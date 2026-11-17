// Positions for the map's concepts: prerequisites above the concepts that need them,
// laid out top to bottom by dagre (a layered-graph layout). Pure: same map, same picture.
import { Graph, layout } from "@dagrejs/dagre";
import type { GoalMap } from "@helix/contracts";

export const NODE_WIDTH = 244;
export const NODE_HEIGHT = 62;

export type Positions = Record<string, { x: number; y: number }>;

export function layoutMap(map: GoalMap): Positions {
  const g = new Graph();
  g.setGraph({ rankdir: "TB", nodesep: 36, ranksep: 76 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const entry of map.view) g.setNode(entry.conceptId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // Prerequisites set the layers: an arrow runs from what's needed to what needs it. A spiral
  // (a@1 → b@2 → a@3) makes a cycle between concepts; dagre lays it out anyway by flipping one
  // arrow internally.
  for (const e of map.edges) if (e.type === "prereq") g.setEdge(e.src, e.dst);
  // Part-of only nudges: a part hangs just below its whole, but never against the prerequisites
  // (a part that's needed for its whole stays above it). Otherwise the two kinds of arrow fight
  // and dagre has to flip one. Either way the arrow is drawn between the nearest sides.
  for (const e of map.edges) {
    if (e.type !== "part_of" || reaches(g, e.src, e.dst)) continue;
    g.setEdge(e.dst, e.src, { weight: 2 });
  }
  layout(g);

  const positions: Positions = {};
  for (const entry of map.view) {
    const node = g.node(entry.conceptId) as { x: number; y: number };
    positions[entry.conceptId] = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 }; // dagre gives centers
  }
  return positions;
}

// Whether `from` already leads to `to` along the layout's arrows (depth-first search).
function reaches(g: Graph, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of g.successors(id) ?? []) stack.push(next as string);
  }
  return false;
}
