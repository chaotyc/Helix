import { describe, expect, it } from "vitest";
import { loadGraderCases, scoreGrader, type Graded } from "./grader-score.ts";

const g = (labelCorrect: boolean, correct: boolean, labelTag: Graded["errorTag"] = null, tag: Graded["errorTag"] = null): Graded => ({
  caseId: "x",
  label: { correct: labelCorrect, errorTag: labelTag },
  correct,
  errorTag: tag,
});

describe("scoreGrader", () => {
  it("separates false passes (wrong graded right) from false fails (right graded wrong)", () => {
    const s = scoreGrader([g(false, true), g(false, false), g(true, true), g(true, true), g(true, false)]);
    expect(s.accuracy).toBeCloseTo(3 / 5);
    expect(s.falsePass).toBeCloseTo(1 / 2);
    expect(s.falseFail).toBeCloseTo(1 / 3);
  });

  it("compares error tags only where both say wrong", () => {
    const s = scoreGrader([g(false, false, "slip", "slip"), g(false, false, "slip", "misconception"), g(false, true, "slip", null)]);
    expect(s.tagAgreement).toBeCloseTo(1 / 2);
  });

  it("meets the bar only with high accuracy and almost no false passes", () => {
    const tenRight = Array.from({ length: 10 }, () => g(true, true));
    expect(scoreGrader(tenRight).meetsBar).toBe(true);
    expect(scoreGrader([...tenRight, g(false, true)]).meetsBar).toBe(false); // one false pass in one wrong answer
    expect(scoreGrader([]).meetsBar).toBe(false);
  });
});

describe("the gold file", () => {
  it("loads, with unique ids and a mix of right and wrong labels", () => {
    const cases = loadGraderCases();
    expect(cases.some((c) => c.label.correct)).toBe(true);
    expect(cases.some((c) => !c.label.correct)).toBe(true);
    for (const c of cases) expect(c.label.correct, c.id).toBe(c.label.errorTag === null);
  });
});
