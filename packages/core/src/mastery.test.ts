import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, HELD_AT, deriveState, predictCorrect, updateMastery, type Answer } from "./mastery.ts";
import { pairKey } from "./pairs.ts";

const P = DEFAULT_PARAMS;

// An answer on concept `c` at depth `d`; seq and time follow the order given.
let nextSeq = 1;
function answer(c: string, d: number, correct: boolean, extra: Partial<Answer> = {}): Answer {
  const seq = nextSeq++;
  return {
    seq,
    conceptId: c,
    depth: d,
    correct,
    confidence: null,
    sessionId: "s1",
    ts: new Date(Date.UTC(2026, 10, 1, 0, seq)).toISOString(),
    aimedAt: null,
    misconceptionId: null,
    ...extra,
  };
}

describe("updateMastery (one Bayesian knowledge-tracing step)", () => {
  it("a right answer raises the estimate, a wrong one lowers it", () => {
    expect(updateMastery(0.5, true)).toBeGreaterThan(0.5);
    expect(updateMastery(0.5, false)).toBeLessThan(0.5);
  });

  it("matches the formula worked by hand: prior 0.2, right answer → 0.64", () => {
    // Bayes: 0.2·0.9 / (0.2·0.9 + 0.8·0.15) = 0.6; then learning: 0.6 + 0.4·0.1 = 0.64
    expect(updateMastery(0.2, true)).toBeCloseTo(0.64, 10);
  });

  it("three right answers in a row from the prior reach 'held'", () => {
    let p = P.prior;
    const path = [true, true, true].map((correct) => (p = updateMastery(p, correct)));
    expect(path[1]).toBeLessThan(HELD_AT); // two is not enough
    expect(path[2]).toBeGreaterThanOrEqual(HELD_AT);
  });

  it("one wrong answer after being held drops below 'held'", () => {
    expect(updateMastery(0.988, false)).toBeLessThan(HELD_AT);
  });

  it("stays a probability at the extremes", () => {
    for (const p of [0, 1]) {
      for (const correct of [true, false]) {
        const next = updateMastery(p, correct);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("predictCorrect (K8: the chance of a right answer, stored before grading)", () => {
  it("is the guess rate when nothing is known and 1 − slip when mastered", () => {
    expect(predictCorrect(0)).toBeCloseTo(P.guess, 10);
    expect(predictCorrect(1)).toBeCloseTo(1 - P.slip, 10);
  });
});

describe("deriveState (state rebuilt from the evidence log alone)", () => {
  it("has no entry for a concept-depth with no answers", () => {
    expect(deriveState([]).size).toBe(0);
  });

  it("keeps a separate estimate per concept per depth (K1)", () => {
    const state = deriveState([answer("lti", 1, true), answer("lti", 2, false)]);
    expect(state.get(pairKey("lti", 1))!.p).toBeGreaterThan(P.prior);
    expect(state.get(pairKey("lti", 2))!.p).toBeLessThan(P.prior);
  });

  it("replays in log order, whatever order the rows arrive in", () => {
    const rows = [answer("lti", 1, true), answer("lti", 1, false), answer("lti", 1, true)];
    expect(deriveState([...rows].reverse()).get(pairKey("lti", 1))!.p).toBeCloseTo(deriveState(rows).get(pairKey("lti", 1))!.p, 12);
  });

  it("a right answer at depth 3 also counts for depths 2 and 1 of the same concept", () => {
    const state = deriveState([answer("lti", 3, true)]);
    expect(state.get(pairKey("lti", 1))).toMatchObject({ answers: 0, implied: 1, lastConfidence: null });
    expect(state.get(pairKey("lti", 2))!.p).toBeCloseTo(updateMastery(P.prior, true), 10);
  });

  it("remembers the count and the last answer, for the planner", () => {
    const rows = [answer("lti", 1, false), answer("lti", 1, true, { confidence: 2 })];
    const s = deriveState(rows).get(pairKey("lti", 1))!;
    expect(s.answers).toBe(2);
    expect(s.lastCorrect).toBe(true);
    expect(s.lastConfidence).toBe(2);
    expect(s.lastTs).toBe(rows[1]!.ts);
  });
});
