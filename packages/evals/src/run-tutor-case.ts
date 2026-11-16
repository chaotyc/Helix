// One tutor-eval case: a small map, optional earlier answers, and scripted learner replies.
//   1. A fresh in-memory database with the goal and map (and the earlier answers as evidence).
//   2. A real tutoring session, replying with the script, one line per learner turn.
//   3. Code checks two rules; the judge gives a verdict on all six.
// The script doesn't adapt to what the tutor asks, so it tests the tutor's habits, not its fit.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { Concept, Edge, ViewEntry, type ModelId, type RuleVerdict, type TimelineItem } from "@helix/contracts";
import {
  createGoal,
  createSession,
  getSession,
  insertEvidence,
  insertItem,
  judgeTutor,
  listTasks,
  openDatabase,
  readGraph,
  readTurns,
  recordMapChange,
  replyToSession,
  startSession,
  type ModelCall,
} from "@helix/server";
import { oneQuestion, retrievalAtEnd, type Verdict } from "./tutor-rules.ts";

export const TUTOR_CASES_DIR = join(import.meta.dirname, "../tutor");
const DEFAULT_CONFIDENCE = 3; // for a scripted answer to a graded question with none given

export const TutorCase = z.object({
  name: z.string(),
  goal: z.object({ title: z.string(), capstone: z.string() }),
  concepts: z.array(Concept),
  edges: z.array(Edge),
  view: z.array(ViewEntry),
  priorAnswers: z.array(z.object({ conceptId: z.string(), depth: z.number().int().min(1).max(5), correct: z.boolean() })).default([]),
  learner: z.array(z.object({ text: z.string().min(1), confidence: z.number().int().min(1).max(5).optional() })).min(1),
});
export type TutorCase = z.infer<typeof TutorCase>;

export function loadTutorCases(dir = TUTOR_CASES_DIR, only?: string): TutorCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const cases = files.map((f) => {
    const parsed = TutorCase.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) throw new Error(`tutor/${f} doesn't match the case format:\n${z.prettifyError(parsed.error)}`);
    return parsed.data;
  });
  const picked = only ? cases.filter((c) => c.name === only) : cases;
  if (picked.length === 0) throw new Error(only ? `No tutor case named ${only}` : `No tutor cases in ${dir}`);
  return picked;
}

export type TutorRun = {
  case: string;
  tutorPromptVersion: string;
  judgePromptVersion: string;
  tutorModel: string;
  judgeModel: string;
  ended: boolean; // the session finished within the script
  learnerTurnsUsed: number;
  code: Verdict[];
  judge: RuleVerdict[];
  transcript: TimelineItem[];
  costUsd: number;
};

export type TutorRunOptions = { callModel: ModelCall; judgeModel: ModelId; log?: (line: string) => void };

export async function runTutorCase(c: TutorCase, options: TutorRunOptions): Promise<TutorRun> {
  const log = options.log ?? (() => {});
  const db = openDatabase(":memory:");
  const goal = createGoal(db, { title: c.goal.title, kind: "course", capstone: c.goal.capstone });
  recordMapChange(
    db,
    { op: "extract", goalId: goal.id, concepts: c.concepts, edges: c.edges, view: c.view, raw: { tutorCase: c.name } },
    { actor: "extractor", promptVersion: "tutor-case", model: "none" },
  );
  seedPriorAnswers(db, goal.id, c.priorAnswers);

  const deps = { callModel: options.callModel, emit: () => {} };
  const session = await startSession(db, goal.id, "tutoring", deps);
  let used = 0;
  for (const turn of c.learner) {
    if (getSession(db, session.id)?.endedAt) break;
    const last = readTurns(db, session.id).at(-1)?.item;
    const confidence = last?.type === "question" ? (turn.confidence ?? DEFAULT_CONFIDENCE) : undefined;
    log(`learner: ${turn.text}`);
    await replyToSession(db, session.id, turn.text, confidence, deps);
    used += 1;
  }

  const turns = readTurns(db, session.id);
  const tasks = listTasks(db, session.id);
  const graph = readGraph(db);
  const name = (id: string) => graph.concepts.find((x) => x.id === id)?.name ?? id;
  const judged = await judgeTutor(
    db,
    {
      goal,
      plan: tasks.map((t) => `${t.kind === "review" ? "Review" : "Learn"}: ${name(t.conceptId)} at depth ${t.depth}`),
      transcript: turns.map((t) => t.item),
      conceptName: name,
    },
    { callModel: options.callModel, model: options.judgeModel },
  );

  const tutorCall = db.prepare("SELECT prompt_version, model FROM ai_call WHERE agent = 'tutor' ORDER BY id DESC LIMIT 1").get();
  const cost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_call").get();
  return {
    case: c.name,
    tutorPromptVersion: String(tutorCall?.prompt_version ?? "none"),
    judgePromptVersion: judged.promptVersion,
    tutorModel: String(tutorCall?.model ?? "none"),
    judgeModel: judged.model,
    ended: Boolean(getSession(db, session.id)?.endedAt),
    learnerTurnsUsed: used,
    code: [retrievalAtEnd(turns, tasks), oneQuestion(turns)],
    judge: judged.report.verdicts,
    transcript: turns.map((t) => t.item),
    costUsd: Number(cost?.cost ?? 0),
  };
}

// Earlier answers, so the planner has something to review. Recorded as one past diagnostic.
function seedPriorAnswers(db: ReturnType<typeof openDatabase>, goalId: string, answers: TutorCase["priorAnswers"]): void {
  if (answers.length === 0) return;
  const session = createSession(db, goalId, "diagnostic");
  for (const a of answers) {
    const item = insertItem(db, {
      goalId,
      conceptId: a.conceptId,
      depth: a.depth,
      prompt: "(seeded)",
      rubric: "(seeded)",
      expectedAnswer: "(seeded)",
      promptVersion: "tutor-case",
      model: "none",
      aimedAt: null,
      sessionId: session.id,
      taskId: null,
    });
    insertEvidence(db, {
      goalId,
      conceptId: a.conceptId,
      depth: a.depth,
      itemId: item.id,
      sessionId: session.id,
      taskId: null,
      answer: "(seeded)",
      correct: a.correct,
      confidence: null,
      errorTag: a.correct ? null : "no_answer",
      explanation: "",
      notes: "",
      misconceptionId: null,
      predictedP: 0.5,
      step: null,
      stepKind: null,
      promptVersion: "tutor-case",
      model: "none",
    });
  }
}
