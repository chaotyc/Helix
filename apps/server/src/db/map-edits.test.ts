import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { MapEdit, ServerMsg } from "@helix/contracts";
import { handle } from "../handlers.ts";
import { createGoal } from "./goals.ts";
import { readGraph, readMapEvents } from "./graph.ts";
import { applyEdits, sharedWith } from "./map-edits.ts";
import { openDatabase } from "./open.ts";

const concept = (id: string) => ({ id, name: id, description: `About ${id}.`, kind: "concept" as const });
const addToGoal = (id: string, targetDepth: 1 | 2 | 3 | 4 | 5 = 3): MapEdit[] => [
  { op: "add_concept", concept: concept(id) },
  { op: "set_view_entry", entry: { conceptId: id, targetDepth, role: "taught" } },
];
const arrow = (dst: string, src: string) => ({ type: "prereq" as const, src, srcDepth: 1 as const, dst, dstDepth: 1 as const });

function setup(): { db: DatabaseSync; goalId: string } {
  const db = openDatabase(":memory:");
  return { db, goalId: createGoal(db, { title: "Signals", kind: "course", capstone: "" }).id };
}

describe("applyEdits", () => {
  it("records each edit as a human diary entry, all sharing one request id", () => {
    const { db, goalId } = setup();
    applyEdits(db, goalId, [...addToGoal("lti"), ...addToGoal("convolution")]);

    const events = readMapEvents(db);
    expect(events.map((e) => e.op)).toEqual(["add_concept", "set_view_entry", "add_concept", "set_view_entry"]);
    expect(new Set(events.map((e) => e.actor))).toEqual(new Set(["human"]));
    expect(new Set(events.map((e) => e.requestId)).size).toBe(1);
    expect(readGraph(db).views[goalId]?.map((e) => e.conceptId)).toEqual(["lti", "convolution"]);
  });

  it("applies all of a batch or none: a loop in the last edit undoes the earlier ones", () => {
    const { db, goalId } = setup();
    applyEdits(db, goalId, [...addToGoal("a"), ...addToGoal("b"), { op: "add_edge", edge: arrow("b", "a") }]);
    const before = readMapEvents(db).length;

    expect(() =>
      applyEdits(db, goalId, [...addToGoal("c"), { op: "add_edge", edge: arrow("a", "b") }]), // a needs b needs a
    ).toThrow(/prerequisite loop/);
    expect(readMapEvents(db)).toHaveLength(before);
    expect(readGraph(db).concepts.map((c) => c.id)).not.toContain("c");
  });

  it("removes a concept from this goal only, keeping it for others", () => {
    const { db, goalId } = setup();
    const other = createGoal(db, { title: "Control", kind: "course", capstone: "" }).id;
    applyEdits(db, goalId, addToGoal("complex-numbers"));
    applyEdits(db, other, [{ op: "set_view_entry", entry: { conceptId: "complex-numbers", targetDepth: 2, role: "background" } }]);

    applyEdits(db, goalId, [{ op: "remove_view_entry", conceptId: "complex-numbers" }]);
    const graph = readGraph(db);
    expect(graph.views[goalId] ?? []).toEqual([]);
    expect(graph.views[other]?.[0]?.conceptId).toBe("complex-numbers");
    expect(graph.concepts.map((c) => c.id)).toContain("complex-numbers");
  });
});

describe("sharedWith", () => {
  it("names the other goals that use each concept", () => {
    const { db, goalId } = setup();
    const other = createGoal(db, { title: "Control", kind: "course", capstone: "" }).id;
    applyEdits(db, goalId, [...addToGoal("complex-numbers"), ...addToGoal("convolution")]);
    applyEdits(db, other, [{ op: "set_view_entry", entry: { conceptId: "complex-numbers", targetDepth: 2, role: "background" } }]);
    expect(sharedWith(db, goalId)).toEqual({ "complex-numbers": ["Control"] });
  });
});

describe("the map.edit message", () => {
  async function send(db: DatabaseSync, goalId: string, edits: MapEdit[]): Promise<ServerMsg[]> {
    const replies: ServerMsg[] = [];
    await handle(db, { type: "map.edit", goalId, edits }, (r) => replies.push(r));
    return replies;
  }

  it("replies with the new learner state, then the updated map", async () => {
    const { db, goalId } = setup();
    const replies = await send(db, goalId, addToGoal("lti"));
    expect(replies.map((r) => r.type)).toEqual(["learner.state", "map.updated"]); // the arrows feed what's held
    expect(replies[1]).toMatchObject({ type: "map.updated", map: { goalId, view: [{ conceptId: "lti" }] }, sharedWith: {} });
  });

  it("replies with the broken rule when an edit is rejected", async () => {
    const { db, goalId } = setup();
    const [reply] = await send(db, goalId, [{ op: "add_edge", edge: arrow("lti", "ghost") }]);
    expect(reply?.type).toBe("map.edit.rejected");
    expect(reply).toMatchObject({ goalId, reason: expect.stringContaining("ghost") });
  });
});
