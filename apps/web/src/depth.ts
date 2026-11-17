import { depthName, type ConceptKnowledge } from "@helix/contracts";

// The chance the next depth (the one above the depth held) is mastered, 0–1, or 0 at target.
// The depth meter draws it as a partly filled segment.
export function nextDepthChance(knowledge: ConceptKnowledge | undefined, target: number): number {
  if (!knowledge || knowledge.depthHeld >= target) return 0;
  return knowledge.mastery[knowledge.depthHeld] ?? 0;
}

// "1 Orient 0.97 · 2 Explain 0.64 · …" for a tooltip.
export function masteryLine(knowledge: ConceptKnowledge | undefined): string {
  if (!knowledge) return "No answers yet.";
  const depths = knowledge.mastery.map((p, i) => `${i + 1} ${depthName(i + 1)} ${p.toFixed(2)}`).join(" · ");
  const inferred = knowledge.depthHeld > knowledge.depthTested ? ` · depth ${knowledge.depthHeld} held through arrows (tested to ${knowledge.depthTested})` : "";
  return `${depths} · ${knowledge.answers} answers${inferred}`;
}
