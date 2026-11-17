import { describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import type { MapEdit, ServerMsg } from "@helix/contracts";
import { handle } from "../handlers.ts";
import { createGoal } from "./goals.ts";
import { readGraph, readMapEvents } from "./graph.ts";
import { applyEdits } from "./map-edits.ts";
import { nextUndo, undoLastEdit } from "./map-undo.ts";
import { openDatabase } from "./open.ts";

const concept = (id: string) => ({ id, name: id, description: `About ${id}.`, kind: "concept" as const });
const addToGoal = (id: string): MapEdit[] => [
  { op: "add_concept", concept: concept(id) },
  { op: "set_view_entry", entry: { conceptId: id, targetDepth: 3, role: "taught" } },
];
const arrow = (dst: string, src: string) => ({ type: "prereq" as const, src, srcDepth: 1 as const, dst, dstDepth: 1 as const });

function setup(): { db: DatabaseSync; goalId: string } {
  const db = openDatabase(":memory:");
  const goalId = createGoal(db, { title: "Signals", kind: "course", capstone: "" }).id;
  applyEdits(db, goalId, [...addToGoal("a"), ...addToGoal("b"), { op: "add_edge", edge: arrow("b", "a") }]);
  return { db, goalId };
}

describe("undoLastEdit", () => {
  it("appends inverse human entries with before, after, and the undone seq; deletes nothing", () => {
    const { db, goalId } = setup();
    applyEdits(db, goalId, [{ op: "remove_view_entry", conceptId: "b" }]);
    const before = readMapEvents(db);
    const removal = before.at(-1)!;

    expect(undoLastEdit(db, goalId)).toBe("Remove “b” from this goal");

    const after = readMapEvents(db);
    expect(after.slice(0, before.length)).toEqual(before); // the diary only grew
    expect(after.at(-1)).toMatchObject({
      op: "set_view_entry",
      actor: "human",
      goalId,
      payload: { goalId, entry: { conceptId: "b" }, undoes: removal.seq },
      before: null,
      after: { conceptId: "b", targetDepth: 3, role: "taught" },
    });
    expect(readGraph(db).views[goalId]?.map((e) => e.conceptId)).toEqual(["a", "b"]);
  });

  it("repeats down the stack, then says there's nothing left", () => {
    const { db, goalId } = setup();
    expect(nextUndo(db, goalId)).toBe("Add 2 concepts"); // the setup's one batch
    applyEdits(db, goalId, [{ op: "delete_edge", edge: arrow("b", "a") }]);
    expect(nextUndo(db, goalId)).toBe("Delete arrow “a” → “b”");
    undoLastEdit(db, goalId);
    expect(readGraph(db).edges).toHaveLength(1);
    undoLastEdit(db, goalId);
    expect(readGraph(db).concepts).toEqual([]);
    expect(nextUndo(db, goalId)).toBeNull();
    expect(() => undoLastEdit(db, goalId)).toThrow("Nothing to undo");
  });

  it("refuses, writing nothing, when bringing an arrow back would make a loop", () => {
    const { db, goalId } = setup();
    applyEdits(db, goalId, [{ op: "delete_edge", edge: arrow("b", "a") }]);
    const other = createGoal(db, { title: "Control", kind: "course", capstone: "" }).id;
    applyEdits(db, other, [{ op: "add_edge", edge: arrow("a", "b") }]); // a needs b, from another goal
    const count = readMapEvents(db).length;
    expect(() => undoLastEdit(db, goalId)).toThrow(/Can't undo: .*prerequisite loop/);
    expect(readMapEvents(db)).toHaveLength(count);
  });
});

describe("the map.undo message", () => {
  it("replies map.undone, the learner state, then the map with what's next to undo", async () => {
    const { db, goalId } = setup();
    applyEdits(db, goalId, [{ op: "remove_view_entry", conceptId: "b" }]);
    const replies: ServerMsg[] = [];
    await handle(db, { type: "map.undo", goalId }, (r) => replies.push(r));
    expect(replies.map((r) => r.type)).toEqual(["map.undone", "learner.state", "map.updated"]);
    expect(replies[0]).toEqual({ type: "map.undone", goalId, undid: "Remove “b” from this goal" });
    expect(replies[2]).toMatchObject({ nextUndo: "Add 2 concepts" });
  });

  it("replies map.edit.rejected when there's nothing to undo", async () => {
    const db = openDatabase(":memory:");
    const goalId = createGoal(db, { title: "Empty", kind: "course", capstone: "" }).id;
    const replies: ServerMsg[] = [];
    await handle(db, { type: "map.undo", goalId }, (r) => replies.push(r));
    expect(replies).toEqual([{ type: "map.edit.rejected", goalId, reason: "Nothing to undo" }]);
  });
});
