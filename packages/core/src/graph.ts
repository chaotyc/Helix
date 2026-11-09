// The global concept graph as an accumulator over its diary (the `map_event` log):
//   graph[n] = applyChange(graph[n-1], change[n]),  starting from an empty graph.
// Everything here is pure: no database, no AI, the same inputs always give the same output.
import type {
  Concept,
  ConceptChanges,
  ConceptGraph,
  Edge,
  GoalMap,
  MapChange,
  ViewEntry,
} from "@helix/contracts";
import { findPartOfLoop, findPrereqLoop } from "./loops.ts";

// What someone (the extractor, the editor, or a human) asks to do to the graph.
export type MapCommand =
  | { op: "extract"; goalId: string; concepts: Concept[]; edges: Edge[]; view: ViewEntry[]; raw: unknown }
  | { op: "add_concept"; concept: Concept }
  | { op: "update_concept"; conceptId: string; changes: ConceptChanges }
  | { op: "delete_concept"; conceptId: string }
  | { op: "add_edge"; edge: Edge }
  | { op: "delete_edge"; edge: Edge }
  | { op: "set_view_entry"; goalId: string; entry: ViewEntry }
  | { op: "remove_view_entry"; goalId: string; conceptId: string };

export function emptyGraph(): ConceptGraph {
  return { concepts: [], edges: [], views: {} };
}

// ---- Small helpers ----

function findConcept(graph: ConceptGraph, id: string): Concept | undefined {
  return graph.concepts.find((c) => c.id === id);
}

export function sameEdge(a: Edge, b: Edge): boolean {
  if (a.type !== b.type || a.src !== b.src || a.dst !== b.dst) return false;
  if (a.type === "prereq" && b.type === "prereq") {
    return a.srcDepth === b.srcDepth && a.dstDepth === b.dstDepth;
  }
  return true;
}

function touches(edge: Edge, conceptId: string): boolean {
  return edge.src === conceptId || edge.dst === conceptId;
}

// "lti@2 needs complex-exp@1" or "conv-integral is part of convolution"
export function edgeLabel(e: Edge): string {
  return e.type === "prereq"
    ? `${e.dst}@${e.dstDepth} needs ${e.src}@${e.srcDepth}`
    : `${e.src} is part of ${e.dst}`;
}

// ---- Hard rules every graph must follow ----

// Lists everything wrong with a graph; an empty list means it's valid.
export function checkGraph(graph: ConceptGraph): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const c of graph.concepts) {
    if (ids.has(c.id)) problems.push(`duplicate concept id "${c.id}"`);
    ids.add(c.id);
  }

  graph.edges.forEach((e, i) => {
    if (!ids.has(e.src)) problems.push(`arrow "${edgeLabel(e)}": no concept "${e.src}"`);
    if (!ids.has(e.dst)) problems.push(`arrow "${edgeLabel(e)}": no concept "${e.dst}"`);
    if (e.src === e.dst) problems.push(`arrow "${edgeLabel(e)}" points to itself`);
    if (graph.edges.findIndex((other) => sameEdge(other, e)) < i) {
      problems.push(`duplicate arrow "${edgeLabel(e)}"`);
    }
  });

  for (const [goalId, entries] of Object.entries(graph.views)) {
    const seen = new Set<string>();
    for (const entry of entries) {
      if (!ids.has(entry.conceptId)) problems.push(`goal ${goalId}: no concept "${entry.conceptId}"`);
      if (seen.has(entry.conceptId)) problems.push(`goal ${goalId}: "${entry.conceptId}" listed twice`);
      seen.add(entry.conceptId);
    }
  }

  const prereqLoop = findPrereqLoop([...ids], graph.edges);
  if (prereqLoop) problems.push(`prerequisite loop: ${[...prereqLoop, prereqLoop[0]].join(" → ")}`);
  const partOfLoop = findPartOfLoop([...ids], graph.edges);
  if (partOfLoop) problems.push(`part-of loop: ${[...partOfLoop, partOfLoop[0]].join(" → ")}`);

  return problems;
}

// ---- Command → diary entry ----

// Turns a command into a diary entry, with the affected things' full state before and after.
// Simple existence checks happen here; everything else (missing concepts, duplicates, loops)
// is caught by checking the whole graph the change would produce.
function buildChange(graph: ConceptGraph, command: MapCommand): MapChange {
  switch (command.op) {
    case "extract": {
      const ids = new Set<string>();
      for (const c of command.concepts) {
        if (ids.has(c.id)) throw new Error(`The proposal lists concept "${c.id}" twice`);
        ids.add(c.id);
      }
      // Concepts the graph already has are reused, not re-added (G2).
      const addedConcepts = command.concepts.filter((c) => !findConcept(graph, c.id));
      const addedEdges: Edge[] = [];
      for (const e of command.edges) {
        const known = graph.edges.some((x) => sameEdge(x, e)) || addedEdges.some((x) => sameEdge(x, e));
        if (!known) addedEdges.push(e);
      }
      return {
        op: "extract",
        payload: { goalId: command.goalId, raw: command.raw },
        before: { view: graph.views[command.goalId] ?? null },
        after: { addedConcepts, addedEdges, view: command.view },
      };
    }

    case "add_concept":
      if (findConcept(graph, command.concept.id)) throw new Error(`Concept "${command.concept.id}" already exists`);
      return { op: "add_concept", payload: { concept: command.concept }, before: null, after: command.concept };

    case "update_concept": {
      const current = findConcept(graph, command.conceptId);
      if (!current) throw new Error(`No concept "${command.conceptId}" to update`);
      return {
        op: "update_concept",
        payload: { conceptId: command.conceptId, changes: command.changes },
        before: current,
        after: { ...current, ...command.changes },
      };
    }

    case "delete_concept": {
      const current = findConcept(graph, command.conceptId);
      if (!current) throw new Error(`No concept "${command.conceptId}" to delete`);
      const views = Object.entries(graph.views).flatMap(([goalId, entries]) =>
        entries.filter((e) => e.conceptId === command.conceptId).map((entry) => ({ goalId, entry })),
      );
      return {
        op: "delete_concept",
        payload: { conceptId: command.conceptId },
        before: { concept: current, edges: graph.edges.filter((e) => touches(e, command.conceptId)), views },
        after: null,
      };
    }

    case "add_edge":
      return { op: "add_edge", payload: { edge: command.edge }, before: null, after: command.edge };

    case "delete_edge": {
      const current = graph.edges.find((e) => sameEdge(e, command.edge));
      if (!current) throw new Error(`No arrow "${edgeLabel(command.edge)}" to delete`);
      return { op: "delete_edge", payload: { edge: command.edge }, before: current, after: null };
    }

    case "set_view_entry": {
      const current = (graph.views[command.goalId] ?? []).find((e) => e.conceptId === command.entry.conceptId);
      return {
        op: "set_view_entry",
        payload: { goalId: command.goalId, entry: command.entry },
        before: current ?? null,
        after: command.entry,
      };
    }

    case "remove_view_entry": {
      const current = (graph.views[command.goalId] ?? []).find((e) => e.conceptId === command.conceptId);
      if (!current) throw new Error(`Goal ${command.goalId} has no concept "${command.conceptId}"`);
      return {
        op: "remove_view_entry",
        payload: { goalId: command.goalId, conceptId: command.conceptId },
        before: current,
        after: null,
      };
    }
  }
}

// Checks a command against the current graph and describes it as a diary entry.
// Throws, with every problem listed, if the graph after the change would break a rule.
export function describeChange(graph: ConceptGraph, command: MapCommand): MapChange {
  const change = buildChange(graph, command);
  const problems = checkGraph(applyChange(graph, change));
  if (problems.length > 0) throw new Error(`This change would break the map: ${problems.join("; ")}`);
  return change;
}

// ---- Diary entry → next graph ----

function setEntry(entries: ViewEntry[], entry: ViewEntry): ViewEntry[] {
  return entries.some((e) => e.conceptId === entry.conceptId)
    ? entries.map((e) => (e.conceptId === entry.conceptId ? entry : e))
    : [...entries, entry];
}

// Returns the graph after one diary entry. Never modifies `graph`; always builds a new one.
// Throws if the entry doesn't fit the graph, which would mean the diary is inconsistent.
export function applyChange(graph: ConceptGraph, change: MapChange): ConceptGraph {
  switch (change.op) {
    case "extract":
      return {
        concepts: [...graph.concepts, ...change.after.addedConcepts],
        edges: [...graph.edges, ...change.after.addedEdges],
        views: { ...graph.views, [change.payload.goalId]: change.after.view },
      };

    case "add_concept":
      return { ...graph, concepts: [...graph.concepts, change.after] };

    case "update_concept": {
      const id = change.before.id;
      if (!findConcept(graph, id)) throw new Error(`Diary updates missing concept "${id}"`);
      return { ...graph, concepts: graph.concepts.map((c) => (c.id === id ? change.after : c)) };
    }

    case "delete_concept": {
      const id = change.before.concept.id;
      if (!findConcept(graph, id)) throw new Error(`Diary deletes missing concept "${id}"`);
      const views = Object.fromEntries(
        Object.entries(graph.views).map(([goalId, entries]) => [goalId, entries.filter((e) => e.conceptId !== id)]),
      );
      return {
        concepts: graph.concepts.filter((c) => c.id !== id),
        edges: graph.edges.filter((e) => !touches(e, id)),
        views,
      };
    }

    case "add_edge":
      return { ...graph, edges: [...graph.edges, change.after] };

    case "delete_edge":
      return { ...graph, edges: graph.edges.filter((e) => !sameEdge(e, change.before)) };

    case "set_view_entry": {
      const { goalId } = change.payload;
      return { ...graph, views: { ...graph.views, [goalId]: setEntry(graph.views[goalId] ?? [], change.after) } };
    }

    case "remove_view_entry": {
      const { goalId, conceptId } = change.payload;
      const entries = (graph.views[goalId] ?? []).filter((e) => e.conceptId !== conceptId);
      return { ...graph, views: { ...graph.views, [goalId]: entries } };
    }
  }
}

// Rebuilds the graph from scratch by rereading the whole diary, oldest entry first.
export function replayGraph(changes: MapChange[]): ConceptGraph {
  return changes.reduce(applyChange, emptyGraph());
}

// ---- One course's slice ----

// The concepts in a goal's view (in view order) and the arrows that run between them.
export function goalSlice(graph: ConceptGraph, goalId: string): GoalMap {
  const view = graph.views[goalId] ?? [];
  const inView = new Set(view.map((e) => e.conceptId));
  return {
    goalId,
    concepts: view.flatMap((e) => graph.concepts.filter((c) => c.id === e.conceptId)),
    view,
    edges: graph.edges.filter((e) => inView.has(e.src) && inView.has(e.dst)),
  };
}

// ---- Comparing two graphs ----

type GoalChange = { goalId: string; before: ViewEntry; after: ViewEntry };

export type GraphDiff = {
  conceptsAdded: Concept[];
  conceptsRemoved: Concept[];
  conceptsChanged: { before: Concept; after: Concept }[];
  edgesAdded: Edge[];
  edgesRemoved: Edge[];
  viewEntriesAdded: { goalId: string; entry: ViewEntry }[];
  viewEntriesRemoved: { goalId: string; entry: ViewEntry }[];
  viewEntriesChanged: GoalChange[];
  isEmpty: boolean;
};

function sameConcept(a: Concept, b: Concept): boolean {
  return a.name === b.name && a.description === b.description && a.kind === b.kind;
}

function sameEntry(a: ViewEntry, b: ViewEntry): boolean {
  return a.targetDepth === b.targetDepth && a.role === b.role;
}

// What changed from graph `a` to graph `b`. Used by the rebuild check now, and later to
// compare the extractor's map with the corrected one.
export function diffGraphs(a: ConceptGraph, b: ConceptGraph): GraphDiff {
  const conceptsAdded = b.concepts.filter((c) => !findConcept(a, c.id));
  const conceptsRemoved = a.concepts.filter((c) => !findConcept(b, c.id));
  const conceptsChanged = a.concepts.flatMap((before) => {
    const after = findConcept(b, before.id);
    return after && !sameConcept(before, after) ? [{ before, after }] : [];
  });
  const edgesAdded = b.edges.filter((e) => !a.edges.some((x) => sameEdge(x, e)));
  const edgesRemoved = a.edges.filter((e) => !b.edges.some((x) => sameEdge(x, e)));

  const viewEntriesAdded: GraphDiff["viewEntriesAdded"] = [];
  const viewEntriesRemoved: GraphDiff["viewEntriesRemoved"] = [];
  const viewEntriesChanged: GoalChange[] = [];
  const goalIds = new Set([...Object.keys(a.views), ...Object.keys(b.views)]);
  for (const goalId of goalIds) {
    const before = a.views[goalId] ?? [];
    const after = b.views[goalId] ?? [];
    for (const entry of after) {
      const old = before.find((e) => e.conceptId === entry.conceptId);
      if (!old) viewEntriesAdded.push({ goalId, entry });
      else if (!sameEntry(old, entry)) viewEntriesChanged.push({ goalId, before: old, after: entry });
    }
    for (const entry of before) {
      if (!after.some((e) => e.conceptId === entry.conceptId)) viewEntriesRemoved.push({ goalId, entry });
    }
  }

  const isEmpty =
    conceptsAdded.length + conceptsRemoved.length + conceptsChanged.length +
      edgesAdded.length + edgesRemoved.length +
      viewEntriesAdded.length + viewEntriesRemoved.length + viewEntriesChanged.length === 0;

  return {
    conceptsAdded,
    conceptsRemoved,
    conceptsChanged,
    edgesAdded,
    edgesRemoved,
    viewEntriesAdded,
    viewEntriesRemoved,
    viewEntriesChanged,
    isEmpty,
  };
}
