import { describe, expect, it } from "vitest";
import { closure, pairKey } from "./pairs.ts";
import { chain } from "./test-maps.ts";

describe("closure (everything holding a concept-depth implies)", () => {
  it("follows the concept's own depths down, then the arrows", () => {
    const keys = closure(chain.edges, { conceptId: "lti", depth: 2 }).map((p) => pairKey(p.conceptId, p.depth));
    expect(keys.sort()).toEqual(["complex-exp@1", "complex-numbers@1", "complex-numbers@2", "lti@1"].sort());
  });

  it("an arrow only applies from its own depth up", () => {
    // lti@1 doesn't need complex-exp: the arrow is from lti@2
    expect(closure(chain.edges, { conceptId: "lti", depth: 1 })).toEqual([]);
  });
});
