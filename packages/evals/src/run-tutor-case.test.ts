import { describe, expect, it } from "vitest";
import { fakeModel } from "@helix/server";
import { loadTutorCases, runTutorCase, type TutorCase } from "./run-tutor-case.ts";

const c: TutorCase = {
  name: "tiny",
  goal: { title: "Tiny", capstone: "" },
  concepts: [{ id: "a", name: "A", description: "About a.", kind: "concept" }],
  edges: [],
  view: [{ conceptId: "a", targetDepth: 1, role: "taught" }],
  priorAnswers: [],
  learner: [{ text: "my guess" }, { text: "my answer", confidence: 4 }, { text: "never sent: the session has ended" }],
};

const question = { prompt: "Recall?", rubric: "r", expectedAnswer: "e", step: "s", stepKind: "reasoning" };
const verdicts = ["predict_first", "one_question", "hints_before_solution", "asks_why", "retrieval_at_end", "never_grades"].map((rule) => ({
  rule,
  verdict: "pass",
  evidence: "[1]",
}));

describe("runTutorCase", () => {
  it("replays the script until the session ends, then checks and judges the transcript", async () => {
    const fake = fakeModel([
      { message: "Predict?", method: "socratic", question: null, taskDone: false },
      { message: "From memory:", method: "socratic", question, taskDone: false },
      { correct: true, errorTag: null, explanation: "Yes.", notes: "", misconceptionId: null, newMisconception: null },
      { message: "Good.", method: "socratic", question: null, taskDone: true },
      { summary: "Learned a." },
      { verdicts },
    ]);
    const run = await runTutorCase(c, { callModel: fake.callModel, judgeModel: "claude-opus-5-5" });

    expect(run.ended).toBe(true);
    expect(run.learnerTurnsUsed).toBe(2);
    expect(run.code.map((v) => `${v.rule}:${v.verdict}`)).toEqual(["retrieval_at_end:pass", "one_question:pass"]);
    expect(run.judge).toHaveLength(6);
    expect(run.tutorPromptVersion).toMatch(/^tutor@/);
  });
});

describe("the tutor cases", () => {
  it("all load", () => {
    expect(loadTutorCases().length).toBeGreaterThan(0);
  });
});
