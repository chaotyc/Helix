import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { ExtractionProposal, JudgeReport } from "@helix/contracts";
import { openDatabase } from "../../db/open.ts";
import { createGoal } from "../../db/goals.ts";
import { createRound } from "../../db/clarifications.ts";
import { createSource } from "../../db/sources.ts";
import { saveSettings } from "../../db/settings.ts";
import { fakeModel } from "../fake-model.ts";
import { extractMap } from "../extraction/extract-map.ts";
import { judgeMap } from "./judge-map.ts";

const map: ExtractionProposal = {
  concepts: [
    { id: "complex-numbers", name: "Complex numbers", description: "Numbers a + bi.", kind: "concept", role: "background", targetDepth: 2 },
    { id: "lti", name: "LTI systems", description: "Linear, time-invariant systems.", kind: "concept", role: "taught", targetDepth: 4 },
  ],
  prerequisites: [{ concept: "lti", depth: 1, needs: "complex-numbers", needsDepth: 2, why: "SECRET-WHY-LINE" }],
  partOf: [],
};

const report: JudgeReport = {
  problems: [{ type: "wrong_target_depth", severity: "minor", conceptIds: ["lti"], reason: "3 is enough for this goal." }],
};

// A goal with a source, one answered question, and an extracted map: what the judge reads.
async function mapped(): Promise<{ db: DatabaseSync; goalId: string }> {
  const db = openDatabase(":memory:");
  const goal = createGoal(db, { title: "Signals", kind: "course", capstone: "Design a filter" });
  const sourceId = createSource(db, goal.id, "Week 1: LTI systems", "syllabus");
  const round = createRound(db, {
    goalId: goal.id,
    sourceId,
    questions: [{ about: "goal", question: "Why this course?", why: "", answerType: "free_text", choices: [] }],
  });
  await extractMap(
    db,
    { goalId: goal.id, roundId: round.id, answers: [{ questionId: round.questions[0]!.id, answer: "To pass the exam" }] },
    { callModel: fakeModel([map]).callModel },
  );
  return { db, goalId: goal.id };
}

describe("judgeMap", () => {
  it("returns the judge's problems and writes nothing to the map", async () => {
    const { db, goalId } = await mapped();
    const events = db.prepare("SELECT COUNT(*) AS n FROM map_event").get()?.n;
    const result = await judgeMap(db, { goalId }, { callModel: fakeModel([report]).callModel });
    expect(result.report).toEqual(report);
    expect(result.map.view.map((e) => e.conceptId)).toEqual(["complex-numbers", "lti"]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM map_event").get()?.n).toBe(events);
  });

  it("shows the goal, source, answers, and bare map, without the extractor's why lines", async () => {
    const { db, goalId } = await mapped();
    const { callModel, requests } = fakeModel([report]);
    await judgeMap(db, { goalId }, { callModel });
    const message = String(requests[0]?.messages[0]?.content);
    expect(message).toContain("Kind: Syllabus\n<source>\nWeek 1: LTI systems\n</source>");
    expect(message).toContain("Answer: To pass the exam");
    expect(message).toContain("- lti (LTI systems) [concept, taught, target depth 4]: Linear, time-invariant systems.");
    expect(message).toContain("- lti@1 needs complex-numbers@2");
    expect(message).not.toContain("SECRET-WHY-LINE");
  });

  it("uses the evaluation model from settings at xhigh effort, unless told otherwise", async () => {
    const { db, goalId } = await mapped();
    saveSettings(db, { models: { generation: "claude-opus-5-5", teaching: "claude-opus-5-5", evaluation: "claude-fable-5-1" } });
    const { callModel, requests } = fakeModel([report, report]);
    await judgeMap(db, { goalId }, { callModel });
    await judgeMap(db, { goalId, model: "claude-sonnet-5-5", effort: "high" }, { callModel });
    expect([requests[0]?.model, requests[0]?.effort]).toEqual(["claude-fable-5-1", "xhigh"]);
    expect([requests[1]?.model, requests[1]?.effort]).toEqual(["claude-sonnet-5-5", "high"]);
  });

  it("retries when a problem names a concept that isn't in the map, or an arrow without 2 ids", async () => {
    const { db, goalId } = await mapped();
    const bad: JudgeReport = {
      problems: [
        { type: "off_topic_concept", severity: "major", conceptIds: ["ghost"], reason: "Not here." },
        { type: "wrong_arrow", severity: "major", conceptIds: ["lti"], reason: "Not real." },
      ],
    };
    const { callModel, requests } = fakeModel([bad, report]);
    await judgeMap(db, { goalId }, { callModel });
    const retry = String(requests[1]?.messages[2]?.content);
    expect(retry).toContain("problem 1 (off_topic_concept) names concept ids not in the map: ghost.");
    expect(retry).toContain("problem 2 (wrong_arrow) is about an arrow, so it needs exactly 2 concept ids; it has 1.");
  });

  it("refuses to judge a goal with no map", async () => {
    const db = openDatabase(":memory:");
    const goal = createGoal(db, { title: "Empty", kind: "course", capstone: "" });
    await expect(judgeMap(db, { goalId: goal.id }, { callModel: fakeModel([]).callModel })).rejects.toThrow(/no map/);
  });
});
