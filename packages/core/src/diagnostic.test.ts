import { describe, expect, it } from "vitest";
import { nextProbe } from "./diagnostic.ts";
import { masteryMap } from "./knowledge.ts";
import type { LearnerState } from "./mastery.ts";
import { pairKey } from "./pairs.ts";
import { chain, goalMap, stateOf, taught } from "./test-maps.ts";

const ids = chain.view.map((e) => e.conceptId);
function probe(state: LearnerState, asked: string[] = []) {
  const p = nextProbe(chain, state, masteryMap(ids, state), new Set(asked));
  return p && pairKey(p.conceptId, p.depth);
}

describe("nextProbe (which concept-depth the diagnostic asks about next)", () => {
  it("starts with the question that covers the most of the map", () => {
    // convolution@2 implies convolution@1, lti@2, lti@1, complex-exp@1, complex-numbers@2, @1
    expect(probe(stateOf({}))).toBe("convolution@2");
  });

  it("never asks the same concept-depth twice in one diagnostic", () => {
    expect(probe(stateOf({}), ["convolution@2"])).not.toBe("convolution@2");
  });

  it("after a miss, skips everything that needs the missed one and asks the next most informative", () => {
    const next = probe(stateOf({ "lti@2": 0.05 }), ["lti@2"]);
    expect(["convolution@1", "convolution@2", "lti@3"]).not.toContain(next);
    expect(next).toBe("complex-exp@3"); // covers complex-exp@1–2 and complex-numbers@1–2
  });

  it("skips what's already held", () => {
    const map = goalMap([taught("a", 1), taught("b", 1)], []);
    const state = stateOf({ "a@1": 0.97 });
    const p = nextProbe(map, state, masteryMap(["a", "b"], state), new Set());
    expect(p).toEqual({ conceptId: "b", depth: 1 });
  });

  it("returns null when nothing is left to ask", () => {
    const map = goalMap([taught("a", 1)], []);
    expect(nextProbe(map, stateOf({}), masteryMap(["a"], stateOf({})), new Set(["a@1"]))).toBeNull();
  });
});
