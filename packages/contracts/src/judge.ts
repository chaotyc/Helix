import { z } from "zod";

// What the map judge (Claude) must return: a list of specific problems, not a score (J3).
// Each names the concept ids involved so it can be checked, and is major (would mislead
// teaching) or minor (style or grain). Sent to the API as the output format.

export const ProblemType = z.enum([
  "wrong_arrow", //          this prerequisite isn't real
  "reversed_arrow", //       the arrow points the wrong way
  "missing_prerequisite", // a needed prerequisite arrow is absent
  "missing_concept", //      the goal needs a concept the map lacks
  "off_topic_concept", //    doesn't belong here, or isn't a real concept (the hallucination check)
  "duplicate_concept", //    two concepts are really one
  "wrong_grain", //          too broad or too narrow to study and test
  "wrong_target_depth",
  "wrong_role", //           taught vs background
  "wrong_arrow_depth", //    the arrow is right, its depths are off
]);
export type ProblemType = z.infer<typeof ProblemType>;

export const Severity = z.enum(["major", "minor"]);
export type Severity = z.infer<typeof Severity>;

export const JudgedProblem = z.strictObject({
  type: ProblemType,
  severity: Severity.describe("major: would mislead teaching or diagnosis; minor: style or grain"),
  conceptIds: z
    .array(z.string())
    .describe("ids of the map's concepts involved; for an arrow, [the concept that needs, the concept needed]"),
  reason: z.string().describe("one line: what's wrong and what would be right"),
});
export type JudgedProblem = z.infer<typeof JudgedProblem>;

export const JudgeReport = z.strictObject({
  problems: z.array(JudgedProblem),
});
export type JudgeReport = z.infer<typeof JudgeReport>;
