import { describe, expect, it } from "vitest";
import type { Edge } from "@helix/contracts";
import { findPartOfLoop, findPrereqLoop } from "./loops.ts";

function needs(dst: string, dstDepth: number, src: string, srcDepth: number): Edge {
  return { type: "prereq", src, srcDepth, dst, dstDepth };
}

describe("findPrereqLoop: loops between (concept, depth) nodes", () => {
  it("finds no loop in a simple chain", () => {
    const edges = [needs("lti", 1, "complex-exp", 1), needs("convolution", 1, "lti", 1)];
    expect(findPrereqLoop(["complex-exp", "lti", "convolution"], edges)).toBeNull();
  });

  it("allows a spiral: complex-exp@1 → lti@2 → complex-exp@3", () => {
    const edges = [needs("lti", 2, "complex-exp", 1), needs("complex-exp", 3, "lti", 2)];
    expect(findPrereqLoop(["complex-exp", "lti"], edges)).toBeNull();
  });

  it("catches a real loop at the same depth and names exactly the nodes in it", () => {
    const edges = [
      needs("b", 1, "a", 1),
      needs("a", 1, "b", 1),
      needs("c", 1, "b", 1), // c is stuck behind the loop but isn't part of it
    ];
    expect(findPrereqLoop(["a", "b", "c"], edges)).toEqual(["a@1", "b@1"]);
  });

  it("catches a loop that runs through a concept's own depth chain", () => {
    // a@2 → a@3 (automatic: depth 3 needs depth 2) → b@1 → a@2
    const edges = [needs("b", 1, "a", 3), needs("a", 2, "b", 1)];
    const loop = findPrereqLoop(["a", "b"], edges);
    expect(loop).not.toBeNull();
    expect(new Set(loop)).toEqual(new Set(["a@2", "a@3", "b@1"]));
  });

  it("ignores arrows to unknown concepts (checkGraph reports those separately)", () => {
    expect(findPrereqLoop(["a"], [needs("a", 1, "ghost", 1)])).toBeNull();
  });
});

describe("findPartOfLoop: loops in part-of arrows", () => {
  it("finds no loop in a hierarchy", () => {
    const edges: Edge[] = [
      { type: "part_of", src: "conv-integral", dst: "convolution" },
      { type: "part_of", src: "conv-sum", dst: "convolution" },
    ];
    expect(findPartOfLoop(["convolution", "conv-integral", "conv-sum"], edges)).toBeNull();
  });

  it("catches a concept that is part of its own part", () => {
    const edges: Edge[] = [
      { type: "part_of", src: "a", dst: "b" },
      { type: "part_of", src: "b", dst: "a" },
    ];
    expect(findPartOfLoop(["a", "b"], edges)).toEqual(["a", "b"]);
  });
});
