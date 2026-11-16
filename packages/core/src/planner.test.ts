import { describe, expect, it } from "vitest";
import { masteryMap } from "./knowledge.ts";
import type { LearnerState } from "./mastery.ts";
import { planSession, type ActiveMisconception } from "./planner.ts";
import { chain, goalMap, needs, stateOf, taught } from "./test-maps.ts";
import type { Edge, GoalMap } from "@helix/contracts";

function plan(map: GoalMap, state: LearnerState, misconceptions: ActiveMisconception[] = []) {
  const ids = map.view.map((e) => e.conceptId);
  return planSession({ map, state, mastery: masteryMap(ids, state), misconceptions });
}
const brief = (tasks: ReturnType<typeof plan>) => tasks.map((t) => `${t.kind} ${t.conceptId}@${t.depth}`);

describe("planSession: 2 reviews, then the next depth on the frontier", () => {
  it("a new learner gets no reviews, and the frontier pair that unlocks the most of the goal", () => {
    // complex-numbers@1 sits under everything; lti@1 only under lti and convolution
    const tasks = plan(chain, stateOf({}));
    expect(brief(tasks)).toEqual(["focus complex-numbers@1"]);
    expect(Object.keys(tasks[0]!).sort()).toEqual(["aimedAt", "conceptId", "depth", "kind", "reason"]); // exactly a task's fields
  });

  // Four held concepts with no arrows, answered in order a, b, c, d (a is the oldest).
  const flat = goalMap([taught("a", 1), taught("b", 1), taught("c", 1), taught("d", 1), taught("e", 1)], []);
  const held = stateOf({ "a@1": 0.97, "b@1": 0.97, "c@1": 0.97, "d@1": 0.97 });

  it("reviews the concepts tested longest ago, and teaches what isn't held", () => {
    expect(brief(plan(flat, held))).toEqual(["review a@1", "review b@1", "focus e@1"]);
  });

  it("an active misconception comes first, aimed at it", () => {
    const tasks = plan(flat, held, [{ id: "m1", conceptId: "d", depth: 1, description: "thinks d is e" }]);
    expect(brief(tasks)[0]).toBe("review d@1");
    expect(tasks[0]!.aimedAt).toBe("m1");
  });

  it("a right answer given unsure (confidence 1–2) comes before ordinary review", () => {
    const state = new Map(held);
    state.set("c@1", { ...state.get("c@1")!, lastConfidence: 2 });
    expect(brief(plan(flat, state)).slice(0, 2)).toEqual(["review c@1", "review a@1"]);
  });

  it("interleaves: the second review prefers a concept easily confused with the first", () => {
    // a and c are both parts of the same whole, so they're the confusable pair
    const partOf = (src: string, dst: string): Edge => ({ type: "part_of", src, dst });
    const map = goalMap([...flat.view, taught("whole", 1)], [partOf("a", "whole"), partOf("c", "whole")]);
    expect(brief(plan(map, held)).slice(0, 2)).toEqual(["review a@1", "review c@1"]);
  });

  it("never reviews the concept it's about to teach", () => {
    const map = goalMap([taught("a", 2), taught("b", 1)], []);
    const tasks = plan(map, stateOf({ "a@1": 0.97, "b@1": 0.97 }));
    expect(brief(tasks)).toEqual(["review b@1", "focus a@2"]);
  });

  it("doesn't review what was answered wrong (that's learning, not review)", () => {
    const map = goalMap([taught("a", 1), taught("b", 2)], [needs("b", 2, "a", 1)]);
    expect(brief(plan(map, stateOf({ "a@1": 0.1, "b@1": 0.97 })))).toEqual(["review b@1", "focus a@1"]);
  });
});
