// Checks the judge's report. Same guard chain as the other agents: JSON, then shape, then
// the rules the schema can't express (every id must be in the map; arrows name two concepts).
import { z } from "zod";
import { JudgeReport, type GoalMap, type ProblemType } from "@helix/contracts";
import type { Check } from "../structured-call.ts";

const ARROW_TYPES: ProblemType[] = ["wrong_arrow", "reversed_arrow", "missing_prerequisite", "wrong_arrow_depth"];
const ONE_OR_MORE: ProblemType[] = ["off_topic_concept", "wrong_grain", "wrong_target_depth", "wrong_role"];

export function checkReport(text: string, map: GoalMap): Check<JudgeReport> {
  // 1. Is it JSON at all?
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The answer is not valid JSON."] };
  }

  // 2. Does it have the right shape?
  const parsed = JudgeReport.safeParse(data);
  if (!parsed.success) return { ok: false, problems: [z.prettifyError(parsed.error)] };
  const report = parsed.data;

  // 3. Does each problem point at real concepts, the right number of them?
  const ids = new Set(map.view.map((e) => e.conceptId));
  const problems: string[] = [];
  report.problems.forEach((p, i) => {
    const label = `problem ${i + 1} (${p.type})`;
    const unknown = p.conceptIds.filter((id) => !ids.has(id));
    if (unknown.length) problems.push(`${label} names concept ids not in the map: ${unknown.join(", ")}.`);
    if (ARROW_TYPES.includes(p.type) && p.conceptIds.length !== 2) {
      problems.push(`${label} is about an arrow, so it needs exactly 2 concept ids; it has ${p.conceptIds.length}.`);
    }
    if (p.type === "duplicate_concept" && p.conceptIds.length < 2) problems.push(`${label} needs the 2 or more ids that are duplicates.`);
    if (ONE_OR_MORE.includes(p.type) && p.conceptIds.length === 0) problems.push(`${label} needs the id of the concept it's about.`);
    if (!p.reason.trim()) problems.push(`${label} has no reason.`);
  });

  return problems.length ? { ok: false, problems } : { ok: true, value: report };
}
