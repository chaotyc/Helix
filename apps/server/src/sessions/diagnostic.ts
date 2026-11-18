// A diagnostic session (Step 12): questions picked by @helix/core's nextProbe, written by the item
// writer, and graded into evidence. It runs until nextProbe has nothing left to ask (every
// concept-depth asked, held, or blocked by a known gap) or the learner ends it. The map recolors after each answer.
import type { Confidence } from "@helix/contracts";
import { goalSlice, implies, nextProbe, pairKey } from "@helix/core";
import { writeItem } from "../ai/items/write-item.ts";
import { getGoal } from "../db/goals.ts";
import { getItem, insertItem, learnerSnapshot, promptsAsked } from "../db/learner.ts";
import { readTurns } from "../db/sessions.ts";
import { conceptIn, newId, pushTurn, teaching, type SessionCtx } from "./context.ts";
import { finishSession } from "./finish.ts";
import { gradeAndRecord } from "./record-answer.ts";

export function openDiagnostic(ctx: SessionCtx): void {
  pushTurn(ctx, {
    type: "task",
    id: newId(),
    label: `Diagnostic: questions to find what you already know, until the map is settled. Answer from memory; "I don't know" is a fine answer. End the session whenever you like.`,
  });
}

// Ask the next question, or finish when there's nothing left to ask.
export async function askNext(ctx: SessionCtx): Promise<void> {
  const { db, session } = ctx;
  const questions = readTurns(db, session.id).flatMap((t) => (t.item.type === "question" ? [t.item] : []));
  const goal = getGoal(db, session.goalId);
  if (!goal) throw new Error(`No goal with id ${session.goalId}`);

  const snap = learnerSnapshot(db);
  const map = goalSlice(snap.graph, goal.id);
  if (map.view.length === 0) throw new Error("This goal has no map yet. Build its map first.");

  const asked = new Set(questions.map((q) => pairKey(q.conceptId, q.depth)));
  const pair = nextProbe(map, snap.state, snap.mastery, asked);
  if (!pair) {
    await finishSession(ctx);
    return;
  }

  ctx.status(`Writing question ${questions.length + 1}…`);
  const concept = conceptIn(snap.graph, pair.conceptId);
  const { item: written, promptVersion, model } = await writeItem(
    db,
    {
      goal,
      concept,
      depth: pair.depth,
      buildsOn: implies(snap.graph.edges, pair)
        .filter((p) => p.conceptId !== pair.conceptId)
        .map((p) => ({ concept: conceptIn(snap.graph, p.conceptId), depth: p.depth })),
      aimedAt: null,
      alreadyAsked: promptsAsked(db, pair.conceptId, pair.depth),
    },
    teaching(ctx),
  );

  const item = insertItem(db, {
    goalId: goal.id,
    conceptId: pair.conceptId,
    depth: pair.depth,
    ...written,
    promptVersion,
    model,
    aimedAt: null,
    sessionId: session.id,
    taskId: null,
  });
  pushTurn(ctx, { type: "question", id: newId(), itemId: item.id, conceptId: item.conceptId, depth: pair.depth, prompt: item.prompt });
}

export async function answerDiagnostic(ctx: SessionCtx, text: string, confidence: Confidence | undefined): Promise<void> {
  const last = readTurns(ctx.db, ctx.session.id).at(-1)?.item;
  if (last?.type !== "question") throw new Error("No question is waiting for an answer.");
  if (confidence === undefined) throw new Error("Rate your confidence (1–5) before sending your answer.");
  const item = getItem(ctx.db, last.itemId);
  if (!item) throw new Error(`No question with id ${last.itemId}`);

  pushTurn(ctx, { type: "answer", id: newId(), text, confidence });
  const feedback = await gradeAndRecord(ctx, { item, answer: text, confidence, taskId: null, step: null, stepKind: null });
  pushTurn(ctx, feedback);
  await askNext(ctx);
}

// After a failed step: carry on unless the learner is the one who should act next.
export async function resumeDiagnostic(ctx: SessionCtx): Promise<void> {
  if (readTurns(ctx.db, ctx.session.id).at(-1)?.item.type === "question") return; // waiting for the answer
  await askNext(ctx);
}
