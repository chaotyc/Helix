// The messages the extractor is sent, built from the goal, the source, and the existing graph.
// The instructions live in prompts/extract-map.md; these only carry the data.
import type { Concept, Goal } from "@helix/contracts";

export function firstMessage(goal: Goal, sourceText: string | undefined, existing: Concept[]): string {
  const source = sourceText?.trim()
    ? `<source>\n${sourceText.trim()}\n</source>`
    : "None provided. Build the map from the goal and your own knowledge of the subject.";

  const known = existing.length
    ? existing.map((c) => `- ${c.id} (${c.name}): ${c.description}`).join("\n")
    : "None yet.";

  return [
    "# Goal",
    `Title: ${goal.title}`,
    `Kind: ${goal.kind}`,
    `Capstone: ${goal.capstone || "not given"}`,
    `Exam date: ${goal.examDate ?? "none"}`,
    "",
    "# Source material",
    source,
    "",
    "# Concepts already in the learner's map",
    "Reuse these ids for any concept that is the same as one you need.",
    known,
  ].join("\n");
}

export function retryMessage(problems: string[]): string {
  return [
    "Helix's checker rejected that map:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the complete corrected map (every concept, prerequisite, and part-of arrow), not just the fixes.",
  ].join("\n");
}
