// Request sections shared by the agents that work with the learner (item writer, grader, tutor,
// summarizer, tutor judge). Each of their prompt versions includes this file.
import { depthName, type Concept, type TimelineItem } from "@helix/contracts";

export const LEARNER_PARTS_FILE = import.meta.filename;

export function depthLabel(depth: number): string {
  return `${depth} (${depthName(depth)})`;
}

export function conceptSection(concept: Concept, depth: number): string {
  return [
    "# Concept",
    `Name: ${concept.name} (id: ${concept.id})`,
    `Kind: ${concept.kind}`,
    `Description: ${concept.description}`,
    `Depth: ${depthLabel(depth)}`,
  ].join("\n");
}

// A session's transcript as numbered turns. `name` turns concept ids into names.
export function transcriptLines(items: TimelineItem[], name: (conceptId: string) => string): string[] {
  return items.map((item, i) => {
    const n = `[${i + 1}]`;
    switch (item.type) {
      case "tutor":
        return `${n} Tutor: ${item.text}`;
      case "question": {
        const step = item.step ? `, step: ${item.step} (${item.stepKind})` : "";
        return `${n} Graded question on ${name(item.conceptId)} at depth ${depthLabel(item.depth)}${step}: ${item.prompt}`;
      }
      case "answer":
        return `${n} Learner${item.confidence ? ` (confidence ${item.confidence}/5)` : ""}: ${item.text}`;
      case "feedback":
        return `${n} Grader: ${item.correct ? "right" : `wrong (${item.errorTag})`}. ${item.explanation}${
          item.misconception ? ` Misconception: ${item.misconception}` : ""
        }`;
      case "task":
        return `${n} --- ${item.label} ---`;
      case "summary":
        return `${n} Summary: ${item.text}`;
    }
  });
}
