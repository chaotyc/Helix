// Scoring the grader against labeled answers. Pure functions: the script runs the calls.
//
// Two kinds of mistakes, like a detector's false alarms and misses:
//   false pass  a wrong answer graded right: the learner model believes something that isn't so,
//               and the tutor moves on too early. The costlier mistake.
//   false fail  a right answer graded wrong: the learner is held back and loses trust.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ErrorTag } from "@helix/contracts";

export const GOLD_FILE = join(import.meta.dirname, "../gold/grader.json");

// The bar for trusting the grader (default; yours to change).
export const MIN_ACCURACY = 0.9;
export const MAX_FALSE_PASS = 0.05;

export const GraderCase = z.object({
  id: z.string(),
  concept: z.object({ name: z.string(), kind: z.enum(["concept", "skill", "decision"]), description: z.string() }),
  depth: z.number().int().min(1).max(5),
  question: z.string(),
  rubric: z.string(),
  expectedAnswer: z.string(),
  answer: z.string(),
  confidence: z.number().int().min(1).max(5).nullable(),
  misconceptions: z.array(z.object({ id: z.string(), description: z.string() })).default([]),
  label: z.object({ correct: z.boolean(), errorTag: ErrorTag.nullable() }),
});
export type GraderCase = z.infer<typeof GraderCase>;

export function loadGraderCases(file = GOLD_FILE): GraderCase[] {
  const parsed = z.object({ cases: z.array(GraderCase) }).safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`${file} doesn't match the format:\n${z.prettifyError(parsed.error)}`);
  const ids = parsed.data.cases.map((c) => c.id);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (repeated.length) throw new Error(`Case ids must be unique; repeated: ${repeated.join(", ")}`);
  return parsed.data.cases;
}

export type Graded = { caseId: string; label: GraderCase["label"]; correct: boolean; errorTag: ErrorTag | null };

export type GraderScore = {
  cases: number;
  accuracy: number; // share graded the same as the label
  falsePass: number; // share of labeled-wrong answers graded right
  falseFail: number; // share of labeled-right answers graded wrong
  tagAgreement: number | null; // among answers both call wrong, share with the same error tag
  meetsBar: boolean;
};

export function scoreGrader(graded: Graded[]): GraderScore {
  const rate = (hits: number, total: number) => (total === 0 ? 0 : hits / total);
  const labeledWrong = graded.filter((g) => !g.label.correct);
  const labeledRight = graded.filter((g) => g.label.correct);
  const bothWrong = labeledWrong.filter((g) => !g.correct);

  const accuracy = rate(graded.filter((g) => g.correct === g.label.correct).length, graded.length);
  const falsePass = rate(labeledWrong.filter((g) => g.correct).length, labeledWrong.length);
  return {
    cases: graded.length,
    accuracy,
    falsePass,
    falseFail: rate(labeledRight.filter((g) => !g.correct).length, labeledRight.length),
    tagAgreement: bothWrong.length ? rate(bothWrong.filter((g) => g.errorTag === g.label.errorTag).length, bothWrong.length) : null,
    meetsBar: graded.length > 0 && accuracy >= MIN_ACCURACY && falsePass <= MAX_FALSE_PASS,
  };
}
