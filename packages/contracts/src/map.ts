import { z } from "zod";

// ---------------------------------------------------------------------------
// The global concept graph: every concept the learner has met, across all courses,
// with prerequisite arrows between (concept, depth) pairs. Each goal (course) is a
// view onto it: which concepts it covers and how deep it needs each one.
// ---------------------------------------------------------------------------

// A depth level: 1 orient · 2 explain · 3 apply · 4 analyze · 5 expert (working names, Step 12 refines).
export const DepthLevel = z.number().int().min(1).max(5);
export type DepthLevel = z.infer<typeof DepthLevel>;

export const Concept = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), // stable slug, unique across the whole graph; never changes
  name: z.string().min(1),
  description: z.string().min(1), // one sentence; how the same concept is recognized across courses
  kind: z.enum(["concept", "skill", "decision"]),
});
export type Concept = z.infer<typeof Concept>;

// `dst` at depth `dstDepth` needs `src` at depth `srcDepth` first.
// Depths make spirals possible: complex-exp@1 → lti@2 → complex-exp@3 is not a loop.
export const PrereqEdge = z.object({
  type: z.literal("prereq"),
  src: z.string(),
  srcDepth: DepthLevel,
  dst: z.string(),
  dstDepth: DepthLevel,
});

// `src` is a part of `dst` (e.g. "convolution integral" is part of "convolution").
export const PartOfEdge = z.object({
  type: z.literal("part_of"),
  src: z.string(),
  dst: z.string(),
});

export const Edge = z.discriminatedUnion("type", [PrereqEdge, PartOfEdge]);
export type Edge = z.infer<typeof Edge>;

// One concept in a goal's view. Target depth is per goal: Signals may need complex
// numbers at depth 3, Circuits only at depth 2. "background" means the course assumes
// it rather than teaching it.
export const ViewEntry = z.object({
  conceptId: z.string(),
  targetDepth: DepthLevel,
  role: z.enum(["taught", "background"]),
});
export type ViewEntry = z.infer<typeof ViewEntry>;

export const ConceptGraph = z.object({
  concepts: z.array(Concept),
  edges: z.array(Edge),
  views: z.record(z.string(), z.array(ViewEntry)), // goal id → that goal's entries
});
export type ConceptGraph = z.infer<typeof ConceptGraph>;

// One course's slice of the global graph: the concepts in its view and the arrows among them.
export const GoalMap = z.object({
  goalId: z.string(),
  concepts: z.array(Concept),
  view: z.array(ViewEntry),
  edges: z.array(Edge),
});
export type GoalMap = z.infer<typeof GoalMap>;

// ---------------------------------------------------------------------------
// Map changes: one entry in the map diary (the `map_event` table).
// `payload` is what was asked for; `before` and `after` are the affected things'
// full state, null when they didn't exist (D1).
// ---------------------------------------------------------------------------

// Any concept field except its id.
export const ConceptChanges = Concept.omit({ id: true }).partial();
export type ConceptChanges = z.infer<typeof ConceptChanges>;

const GoalEntry = z.object({ goalId: z.string(), entry: ViewEntry });

export const MapChange = z.discriminatedUnion("op", [
  // One extraction as one entry (D2): adds concepts and arrows the graph doesn't have yet,
  // and sets the goal's view. Concepts the graph already has are reused, not re-added.
  // `raw` keeps the extractor's whole answer, explanations included (E2).
  z.object({
    op: z.literal("extract"),
    payload: z.object({ goalId: z.string(), raw: z.unknown() }),
    before: z.object({ view: z.array(ViewEntry).nullable() }),
    after: z.object({
      addedConcepts: z.array(Concept),
      addedEdges: z.array(Edge),
      view: z.array(ViewEntry),
    }),
  }),
  z.object({
    op: z.literal("add_concept"),
    payload: z.object({ concept: Concept }),
    before: z.null(),
    after: Concept,
  }),
  z.object({
    op: z.literal("update_concept"),
    payload: z.object({ conceptId: z.string(), changes: ConceptChanges }),
    before: Concept,
    after: Concept,
  }),
  // Deleting a concept also removes its arrows and its view entries, so `before` keeps them (D1).
  z.object({
    op: z.literal("delete_concept"),
    payload: z.object({ conceptId: z.string() }),
    before: z.object({ concept: Concept, edges: z.array(Edge), views: z.array(GoalEntry) }),
    after: z.null(),
  }),
  z.object({ op: z.literal("add_edge"), payload: z.object({ edge: Edge }), before: z.null(), after: Edge }),
  z.object({ op: z.literal("delete_edge"), payload: z.object({ edge: Edge }), before: Edge, after: z.null() }),
  // Add a concept to a goal's view, or change its target depth or role.
  z.object({
    op: z.literal("set_view_entry"),
    payload: GoalEntry,
    before: ViewEntry.nullable(),
    after: ViewEntry,
  }),
  z.object({
    op: z.literal("remove_view_entry"),
    payload: z.object({ goalId: z.string(), conceptId: z.string() }),
    before: ViewEntry,
    after: z.null(),
  }),
]);
export type MapChange = z.infer<typeof MapChange>;

// Who made a change: the extractor (Claude building a map), the editor (an LLM applying
// the learner's typed instruction), or a human directly.
export const MapActor = z.enum(["extractor", "editor", "human"]);
export type MapActor = z.infer<typeof MapActor>;

// Everything recorded about a change besides the change itself.
export const MapEventInfo = z.object({
  seq: z.number().int(), // order in the diary; replay goes in this order
  goalId: z.string().nullable(), // the course the change was made for, if any
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
