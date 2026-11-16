import { z } from "zod";
import { Concept, ConceptChanges, Edge, ViewEntry } from "./map.ts";

// One click edit to a goal's map (Step 10). Concepts and arrows are global, shared by every
// goal that uses them; target depth and role are per goal. Deleting a concept from the whole
// graph isn't offered (V2): "remove" takes it out of this goal only.
export const MapEdit = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_concept"), concept: Concept }),
  z.object({ op: z.literal("update_concept"), conceptId: z.string(), changes: ConceptChanges }),
  z.object({ op: z.literal("add_edge"), edge: Edge }),
  z.object({ op: z.literal("delete_edge"), edge: Edge }),
  z.object({ op: z.literal("set_view_entry"), entry: ViewEntry }),
  z.object({ op: z.literal("remove_view_entry"), conceptId: z.string() }),
]);
export type MapEdit = z.infer<typeof MapEdit>;

// For each concept in a goal's map, the titles of the other goals that also use it,
// so the editor can warn before changing something shared.
export const SharedWith = z.record(z.string(), z.array(z.string()));
export type SharedWith = z.infer<typeof SharedWith>;
