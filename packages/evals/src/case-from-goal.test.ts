import { describe, expect, it } from "vitest";
import type { ClarifyQuestion, Goal } from "@helix/contracts";
import { EvalCase } from "./cases.ts";
import { caseFromGoal, caseName } from "./case-from-goal.ts";

const goal: Goal = { id: "g1", title: "Signals & Systems (Fall)", kind: "course", capstone: "Design a filter", examDate: "2026-12-14", createdAt: "x" };
const answered: ClarifyQuestion[] = [
  { id: "q1", about: "goal", question: "Why this course?", why: "", answerType: "free_text", choices: [], answer: "Pass the exam" },
];

describe("caseFromGoal", () => {
  it("names the case after the goal", () => {
    expect(caseName(goal.title)).toBe("signals-systems-fall");
  });

  it("builds a valid case with the source file and the answers", () => {
    const { case: built, sourceFile } = caseFromGoal(goal, { text: "Week 1: LTI", kind: "syllabus" }, answered);
    expect(EvalCase.safeParse(built).success).toBe(true);
    expect(built).toMatchObject({
      name: "signals-systems-fall",
      goal: { title: goal.title, capstone: "Design a filter", examDate: "2026-12-14" },
      source: { file: "signals-systems-fall.source.md", kind: "syllabus" },
      answers: [{ about: "goal", question: "Why this course?", answer: "Pass the exam" }],
    });
    expect(sourceFile).toEqual({ name: "signals-systems-fall.source.md", text: "Week 1: LTI" });
  });

  it("has no source when the map was built from the goal and answers alone", () => {
    const { case: built, sourceFile } = caseFromGoal({ ...goal, examDate: undefined }, undefined, answered);
    expect(built.source).toBeNull();
    expect(built.goal).not.toHaveProperty("examDate");
    expect(sourceFile).toBeUndefined();
  });
});
