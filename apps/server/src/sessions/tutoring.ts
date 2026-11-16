// A tutoring session (Step 13). Code plans it (the planner in @helix/core picks up to 2 reviews and
// one concept to teach), then the tutor teaches each task in turn. Graded questions go through the
// grader into evidence; the tutor reads the verdicts but never grades.
import type { DatabaseSync } from "node:sqlite";
import { depthName, type Confidence, type TimelineItem } from "@helix/contracts";
import { goalSlice, implies, pairKey, planSession, type PlannedTask } from "@helix/core";
import { tutorTurn, type PlanLine, type TutorBriefing } from "../ai/tutoring/tutor-turn.ts";
import { answersForGoal } from "../db/clarifications.ts";
import { getGoal } from "../db/goals.ts";
import { activeMisconceptions, getItem, insertItem, learnerSnapshot, listMisconceptions, recentNotes } from "../db/learner.ts";
import { endTask, listTasks, readTurns, recentSummaries, setTaskMethod, startTask, type Task } from "../db/sessions.ts";
import { conceptIn, namer, newId, pushTurn, teaching, type SessionCtx } from "./context.ts";
import { finishSession } from "./finish.ts";
import { gradeAndRecord } from "./record-answer.ts";

const NOTES_IN_BRIEFING = 3;
const SUMMARIES_IN_BRIEFING = 2;

// The plan for a new session, or an error when there's nothing to teach.
export function planFor(db: DatabaseSync, goalId: string): PlannedTask[] {
  const snap = learnerSnapshot(db);
  const map = goalSlice(snap.graph, goalId);
  if (map.view.length === 0) throw new Error("This goal has no map yet. Build its map first.");
  const tasks = planSession({ map, state: snap.state, mastery: snap.mastery, misconceptions: activeMisconceptions(db, snap.answers) });
  if (tasks.length === 0) throw new Error("Nothing to teach or review: every concept in this goal is at its target depth.");
  return tasks;
}

function taskLabel(t: Pick<Task, "kind" | "depth" | "conceptId">, name: (id: string) => string): string {
  return t.kind === "review"
    ? `Review: ${name(t.conceptId)} at depth ${t.depth}`
    : `Learn: ${name(t.conceptId)} to depth ${t.depth} (${depthName(t.depth)})`;
}

function currentTask(ctx: SessionCtx): Task | undefined {
  return listTasks(ctx.db, ctx.session.id).find((t) => t.endedAt === null);
}

// Opens the next unfinished task with a divider, or finishes the session when none is left.
async function openNextTask(ctx: SessionCtx): Promise<void> {
  const task = currentTask(ctx);
  if (!task) {
    await finishSession(ctx);
    return;
  }
  startTask(ctx.db, task.id);
  const name = namer(learnerSnapshot(ctx.db).graph);
  pushTurn(ctx, { type: "task", id: newId(), label: taskLabel(task, name) }, task.id);
  await tutorStep(ctx);
}

export async function beginTutoring(ctx: SessionCtx): Promise<void> {
  await openNextTask(ctx);
}

// One tutor turn, then whatever it leads to: a graded question card, or the next task.
async function tutorStep(ctx: SessionCtx): Promise<void> {
  const task = currentTask(ctx);
  if (!task) {
    await finishSession(ctx);
    return;
  }

  ctx.status("The tutor is writing…");
  const streamId = newId();
  const { turn, promptVersion, model } = await tutorTurn(ctx.db, briefing(ctx, task), {
    ...teaching(ctx),
    onMessage: (text) => ctx.emit({ type: "session.item", sessionId: ctx.session.id, item: { type: "tutor", id: streamId, text, streaming: true } }),
  });

  setTaskMethod(ctx.db, task.id, turn.method);
  pushTurn(ctx, { type: "tutor", id: streamId, text: turn.message }, task.id);

  if (turn.question) {
    const q = turn.question;
    const item = insertItem(ctx.db, {
      goalId: ctx.session.goalId,
      conceptId: task.conceptId,
      depth: task.depth,
      prompt: q.prompt,
      rubric: q.rubric,
      expectedAnswer: q.expectedAnswer,
      promptVersion,
      model,
      aimedAt: task.aimedAt,
      sessionId: ctx.session.id,
      taskId: task.id,
    });
    const card: TimelineItem = {
      type: "question",
      id: newId(),
      itemId: item.id,
      conceptId: task.conceptId,
      depth: task.depth,
      prompt: q.prompt,
      step: q.step,
      stepKind: q.stepKind,
    };
    pushTurn(ctx, card, task.id);
  } else if (turn.taskDone) {
    endTask(ctx.db, task.id);
    await openNextTask(ctx);
  }
}

export async function replyTutoring(ctx: SessionCtx, text: string, confidence: Confidence | undefined): Promise<void> {
  const task = currentTask(ctx);
  if (!task) throw new Error("This session has no task left.");
  const last = readTurns(ctx.db, ctx.session.id).at(-1)?.item;

  if (last?.type === "question") {
    if (confidence === undefined) throw new Error("Rate your confidence (1–5) before answering a graded question.");
    const item = getItem(ctx.db, last.itemId);
    if (!item) throw new Error(`No question with id ${last.itemId}`);
    pushTurn(ctx, { type: "answer", id: newId(), text, confidence }, task.id);
    const feedback = await gradeAndRecord(ctx, {
      item,
      answer: text,
      confidence,
      taskId: task.id,
      step: last.step ?? null,
      stepKind: last.stepKind ?? null,
    });
    pushTurn(ctx, feedback, task.id);
  } else {
    pushTurn(ctx, { type: "answer", id: newId(), text }, task.id); // ungraded: a prediction, an attempt, a question back
  }
  await tutorStep(ctx);
}

// After a failed step: get the tutor's next turn, unless it's the learner's move.
export async function resumeTutoring(ctx: SessionCtx): Promise<void> {
  const last = readTurns(ctx.db, ctx.session.id).at(-1)?.item;
  if (last?.type === "tutor" || last?.type === "question") return; // waiting for the learner
  if (!last) {
    await openNextTask(ctx);
    return;
  }
  await tutorStep(ctx);
}

// The tutor briefing (K7), computed fresh for each turn.
function briefing(ctx: SessionCtx, task: Task): TutorBriefing {
  const { db, session } = ctx;
  const goal = getGoal(db, session.goalId);
  if (!goal) throw new Error(`No goal with id ${session.goalId}`);
  const snap = learnerSnapshot(db);
  const name = namer(snap.graph);
  const map = goalSlice(snap.graph, goal.id);
  const pair = { conceptId: task.conceptId, depth: task.depth };
  const buildsOn = implies(snap.graph.edges, pair).filter((p) => p.conceptId !== task.conceptId);
  const active = activeMisconceptions(db, snap.answers);
  const near = new Set([task.conceptId, ...buildsOn.map((p) => p.conceptId)]);
  const tasks = listTasks(db, session.id);
  const turns = readTurns(db, session.id);

  const plan: PlanLine[] = tasks.map((t) => ({
    label: taskLabel(t, name),
    reason: t.reason,
    status: t.endedAt ? "done" : t.id === task.id ? "now" : "later",
  }));

  return {
    goal,
    answered: answersForGoal(db, goal.id),
    plan,
    task: {
      concept: conceptIn(snap.graph, task.conceptId),
      depth: task.depth,
      targetDepth: map.view.find((e) => e.conceptId === task.conceptId)?.targetDepth ?? task.depth,
      mastery: snap.knowledge.find((k) => k.conceptId === task.conceptId)?.mastery ?? [0, 0, 0, 0, 0],
      buildsOn: buildsOn.map((p) => ({ name: name(p.conceptId), depth: p.depth, mastery: snap.mastery.get(pairKey(p.conceptId, p.depth)) ?? 0 })),
      aimedAt: task.aimedAt ? (listMisconceptions(db).find((m) => m.id === task.aimedAt)?.description ?? null) : null,
      misconceptions: active.filter((m) => near.has(m.conceptId)).map((m) => `${name(m.conceptId)}: ${m.description}`),
      notes: recentNotes(db, task.conceptId, NOTES_IN_BRIEFING),
    },
    summaries: recentSummaries(db, goal.id, SUMMARIES_IN_BRIEFING),
    transcript: turns.map((t) => t.item),
    conceptName: name,
    gradedInTask: turns.some((t) => t.taskId === task.id && t.item.type === "feedback"),
  };
}
