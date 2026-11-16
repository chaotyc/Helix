// Turning one judged map into numbers (J4). The headline is major problems per 10 concepts:
// dividing by map size keeps a big map from looking worse just for being big (like quoting a
// bit error rate rather than a total error count). Lower is better; 0 means nothing major.
import type { GoalMap, JudgeReport } from "@helix/contracts";
import type { Warning } from "./lint.ts";

export type RunScore = {
  concepts: number;
  arrows: number;
  majors: number;
  minors: number;
  majorsPer10: number;
  byType: Record<string, { major: number; minor: number }>;
  warnings: number;
};

export function scoreRun(map: GoalMap, report: JudgeReport, warnings: Warning[]): RunScore {
  const byType: RunScore["byType"] = {};
  for (const p of report.problems) {
    const counts = (byType[p.type] ??= { major: 0, minor: 0 });
    counts[p.severity] += 1;
  }
  const majors = report.problems.filter((p) => p.severity === "major").length;
  const concepts = map.view.length;
  return {
    concepts,
    arrows: map.edges.length,
    majors,
    minors: report.problems.length - majors,
    majorsPer10: concepts === 0 ? 0 : (majors / concepts) * 10,
    byType,
    warnings: warnings.length,
  };
}

// Several runs of the same case vary (M8): report the mean and the range.
export function spread(values: number[]): { mean: number; min: number; max: number } {
  if (values.length === 0) return { mean: 0, min: 0, max: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, min: Math.min(...values), max: Math.max(...values) };
}
