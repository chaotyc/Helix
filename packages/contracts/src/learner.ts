import { z } from "zod";

// ---------------------------------------------------------------------------
// The learner model (Steps 11–13): what Helix believes the learner knows, and the
// shapes of the agents that ask, grade, and teach.
// ---------------------------------------------------------------------------

// Names for depths 1–5 (index 0 is depth 1). Defined in prompts/depth-levels.md.
export const DEPTH_NAMES = ["Orient", "Explain", "Apply", "Analyze", "Expert"] as const;

export function depthName(depth: number): string {
  return DEPTH_NAMES[depth - 1] ?? `depth ${depth}`;
}

// What kind of mistake a wrong answer shows. One list, used by the grader's output, the
// evidence log, and the grader eval. Edit it here and the grader's schema follows.
export const ErrorTag = z.enum([
  "misconception", // a wrong belief about how the concept works
  "wrong_method", // chose a method that doesn't fit the problem
  "slip", // right method, an algebra, arithmetic, or sign mistake
  "incomplete", // right as far as it goes, but missing a required part
  "misread", // answered a different question than the one asked
  "no_answer", // "I don't know", blank, or off-topic
]);
export type ErrorTag = z.infer<typeof ErrorTag>;

// K2: inside a tutoring task, which kind of step a graded question tested. Typed by the
// concept's kind: reasoning steps for a concept, solution steps for a skill, and
// condition → choice for a decision.
export const StepKind = z.enum(["reasoning", "solution", "choice"]);
export type StepKind = z.infer<typeof StepKind>;

// How the tutor is teaching the current task. Recorded per task, so a later step can learn
// which methods work (after-MVP item 4).
export const TeachingMethod = z.enum(["worked_example", "socratic", "analogy", "contrast", "practice"]);
export type TeachingMethod = z.infer<typeof TeachingMethod>;

// One concept's knowledge as the UI shows it (K1). Knowledge is global: one entry per
// concept, whatever course the answers came from (G3).
export const ConceptKnowledge = z.object({
  conceptId: z.string(),
  depthHeld: z.number().int().min(0).max(5), // highest depth held, tested or inferred through arrows
  depthTested: z.number().int().min(0).max(5), // highest depth held on this concept's own answers
  mastery: z.array(z.number().min(0).max(1)).length(5), // chance it's mastered, at depths 1–5
  answers: z.number().int().min(0), // graded answers on this concept, all depths
});
export type ConceptKnowledge = z.infer<typeof ConceptKnowledge>;

// ---------------------------------------------------------------------------
// What the agents return. Sent to the API as output formats, so only what structured
// outputs support: code checks the rest (rule 2).
// ---------------------------------------------------------------------------

// The item writer: one question for one concept at one depth.
export const WrittenItem = z.strictObject({
  prompt: z.string().describe("the question, as the learner will see it"),
  rubric: z.string().describe("what a correct answer must contain at this depth, and what doesn't count"),
  expectedAnswer: z.string().describe("a model answer that meets the rubric"),
});
export type WrittenItem = z.infer<typeof WrittenItem>;

// The grader: right or wrong, why, and any misconception the answer shows (K3).
export const Grade = z.strictObject({
  correct: z.boolean(),
  errorTag: ErrorTag.nullable().describe("null when correct; otherwise the main kind of mistake"),
  explanation: z.string().describe("feedback to the learner: what was right, what was wrong, the fix"),
  notes: z.string().describe("one or two lines for the tutor's memory: the misunderstanding or what to retain"),
  misconceptionId: z.string().nullable().describe("the id of a listed misconception this answer shows, or null"),
  newMisconception: z.string().nullable().describe("a misconception not on the list, as one plain sentence, or null"),
});
export type Grade = z.infer<typeof Grade>;

// A graded question the tutor asks inside a task.
export const TutorQuestion = z.strictObject({
  prompt: z.string().describe("the question, as it appears to the learner"),
  rubric: z.string(),
  expectedAnswer: z.string(),
  step: z.string().describe("the step this tests, in a few words"),
  stepKind: StepKind,
});
export type TutorQuestion = z.infer<typeof TutorQuestion>;

// The tutor: one turn of the conversation. `message` comes first so it streams first.
export const TutorTurn = z.strictObject({
  message: z.string().describe("what the tutor says this turn"),
  method: TeachingMethod.describe("how you are teaching the current task"),
  question: TutorQuestion.nullable().describe("a graded question, asked with no hints given for it; null otherwise"),
  taskDone: z.boolean().describe("true once the task's closing retrieval question has been answered and discussed"),
});
export type TutorTurn = z.infer<typeof TutorTurn>;

// The session summarizer (K6).
export const SessionSummary = z.strictObject({
  summary: z.string().describe("about 5 lines: what was covered, what worked, what's unfinished"),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

// The tutor eval's judge: one verdict per teaching rule.
export const TutorRule = z.enum([
  "predict_first", // asks for a prediction before explaining
  "one_question", // one question at a time
  "hints_before_solution", // at least two hints before giving a solution
  "asks_why", // asks why a step works
  "retrieval_at_end", // each task ends with a retrieval question
  "never_grades", // leaves grading to the grader
]);
export type TutorRule = z.infer<typeof TutorRule>;

export const RuleVerdict = z.strictObject({
  rule: TutorRule,
  verdict: z.enum(["pass", "fail", "not_applicable"]),
  evidence: z.string().describe("the turn number and a short quote that decided it"),
});
export type RuleVerdict = z.infer<typeof RuleVerdict>;

export const TutorJudgeReport = z.strictObject({ verdicts: z.array(RuleVerdict) });
export type TutorJudgeReport = z.infer<typeof TutorJudgeReport>;

// ---------------------------------------------------------------------------
// The grader eval (packages/evals): a simulated learner writes answers of assigned kinds,
// the real grader grades them, and a judge decides whether each grade is right. The kind
// is an instruction to the simulator, not a label: only the judge's verdict is scored.
// ---------------------------------------------------------------------------

export const AnswerKind = z.enum([
  "fully_right", // meets the rubric, in the learner's own words
  "right_other_form", // right by other notation, an equivalent form, or another valid method
  "right_result_wrong_reasoning", // the right result reached by wrong reasoning
  "partly_right", // right as far as it goes, missing a required part
  "misconception", // follows from a wrong belief about the concept
  "slip", // the right approach with one small execution error
  "misread", // answers a different question
  "no_answer", // no real attempt
]);
export type AnswerKind = z.infer<typeof AnswerKind>;

export const SimulatedAnswer = z.strictObject({
  kind: AnswerKind,
  answer: z.string().describe("the learner's answer, as they would type it"),
  confidence: z.number().int().describe("1 to 5: how sure this learner would be before seeing feedback"),
});
export type SimulatedAnswer = z.infer<typeof SimulatedAnswer>;

export const SimulatedAnswers = z.strictObject({ answers: z.array(SimulatedAnswer) });
export type SimulatedAnswers = z.infer<typeof SimulatedAnswers>;

export const GradeVerdict = z.enum([
  "right", // the grade's right/wrong call is correct
  "false_pass", // graded right, but the answer is wrong
  "false_fail", // graded wrong, but the answer is right
]);
export type GradeVerdict = z.infer<typeof GradeVerdict>;

export const GraderJudgment = z.strictObject({
  reason: z.string().describe("two or three lines: what the answer shows against the rubric, and what decided the verdict"),
  rubricSound: z.boolean().describe("false if the rubric or model answer is wrong, or too vague to grade from"),
  verdict: GradeVerdict,
  tagFits: z
    .enum(["yes", "no", "not_applicable"])
    .describe("yes or no only when the grade says wrong and the verdict is right; otherwise not_applicable"),
  betterTag: ErrorTag.nullable().describe("when tagFits is no: the tag that fits; otherwise null"),
});
export type GraderJudgment = z.infer<typeof GraderJudgment>;
