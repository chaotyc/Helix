// Rule checks (J10): problems plain code can see in a map, with no model involved. They are
// warnings, not failures, and they adapt to the map's size: goals range from one problem to a
// whole textbook, so there is no "too few" or "too many" concepts.
import type { GoalMap } from "@helix/contracts";

export type Warning = { rule: string; conceptIds: string[]; message: string };

export const SIMILAR_NAMES = 0.6; // word overlap at or above this flags a possible duplicate
export const MIN_CONCEPTS_FOR_DEPTH_SPREAD = 5; // below this, one shared target depth is normal

// "Fourier Series" → {"fourier", "series"}. Lowercased; a trailing plural "s" dropped.
function wordSet(name: string): Set<string> {
  const words = name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)));
}

// Shared words ÷ all words: |A ∩ B| / |A ∪ B|, from 0 (nothing shared) to 1 (the same words).
export function wordOverlap(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  const shared = [...A].filter((w) => B.has(w)).length;
  const all = new Set([...A, ...B]).size;
  return all === 0 ? 0 : shared / all;
}

export function lintMap(map: GoalMap): Warning[] {
  const warnings: Warning[] = [];
  const ids = map.view.map((e) => e.conceptId);
  const name = (id: string) => map.concepts.find((c) => c.id === id)?.name ?? id;

  // 1. A concept with no arrows at all is cut off from the rest of the map.
  if (ids.length > 1) {
    const touched = new Set(map.edges.flatMap((e) => [e.src, e.dst]));
    for (const id of ids.filter((id) => !touched.has(id))) {
      warnings.push({ rule: "no_arrows", conceptIds: [id], message: `${id} has no arrows to or from any concept.` });
    }
  }

  // 2. Background is there because something needs it. If nothing does, why is it in the map?
  const needed = new Set(map.edges.flatMap((e) => (e.type === "prereq" ? [e.src] : [])));
  for (const entry of map.view.filter((e) => e.role === "background" && !needed.has(e.conceptId))) {
    warnings.push({
      rule: "unused_background",
      conceptIds: [entry.conceptId],
      message: `${entry.conceptId} is background, but no concept needs it.`,
    });
  }

  // 3. Every target depth the same: depths probably weren't thought about.
  const depths = new Set(map.view.map((e) => e.targetDepth));
  if (ids.length >= MIN_CONCEPTS_FOR_DEPTH_SPREAD && depths.size === 1) {
    warnings.push({ rule: "same_target_depth", conceptIds: [], message: `All ${ids.length} concepts have target depth ${[...depths][0]}.` });
  }

  // 4. Two names sharing most of their words may be one concept twice.
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const overlap = wordOverlap(name(ids[i]!), name(ids[j]!));
      if (overlap >= SIMILAR_NAMES) {
        warnings.push({
          rule: "similar_names",
          conceptIds: [ids[i]!, ids[j]!],
          message: `"${name(ids[i]!)}" and "${name(ids[j]!)}" share ${Math.round(overlap * 100)}% of their words.`,
        });
      }
    }
  }

  return warnings;
}
