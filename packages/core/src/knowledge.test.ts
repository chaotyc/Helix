import { describe, expect, it } from "vitest";
import { conceptKnowledge, frontier, masteryMap } from "./knowledge.ts";
import { DEFAULT_PARAMS, HELD_AT, deriveState, updateMastery, type LearnerState } from "./mastery.ts";
import { pairKey } from "./pairs.ts";
import { answers, chain, goalMap, needs, stateOf, taught } from "./test-maps.ts";

const ids = chain.view.map((e) => e.conceptId);
const mastery = (...keys: string[]) => masteryMap(ids, deriveState(answers(...keys), chain.edges));
const ONE_RIGHT = updateMastery(DEFAULT_PARAMS.prior, true);

describe("right answers pass down the arrows (deriveState with the map's arrows)", () => {
  it("an unanswered concept-depth sits at the prior", () => {
    expect(mastery().get("lti@1")).toBe(DEFAULT_PARAMS.prior);
  });

  it("a right answer on convolution@1 counts as one for everything it implies", () => {
    const m = mastery("convolution@1");
    for (const key of ["lti@2", "lti@1", "complex-exp@1", "complex-numbers@2", "complex-numbers@1"]) {
      expect(m.get(key), key).toBeCloseTo(ONE_RIGHT, 10);
    }
    expect(m.get("lti@3")).toBe(DEFAULT_PARAMS.prior); // above what was implied: untouched
  });

  it("right answers above add up: three on convolution@1 make lti@1 held without asking it", () => {
    expect(mastery("convolution@1", "convolution@1", "convolution@1").get("lti@1")).toBeGreaterThanOrEqual(HELD_AT);
  });

  it("wrong answers pass nothing up or down", () => {
    const m = mastery("!lti@2");
    expect(m.get("convolution@1")).toBe(DEFAULT_PARAMS.prior);
    expect(m.get("complex-exp@1")).toBe(DEFAULT_PARAMS.prior);
    expect(m.get("lti@2")).toBeLessThan(DEFAULT_PARAMS.prior);
  });

  it("log order counts: a direct miss after right answers above pulls it down", () => {
    expect(mastery("convolution@1", "convolution@1", "convolution@1", "!lti@2").get("lti@2")).toBeLessThan(HELD_AT);
  });

  it("log order counts: a miss followed by right answers above is outweighed", () => {
    expect(mastery("!lti@2", "convolution@1", "convolution@1", "convolution@1").get("lti@2")).toBeGreaterThanOrEqual(HELD_AT);
  });

  it("counts answers and readings passed down separately", () => {
    const state = deriveState(answers("convolution@1", "lti@1"), chain.edges);
    expect(state.get("lti@1")).toMatchObject({ answers: 1, implied: 1 });
  });
});

describe("conceptKnowledge (what the map shows per concept)", () => {
  const knowledge = (state: LearnerState, own: LearnerState) => Object.fromEntries(conceptKnowledge(ids, state, own).map((k) => [k.conceptId, k]));

  it("separates depth held on a concept's own answers from depth inferred through arrows", () => {
    const log = answers(...Array(3).fill("convolution@1"), ...Array(3).fill("complex-numbers@1"));
    const k = knowledge(deriveState(log, chain.edges), deriveState(log));
    expect(k["convolution"]).toMatchObject({ depthHeld: 1, depthTested: 1, answers: 3 });
    expect(k["lti"]).toMatchObject({ depthHeld: 2, depthTested: 0, answers: 0 });
    expect(k["complex-numbers"]).toMatchObject({ depthHeld: 2, depthTested: 1 });
    expect(k["lti"]!.mastery).toHaveLength(5);
  });

  it("depth held needs every depth below it held too (K1)", () => {
    const state = stateOf({ "lti@3": 0.97, "lti@1": 0.1 });
    expect(knowledge(state, state)["lti"]!.depthHeld).toBe(0);
  });
});

describe("frontier (what's ready to learn next)", () => {
  const pairs = (state: LearnerState) => frontier(chain, masteryMap(ids, state)).map((p) => pairKey(p.conceptId, p.depth));

  it("for a new learner: depth 1 of everything with no arrow into depth 1", () => {
    // complex-exp@1 needs complex-numbers@2 and convolution@1 needs lti@2, so both wait
    expect(pairs(stateOf({}))).toEqual(["complex-numbers@1", "lti@1"]);
  });

  it("a held depth moves the concept to its next depth", () => {
    expect(pairs(stateOf({ "complex-numbers@1": 0.96 }))).toContain("complex-numbers@2");
  });

  it("opens a concept once its prerequisites are held", () => {
    expect(pairs(stateOf({ "complex-numbers@2": 0.96 }))).toContain("complex-exp@1");
  });

  it("skips concepts already at their target depth", () => {
    const map = goalMap([taught("a", 1)], []);
    expect(frontier(map, masteryMap(["a"], stateOf({ "a@1": HELD_AT })))).toEqual([]);
  });

  it("an arrow from a deeper level doesn't block the shallower one", () => {
    const map = goalMap([taught("a", 2), taught("b", 3)], [needs("b", 2, "a", 2)]);
    const f = frontier(map, masteryMap(["a", "b"], stateOf({ "b@1": 0.99 })));
    expect(f.map((p) => pairKey(p.conceptId, p.depth))).toEqual(["a@1"]); // b@2 waits for a@2
  });
});
