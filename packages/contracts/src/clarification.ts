import { z } from "zod";

// Before a map is built, a clarifier asks the learner up to 3 questions whose answers would
// change the map. The first question for a goal is always about the goal itself.

export const QuestionTopic = z.enum(["goal", "scope", "background", "other"]);
export type QuestionTopic = z.infer<typeof QuestionTopic>;

// "choice" questions come with suggested answers; the learner can still type their own.
export const AnswerType = z.enum(["free_text", "choice"]);
export type AnswerType = z.infer<typeof AnswerType>;

// ---------------------------------------------------------------------------
// What the clarifier (Claude) must return. Sent to the API as the output format, so no
// array-length limits here: code checks "at most 3" and "2–4 choices" after.
// ---------------------------------------------------------------------------

export const ProposedQuestion = z.strictObject({
  about: QuestionTopic.describe("goal: what the learner wants to achieve; scope: what's in or out; background: what they arrive with"),
  question: z.string().describe("one plain question, asking one thing, addressed to the learner"),
  why: z.string().describe("one line: how the answer would change the map"),
  answerType: AnswerType.describe("choice when likely answers form a short known list; free_text when the answer is personal or open"),
  choices: z.array(z.string()).describe("2-4 short suggested answers for a choice question; empty for free_text"),
});
export type ProposedQuestion = z.infer<typeof ProposedQuestion>;

export const ClarifyProposal = z.strictObject({
  questions: z.array(ProposedQuestion),
});
export type ClarifyProposal = z.infer<typeof ClarifyProposal>;

// ---------------------------------------------------------------------------
// Questions as saved with the goal and shown to the learner.
// ---------------------------------------------------------------------------

export const ClarifyQuestion = z.object({
  id: z.string(),
  about: QuestionTopic,
  question: z.string(),
  why: z.string(),
  answerType: AnswerType,
  choices: z.array(z.string()),
  answer: z.string().optional(), // missing until the learner answers
});
export type ClarifyQuestion = z.infer<typeof ClarifyQuestion>;

// The learner's answer: one of the choices or their own words. Never empty (every question
// must be answered before the map is built).
export const ClarifyAnswer = z.object({
  questionId: z.string(),
  answer: z.string().trim().min(1),
});
export type ClarifyAnswer = z.infer<typeof ClarifyAnswer>;
