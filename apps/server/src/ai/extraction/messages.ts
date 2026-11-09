// The messages the extractor is sent, built from the goal, the source, the learner's answers,
// and the existing graph. The instructions live in prompts/extract-map.md; these only carry the data.
import type { ClarifyQuestion, Concept, Goal } from "@helix/contracts";
import { answersSection, goalSection, sourceSection, type SourceInput } from "../request-parts.ts";

export const MESSAGES_FILE = import.meta.filename;

export function firstMessage(
  goal: Goal,
  source: SourceInput | undefined,
  answered: ClarifyQuestion[],
  existing: Concept[],
): string {
  const known = existing.length
    ? existing.map((c) => `- ${c.id} (${c.name}): ${c.description}`).join("\n")
    : "None yet.";

  return [
    goalSection(goal),
    sourceSection(source),
    answersSection(answered),
    ["# Concepts already in the learner's map", "Reuse these ids for any concept that is the same as one you need.", known].join("\n"),
  ].join("\n\n");
}

export function retryMessage(problems: string[]): string {
  return [
    "The checker rejected that map:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the complete corrected map (every concept, prerequisite, and part-of arrow), not just the fixes.",
  ].join("\n");
}
