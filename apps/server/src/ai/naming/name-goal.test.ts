import { describe, expect, it } from "vitest";
import { ClientMsg, type ServerMsg } from "@helix/contracts";
import { openDatabase } from "../../db/open.ts";
import { getGoal, renameGoal } from "../../db/goals.ts";
import { handle } from "../../handlers.ts";
import { fakeModel } from "../fake-model.ts";
import { checkName, standInTitle } from "./name-goal.ts";

describe("standInTitle", () => {
  it("is the first line of the learner's words", () => {
    expect(standInTitle("Signals and systems\nfor my EE course")).toBe("Signals and systems");
  });

  it("is cut at a word when the line is long", () => {
    const title = standInTitle("I want to learn enough linear algebra to follow a machine learning course next term");
    expect(title.length).toBeLessThanOrEqual(49);
    expect(title).toBe("I want to learn enough linear algebra to follow…");
  });
});

describe("checkName", () => {
  it("puts a title on one line", () => {
    expect(checkName(JSON.stringify({ title: "Signals\nand  systems" }))).toEqual({ ok: true, value: "Signals and systems" });
    expect(standInTitle("One\rTwo")).toBe("One");
  });

  it("drops quotes and an ending period", () => {
    expect(checkName(JSON.stringify({ title: "“Signals and systems.”" }))).toEqual({ ok: true, value: "Signals and systems" });
  });

  it("rejects an empty or too-long title", () => {
    expect(checkName(JSON.stringify({ title: "  " })).ok).toBe(false);
    expect(checkName(JSON.stringify({ title: "x".repeat(41) })).ok).toBe(false);
  });
});

describe("goal.create without a title", () => {
  async function create(answers: object[]) {
    const db = openDatabase(":memory:");
    const sent: ServerMsg[] = [];
    const { callModel, requests } = fakeModel(answers);
    await handle(db, { type: "goal.create", goal: { kind: "course", prompt: "Signals and systems for my EE course" } }, (m) => sent.push(m), callModel);
    return { db, sent, requests };
  }

  it("creates the goal with a stand-in title, then sends the model's name", async () => {
    const { db, sent, requests } = await create([{ title: "Signals and systems" }]);
    expect(sent.map((m) => m.type)).toEqual(["goal.created", "goal.updated"]);
    const created = sent[0]!.type === "goal.created" ? sent[0]!.goal : null;
    expect(created?.title).toBe("Signals and systems for my EE course");
    expect(getGoal(db, created!.id)?.title).toBe("Signals and systems");
    expect(requests[0]?.messages[0]?.content).toContain("<learner_prompt>\nSignals and systems for my EE course\n</learner_prompt>");
  });

  it("keeps the stand-in when naming fails", async () => {
    const { sent } = await create([]); // the fake model has no answer: the call fails
    expect(sent.map((m) => m.type)).toEqual(["goal.created"]);
  });

  it("never replaces a title the learner typed meanwhile", async () => {
    const db = openDatabase(":memory:");
    const sent: ServerMsg[] = [];
    const callModel = fakeModel([{ title: "Signals and systems" }]).callModel;
    await handle(
      db,
      { type: "goal.create", goal: { kind: "course", prompt: "Signals" } },
      (m) => {
        sent.push(m);
        if (m.type === "goal.created") renameGoal(db, m.goal.id, "My EE class"); // renamed before the name arrives
      },
      callModel,
    );
    expect(sent.map((m) => m.type)).toEqual(["goal.created"]);
    const id = sent[0]!.type === "goal.created" ? sent[0]!.goal.id : "";
    expect(getGoal(db, id)?.title).toBe("My EE class");
  });

  it("keeps a rename made during naming, even to the stand-in's own words", async () => {
    const db = openDatabase(":memory:");
    const sent: ServerMsg[] = [];
    const reply = (m: ServerMsg) => sent.push(m);
    const { callModel } = fakeModel([{ title: "Signals and systems" }]);
    let renamed: Promise<void> | undefined;
    await handle(
      db,
      { type: "goal.create", goal: { kind: "course", prompt: "Signals" } },
      (m) => {
        reply(m);
        if (m.type === "goal.created") renamed = handle(db, { type: "goal.rename", goalId: m.goal.id, title: m.goal.title }, reply);
      },
      callModel,
    );
    await renamed;
    const id = sent[0]!.type === "goal.created" ? sent[0]!.goal.id : "";
    expect(getGoal(db, id)?.title).toBe("Signals");
    expect(sent.filter((m) => m.type === "goal.updated").map((m) => (m.type === "goal.updated" ? m.goal.title : ""))).toEqual(["Signals"]);
  });

  it("doesn't call the model when a title is given", async () => {
    const { requests, sent } = await (async () => {
      const db = openDatabase(":memory:");
      const sent: ServerMsg[] = [];
      const { callModel, requests } = fakeModel([]);
      await handle(db, { type: "goal.create", goal: { title: "Control", kind: "course" } }, (m) => sent.push(m), callModel);
      return { requests, sent };
    })();
    expect(requests).toHaveLength(0);
    expect(sent.map((m) => m.type)).toEqual(["goal.created"]);
  });
});

describe("goal.rename", () => {
  it("saves the new title and sends the goal back", async () => {
    const db = openDatabase(":memory:");
    const sent: ServerMsg[] = [];
    await handle(db, { type: "goal.create", goal: { title: "Signals", kind: "course" } }, (m) => sent.push(m));
    const id = sent[0]!.type === "goal.created" ? sent[0]!.goal.id : "";
    await handle(db, { type: "goal.rename", goalId: id, title: "Signals and systems" }, (m) => sent.push(m));
    expect(sent[1]).toMatchObject({ type: "goal.updated", goal: { id, title: "Signals and systems" } });
  });
});

describe("goal titles from the UI", () => {
  it("are one non-blank line, here and when creating", () => {
    expect(ClientMsg.safeParse({ type: "goal.create", goal: { kind: "course", title: "   " } }).success).toBe(false);
    expect(ClientMsg.safeParse({ type: "goal.create", goal: { kind: "course", title: "a".repeat(121) } }).success).toBe(false);
    expect(ClientMsg.safeParse({ type: "goal.rename", goalId: "g", title: "two\nlines" }).success).toBe(false);
    expect(ClientMsg.safeParse({ type: "goal.rename", goalId: "g", title: "  Signals  " }).data).toMatchObject({ title: "Signals" });
    expect(ClientMsg.safeParse({ type: "goal.rename", goalId: "g", title: "My   renamed goal" }).data).toMatchObject({ title: "My renamed goal" });
  });
});

describe("a map job that fails before the model is called", () => {
  it("still reports failed progress for its goal", async () => {
    const db = openDatabase(":memory:");
    const sent: ServerMsg[] = [];
    await handle(db, { type: "goal.create", goal: { title: "Signals", kind: "course" } }, (m) => sent.push(m));
    const goalId = sent[0]!.type === "goal.created" ? sent[0]!.goal.id : "";
    await expect(handle(db, { type: "map.extract", goalId, roundId: "stale", answers: [] }, (m) => sent.push(m))).rejects.toThrow();
    expect(sent.at(-1)).toMatchObject({ type: "map.progress", goalId, stage: "failed" });
  });
});
