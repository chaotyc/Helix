import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnswerKind, type GoalMap, type Grade, type GraderJudgment, type SimulatedAnswers, type WrittenItem } from "@helix/contracts";
import type { ModelCall, ModelRequest } from "@helix/server";
import { loadCases } from "./cases.ts";
import { limitCalls, loadMapSources, runGraderItem, type MapSource } from "./grader-run.ts";

const map: GoalMap = {
  goalId: "g",
  concepts: [
    { id: "base", name: "Base idea", description: "What the topic builds on.", kind: "concept" },
    { id: "topic", name: "The topic", description: "The idea under test.", kind: "skill" },
  ],
  view: [
    { conceptId: "base", targetDepth: 2, role: "background" },
    { conceptId: "topic", targetDepth: 3, role: "taught" },
  ],
  edges: [{ type: "prereq", src: "base", srcDepth: 2, dst: "topic", dstDepth: 2 }],
};

const item: WrittenItem = { prompt: "Q?", rubric: "Must say R.", expectedAnswer: "R." };
const simulated: SimulatedAnswers = {
  answers: AnswerKind.options.map((kind) => ({ kind, answer: `answer of kind ${kind}`, confidence: 3 })),
};
const rightGrade: Grade = { correct: true, errorTag: null, explanation: "Right.", notes: "", misconceptionId: null, newMisconception: null };
const wrongGrade: Grade = { ...rightGrade, correct: false, errorTag: "slip", explanation: "A slip." };
const accept = (grade: Grade): GraderJudgment => ({
  reason: "Matches the rubric.",
  rubricSound: true,
  verdict: "right",
  tagFits: grade.correct ? "not_applicable" : "yes",
  betterTag: null,
});

// Answers by which agent is asking (told apart by the output schema), since the gradings run at once.
function fakeByAgent() {
  const requests: ModelRequest[] = [];
  const callModel: ModelCall = async (request) => {
    requests.push(request);
    const props = Object.keys((request.schema as { properties?: object }).properties ?? {});
    const user = String(request.messages[0]?.content);
    const grade = user.includes("fully_right") ? rightGrade : wrongGrade;
    const answer = props.includes("verdict")
      ? accept(user.includes("Verdict: right") ? rightGrade : wrongGrade)
      : props.includes("answers")
        ? simulated
        : props.includes("correct")
          ? grade
          : item;
    const text = JSON.stringify(answer);
    return { stopReason: "end_turn", text, native: [{ type: "text", text }], model: "claude-opus-5-5", inputTokens: 10, outputTokens: 10 };
  };
  return { callModel, requests };
}

const [demo] = loadCases(undefined, "signals-demo");
const source: MapSource = { case: "signals-demo", file: "maps-x.json", extractPromptVersion: "extract-map@x", extractModel: "m", map };

describe("runGraderItem", () => {
  it("writes a question, simulates eight answers, grades and judges each", async () => {
    const { callModel, requests } = fakeByAgent();
    const run = await runGraderItem({ case: "signals-demo", conceptId: "topic", depth: 2 }, demo!, source, {
      callModel,
      model: "claude-opus-5-5",
      learnerModel: "claude-opus-5-5",
      judgeModel: "claude-opus-5-5",
      effort: "medium",
      judgeEffort: "high",
      run: 1,
    });

    expect(requests).toHaveLength(2 + 2 * 8); // item writer, learner, then a grade and a judgment per answer
    expect(String(requests[0]?.messages[0]?.content)).toContain("- Base idea at depth 2"); // what it builds on, from the map
    expect(run.answers.map((a) => a.kind)).toEqual(AnswerKind.options);
    expect(run.answers.every((a) => a.judgment.verdict === "right")).toBe(true);
    expect(run.failures).toEqual([]);
    expect(run.versions.grader).toMatch(/^grader@/);
    expect(run.versions.judge).toMatch(/^judge-grader@/);
    expect(run.versions.learner).toMatch(/^simulate-learner@/);
  });

  it("never shows the judge or the grader the kind an answer was written as", async () => {
    const { callModel, requests } = fakeByAgent();
    await runGraderItem({ case: "signals-demo", conceptId: "topic", depth: 1 }, demo!, source, {
      callModel,
      model: "claude-opus-5-5",
      learnerModel: "claude-opus-5-5",
      judgeModel: "claude-opus-5-5",
      effort: "medium",
      judgeEffort: "high",
      run: 1,
    });
    const graded = requests.slice(2).map((r) => String(r.messages[0]?.content));
    for (const text of graded) expect(text).not.toMatch(/\bkind: |Kinds to write/);
  });
});

describe("loadMapSources", () => {
  it("takes the newest saved map of each case, passing over runs saved without one", () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-maps-"));
    const run = (extractPromptVersion: string, withMap: boolean) => ({
      case: "signals-demo",
      extractPromptVersion,
      extractModel: "m",
      ...(withMap ? { map } : {}),
    });
    writeFileSync(join(dir, "maps-2026-11-17-0100-a.json"), JSON.stringify({ runs: [run("extract-map@old", true)] }));
    writeFileSync(join(dir, "maps-2026-11-17-0200-b.json"), JSON.stringify({ runs: [run("extract-map@new", true)] }));
    writeFileSync(join(dir, "maps-2026-11-17-0300-c.json"), JSON.stringify({ runs: [run("extract-map@nomap", false)] }));

    expect(loadMapSources(dir).get("signals-demo")?.extractPromptVersion).toBe("extract-map@new");
    expect(loadMapSources(dir, "maps-2026-11-17-0100-a.json").get("signals-demo")?.extractPromptVersion).toBe("extract-map@old");
    expect(loadMapSources(join(dir, "missing")).size).toBe(0);
  });
});

describe("limitCalls", () => {
  it("keeps at most `max` calls running at once", async () => {
    let running = 0;
    let peak = 0;
    const slow: ModelCall = async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { stopReason: "end_turn", text: "{}", model: "m", inputTokens: 0, outputTokens: 0 };
    };
    const limited = limitCalls(slow, 2);
    const request = { model: "claude-opus-5-5", system: "", messages: [], schema: {}, effort: "low" } as const;
    await Promise.all(Array.from({ length: 7 }, () => limited({ ...request, messages: [] })));
    expect(peak).toBe(2);
  });
});
