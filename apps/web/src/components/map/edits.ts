// Turning what the user changed in a form into map edits for the server.
import type { Concept, ConceptChanges, Edge, MapEdit, SharedWith, ViewEntry } from "@helix/contracts";

// "Fourier Series" → "fourier-series": the id format concepts use.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// A stable name for an arrow, used as its id on the canvas.
export function edgeKey(e: Edge): string {
  return e.type === "prereq" ? `${e.src}@${e.srcDepth}->${e.dst}@${e.dstDepth}` : `${e.src}-part-of->${e.dst}`;
}

// "convolution@1 needs lti@1", the way the server and the checker word it.
export function edgeLabel(e: Edge): string {
  return e.type === "prereq" ? `${e.dst}@${e.dstDepth} needs ${e.src}@${e.srcDepth}` : `${e.src} is part of ${e.dst}`;
}

// Only what changed: the concept itself (shared across goals) and this goal's view entry.
export function conceptEdits(before: Concept, entryBefore: ViewEntry, after: Concept, entryAfter: ViewEntry): MapEdit[] {
  const changes: ConceptChanges = {};
  if (after.name !== before.name) changes.name = after.name;
  if (after.description !== before.description) changes.description = after.description;
  if (after.kind !== before.kind) changes.kind = after.kind;

  const edits: MapEdit[] = [];
  if (Object.keys(changes).length) edits.push({ op: "update_concept", conceptId: before.id, changes });
  if (entryAfter.targetDepth !== entryBefore.targetDepth || entryAfter.role !== entryBefore.role) {
    edits.push({ op: "set_view_entry", entry: entryAfter });
  }
  return edits;
}

// The other goals that also draw this arrow: those that use both of its concepts.
export function edgeSharedWith(e: Edge, sharedWith: SharedWith): string[] {
  const dst = new Set(sharedWith[e.dst] ?? []);
  return (sharedWith[e.src] ?? []).filter((title) => dst.has(title));
}
