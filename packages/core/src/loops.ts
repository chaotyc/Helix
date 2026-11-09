// Loop detection for prerequisite and part-of arrows, using Kahn's algorithm:
// repeatedly remove every node with nothing left pointing into it. If every node gets
// removed, there is no loop (and the removal order is a valid teaching order). If some
// are left, they sit in a loop or behind one; we then walk backwards among the leftovers
// to name exactly the nodes in a loop.
//
// Like levelizing a combinational netlist: evaluate every gate whose inputs are ready,
// layer by layer. A feedback loop is what makes the process stall.
import type { Edge } from "@helix/contracts";

const DEPTHS = [1, 2, 3, 4, 5];

function node(conceptId: string, depth: number): string {
  return `${conceptId}@${depth}`;
}

// The core routine on plain node names. Returns the nodes of one loop, in arrow order,
// or null when there is no loop.
export function findLoop(nodes: string[], arrows: [from: string, to: string][]): string[] | null {
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    successors.set(n, []);
    predecessors.set(n, []);
    inDegree.set(n, 0);
  }
  for (const [from, to] of arrows) {
    if (!successors.has(from) || !successors.has(to)) continue; // unknown node: reported elsewhere
    successors.get(from)!.push(to);
    predecessors.get(to)!.push(from);
    inDegree.set(to, inDegree.get(to)! + 1);
  }

  // Kahn's algorithm: peel off nodes that have no remaining arrows pointing into them.
  const ready = nodes.filter((n) => inDegree.get(n) === 0);
  let removed = 0;
  while (ready.length > 0) {
    const n = ready.pop()!;
    removed += 1;
    for (const next of successors.get(n)!) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (removed === nodes.length) return null;

  // Every leftover node still has an arrow coming in from another leftover node.
  // So walking backwards through leftovers must eventually revisit a node: that's a loop.
  const leftover = (n: string) => inDegree.get(n)! > 0;
  let current = nodes.find(leftover)!;
  const path: string[] = [];
  const seenAt = new Map<string, number>();
  while (!seenAt.has(current)) {
    seenAt.set(current, path.length);
    path.push(current);
    current = predecessors.get(current)!.find(leftover)!;
  }
  // The walk went against the arrows, so reverse it to read in arrow order,
  // then rotate so the loop starts at its alphabetically first node (stable output for tests and messages).
  const loop = path.slice(seenAt.get(current)!).reverse();
  const start = loop.indexOf([...loop].sort()[0]!);
  return [...loop.slice(start), ...loop.slice(0, start)];
}

// Prerequisite loops between (concept, depth) nodes. Each concept is five nodes, and each
// depth automatically needs the one below it, so loops through a concept's own depth chain
// are caught too.
export function findPrereqLoop(conceptIds: string[], edges: Edge[]): string[] | null {
  const nodes = conceptIds.flatMap((id) => DEPTHS.map((d) => node(id, d)));
  const arrows: [string, string][] = [];
  for (const id of conceptIds) {
    for (const d of DEPTHS.slice(1)) arrows.push([node(id, d - 1), node(id, d)]);
  }
  for (const e of edges) {
    if (e.type === "prereq") arrows.push([node(e.src, e.srcDepth), node(e.dst, e.dstDepth)]);
  }
  return findLoop(nodes, arrows);
}

// Part-of loops between concepts (no depths: being part of something isn't a depth question).
export function findPartOfLoop(conceptIds: string[], edges: Edge[]): string[] | null {
  const arrows: [string, string][] = [];
  for (const e of edges) {
    if (e.type === "part_of") arrows.push([e.src, e.dst]);
  }
  return findLoop(conceptIds, arrows);
}
