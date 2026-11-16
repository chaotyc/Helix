// Click edits to a goal's map (Step 10), and what the editor needs to know about sharing.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { MapEdit, ServerMsg, SharedWith } from "@helix/contracts";
import { goalSlice, type MapCommand } from "@helix/core";
import { listGoals } from "./goals.ts";
import { readGraph, recordMapChange } from "./graph.ts";
import { inTransaction } from "./transaction.ts";

// An edit as the UI sends it → a command for the graph. View edits belong to `goalId`.
function toCommand(goalId: string, edit: MapEdit): MapCommand {
  switch (edit.op) {
    case "set_view_entry":
      return { op: "set_view_entry", goalId, entry: edit.entry };
    case "remove_view_entry":
      return { op: "remove_view_entry", goalId, conceptId: edit.conceptId };
    default:
      return edit;
  }
}

// Applies every edit or none. Each becomes one diary entry with actor "human" and its
// before and after (rule 4); they share one request id, so they read as one action.
// Throws with the rule that was broken, e.g. "This change would break the map: prerequisite loop: ...".
export function applyEdits(db: DatabaseSync, goalId: string, edits: MapEdit[]): void {
  const requestId = randomUUID();
  inTransaction(db, () => {
    for (const edit of edits) recordMapChange(db, toCommand(goalId, edit), { actor: "human", goalId, requestId });
  });
}

// For each concept in this goal's map, the titles of the other goals that use it too (V2).
export function sharedWith(db: DatabaseSync, goalId: string): SharedWith {
  const graph = readGraph(db);
  const titles = new Map(listGoals(db).map((g) => [g.id, g.title]));
  const result: SharedWith = {};
  for (const entry of graph.views[goalId] ?? []) {
    const others = Object.entries(graph.views)
      .filter(([otherId, view]) => otherId !== goalId && view.some((e) => e.conceptId === entry.conceptId))
      .map(([otherId]) => titles.get(otherId) ?? otherId);
    if (others.length) result[entry.conceptId] = others;
  }
  return result;
}

// The reply every map change ends with: the goal's slice of the graph, and what it shares.
export function mapUpdate(db: DatabaseSync, goalId: string): ServerMsg {
  return { type: "map.updated", map: goalSlice(readGraph(db), goalId), sharedWith: sharedWith(db, goalId) };
}
