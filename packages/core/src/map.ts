// The concept map as an accumulator over its diary (the `map_event` log):
//   map[n] = applyChange(map[n-1], change[n]),  starting from an empty map.
// Everything here is pure: no database, no AI, the same inputs always give the same output.
import type { Concept, ConceptChanges, ConceptMap, Edge, MapChange } from "@helix/contracts";

// What someone (the extractor, the editor, or a human) asks to do to a map.
export type MapCommand =
  | { op: "extract"; map: ConceptMap }
  | { op: "add_concept"; concept: Concept }
  | { op: "update_concept"; conceptId: string; changes: ConceptChanges }
  | { op: "delete_concept"; conceptId: string }
  | { op: "add_edge"; edge: Edge }
  | { op: "delete_edge"; edge: Edge };

export function emptyMap(): ConceptMap {
  return { concepts: [], edges: [] };
}

// ---- Small helpers ----

function findConcept(map: ConceptMap, id: string): Concept | undefined {
  return map.concepts.find((c) => c.id === id);
}

function sameEdge(a: Edge, b: Edge): boolean {
  return a.src === b.src && a.dst === b.dst && a.type === b.type;
}

function touches(edge: Edge, conceptId: string): boolean {
  return edge.src === conceptId || edge.dst === conceptId;
}

// ---- Hard rules every map must follow ----

// Lists everything wrong with a map; an empty list means it's valid.
// Not checked here yet: prerequisite cycles (Step 8).
export function checkMap(map: ConceptMap): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();

  for (const c of map.concepts) {
    if (ids.has(c.id)) problems.push(`duplicate concept id "${c.id}"`);
    ids.add(c.id);
  }

  map.edges.forEach((edge, i) => {
    if (!ids.has(edge.src)) problems.push(`edge ${edge.src} → ${edge.dst}: no concept "${edge.src}"`);
    if (!ids.has(edge.dst)) problems.push(`edge ${edge.src} → ${edge.dst}: no concept "${edge.dst}"`);
    if (edge.src === edge.dst) problems.push(`edge ${edge.src} → ${edge.dst} points to itself`);
    if (map.edges.findIndex((other) => sameEdge(other, edge)) < i) {
      problems.push(`duplicate edge ${edge.src} → ${edge.dst}`);
    }
  });

  return problems;
}

// ---- Command → diary entry ----

// Checks a command against the current map and describes it as a diary entry,
// with the affected thing's full state before and after. Throws if the command is invalid.
export function describeChange(map: ConceptMap, command: MapCommand): MapChange {
  switch (command.op) {
    case "extract": {
      const problems = checkMap(command.map);
      if (problems.length > 0) throw new Error(`Invalid map: ${problems.join("; ")}`);
      return { op: "extract", payload: {}, before: map, after: command.map };
    }

    case "add_concept": {
      if (findConcept(map, command.concept.id)) {
        throw new Error(`Concept "${command.concept.id}" already exists`);
      }
      return { op: "add_concept", payload: { concept: command.concept }, before: null, after: command.concept };
    }

    case "update_concept": {
      const current = findConcept(map, command.conceptId);
      if (!current) throw new Error(`No concept "${command.conceptId}" to update`);
      return {
        op: "update_concept",
        payload: { conceptId: command.conceptId, changes: command.changes },
        before: current,
        after: { ...current, ...command.changes },
      };
    }

    case "delete_concept": {
      const current = findConcept(map, command.conceptId);
      if (!current) throw new Error(`No concept "${command.conceptId}" to delete`);
      const edges = map.edges.filter((e) => touches(e, command.conceptId));
      return {
        op: "delete_concept",
        payload: { conceptId: command.conceptId },
        before: { concept: current, edges },
        after: null,
      };
    }

    case "add_edge": {
      const { edge } = command;
      if (!findConcept(map, edge.src)) throw new Error(`No concept "${edge.src}" for this edge`);
      if (!findConcept(map, edge.dst)) throw new Error(`No concept "${edge.dst}" for this edge`);
      if (edge.src === edge.dst) throw new Error(`A concept can't be its own ${edge.type}`);
      if (map.edges.some((e) => sameEdge(e, edge))) throw new Error(`Edge ${edge.src} → ${edge.dst} already exists`);
      return { op: "add_edge", payload: { edge }, before: null, after: edge };
    }

    case "delete_edge": {
      const current = map.edges.find((e) => sameEdge(e, command.edge));
      if (!current) throw new Error(`No edge ${command.edge.src} → ${command.edge.dst} to delete`);
      return { op: "delete_edge", payload: { edge: command.edge }, before: current, after: null };
    }
  }
}

// ---- Diary entry → next map ----

// Returns the map after one diary entry. Never modifies `map`; always builds a new one.
// Throws if the entry doesn't fit the map, which would mean the diary is inconsistent.
export function applyChange(map: ConceptMap, change: MapChange): ConceptMap {
  switch (change.op) {
    case "extract":
      return change.after;

    case "add_concept":
      return { ...map, concepts: [...map.concepts, change.after] };

    case "update_concept": {
      const id = change.before.id;
      if (!findConcept(map, id)) throw new Error(`Diary updates missing concept "${id}"`);
      return { ...map, concepts: map.concepts.map((c) => (c.id === id ? change.after : c)) };
    }

    case "delete_concept": {
      const id = change.before.concept.id;
      if (!findConcept(map, id)) throw new Error(`Diary deletes missing concept "${id}"`);
      return {
        concepts: map.concepts.filter((c) => c.id !== id),
        edges: map.edges.filter((e) => !touches(e, id)),
      };
    }

    case "add_edge":
      return { ...map, edges: [...map.edges, change.after] };

    case "delete_edge":
      return { ...map, edges: map.edges.filter((e) => !sameEdge(e, change.before)) };
  }
}

// Rebuilds a map from scratch by rereading its whole diary, oldest entry first.
export function replayMap(changes: MapChange[]): ConceptMap {
  return changes.reduce(applyChange, emptyMap());
}

// ---- Comparing two maps ----

export type MapDiff = {
  conceptsAdded: Concept[];
  conceptsRemoved: Concept[];
  conceptsChanged: { before: Concept; after: Concept }[];
  edgesAdded: Edge[];
  edgesRemoved: Edge[];
  isEmpty: boolean;
};

function sameConcept(a: Concept, b: Concept): boolean {
  return (
    a.name === b.name &&
    a.kind === b.kind &&
    a.sourceRef === b.sourceRef &&
    a.targetDepth === b.targetDepth
  );
}

// What changed from map `a` to map `b`. Used by the rebuild check now, and later to
// compare the extractor's map with the corrected one.
export function diffMaps(a: ConceptMap, b: ConceptMap): MapDiff {
  const conceptsAdded = b.concepts.filter((c) => !findConcept(a, c.id));
  const conceptsRemoved = a.concepts.filter((c) => !findConcept(b, c.id));
  const conceptsChanged = a.concepts.flatMap((before) => {
    const after = findConcept(b, before.id);
    return after && !sameConcept(before, after) ? [{ before, after }] : [];
  });
  const edgesAdded = b.edges.filter((e) => !a.edges.some((x) => sameEdge(x, e)));
  const edgesRemoved = a.edges.filter((e) => !b.edges.some((x) => sameEdge(x, e)));

  const isEmpty =
    conceptsAdded.length + conceptsRemoved.length + conceptsChanged.length +
      edgesAdded.length + edgesRemoved.length === 0;

  return { conceptsAdded, conceptsRemoved, conceptsChanged, edgesAdded, edgesRemoved, isEmpty };
}
