// Which sides of two concept cards an arrow joins, from where the cards are now (laid out or
// dragged), so an arrow never leaves the bottom of a card to reach one above it and loops around.
//   - cards side by side: the facing sides, left to right;
//   - prerequisite arrows between stacked cards: bottom to top (or top to bottom, going up);
//   - part-of arrows between stacked cards: a bracket on the part's outer side, so they stay
//     clear of the prerequisite arrow that often joins the same two cards (a part that needs its
//     whole: "Impulse response" is part of "LTI systems" and needs it).
import type { Edge } from "@helix/contracts";
import { NODE_HEIGHT, NODE_WIDTH } from "./layout.ts";

export type Side = "top" | "bottom" | "left" | "right";
type Point = { x: number; y: number };

// Handle ids on ConceptNode: an arrow leaves from "s-<side>" and arrives at "t-<side>".
export const sourceHandle = (side: Side) => `s-${side}`;
export const targetHandle = (side: Side) => `t-${side}`;

const MIN_GAP = 16; // px between cards stacked vertically before a top/bottom join looks right

// `src` and `dst` are the cards' top-left corners (every card is the same size).
export function arrowSides(type: Edge["type"], src: Point, dst: Point): { from: Side; to: Side } {
  const dx = dst.x - src.x;
  const dy = dst.y - src.y;
  const facingSides = dx >= 0 ? ({ from: "right", to: "left" } as const) : ({ from: "left", to: "right" } as const);
  if (Math.abs(dy) < NODE_HEIGHT + MIN_GAP) return facingSides; // side by side
  if (type === "part_of") {
    // A bracket on the part's outer side: it curves out and back in, clear of the cards between.
    if (Math.abs(dx) < NODE_WIDTH / 2) return { from: "right", to: "right" };
    return dx > 0 ? { from: "left", to: "left" } : { from: "right", to: "right" };
  }
  return dy > 0 ? { from: "bottom", to: "top" } : { from: "top", to: "bottom" };
}
