// Undo for click edits: take back the most recent human edit on a goal's map by appending its
// inverse to the diary (rule 3: the log is append-only). Each inverse entry is a human change
// with its own before and after (rule 4), and names the entry it undoes in its payload.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { actionLabel, planUndo, replayGraph, undoableActions } from "@helix/core";
import { readMapEvents, recordMapChange } from "./graph.ts";
import { inTransaction } from "./transaction.ts";

// Undoes the goal's most recent human edit that isn't undone yet, and returns its name
// ("Remove “LTI systems” from this goal"). All its parts are undone together or not at all.
// Throws, starting "Can't undo", if the map has moved on or the inverse would break a rule.
export function undoLastEdit(db: DatabaseSync, goalId: string): string {
  return inTransaction(db, () => {
    const events = readMapEvents(db);
    const action = undoableActions(events, goalId)[0];
    if (!action) throw new Error("Nothing to undo");
    const graph = replayGraph(events);
    const label = actionLabel(graph, action);
    const requestId = randomUUID(); // the inverse entries read as one action too
    for (const step of planUndo(graph, action)) {
      recordMapChange(db, step.command, { actor: "human", goalId, requestId, undoes: step.undoes });
    }
    return label;
  });
}

// What Undo would take back on this goal's map, in words, or null if nothing.
export function nextUndo(db: DatabaseSync, goalId: string): string | null {
  const events = readMapEvents(db);
  const action = undoableActions(events, goalId)[0];
  return action ? actionLabel(replayGraph(events), action) : null;
}
