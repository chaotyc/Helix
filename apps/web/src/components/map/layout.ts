// Positions for the map's concepts: prerequisites above the concepts that need them,
// laid out top to bottom by dagre (a layered-graph layout). Pure: same map, same picture.
import { Graph, layout } from "@dagrejs/dagre";
import type { GoalMap } from "@helix/contracts";

export const NODE_WIDTH = 210;
export const NODE_HEIGHT = 58;

export type Positions = Record<string, { x: number; y: number }>;

export function layoutMap(map: GoalMap): Positions {
  const g = new Graph();
  g.setGraph({ rankdir: "TB", nodesep: 30, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const entry of map.view) g.setNode(entry.conceptId, { width: NODE_WIDTH, height: NODE_HEIGHT });
  // Arrows run from what's needed to what needs it. A spiral (a@1 → b@2 → a@3) makes a
  // cycle between concepts; dagre lays it out anyway by flipping one arrow internally.
  for (const e of map.edges) g.setEdge(e.src, e.dst);
  layout(g);

  const positions: Positions = {};
  for (const entry of map.view) {
    const node = g.node(entry.conceptId) as { x: number; y: number };
    positions[entry.conceptId] = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 }; // dagre gives centers
  }
  return positions;
}
