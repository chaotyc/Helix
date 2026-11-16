import { describe, expect, it } from "vitest";
import type { GoalMap, JudgeReport } from "@helix/contracts";
import { scoreRun, spread } from "./score.ts";

const map: GoalMap = {
  goalId: "g",
  concepts: Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `C${i}`, description: "x", kind: "concept" as const })),
  view: Array.from({ length: 20 }, (_, i) => ({ conceptId: `c${i}`, role: "taught" as const, targetDepth: 3 as const })),
  edges: [],
};

const report: JudgeReport = {
  problems: [
    { type: "wrong_arrow", severity: "major", conceptIds: ["c1", "c0"], reason: "" },
    { type: "wrong_arrow", severity: "minor", conceptIds: ["c2", "c0"], reason: "" },
    { type: "missing_concept", severity: "major", conceptIds: [], reason: "" },
    { type: "missing_concept", severity: "major", conceptIds: [], reason: "" },
  ],
};

describe("scoreRun", () => {
  it("counts majors per 10 concepts: 3 majors in 20 concepts is 1.5", () => {
    const score = scoreRun(map, report, []);
    expect(score.majors).toBe(3);
    expect(score.minors).toBe(1);
    expect(score.majorsPer10).toBe(1.5);
  });

  it("breaks problems down by type and severity", () => {
    expect(scoreRun(map, report, []).byType).toEqual({
      wrong_arrow: { major: 1, minor: 1 },
      missing_concept: { major: 2, minor: 0 },
    });
  });

  it("gives the same headline to a map twice the size with twice the problems", () => {
    const double: GoalMap = { ...map, view: [...map.view, ...map.view] };
    const doubled: JudgeReport = { problems: [...report.problems, ...report.problems] };
    expect(scoreRun(double, doubled, []).majorsPer10).toBe(scoreRun(map, report, []).majorsPer10);
  });
});

describe("spread", () => {
  it("is the mean and the range", () => {
    expect(spread([1, 2, 6])).toEqual({ mean: 3, min: 1, max: 6 });
  });
});
