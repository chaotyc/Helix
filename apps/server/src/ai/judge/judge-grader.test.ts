import { describe, expect, it } from "vitest";
import type { Grade, GraderJudgment } from "@helix/contracts";
import { checkJudgment } from "./judge-grader.ts";
import { checkSimulated } from "./simulate-learner.ts";

const right: Grade = { correct: true, errorTag: null, explanation: "Right.", notes: "", misconceptionId: null, newMisconception: null };
const wrong: Grade = { ...right, correct: false, errorTag: "slip", explanation: "A slip." };
const judgment = (over: Partial<GraderJudgment>): string =>
  JSON.stringify({ reason: "Because.", rubricSound: true, verdict: "right", tagFits: "not_applicable", betterTag: null, ...over });

describe("checkJudgment", () => {
  it("accepts a consistent judgment", () => {
    expect(checkJudgment(judgment({}), right).ok).toBe(true);
    expect(checkJudgment(judgment({ verdict: "false_pass" }), right).ok).toBe(true);
    expect(checkJudgment(judgment({ tagFits: "yes" }), wrong).ok).toBe(true);
    expect(checkJudgment(judgment({ tagFits: "no", betterTag: "misconception" }), wrong).ok).toBe(true);
    expect(checkJudgment(judgment({ verdict: "false_fail" }), wrong).ok).toBe(true);
  });

  it("rejects a verdict the grade makes impossible", () => {
    expect(checkJudgment(judgment({ verdict: "false_fail" }), right).ok).toBe(false);
    expect(checkJudgment(judgment({ verdict: "false_pass", tagFits: "not_applicable" }), wrong).ok).toBe(false);
  });

  it("asks about the tag exactly when both call the answer wrong", () => {
    expect(checkJudgment(judgment({ tagFits: "not_applicable" }), wrong).ok).toBe(false);
    expect(checkJudgment(judgment({ tagFits: "yes" }), right).ok).toBe(false);
    expect(checkJudgment(judgment({ verdict: "false_fail", tagFits: "yes" }), wrong).ok).toBe(false);
  });

  it("wants a better tag only when the tag doesn't fit, and not the grader's own", () => {
    expect(checkJudgment(judgment({ tagFits: "no" }), wrong).ok).toBe(false);
    expect(checkJudgment(judgment({ tagFits: "yes", betterTag: "misread" }), wrong).ok).toBe(false);
    expect(checkJudgment(judgment({ tagFits: "no", betterTag: "slip" }), wrong).ok).toBe(false);
  });
});

describe("checkSimulated", () => {
  const answers = (list: { kind: string; answer: string; confidence: number }[]) => JSON.stringify({ answers: list });

  it("wants one answer per kind, in order, with confidence 1 to 5", () => {
    const kinds = ["fully_right", "no_answer"] as const;
    expect(checkSimulated(answers([{ kind: "fully_right", answer: "x", confidence: 4 }, { kind: "no_answer", answer: "", confidence: 1 }]), [...kinds]).ok).toBe(true);
    expect(checkSimulated(answers([{ kind: "no_answer", answer: "", confidence: 1 }, { kind: "fully_right", answer: "x", confidence: 4 }]), [...kinds]).ok).toBe(false);
    expect(checkSimulated(answers([{ kind: "fully_right", answer: "x", confidence: 9 }, { kind: "no_answer", answer: "", confidence: 1 }]), [...kinds]).ok).toBe(false);
    expect(checkSimulated(answers([{ kind: "fully_right", answer: " ", confidence: 3 }, { kind: "no_answer", answer: "", confidence: 1 }]), [...kinds]).ok).toBe(false);
  });
});
