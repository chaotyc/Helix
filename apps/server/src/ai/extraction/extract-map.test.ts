import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { ClarifyAnswer, ExtractionProposal, ExtractionStage, SourceKind } from "@helix/contracts";
import { openDatabase } from "../../db/open.ts";
import { createGoal } from "../../db/goals.ts";
import { readGraph, readMapEvents } from "../../db/graph.ts";
import { loadPrompt } from "../prompts.ts";
import { fakeModel } from "../fake-model.ts";
import { clarifyMap } from "../clarification/clarify-map.ts";
import { extractMap } from "./extract-map.ts";
import { MESSAGES_FILE } from "./messages.ts";
import { REQUEST_PARTS_FILE } from "../request-parts.ts";

// ---- Builders ----

function concept(id: string, role: "taught" | "background" = "taught", targetDepth: 1 | 2 | 3 | 4 | 5 = 3) {
  return { id, name: id, description: `About ${id}.`, kind: "concept" as const, role, targetDepth };
}
function needs(c: string, depth: 1 | 2 | 3 | 4 | 5, n: string, needsDepth: 1 | 2 | 3 | 4 | 5) {
  return { concept: c, depth, needs: n, needsDepth, why: `${c} builds on ${n}.` };
}

const signalsMap: ExtractionProposal = {
  concepts: [concept("complex-numbers", "background", 2), concept("lti", "taught", 4), concept("convolution")],
  prerequisites: [needs("lti", 1, "complex-numbers", 2), needs("convolution", 1, "lti", 1)],
  partOf: [],
};

function setup(title = "Signals"): { db: DatabaseSync; goalId: string } {
  const db = openDatabase(":memory:");
  const goal = createGoal(db, { title, kind: "course", capstone: "Design a filter" });
  return { db, goalId: goal.id };
}

// Runs the clarifier (one goal question) and answers it: what every extraction starts from.
async function clarified(
  db: DatabaseSync,
  goalId: string,
  source?: { text: string; kind?: SourceKind },
  answer = "Pass the final exam",
): Promise<{ goalId: string; roundId: string; answers: ClarifyAnswer[] }> {
  const goalQuestion = { about: "goal", question: "What do you want from this course?", why: "Sets the depths.", answerType: "free_text", choices: [] };
  const round = await clarifyMap(db, { goalId, sourceText: source?.text, sourceKind: source?.kind }, {
    callModel: fakeModel([{ questions: [goalQuestion] }]).callModel,
  });
  return { goalId, roundId: round.roundId, answers: round.questions.map((q) => ({ questionId: q.id, answer })) };
}

function extractCalls(db: DatabaseSync) {
  return db
    .prepare("SELECT attempt, status, problems, prompt_version, effort, cost_usd FROM ai_call WHERE agent = 'extract-map' ORDER BY id")
    .all();
}

// ---- Tests ----

describe("extractMap", () => {
  it("saves a valid map as one extract entry, linked to its source, prompt version, and model", async () => {
    const { db, goalId } = setup();
    const input = await clarified(db, goalId, { text: "Week 1: LTI systems...", kind: "syllabus" });
    const stages: ExtractionStage[] = [];

    const map = await extractMap(db, input, {
      callModel: fakeModel([signalsMap]).callModel,
      onProgress: (stage) => stages.push(stage),
    });

    expect(map.concepts.map((c) => c.id)).toEqual(["complex-numbers", "lti", "convolution"]);
    expect(map.view[0]).toEqual({ conceptId: "complex-numbers", targetDepth: 2, role: "background" });

    const [event] = readMapEvents(db);
    expect(event?.op).toBe("extract");
    expect(event?.actor).toBe("extractor");
    expect(event?.promptVersion).toBe(loadPrompt("extract-map", [MESSAGES_FILE, REQUEST_PARTS_FILE], ["source-is-data"]).version);
    expect(event?.model).toBe("claude-opus-5-5");
    expect(event?.sourceId).not.toBeNull();

    expect(extractCalls(db)).toEqual([
      expect.objectContaining({ attempt: 1, status: "ok", effort: "high", cost_usd: (1000 * 4 + 2000 * 20) / 1e6 }),
    ]);
    expect(stages).toEqual(["started", "thinking", "writing", "checking", "saved"]);
  });

  it("keeps Claude's whole answer, explanations included, and the round, in the diary entry", async () => {
    const { db, goalId } = setup();
    const input = await clarified(db, goalId);
    await extractMap(db, input, { callModel: fakeModel([signalsMap]).callModel });
    const [event] = readMapEvents(db);
    expect(event?.payload).toMatchObject({
      raw: { roundId: input.roundId, proposal: { prerequisites: [{ why: "lti builds on complex-numbers." }, {}] } },
    });
  });

  it("sends the learner's answers, and works with no source", async () => {
    const { db, goalId } = setup();
    const input = await clarified(db, goalId, undefined, "Build a guitar pedal");
    const { callModel, requests } = fakeModel([signalsMap]);
    await extractMap(db, input, { callModel });

    const message = String(requests[0]?.messages[0]?.content);
    expect(message).toContain("Kind: None");
    expect(message).toContain("- (goal) What do you want from this course?\n  Answer: Build a guitar pedal");
    expect(readMapEvents(db)[0]?.sourceId).toBeNull();
  });

  it("uses the source saved with the round, with its kind", async () => {
    const { db, goalId } = setup();
    const input = await clarified(db, goalId, { text: "Ch 1. Signals", kind: "contents" });
    const { callModel, requests } = fakeModel([signalsMap]);
    await extractMap(db, input, { callModel });
    expect(requests[0]?.messages[0]?.content).toContain("Kind: Table of contents\n<source>\nCh 1. Signals\n</source>");
  });

  it("refuses to start, spending nothing, until every question is answered", async () => {
    const { db, goalId } = setup();
    const input = await clarified(db, goalId);
    const { callModel, requests } = fakeModel([signalsMap]);

    await expect(extractMap(db, { ...input, answers: [] }, { callModel })).rejects.toThrow(/Answer every question/);
    await expect(
      extractMap(db, { ...input, answers: [{ questionId: input.answers[0]!.questionId, answer: "   " }] }, { callModel }),
    ).rejects.toThrow(/Answer every question/);
    expect(requests).toHaveLength(0);
    expect(extractCalls(db)).toEqual([]);
  });

  it("rejects a round that belongs to another goal", async () => {
    const { db, goalId } = setup();
    const other = createGoal(db, { title: "Control", kind: "course", capstone: "" });
    const input = await clarified(db, other.id);
    await expect(extractMap(db, { ...input, goalId }, { callModel: fakeModel([signalsMap]).callModel })).rejects.toThrow(
      /No clarifying round/,
    );
  });

  it("retries once with the problems listed, and saves the corrected map", async () => {
    const { db, goalId } = setup();
    const broken = { ...signalsMap, prerequisites: [...signalsMap.prerequisites, needs("convolution", 2, "ghost", 1)] };
    const { callModel, requests } = fakeModel([broken, signalsMap]);

    await extractMap(db, await clarified(db, goalId), { callModel });

    expect(requests).toHaveLength(2);
    const retry = requests[1]!.messages;
    expect(retry.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry[2]?.content).toContain('no concept "ghost"');
    expect(extractCalls(db).map((c) => c.status)).toEqual(["invalid", "ok"]);
    expect(readMapEvents(db)).toHaveLength(1);
  });

  it("names a prerequisite loop in the problems", async () => {
    const { db, goalId } = setup();
    const loop = { ...signalsMap, prerequisites: [needs("lti", 1, "convolution", 1), needs("convolution", 1, "lti", 1)] };
    const { callModel, requests } = fakeModel([loop, signalsMap]);
    await extractMap(db, await clarified(db, goalId), { callModel });
    expect(requests[1]?.messages[2]?.content).toContain("prerequisite loop: convolution@1 → lti@1 → convolution@1");
  });

  it("gives up after two invalid answers and writes nothing to the map", async () => {
    const { db, goalId } = setup();
    const { callModel } = fakeModel(["not json at all", "still not json"]);
    await expect(extractMap(db, await clarified(db, goalId), { callModel })).rejects.toThrow(/still invalid after 2 tries/);
    expect(readMapEvents(db)).toEqual([]);
    expect(extractCalls(db)).toEqual([
      expect.objectContaining({ status: "invalid", problems: JSON.stringify(["The answer is not valid JSON."]) }),
      expect.objectContaining({ status: "invalid" }),
    ]);
  });

  it("rejects a badly formed concept id with a readable problem", async () => {
    const { db, goalId } = setup();
    const badId = { ...signalsMap, concepts: [...signalsMap.concepts, concept("Fourier Series")] };
    const { callModel, requests } = fakeModel([badId, signalsMap]);
    await extractMap(db, await clarified(db, goalId), { callModel });
    expect(requests[1]?.messages[2]?.content).toContain('concept "Fourier Series"');
  });

  it("stops at once on a refusal, without retrying", async () => {
    const { db, goalId } = setup();
    const { callModel, requests } = fakeModel([{ stopReason: "refusal" }]);
    await expect(extractMap(db, await clarified(db, goalId), { callModel })).rejects.toThrow(/declined/);
    expect(requests).toHaveLength(1);
    expect(extractCalls(db)).toEqual([expect.objectContaining({ status: "refused" })]);
  });

  it("shows a second course the existing concepts, and reuses them instead of duplicating", async () => {
    const { db, goalId } = setup();
    await extractMap(db, await clarified(db, goalId), { callModel: fakeModel([signalsMap]).callModel });

    const control = createGoal(db, { title: "Control", kind: "course", capstone: "Stabilize a plant" });
    const controlMap: ExtractionProposal = {
      concepts: [concept("complex-numbers", "background", 3), concept("stability", "taught", 4)],
      prerequisites: [needs("stability", 1, "complex-numbers", 2)],
      partOf: [],
    };
    const { callModel, requests } = fakeModel([controlMap]);
    await extractMap(db, await clarified(db, control.id), { callModel });

    expect(requests[0]?.messages[0]?.content).toContain("- complex-numbers (complex-numbers): About complex-numbers.");
    const graph = readGraph(db);
    expect(graph.concepts.filter((c) => c.id === "complex-numbers")).toHaveLength(1);
    expect(graph.views[goalId]?.[0]?.targetDepth).toBe(2); // Signals keeps its own target
    expect(graph.views[control.id]?.[0]?.targetDepth).toBe(3);
  });

  it("sends a schema the API accepts: every object closed, no $schema key", async () => {
    const { db, goalId } = setup();
    const { callModel, requests } = fakeModel([signalsMap]);
    await extractMap(db, await clarified(db, goalId), { callModel });
    const schema = requests[0]!.schema;
    expect(schema).not.toHaveProperty("$schema");
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(schema)).not.toMatch(/"(minimum|maximum|pattern)"/);
  });
});
