import { describe, expect, it } from "vitest";
import type { GoalMap, ViewEntry } from "@helix/contracts";
import { lintMap, wordOverlap } from "./lint.ts";

function goalMap(entries: [string, string, ViewEntry["role"], ViewEntry["targetDepth"]][], arrows: [string, string][] = []): GoalMap {
  return {
    goalId: "g",
    concepts: entries.map(([id, name]) => ({ id, name, description: `About ${name}.`, kind: "concept" })),
    view: entries.map(([conceptId, , role, targetDepth]) => ({ conceptId, role, targetDepth })),
    edges: arrows.map(([dst, src]) => ({ type: "prereq", src, srcDepth: 1, dst, dstDepth: 1 })),
  };
}

const rules = (map: GoalMap) => lintMap(map).map((w) => `${w.rule}:${w.conceptIds.join(",")}`);

describe("lintMap", () => {
  it("passes a healthy map", () => {
    const map = goalMap(
      [["algebra", "Algebra", "background", 2], ["limits", "Limits", "taught", 3], ["derivatives", "Derivatives", "taught", 4]],
      [["limits", "algebra"], ["derivatives", "limits"]],
    );
    expect(lintMap(map)).toEqual([]);
  });

  it("flags a concept cut off from the rest", () => {
    const map = goalMap([["limits", "Limits", "taught", 3], ["derivatives", "Derivatives", "taught", 4], ["art", "Art", "taught", 2]], [["derivatives", "limits"]]);
    expect(rules(map)).toEqual(["no_arrows:art"]);
  });

  it("doesn't flag a one-concept map for having no arrows: a tiny goal can be one concept", () => {
    expect(lintMap(goalMap([["chain-rule", "Chain rule", "taught", 3]]))).toEqual([]);
  });

  it("flags background that nothing needs", () => {
    const map = goalMap([["algebra", "Algebra", "background", 2], ["limits", "Limits", "taught", 3]], [["algebra", "limits"]]);
    expect(rules(map)).toContain("unused_background:algebra");
  });

  it("flags one shared target depth only once a map is big enough to expect variety", () => {
    const five = goalMap(
      ["a", "b", "c", "d", "e"].map((id) => [id, `Topic ${id}`, "taught", 3] as [string, string, "taught", 3]),
      [["b", "a"], ["c", "b"], ["d", "c"], ["e", "d"]],
    );
    expect(rules(five)).toContain("same_target_depth:");
    const three = goalMap([["x", "Sets", "taught", 3], ["y", "Maps", "taught", 3], ["z", "Groups", "taught", 3]], [["y", "x"], ["z", "y"]]);
    expect(rules(three)).not.toContain("same_target_depth:");
  });

  it("flags names that share most of their words", () => {
    const map = goalMap([["fs", "Fourier series", "taught", 3], ["fs2", "Fourier Series", "taught", 3]], [["fs2", "fs"]]);
    expect(rules(map)).toContain("similar_names:fs,fs2");
  });
});

describe("wordOverlap", () => {
  it("is shared words over all words", () => {
    expect(wordOverlap("Fourier series", "Fourier transform")).toBeCloseTo(1 / 3);
    expect(wordOverlap("LTI systems", "LTI system")).toBe(1); // plural ignored
    expect(wordOverlap("Limits", "Graphs")).toBe(0);
  });
});
