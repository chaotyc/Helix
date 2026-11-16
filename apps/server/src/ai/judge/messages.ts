// The messages the map judge is sent. The instructions live in prompts/judge-map.md;
// these only carry the data. The map is shown bare: no `why` lines from the extractor (J2),
// so each arrow is judged on its own merits rather than on its explanation.
import type { ClarifyQuestion, Goal, GoalMap } from "@helix/contracts";
import { answersSection, goalSection, sourceSection, type SourceInput } from "../request-parts.ts";

export const MESSAGES_FILE = import.meta.filename;

export function mapSection(map: GoalMap): string {
  const concepts = map.view.map((entry) => {
    const c = map.concepts.find((x) => x.id === entry.conceptId);
    return `- ${entry.conceptId} (${c?.name ?? "?"}) [${c?.kind ?? "?"}, ${entry.role}, target depth ${entry.targetDepth}]: ${c?.description ?? ""}`;
  });
  const prereqs = map.edges.flatMap((e) => (e.type === "prereq" ? [`- ${e.dst}@${e.dstDepth} needs ${e.src}@${e.srcDepth}`] : []));
  const partOf = map.edges.flatMap((e) => (e.type === "part_of" ? [`- ${e.src} is part of ${e.dst}`] : []));

  return [
    "# The map",
    "## Concepts",
    ...(concepts.length ? concepts : ["None."]),
    "## Prerequisites",
    ...(prereqs.length ? prereqs : ["None."]),
    "## Part of",
    ...(partOf.length ? partOf : ["None."]),
  ].join("\n");
}

export function firstMessage(goal: Goal, source: SourceInput | undefined, answered: ClarifyQuestion[], map: GoalMap): string {
  return [goalSection(goal), sourceSection(source), answersSection(answered), mapSection(map)].join("\n\n");
}

export function retryMessage(problems: string[]): string {
  return [
    "The checker rejected that report:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the complete corrected list of problems.",
  ].join("\n");
}
