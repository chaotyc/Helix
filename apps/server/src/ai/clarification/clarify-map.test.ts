import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { ClarifyProposal, ExtractionStage, ProposedQuestion } from "@helix/contracts";
import { openDatabase } from "../../db/open.ts";
import { createGoal } from "../../db/goals.ts";
import { getRound, saveAnswers } from "../../db/clarifications.ts";
import { fakeModel } from "../fake-model.ts";
import { clarifyMap } from "./clarify-map.ts";

// ---- Builders ----

function question(about: ProposedQuestion["about"], choices: string[] = []): ProposedQuestion {
  return {
    about,
    question: `What about ${about}?`,
    why: `It changes the ${about} of the map.`,
    answerType: choices.length ? "choice" : "free_text",
    choices,
  };
}

const goodQuestions: ClarifyProposal = {
  questions: [question("goal"), question("scope", ["Analog only", "Analog and digital"])],
};

function setup(): { db: DatabaseSync; goalId: string } {
  const db = openDatabase(":memory:");
  const goal = createGoal(db, { title: "Signals", kind: "course", capstone: "Design a filter" });
  return { db, goalId: goal.id };
}

function aiCalls(db: DatabaseSync) {
  return db.prepare("SELECT agent, attempt, status, effort FROM ai_call ORDER BY id").all();
}

// ---- Tests ----

describe("clarifyMap", () => {
  it("saves the questions as one round with the goal, each with an id", async () => {
    const { db, goalId } = setup();
    const stages: ExtractionStage[] = [];
    const round = await clarifyMap(db, { goalId, sourceText: "Week 1: LTI", sourceKind: "syllabus" }, {
      callModel: fakeModel([goodQuestions]).callModel,
      onProgress: (stage) => stages.push(stage),
    });

    expect(round.questions.map((q) => q.about)).toEqual(["goal", "scope"]);
    expect(round.questions[1]?.choices).toEqual(["Analog only", "Analog and digital"]);
    expect(round.questions.every((q) => q.id && q.answer === undefined)).toBe(true);

    const saved = getRound(db, round.roundId);
    expect(saved?.goalId).toBe(goalId);
    expect(saved?.sourceId).not.toBeNull(); // the source is saved now, so the extraction uses this exact text
    expect(aiCalls(db)).toEqual([{ agent: "clarify-map", attempt: 1, status: "ok", effort: "medium" }]);
    expect(stages.at(-1)).toBe("asked");
  });

  it("sends the goal and source kind, or says there is no source", async () => {
    const { db, goalId } = setup();
    const { callModel, requests } = fakeModel([goodQuestions, goodQuestions]);
    await clarifyMap(db, { goalId, sourceText: "Ch 1. Signals", sourceKind: "contents" }, { callModel });
    await clarifyMap(db, { goalId }, { callModel });

    expect(requests[0]?.messages[0]?.content).toContain("Capstone: Design a filter");
    expect(requests[0]?.messages[0]?.content).toContain("Kind: Table of contents\n<source>\nCh 1. Signals\n</source>");
    expect(requests[1]?.messages[0]?.content).toContain("Kind: None\nNo source material.");
    expect(getRound(db, (await clarifyMap(db, { goalId }, { callModel: fakeModel([goodQuestions]).callModel })).roundId)?.sourceId).toBeNull();
  });

  it("retries when the first question isn't about the goal", async () => {
    const { db, goalId } = setup();
    const { callModel, requests } = fakeModel([{ questions: [question("scope")] }, goodQuestions]);
    await clarifyMap(db, { goalId }, { callModel });
    expect(requests[1]?.messages[2]?.content).toContain("The first question must be about the learner's goal");
    expect(aiCalls(db).map((c) => c.status)).toEqual(["invalid", "ok"]);
  });

  it("rejects more than 3 questions", async () => {
    const { db, goalId } = setup();
    const four = { questions: [question("goal"), question("scope"), question("background"), question("other")] };
    const { callModel, requests } = fakeModel([four, goodQuestions]);
    await clarifyMap(db, { goalId }, { callModel });
    expect(requests[1]?.messages[2]?.content).toContain("Ask at most 3 questions; there are 4.");
  });

  it("rejects a choice question without 2-4 choices, and a free-text question with choices", async () => {
    const { db, goalId } = setup();
    const bad = {
      questions: [question("goal"), question("scope", ["Only one"]), { ...question("other"), choices: ["stray"] }],
    };
    const { callModel, requests } = fakeModel([bad, goodQuestions]);
    await clarifyMap(db, { goalId }, { callModel });
    const retry = String(requests[1]?.messages[2]?.content);
    expect(retry).toContain("question 2 is a choice question, so it needs 2-4 choices; it has 1.");
    expect(retry).toContain("question 3 is free_text, so its choices must be empty.");
  });

  it("refuses to save a round when the first question is never about the goal", async () => {
    const { db, goalId } = setup();
    const noGoal = { questions: [question("scope")] };
    await expect(clarifyMap(db, { goalId }, { callModel: fakeModel([noGoal, noGoal]).callModel })).rejects.toThrow(
      /still invalid after 2 tries/,
    );
    expect(db.prepare("SELECT COUNT(*) AS n FROM clarify_round").get()?.n).toBe(0);
  });

  it("shows earlier answers, and allows asking nothing once the goal is answered", async () => {
    const { db, goalId } = setup();
    const first = await clarifyMap(db, { goalId }, { callModel: fakeModel([goodQuestions]).callModel });
    saveAnswers(db, getRound(db, first.roundId)!, [
      { questionId: first.questions[0]!.id, answer: "Pass the exam in December" },
      { questionId: first.questions[1]!.id, answer: "Analog only" },
    ]);

    const { callModel, requests } = fakeModel([{ questions: [] }]);
    const second = await clarifyMap(db, { goalId }, { callModel });

    expect(second.questions).toEqual([]);
    expect(requests[0]?.messages[0]?.content).toContain("- (goal) What about goal?\n  Answer: Pass the exam in December");
  });

  it("sends a schema the API accepts: every object closed, no length limits", async () => {
    const { db, goalId } = setup();
    const { callModel, requests } = fakeModel([goodQuestions]);
    await clarifyMap(db, { goalId }, { callModel });
    const schema = requests[0]!.schema;
    expect(schema).not.toHaveProperty("$schema");
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum|minItems|maxItems|pattern)"/);
  });
});
