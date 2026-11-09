import { z } from "zod";

// ---------------------------------------------------------------------------
// The concept map: concepts (nodes) and edges (arrows between them).
// ---------------------------------------------------------------------------

// How deep the goal needs a concept: 1 = orient ... 5 = expert. Set by the extractor, not the user.
export const TargetDepth = z.number().int().min(1).max(5);

export const Concept = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // stable slug, unique within a goal; never changes
  name: z.string().min(1),
  kind: z.enum(["concept", "skill", "decision"]),
  sourceRef: z.string().optional(), // where it appears in the source, e.g. "Week 3" or "§2.4"
  targetDepth: TargetDepth,
});
export type Concept = z.infer<typeof Concept>;

export const Edge = z.object({
  src: z.string(), // for "prereq": src must be learned before dst
  dst: z.string(),
  type: z.enum(["prereq", "part_of"]),
});
export type Edge = z.infer<typeof Edge>;

// A whole map. Concepts are kept in course order: their position in the array.
export const ConceptMap = z.object({
  concepts: z.array(Concept),
  edges: z.array(Edge),
});
export type ConceptMap = z.infer<typeof ConceptMap>;

// ---------------------------------------------------------------------------
// Map changes: one entry in the map diary (the `map_event` table).
// `payload` is what was asked for; `before` and `after` are the affected thing's
// full state, null when it didn't exist (decision D1).
// ---------------------------------------------------------------------------

// Any concept field except its id.
export const ConceptChanges = Concept.omit({ id: true }).partial();
export type ConceptChanges = z.infer<typeof ConceptChanges>;

export const MapChange = z.discriminatedUnion("op", [
  // The extractor's whole map as one entry (D2). The input is the event's sourceId (D3).
  z.object({ op: z.literal("extract"), payload: z.object({}), before: ConceptMap, after: ConceptMap }),
  z.object({
    op: z.literal("add_concept"),
    payload: z.object({ concept: Concept }),
    before: z.null(),
    after: Concept,
  }),
  // Any change to a concept's fields: name, kind, source reference, target depth (D5).
  z.object({
    op: z.literal("update_concept"),
    payload: z.object({ conceptId: z.string(), changes: ConceptChanges }),
    before: Concept,
    after: Concept,
  }),
  // Deleting a concept also deletes its edges, so `before` keeps them too (D1).
  z.object({
    op: z.literal("delete_concept"),
    payload: z.object({ conceptId: z.string() }),
    before: z.object({ concept: Concept, edges: z.array(Edge) }),
    after: z.null(),
  }),
  z.object({ op: z.literal("add_edge"), payload: z.object({ edge: Edge }), before: z.null(), after: Edge }),
  z.object({ op: z.literal("delete_edge"), payload: z.object({ edge: Edge }), before: Edge, after: z.null() }),
]);
export type MapChange = z.infer<typeof MapChange>;

// Who made a change: the extractor (Claude building a map), the editor (an LLM applying
// the learner's typed instruction), or a human directly.
export const MapActor = z.enum(["extractor", "editor", "human"]);
export type MapActor = z.infer<typeof MapActor>;

// Everything recorded about a change besides the change itself.
export const MapEventInfo = z.object({
  seq: z.number().int(), // order in the diary; replay goes in this order
  goalId: z.string(),
  actor: MapActor,
  requestId: z.string().nullable(), // groups the changes made for one editor instruction
  instruction: z.string().nullable(), // the learner's words, for editor changes
  sourceId: z.string().nullable(), // the source text an extraction was given
  promptVersion: z.string().nullable(), // e.g. "extract-map@3f9a1c2e" (D4)
  model: z.string().nullable(),
  ts: z.string(),
});
export type MapEventInfo = z.infer<typeof MapEventInfo>;

export const MapEvent = z.intersection(MapChange, MapEventInfo);
export type MapEvent = z.infer<typeof MapEvent>;
