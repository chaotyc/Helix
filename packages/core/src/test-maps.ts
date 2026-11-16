// Small maps for tests. A chain in the Signals course:
//   complex-numbers ← complex-exp ← lti ← convolution
// with the depth-aware arrows written out below, plus a background concept.
import type { Concept, Edge, GoalMap, ViewEntry } from "@helix/contracts";
import type { Answer, LearnerState, PairState } from "./mastery.ts";
import { pairKey } from "./pairs.ts";

export const concept = (id: string): Concept => ({ id, name: id, description: `About ${id}.`, kind: "concept" });

// `dst` at `dstDepth` needs `src` at `srcDepth`.
export const needs = (dst: string, dstDepth: number, src: string, srcDepth: number): Edge => ({
  type: "prereq",
  src,
  srcDepth,
  dst,
  dstDepth,
});

export const taught = (conceptId: string, targetDepth: number): ViewEntry => ({ conceptId, targetDepth, role: "taught" });
export const background = (conceptId: string, targetDepth: number): ViewEntry => ({ conceptId, targetDepth, role: "background" });

export function goalMap(view: ViewEntry[], edges: Edge[]): GoalMap {
  return { goalId: "g", concepts: view.map((e) => concept(e.conceptId)), view, edges };
}

export const chain = goalMap(
  [background("complex-numbers", 2), taught("complex-exp", 3), taught("lti", 3), taught("convolution", 2)],
  [
    needs("complex-exp", 1, "complex-numbers", 2),
    needs("lti", 2, "complex-exp", 1),
    needs("convolution", 1, "lti", 2),
  ],
);

// A learner state with the given P(mastered) per "concept@depth", each from one direct answer,
// in the order given (so later keys count as newer).
export function stateOf(ps: Record<string, number>, extra: Partial<PairState> = {}): LearnerState {
  const state: LearnerState = new Map();
  let seq = 0;
  for (const [key, p] of Object.entries(ps)) {
    const [conceptId, depth] = key.split("@") as [string, string];
    seq += 1;
    state.set(pairKey(conceptId, Number(depth)), {
      conceptId,
      depth: Number(depth),
      p,
      answers: 1,
      implied: 0,
      lastSeq: seq,
      lastTs: new Date(Date.UTC(2026, 10, 1, 0, seq)).toISOString(),
      lastCorrect: p > 0.5,
      lastConfidence: null,
      ...extra,
    });
  }
  return state;
}

// Graded answers in log order: "lti@2" is a right answer, "!lti@2" a wrong one.
export function answers(...keys: string[]): Answer[] {
  return keys.map((key, i) => {
    const correct = !key.startsWith("!");
    const [conceptId, depth] = key.replace("!", "").split("@") as [string, string];
    return {
      seq: i + 1,
      conceptId,
      depth: Number(depth),
      correct,
      confidence: null,
      sessionId: "s1",
      ts: new Date(Date.UTC(2026, 10, 1, 0, i + 1)).toISOString(),
      aimedAt: null,
      misconceptionId: null,
    };
  });
}
