// Questions, graded answers (the evidence log), misconceptions, and the knowledge state
// derived from them. Evidence and the map are the source of truth (rule 3); concept_state is a
// copy of what @helix/core derives from them, rewritten after every answer and map change.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ErrorTag, StepKind, type ConceptKnowledge, type ConceptGraph } from "@helix/contracts";
import {
  conceptKnowledge,
  deriveState,
  masteryMap,
  misconceptionActive,
  misconceptionEvents,
  type ActiveMisconception,
  type Answer,
  type LearnerState,
  type MasteryMap,
} from "@helix/core";
import { readGraph } from "./graph.ts";
import { inTransaction } from "./transaction.ts";

// ---- Items (questions asked) ----

export type NewItem = {
  goalId: string;
  conceptId: string;
  depth: number;
  prompt: string;
  rubric: string;
  expectedAnswer: string;
  promptVersion: string; // the item writer's, or the tutor's for questions asked mid-task
  model: string;
  aimedAt: string | null;
  sessionId: string | null;
  taskId: string | null;
};

export type Item = NewItem & { id: string };

const ItemRow = z.object({
  id: z.string(),
  goal_id: z.string(),
  concept_id: z.string(),
  depth: z.number(),
  prompt: z.string(),
  rubric: z.string(),
  expected_answer: z.string(),
  prompt_version: z.string(),
  model: z.string(),
  aimed_at: z.string().nullable(),
  session_id: z.string().nullable(),
  task_id: z.string().nullable(),
});

export function insertItem(db: DatabaseSync, item: NewItem): Item {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO item (id, goal_id, concept_id, depth, prompt, rubric, expected_answer, prompt_version, model,
                       aimed_at, session_id, task_id, created_at)
     VALUES ($id, $goalId, $conceptId, $depth, $prompt, $rubric, $expectedAnswer, $promptVersion, $model,
             $aimedAt, $sessionId, $taskId, $createdAt)`,
  ).run({ id, ...item, createdAt: new Date().toISOString() });
  return { id, ...item };
}

export function getItem(db: DatabaseSync, id: string): Item | undefined {
  const row = db.prepare("SELECT * FROM item WHERE id = $id").get({ id });
  if (!row) return undefined;
  const r = ItemRow.parse(row);
  return {
    id: r.id,
    goalId: r.goal_id,
    conceptId: r.concept_id,
    depth: r.depth,
    prompt: r.prompt,
    rubric: r.rubric,
    expectedAnswer: r.expected_answer,
    promptVersion: r.prompt_version,
    model: r.model,
    aimedAt: r.aimed_at,
    sessionId: r.session_id,
    taskId: r.task_id,
  };
}

// Questions already asked on a concept at a depth, newest last, so the writer can avoid repeats.
export function promptsAsked(db: DatabaseSync, conceptId: string, depth: number): string[] {
  return db
    .prepare("SELECT prompt FROM item WHERE concept_id = $conceptId AND depth = $depth ORDER BY created_at")
    .all({ conceptId, depth })
    .map((row) => z.object({ prompt: z.string() }).parse(row).prompt);
}

// ---- Evidence (the answer diary) ----

export type NewEvidence = {
  goalId: string;
  conceptId: string;
  depth: number;
  itemId: string;
  sessionId: string;
  taskId: string | null;
  answer: string;
  correct: boolean;
  confidence: number | null;
  errorTag: ErrorTag | null;
  explanation: string;
  notes: string;
  misconceptionId: string | null;
  predictedP: number;
  step: string | null;
  stepKind: StepKind | null;
  promptVersion: string; // the grader's
  model: string;
};

export function insertEvidence(db: DatabaseSync, e: NewEvidence): number {
  const result = db
    .prepare(
      `INSERT INTO evidence (goal_id, concept_id, depth, item_id, session_id, task_id, answer, correct, confidence,
                             grader, error_tag, explanation, notes, misconception_id, predicted_p, step, step_kind,
                             prompt_version, model, ts)
       VALUES ($goalId, $conceptId, $depth, $itemId, $sessionId, $taskId, $answer, $correct, $confidence,
               'llm', $errorTag, $explanation, $notes, $misconceptionId, $predictedP, $step, $stepKind,
               $promptVersion, $model, $ts)`,
    )
    .run({ ...e, correct: e.correct ? 1 : 0, ts: new Date().toISOString() });
  return Number(result.lastInsertRowid);
}

const AnswerRow = z.object({
  seq: z.number(),
  concept_id: z.string(),
  depth: z.number(),
  correct: z.number(),
  confidence: z.number().nullable(),
  session_id: z.string().nullable(),
  ts: z.string(),
  aimed_at: z.string().nullable(),
  misconception_id: z.string().nullable(),
});

// Every graded answer, as the learner model reads them.
export function readAnswers(db: DatabaseSync): Answer[] {
  return db
    .prepare(
      `SELECT e.seq, e.concept_id, e.depth, e.correct, e.confidence, e.session_id, e.ts, i.aimed_at, e.misconception_id
       FROM evidence e LEFT JOIN item i ON i.id = e.item_id ORDER BY e.seq`,
    )
    .all()
    .map((row) => {
      const r = AnswerRow.parse(row);
      return {
        seq: r.seq,
        conceptId: r.concept_id,
        depth: r.depth,
        correct: r.correct === 1,
        confidence: r.confidence,
        sessionId: r.session_id,
        ts: r.ts,
        aimedAt: r.aimed_at,
        misconceptionId: r.misconception_id,
      };
    });
}

// The grader's notes on the latest answers for a concept, newest last (for the tutor briefing).
export function recentNotes(db: DatabaseSync, conceptId: string, limit: number): string[] {
  return db
    .prepare(
      `SELECT notes FROM evidence WHERE concept_id = $conceptId AND notes IS NOT NULL AND notes != ''
       ORDER BY seq DESC LIMIT $limit`,
    )
    .all({ conceptId, limit })
    .map((row) => z.object({ notes: z.string() }).parse(row).notes)
    .reverse();
}

// ---- Misconceptions (K3) ----

export type Misconception = { id: string; conceptId: string; description: string };

const MisconceptionRow = z.object({ id: z.string(), concept_id: z.string(), description: z.string() });

export function createMisconception(db: DatabaseSync, conceptId: string, description: string): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO misconception (id, concept_id, description, created_at) VALUES ($id, $conceptId, $description, $createdAt)",
  ).run({ id, conceptId, description, createdAt: new Date().toISOString() });
  return id;
}

export function listMisconceptions(db: DatabaseSync, conceptId?: string): Misconception[] {
  const rows = conceptId
    ? db.prepare("SELECT * FROM misconception WHERE concept_id = $conceptId ORDER BY created_at").all({ conceptId })
    : db.prepare("SELECT * FROM misconception ORDER BY created_at").all();
  return rows.map((row) => {
    const r = MisconceptionRow.parse(row);
    return { id: r.id, conceptId: r.concept_id, description: r.description };
  });
}

// Active misconceptions, each with the depth of the answer that last showed it.
export function activeMisconceptions(db: DatabaseSync, answers: Answer[]): ActiveMisconception[] {
  return listMisconceptions(db).flatMap((m) => {
    if (!misconceptionActive(misconceptionEvents(answers, m.id))) return [];
    const lastShown = answers.findLast((a) => a.misconceptionId === m.id);
    return [{ ...m, depth: lastShown?.depth ?? 1 }];
  });
}

// ---- Knowledge state ----

export type LearnerSnapshot = {
  answers: Answer[];
  state: LearnerState; // per concept-depth, with right answers passed down the current map's arrows
  graph: ConceptGraph;
  mastery: MasteryMap; // every concept-depth, the prior where there's no evidence
  knowledge: ConceptKnowledge[];
};

// Everything the learner model says right now, derived from the evidence log and the current graph.
export function learnerSnapshot(db: DatabaseSync): LearnerSnapshot {
  const answers = readAnswers(db);
  const graph = readGraph(db);
  const state = deriveState(answers, graph.edges);
  const ids = graph.concepts.map((c) => c.id);
  const ownState = deriveState(answers); // each concept's own answers only: tells tested from inferred
  return { answers, state, graph, mastery: masteryMap(ids, state), knowledge: conceptKnowledge(ids, state, ownState) };
}

// Rewrites concept_state from the evidence log and the map (rule 3: derived state can always be rebuilt).
export function rebuildConceptState(db: DatabaseSync): void {
  const state = deriveState(readAnswers(db), readGraph(db).edges);
  const now = new Date().toISOString();
  inTransaction(db, () => {
    db.exec("DELETE FROM concept_state");
    const insert = db.prepare(
      `INSERT INTO concept_state (concept_id, depth, p_mastery, answers, last_answer_at, updated_at)
       VALUES ($conceptId, $depth, $p, $answers, $lastTs, $now)`,
    );
    for (const s of state.values()) {
      insert.run({ conceptId: s.conceptId, depth: s.depth, p: s.p, answers: s.answers, lastTs: s.lastTs, now });
    }
  });
}
