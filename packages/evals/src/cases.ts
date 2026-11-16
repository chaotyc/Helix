// Evaluation cases: the fixed inputs a map is built from (J11). Each is a goal, an optional
// source file and its kind, and fixed answers to the clarifying questions (M5), so every run
// sees exactly the same input. They live in packages/evals/cases/<name>.json.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { QuestionTopic, SourceKind } from "@helix/contracts";

export const CASES_DIR = join(import.meta.dirname, "../cases");

export const EvalCase = z.object({
  name: z.string().min(1),
  goal: z.object({
    title: z.string().min(1),
    capstone: z.string(),
    examDate: z.iso.date().optional(),
  }),
  source: z.object({ file: z.string(), kind: SourceKind }).nullable(), // null: build from the goal and answers alone
  answers: z.array(z.object({ about: QuestionTopic, question: z.string().min(1), answer: z.string().min(1) })),
});
export type EvalCase = z.infer<typeof EvalCase>;

export type LoadedCase = EvalCase & { sourceText?: string };

// Every case in `dir`, or only the one named `only`. Files are outside data: checked first (rule 2).
export function loadCases(dir = CASES_DIR, only?: string): LoadedCase[] {
  const cases = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const parsed = EvalCase.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
      if (!parsed.success) throw new Error(`cases/${file} is invalid:\n${z.prettifyError(parsed.error)}`);
      const c = parsed.data;
      return { ...c, sourceText: c.source ? readFileSync(join(dir, c.source.file), "utf8") : undefined };
    });

  if (only === undefined) return cases;
  const match = cases.filter((c) => c.name === only);
  if (match.length === 0) throw new Error(`No case named "${only}". Cases: ${cases.map((c) => c.name).join(", ")}`);
  return match;
}
