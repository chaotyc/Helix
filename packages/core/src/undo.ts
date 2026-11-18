// Undo for the map diary. The diary is append-only, so undo never deletes an entry: it appends
// the inverse change. If entry c took the graph G to c(G), its inverse c⁻¹ takes c(G) back to G,
// the way a matrix inverse undoes a transform. That only holds if nothing touched the same
// things in between, so each inverse first checks the graph still looks the way c left it.
// Pure: no database, the same inputs always give the same output.
import type { Concept, ConceptGraph, Edge, MapChange, MapEvent } from "@helix/contracts";
import { applyChange, describeChange, sameConcept, sameEdge, sameEntry, type MapCommand } from "./graph.ts";

// One command to record, and the diary seq of the entry it takes back.
export type UndoStep = { command: MapCommand; undoes: number };

function conceptName(graph: ConceptGraph, id: string): string {
  return `“${graph.concepts.find((c) => c.id === id)?.name ?? id}”`;
}

function entryOf(graph: ConceptGraph, goalId: string, conceptId: string) {
  return (graph.views[goalId] ?? []).find((e) => e.conceptId === conceptId);
}

function arrowName(graph: ConceptGraph, e: Edge): string {
  return `arrow ${conceptName(graph, e.src)} → ${conceptName(graph, e.dst)}`;
}

// The fields of `from` that differ from `to`: the changes that turn `to` back into `from`.
function changesBack(from: Concept, to: Concept): Partial<Omit<Concept, "id">> {
  const changes: Partial<Omit<Concept, "id">> = {};
  if (from.name !== to.name) changes.name = from.name;
  if (from.description !== to.description) changes.description = from.description;
  if (from.kind !== to.kind) changes.kind = from.kind;
  return changes;
}

// The commands that take back one diary entry, given the graph as it is now.
// Throws if the graph has moved on since the entry (someone changed the same thing again).
export function inverseCommands(graph: ConceptGraph, change: MapChange): MapCommand[] {
  const name = (id: string) => conceptName(graph, id);
  const changedSince = (what: string) => new Error(`${what} has changed since that edit`);

  switch (change.op) {
    case "extract":
      throw new Error("A map build can't be undone; rebuild the map instead");

    case "add_concept": {
      const id = change.after.id;
      const current = graph.concepts.find((c) => c.id === id);
      if (!current) throw new Error(`${name(id)} is already gone`);
      if (!sameConcept(current, change.after)) throw changedSince(name(id));
      const goals = Object.values(graph.views).filter((entries) => entries.some((e) => e.conceptId === id)).length;
      if (goals > 0) throw new Error(`${name(id)} is now used by ${goals === 1 ? "a goal" : `${goals} goals`}`);
      if (graph.edges.some((e) => e.src === id || e.dst === id)) throw new Error(`${name(id)} now has arrows`);
      return [{ op: "delete_concept", conceptId: id }];
    }

    case "update_concept": {
      const id = change.before.id;
      const current = graph.concepts.find((c) => c.id === id);
      if (!current) throw new Error(`${name(id)} is gone`);
      if (!sameConcept(current, change.after)) throw changedSince(name(id));
      return [{ op: "update_concept", conceptId: id, changes: changesBack(change.before, current) }];
    }

    // Bring the concept back with everything its deletion took: its view entries and its arrows.
    case "delete_concept": {
      const { concept, edges, views } = change.before;
      if (graph.concepts.some((c) => c.id === concept.id)) throw new Error(`${name(concept.id)} exists again`);
      return [
        { op: "add_concept", concept },
        ...views.map(({ goalId, entry }): MapCommand => ({ op: "set_view_entry", goalId, entry })),
        ...edges.map((edge): MapCommand => ({ op: "add_edge", edge })),
      ];
    }

    case "add_edge":
      if (!graph.edges.some((e) => sameEdge(e, change.after))) throw new Error(`The ${arrowName(graph, change.after)} is already gone`);
      return [{ op: "delete_edge", edge: change.after }];

    case "delete_edge":
      if (graph.edges.some((e) => sameEdge(e, change.before))) throw new Error(`The ${arrowName(graph, change.before)} is back already`);
      return [{ op: "add_edge", edge: change.before }];

    case "set_view_entry": {
      const { goalId } = change.payload;
      const current = entryOf(graph, goalId, change.after.conceptId);
      if (!current || !sameEntry(current, change.after)) throw changedSince(`${name(change.after.conceptId)} in this goal`);
      return change.before
        ? [{ op: "set_view_entry", goalId, entry: change.before }]
        : [{ op: "remove_view_entry", goalId, conceptId: change.after.conceptId }];
    }

    case "remove_view_entry": {
      const { goalId, conceptId } = change.payload;
      if (entryOf(graph, goalId, conceptId)) throw new Error(`${name(conceptId)} is back in this goal already`);
      return [{ op: "set_view_entry", goalId, entry: change.before }];
    }
  }
}

// Every command needed to take back one action (the entries of one click edit), newest entry
// first, each checked like a normal edit: it must leave a valid map (no loops, no missing
// concepts). All or nothing: throws, starting "Can't undo", if any step would fail.
export function planUndo(graph: ConceptGraph, action: MapEvent[]): UndoStep[] {
  const steps: UndoStep[] = [];
  let current = graph;
  try {
    for (const event of [...action].sort((a, b) => b.seq - a.seq)) {
      for (const command of inverseCommands(current, event)) {
        current = applyChange(current, describeChange(current, command));
        steps.push({ command, undoes: event.seq });
      }
    }
  } catch (err) {
    throw new Error(`Can't undo: ${err instanceof Error ? err.message : String(err)}`);
  }
  return steps;
}

// Which diary entry, if any, a change takes back.
export function undoneSeq(change: MapChange): number | undefined {
  return "undoes" in change.payload ? change.payload.undoes : undefined;
}

// The human edits on one goal's map that can still be undone, newest first. Each is one action:
// the entries that share a request id (one click edit). Undo entries themselves aren't offered
// (there's no redo), and neither is anything before the goal's last map build or editor change,
// which reshaped the map.
export function undoableActions(events: MapEvent[], goalId: string): MapEvent[][] {
  const mine = events.filter((e) => e.goalId === goalId);
  const lastNonHuman = mine.findLastIndex((e) => e.actor !== "human");
  const undone = new Set(events.map(undoneSeq).filter((seq) => seq !== undefined));

  const actions = new Map<string, MapEvent[]>();
  for (const event of mine.slice(lastNonHuman + 1)) {
    if (undoneSeq(event) !== undefined) continue; // an undo, not an edit
    const key = event.requestId ?? `seq-${event.seq}`;
    actions.set(key, [...(actions.get(key) ?? []), event]);
  }
  return [...actions.values()].filter((action) => !action.some((e) => undone.has(e.seq))).reverse();
}

// An action in a few words, for the Undo button and its confirmation:
// "Add “LTI systems”", "Remove “Convolution” from this goal", "Change arrow “LTI” → “Convolution”".
export function actionLabel(graph: ConceptGraph, action: MapChange[]): string {
  const name = (id: string) => conceptName(graph, id);
  const of = <Op extends MapChange["op"]>(op: Op) => action.filter((c): c is Extract<MapChange, { op: Op }> => c.op === op);
  const ops = new Set(action.map((c) => c.op));
  const only = (...allowed: MapChange["op"][]) => [...ops].every((op) => allowed.includes(op));

  const added = of("add_concept");
  if (added.length === 1) return `Add “${added[0]!.after.name}”`;
  if (added.length > 1) return `Add ${added.length} concepts`;

  const deleted = of("delete_concept");
  if (deleted.length === 1) return `Delete “${deleted[0]!.before.concept.name}”`;
  if (deleted.length > 1) return `Delete ${deleted.length} concepts`;

  const removed = of("remove_view_entry");
  if (removed.length > 0 && only("remove_view_entry")) {
    return removed.length === 1 ? `Remove ${name(removed[0]!.payload.conceptId)} from this goal` : `Remove ${removed.length} concepts from this goal`;
  }

  if (only("add_edge", "delete_edge")) {
    const arrows = [...of("delete_edge").map((c) => c.before), ...of("add_edge").map((c) => c.after)];
    const sameEnds = arrows.every((e) => e.src === arrows[0]!.src && e.dst === arrows[0]!.dst);
    const verb = ops.size === 2 ? "Change" : ops.has("add_edge") ? "Add" : "Delete";
    if (arrows.length > 0 && sameEnds) return `${verb} ${arrowName(graph, arrows[0]!)}`;
  }

  if (only("update_concept", "set_view_entry")) {
    const ids = new Set(action.map((c) => (c.op === "update_concept" ? c.payload.conceptId : c.op === "set_view_entry" ? c.payload.entry.conceptId : "")));
    if (ids.size === 1) return `Edit ${name([...ids][0]!)}`;
  }

  return action.length === 1 ? "1 map change" : `${action.length} map changes`;
}
