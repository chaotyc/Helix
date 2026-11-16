// Turns a goal you've built a map for into an evaluation case (V5): its goal fields, the source
// its latest map was built from, and your answers to the clarifying questions. Pure, so it's tested.
import type { ClarifyQuestion, Goal, SourceKind } from "@helix/contracts";
import type { EvalCase } from "./cases.ts";

// "Signals and Systems" → "signals-and-systems": the case's name and file names.
export function caseName(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function caseFromGoal(
  goal: Goal,
  source: { text: string; kind: SourceKind } | undefined,
  answered: ClarifyQuestion[],
): { case: EvalCase; sourceFile?: { name: string; text: string } } {
  const name = caseName(goal.title);
  const sourceFile = source ? { name: `${name}.source.md`, text: source.text } : undefined;
  return {
    case: {
      name,
      goal: { title: goal.title, capstone: goal.capstone, ...(goal.examDate ? { examDate: goal.examDate } : {}) },
      source: sourceFile && source ? { file: sourceFile.name, kind: source.kind } : null,
      answers: answered.map((q) => ({ about: q.about, question: q.question, answer: q.answer ?? "" })),
    },
    sourceFile,
  };
}
