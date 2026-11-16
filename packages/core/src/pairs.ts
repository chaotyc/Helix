// Concept-depth pairs ("lti@2") and what implies what. Mastering a concept at a depth implies
// mastering it at every depth below, and mastering whatever its arrows say it needs at that depth.
// Read "B@2 needs A@1" as the logical implication B@2 ⇒ A@1.
import type { Edge, GoalMap } from "@helix/contracts";

export const DEPTHS = [1, 2, 3, 4, 5] as const;

export type Pair = { conceptId: string; depth: number };

export function pairKey(conceptId: string, depth: number): string {
  return `${conceptId}@${depth}`;
}

// What holding `pair` implies directly: the depth below it, and the prerequisites its arrows name.
export function implies(edges: Edge[], pair: Pair): Pair[] {
  const out: Pair[] = pair.depth > 1 ? [{ conceptId: pair.conceptId, depth: pair.depth - 1 }] : [];
  for (const e of edges) {
    if (e.type === "prereq" && e.dst === pair.conceptId && e.dstDepth === pair.depth) {
      out.push({ conceptId: e.src, depth: e.srcDepth });
    }
  }
  return out;
}

// What directly implies `pair`: the depth above it, and whatever needs it through an arrow.
export function impliedBy(edges: Edge[], pair: Pair): Pair[] {
  const out: Pair[] = pair.depth < 5 ? [{ conceptId: pair.conceptId, depth: pair.depth + 1 }] : [];
  for (const e of edges) {
    if (e.type === "prereq" && e.src === pair.conceptId && e.srcDepth === pair.depth) {
      out.push({ conceptId: e.dst, depth: e.dstDepth });
    }
  }
  return out;
}

// Everything holding `pair` implies, following arrows all the way down (not including `pair`).
export function closure(edges: Edge[], pair: Pair): Pair[] {
  return walk(pair, (p) => implies(edges, p));
}

// Everything that implies `pair` (not including it): what holding it would help unlock.
export function dependents(edges: Edge[], pair: Pair): Pair[] {
  return walk(pair, (p) => impliedBy(edges, p));
}

function walk(start: Pair, next: (p: Pair) => Pair[]): Pair[] {
  const seen = new Set([pairKey(start.conceptId, start.depth)]);
  const out: Pair[] = [];
  const stack = next(start);
  while (stack.length) {
    const p = stack.pop()!;
    const key = pairKey(p.conceptId, p.depth);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    stack.push(...next(p));
  }
  return out;
}

// Every concept-depth a goal asks for: each view concept at depths 1 to its target.
export function goalPairs(map: GoalMap): Pair[] {
  return map.view.flatMap((e) => DEPTHS.filter((d) => d <= e.targetDepth).map((depth) => ({ conceptId: e.conceptId, depth })));
}
