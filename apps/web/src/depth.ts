import { depthName, type ConceptKnowledge, type Depth } from "@helix/contracts";

// Tailwind classes for each depth, 0 (not yet) to 5 (expert). On the dark background,
// a brighter chip means a deeper hold on the concept. Tailwind only includes classes it
// finds written out in full in the source, so each one is spelled out here.
const DEPTH_CLASSES = [
  "bg-zinc-800 text-zinc-400",
  "bg-sky-950 text-sky-200",
  "bg-sky-900 text-sky-100",
  "bg-sky-700 text-white",
  "bg-sky-500 text-zinc-950",
  "bg-sky-300 text-zinc-950",
];

export function depthClasses(depth: Depth): string {
  return DEPTH_CLASSES[depth] ?? DEPTH_CLASSES[0];
}

// How far a concept is toward this goal's target depth, 0–1: the depths held, plus the chance
// the next one is mastered. Used for the bar under each concept on the map.
export function progressToward(knowledge: ConceptKnowledge | undefined, target: number): number {
  if (!knowledge || target === 0) return 0;
  const held = Math.min(knowledge.depthHeld, target);
  const next = held < target ? (knowledge.mastery[held] ?? 0) : 0; // mastery[i] is depth i + 1
  return Math.min(1, (held + next) / target);
}

// "1 Orient 0.97 · 2 Explain 0.64 · …" for a tooltip.
export function masteryLine(knowledge: ConceptKnowledge | undefined): string {
  if (!knowledge) return "No answers yet.";
  const depths = knowledge.mastery.map((p, i) => `${i + 1} ${depthName(i + 1)} ${p.toFixed(2)}`).join(" · ");
  const inferred = knowledge.depthHeld > knowledge.depthTested ? ` · depth ${knowledge.depthHeld} held through arrows (tested to ${knowledge.depthTested})` : "";
  return `${depths} · ${knowledge.answers} answers${inferred}`;
}
