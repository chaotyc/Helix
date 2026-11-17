import { describe, expect, it } from "vitest";
import { graderTable, pickItems, scoreGrader, seededRandom, type ConceptEntry, type GraderRunSummary, type Judged } from "./grader-score.ts";

const j = (gradedCorrect: boolean, verdict: Judged["verdict"], tagFits: Judged["tagFits"] = "not_applicable", kind: Judged["kind"] = "slip"): Judged => ({
  kind,
  gradedCorrect,
  verdict,
  tagFits,
  rubricSound: true,
});

describe("scoreGrader", () => {
  it("counts the share of grades the judge accepts", () => {
    const s = scoreGrader([j(true, "right"), j(false, "right", "yes"), j(true, "false_pass"), j(false, "false_fail")]);
    expect(s.graded).toBe(4);
    expect(s.accepted).toBeCloseTo(2 / 4);
  });

  it("measures false passes among answers the judge calls wrong, false fails among those it calls right", () => {
    // The judge calls wrong: the false pass, and the two wrong grades it accepts → 1 of 3.
    // The judge calls right: the right grade it accepts, and the false fail → 1 of 2.
    const s = scoreGrader([j(true, "false_pass"), j(false, "right", "yes"), j(false, "right", "no"), j(true, "right"), j(false, "false_fail")]);
    expect(s.falsePass).toBeCloseTo(1 / 3);
    expect(s.falseFail).toBeCloseTo(1 / 2);
  });

  it("compares error tags only where both call the answer wrong", () => {
    const s = scoreGrader([j(false, "right", "yes"), j(false, "right", "no"), j(true, "right"), j(false, "false_fail")]);
    expect(s.tagAgreement).toBeCloseTo(1 / 2);
    expect(scoreGrader([j(true, "right")]).tagAgreement).toBeNull();
  });

  it("meets the bar only with most grades accepted and almost no false passes", () => {
    const tenRight = Array.from({ length: 10 }, () => j(true, "right"));
    expect(scoreGrader(tenRight).meetsBar).toBe(true);
    expect(scoreGrader([...tenRight, j(true, "false_pass")]).meetsBar).toBe(false); // the only wrong answer passed
    expect(scoreGrader([...tenRight, j(false, "false_fail"), j(false, "false_fail")]).meetsBar).toBe(false); // 10/12 accepted
    expect(scoreGrader([]).meetsBar).toBe(false);
  });

  it("breaks the verdicts down by the kind the answer was written as", () => {
    const s = scoreGrader([j(true, "false_pass", "not_applicable", "right_result_wrong_reasoning"), j(true, "right", "not_applicable", "fully_right")]);
    expect(s.byKind.right_result_wrong_reasoning).toEqual({ graded: 1, accepted: 0, falsePasses: 1, falseFails: 0 });
    expect(s.byKind.fully_right).toEqual({ graded: 1, accepted: 1, falsePasses: 0, falseFails: 0 });
  });

  it("reports the share of grades on a rubric the judge called unsound", () => {
    expect(scoreGrader([j(true, "right"), { ...j(true, "right"), rubricSound: false }]).unsoundRubrics).toBeCloseTo(1 / 2);
  });
});

describe("pickItems", () => {
  const entries: ConceptEntry[] = [
    { case: "a", conceptId: "c1", targetDepth: 2 },
    { case: "a", conceptId: "c2", targetDepth: 3 },
    { case: "a", conceptId: "c3", targetDepth: 4 },
    { case: "b", conceptId: "c4", targetDepth: 1 },
  ];

  it("is the same for the same seed, whatever the input order", () => {
    expect(pickItems([...entries].reverse(), 6, 3)).toEqual(pickItems(entries, 6, 3));
  });

  it("takes depths in turn, only up to a concept's target depth", () => {
    const picks = pickItems(entries, 4, 1);
    expect(picks.map((p) => p.depth)).toEqual([1, 2, 3, 4]); // no concept reaches 5, so 5 is skipped
    for (const p of picks) expect(entries.find((e) => e.conceptId === p.conceptId)!.targetDepth).toBeGreaterThanOrEqual(p.depth);
  });

  it("starts the depth cycle where the seed says, so other seeds reach other depths", () => {
    expect(pickItems(entries, 2, 3).map((p) => p.depth)).toEqual([3, 4]);
  });

  it("uses every concept that fits before repeating one", () => {
    const picks = pickItems(entries, 4, 2).filter((p) => p.depth === 1);
    expect(new Set(picks.map((p) => p.conceptId)).size).toBe(picks.length);
    const all = pickItems(entries.map((e) => ({ ...e, targetDepth: 1 })), 4, 1);
    expect(new Set(all.map((p) => p.conceptId)).size).toBe(4);
  });

  it("returns nothing for an empty map", () => {
    expect(pickItems([], 3, 1)).toEqual([]);
  });
});

describe("seededRandom", () => {
  it("repeats for a seed and stays in [0, 1)", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("graderTable", () => {
  const run = (judgePromptVersion: string): GraderRunSummary => ({
    date: "2026-11-17T20:00:00.000Z",
    graderPromptVersion: "grader@aaaaaaaa",
    graderModel: "claude-opus-5-5",
    itemPromptVersion: "item-writer@bbbbbbbb",
    learnerPromptVersion: "simulate-learner@cccccccc",
    learnerModel: "claude-opus-5-5",
    judgePromptVersion,
    judgeModel: "claude-opus-5-5",
    judgeEffort: "high",
    questions: 4,
    score: { graded: 32, accepted: 0.9375, falsePass: 0, falseFail: 0.1, tagAgreement: 0.8, unsoundRubrics: 0, meetsBar: true },
    costUsd: 1.5,
  });

  it("groups runs by judge, since a different judge makes scores incomparable", () => {
    const table = graderTable([run("judge-grader@11111111"), run("judge-grader@22222222")]);
    expect(table.match(/^Judge: /gm)).toHaveLength(2);
    expect(table).toContain("94%");
  });

  it("says so when there are no results", () => {
    expect(graderTable([])).toBe("No grader results yet.");
  });
});
