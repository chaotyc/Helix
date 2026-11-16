// Whole sessions, run through the message handlers against a fake model: the order of agent
// calls, what reaches the logs, and what the window is told.
import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, Edge, ServerMsg, ViewEntry } from "@helix/contracts";
import { fakeModel, type FakeAnswer } from "../ai/fake-model.ts";
import { createGoal } from "../db/goals.ts";
import { recordMapChange } from "../db/graph.ts";
import { openDatabase } from "../db/open.ts";
import { insertEvidence, insertItem } from "../db/learner.ts";
import { createSession } from "../db/sessions.ts";
import { handle } from "../handlers.ts";

const concept = (id: string) => ({ id, name: id.toUpperCase(), description: `About ${id}.`, kind: "concept" as const });
const needs = (dst: string, dstDepth: number, src: string, srcDepth: number): Edge => ({ type: "prereq", src, srcDepth, dst, dstDepth });
const taught = (conceptId: string, targetDepth: number): ViewEntry => ({ conceptId, targetDepth, role: "taught" });

// A goal whose map is: b (target 2), whose depth 2 needs a@1; a (target 1).
function setup(): { db: DatabaseSync; goalId: string } {
  const db = openDatabase(":memory:");
  const goalId = createGoal(db, { title: "Course", kind: "course", capstone: "" }).id;
  recordMapChange(
    db,
    { op: "extract", goalId, concepts: [concept("a"), concept("b")], edges: [needs("b", 2, "a", 1)], view: [taught("a", 1), taught("b", 2)], raw: {} },
    { actor: "extractor", promptVersion: "test", model: "none" },
  );
  return { db, goalId };
}

// Sends messages one after another; collects everything the server sends back.
function client(db: DatabaseSync, answers: FakeAnswer[]) {
  const fake = fakeModel(answers);
  const sent: ServerMsg[] = [];
  const send = (msg: ClientMsg) => handle(db, msg, (m) => sent.push(m), fake.callModel);
  return { send, sent, fake, of: <T extends ServerMsg["type"]>(type: T) => sent.filter((m): m is Extract<ServerMsg, { type: T }> => m.type === type) };
}

const item = (prompt: string) => ({ prompt, rubric: "r", expectedAnswer: "e" });
const right = { correct: true, errorTag: null, explanation: "Yes.", notes: "solid", misconceptionId: null, newMisconception: null };
const wrong = (newMisconception: string | null) => ({
  correct: false,
  errorTag: newMisconception ? "misconception" : "slip",
  explanation: "Not quite.",
  notes: "confused",
  misconceptionId: null,
  newMisconception,
});
const summary = { summary: "Covered a and b." };
const tutor = (message: string, extra: object = {}) => ({ message, method: "socratic", question: null, taskDone: false, ...extra });

function rows(db: DatabaseSync, sql: string) {
  return db.prepare(sql).all() as Record<string, unknown>[];
}

describe("a diagnostic session", () => {
  it("asks, grades into evidence, names misconceptions, and ends with a summary", async () => {
    const { db, goalId } = setup();
    const c = client(db, [item("Q1"), right, item("Q2"), wrong("Thinks a is b"), item("Q3"), right, summary]);

    await c.send({ type: "session.start", goalId, kind: "diagnostic" });
    const sessionId = c.of("session.started")[0]!.session.id;
    for (const text of ["answer 1", "answer 2", "answer 3"]) {
      await c.send({ type: "session.reply", sessionId, text, confidence: 4 });
    }

    // The picker's order: b@2 covers the most; then a@1 and b@1 tie (each covers only itself), course order first.
    const asked = c.of("session.item").flatMap((m) => (m.item.type === "question" ? [`${m.item.conceptId}@${m.item.depth}`] : []));
    expect(asked).toEqual(["b@2", "a@1", "b@1"]);

    const evidence = rows(db, "SELECT concept_id, depth, correct, confidence, predicted_p, prompt_version, misconception_id FROM evidence ORDER BY seq");
    expect(evidence.map((e) => e.correct)).toEqual([1, 0, 1]);
    expect(evidence[0]!.predicted_p).toBeCloseTo(0.2 * 0.9 + 0.8 * 0.15, 10); // K8: predicted from the prior
    expect(String(evidence[0]!.prompt_version)).toMatch(/^grader@/);

    const [mis] = rows(db, "SELECT id, concept_id, description FROM misconception");
    expect(mis).toMatchObject({ concept_id: "a", description: "Thinks a is b" });
    expect(evidence[1]!.misconception_id).toBe(mis!.id);

    expect(rows(db, "SELECT * FROM concept_state").length).toBe(3); // one per concept-depth answered
    expect(c.of("learner.state")).toHaveLength(3); // the map recolors after every answer
    const ended = c.of("session.ended")[0]!.session;
    expect(ended.summary).toBe("Covered a and b.");
    expect(c.fake.requests).toHaveLength(7);
  });

  it("refuses an answer without a confidence rating, and grades nothing", async () => {
    const { db, goalId } = setup();
    const c = client(db, [item("Q1")]);
    await c.send({ type: "session.start", goalId, kind: "diagnostic" });
    const sessionId = c.of("session.started")[0]!.session.id;

    await expect(c.send({ type: "session.reply", sessionId, text: "x" })).rejects.toThrow(/confidence/);
    expect(rows(db, "SELECT * FROM evidence")).toHaveLength(0);
  });

  it("after a failed call, says so, resends the timeline, and can resume", async () => {
    const { db, goalId } = setup();
    const c = client(db, ["not json", "still not json", item("Q1")]); // two invalid answers: the call fails
    await expect(c.send({ type: "session.start", goalId, kind: "diagnostic" })).rejects.toThrow(/invalid/);
    const sessionId = c.of("session.started")[0]!.session.id;

    expect(c.of("session.status").at(-1)).toMatchObject({ busy: false, detail: expect.stringMatching(/^Failed:/) });
    expect(c.of("session.timeline")).toHaveLength(1);

    await c.send({ type: "session.resume", sessionId });
    expect(c.of("session.item").some((m) => m.item.type === "question")).toBe(true);
  });
});

describe("a tutoring session", () => {
  it("teaches the planned task, grades its retrieval question, and won't finish a task without one", async () => {
    const { db, goalId } = setup();
    const question = { prompt: "Why a?", rubric: "r", expectedAnswer: "e", step: "the key idea", stepKind: "reasoning" };
    const c = client(db, [
      tutor("What do you predict?"),
      tutor("Done!", { taskDone: true }), // rejected: no graded answer in this task yet
      tutor("Now from memory:", { question }),
      right,
      tutor("Well done.", { taskDone: true }),
      summary,
    ]);

    await c.send({ type: "session.start", goalId, kind: "tutoring" });
    const sessionId = c.of("session.started")[0]!.session.id;
    await c.send({ type: "session.reply", sessionId, text: "I'd guess x" }); // ungraded: no confidence needed
    await c.send({ type: "session.reply", sessionId, text: "Because y", confidence: 3 });

    // A new learner: no reviews, and the frontier is a@1.
    const [task] = rows(db, "SELECT kind, concept_id, depth, method, ended_at FROM task");
    expect(task).toMatchObject({ kind: "focus", concept_id: "a", depth: 1, method: "socratic" });
    expect(task!.ended_at).not.toBeNull();

    const calls = rows(db, "SELECT agent, status FROM ai_call ORDER BY id");
    expect(calls.filter((x) => x.agent === "tutor").map((x) => x.status)).toEqual(["ok", "invalid", "ok", "ok"]);

    const [e] = rows(db, "SELECT step, step_kind, task_id FROM evidence");
    expect(e).toMatchObject({ step: "the key idea", step_kind: "reasoning", task_id: expect.any(String) });
    const [i] = rows(db, "SELECT prompt_version FROM item");
    expect(String(i!.prompt_version)).toMatch(/^tutor@/); // the tutor wrote this question

    expect(c.of("session.ended")).toHaveLength(1);
    // The tutor's text streamed: an unfinished version went out before the saved one.
    expect(c.of("session.item").some((m) => m.item.type === "tutor" && m.item.streaming)).toBe(true);
  });

  it("with every concept at its target depth, plans a review-only session", async () => {
    const { db, goalId } = setup();
    // Three right answers on b@2 make it held; right answers pass down to b@1 and a@1.
    const s = createSession(db, goalId, "diagnostic");
    const q = insertItem(db, { goalId, conceptId: "b", depth: 2, ...item("Q"), promptVersion: "t", model: "m", aimedAt: null, sessionId: s.id, taskId: null });
    for (let n = 0; n < 3; n += 1) {
      insertEvidence(db, {
        goalId, conceptId: "b", depth: 2, itemId: q.id, sessionId: s.id, taskId: null, answer: "x", correct: true, confidence: 5,
        errorTag: null, explanation: "", notes: "", misconceptionId: null, predictedP: 0.5, step: null, stepKind: null, promptVersion: "t", model: "m",
      });
    }

    const question = { prompt: "Recall b?", rubric: "r", expectedAnswer: "e", step: "recall", stepKind: "reasoning" };
    const c = client(db, [tutor("Quick review:", { question })]);
    await c.send({ type: "session.start", goalId, kind: "tutoring" });
    expect(rows(db, "SELECT kind, concept_id, depth FROM task")).toEqual([{ kind: "review", concept_id: "b", depth: 2 }]);
  });

});
