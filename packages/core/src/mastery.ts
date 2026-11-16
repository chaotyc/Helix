// Bayesian knowledge tracing (BKT): one probability per concept per depth (K1), updated by
// each graded answer. Think of it as a two-state hidden Markov model: the learner either has
// mastered the concept at that depth or hasn't, and each answer is a noisy reading of that
// hidden state.
//   guess  P(right answer | not mastered)
//   slip   P(wrong answer | mastered)
//   learn  P(not mastered → mastered) after each practice opportunity
//   prior  P(mastered) before any answer
// An LLM grade counts as certain (decided in Step 11): the grader's own mistakes are not modeled.
//
// Right answers pass down the arrows (decided in Step 11): if B@2 needs A@1, a right answer on
// B@2 also counts as a right answer on A@1 (and on B@1), as one more reading of the same kind.
// Several right answers above A@1 add up, like repeated readings of a sensor, and log order is
// kept: a later direct miss on A@1 still pulls it down. Wrong answers pass nothing.
import type { Edge } from "@helix/contracts";
import { closure, pairKey } from "./pairs.ts";

export type MasteryParams = { prior: number; learn: number; guess: number; slip: number };

// Starting values, to be fitted once there's evidence. Guess is low because answers are
// written, not multiple choice.
export const DEFAULT_PARAMS: MasteryParams = { prior: 0.2, learn: 0.1, guess: 0.15, slip: 0.1 };

// A concept at a depth is "held" once P(mastered) reaches this (decided: 0.95).
export const HELD_AT = 0.95;

// One graded answer, as the learner model reads the evidence log.
export type Answer = {
  seq: number; // order in the log
  conceptId: string;
  depth: number;
  correct: boolean;
  confidence: number | null; // 1–5, rated before feedback
  sessionId: string | null;
  ts: string;
  aimedAt: string | null; // the misconception the question targeted, if any
  misconceptionId: string | null; // the misconception the grader saw in the answer, if any
};

// What the log says about one concept at one depth.
export type PairState = {
  conceptId: string;
  depth: number;
  p: number; // P(mastered), from this pair's answers and right answers passed down to it
  answers: number; // answers to questions on this concept-depth itself
  implied: number; // right answers above it, passed down the arrows
  lastSeq: number; // the last reading of either kind
  lastTs: string;
  lastCorrect: boolean;
  lastConfidence: number | null; // null when the last reading was passed down
};

// Keyed by pairKey(conceptId, depth).
export type LearnerState = Map<string, PairState>;

// The model's chance of a right answer from someone at mastery p. Stored on every evidence
// row before grading (K8), so calibration can be checked later straight from the log.
export function predictCorrect(p: number, params: MasteryParams = DEFAULT_PARAMS): number {
  return p * (1 - params.slip) + (1 - p) * params.guess;
}

// One BKT step: Bayes' rule on the answer, then the chance of learning from the attempt.
export function updateMastery(p: number, correct: boolean, params: MasteryParams = DEFAULT_PARAMS): number {
  const { guess, slip, learn } = params;
  const ifMastered = correct ? 1 - slip : slip; // P(this answer | mastered)
  const ifNot = correct ? guess : 1 - guess; // P(this answer | not mastered)
  const posterior = (p * ifMastered) / (p * ifMastered + (1 - p) * ifNot);
  return posterior + (1 - posterior) * learn;
}

// The learner state from the evidence log and the map (rule 3): replay every answer in log
// order; a right one also counts for everything it implies. With no `edges`, a right answer
// still passes down its own concept's depths: the state from each concept's answers alone.
export function deriveState(evidence: Answer[], edges: Edge[] = [], params: MasteryParams = DEFAULT_PARAMS): LearnerState {
  const state: LearnerState = new Map();
  const read = (conceptId: string, depth: number, a: Answer, direct: boolean) => {
    const key = pairKey(conceptId, depth);
    const before = state.get(key);
    const correct = direct ? a.correct : true;
    state.set(key, {
      conceptId,
      depth,
      p: updateMastery(before?.p ?? params.prior, correct, params),
      answers: (before?.answers ?? 0) + (direct ? 1 : 0),
      implied: (before?.implied ?? 0) + (direct ? 0 : 1),
      lastSeq: a.seq,
      lastTs: a.ts,
      lastCorrect: correct,
      lastConfidence: direct ? a.confidence : null,
    });
  };

  for (const a of [...evidence].sort((x, y) => x.seq - y.seq)) {
    read(a.conceptId, a.depth, a, true);
    if (!a.correct) continue;
    for (const below of closure(edges, { conceptId: a.conceptId, depth: a.depth })) read(below.conceptId, below.depth, a, false);
  }
  return state;
}
