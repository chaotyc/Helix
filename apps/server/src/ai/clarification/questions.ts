// Checks the clarifier's answer. Same guard chain as the extractor's check: JSON, then shape,
// then the rules the schema can't express. Problems are plain sentences Claude sees on a retry.
import { z } from "zod";
import { ClarifyProposal, type ProposedQuestion } from "@helix/contracts";
import type { Check } from "../structured-call.ts";

export const MAX_QUESTIONS = 3;

// `goalAnswered`: the learner has already answered a question about their goal in an earlier round.
export function checkQuestions(text: string, goalAnswered: boolean): Check<ProposedQuestion[]> {
  // 1. Is it JSON at all?
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["The answer is not valid JSON."] };
  }

  // 2. Does it have the right shape?
  const parsed = ClarifyProposal.safeParse(data);
  if (!parsed.success) return { ok: false, problems: [z.prettifyError(parsed.error)] };
  const questions = parsed.data.questions;

  // 3. The rules on the list as a whole.
  const problems: string[] = [];
  if (questions.length > MAX_QUESTIONS) {
    problems.push(`Ask at most ${MAX_QUESTIONS} questions; there are ${questions.length}.`);
  }
  if (!goalAnswered && questions[0]?.about !== "goal") {
    problems.push('The first question must be about the learner\'s goal (about: "goal").');
  }

  // 4. The rules on each question.
  questions.forEach((q, i) => {
    const label = `question ${i + 1}`;
    if (!q.question.trim()) problems.push(`${label} is empty.`);
    if (q.answerType === "choice" && (q.choices.length < 2 || q.choices.length > 4)) {
      problems.push(`${label} is a choice question, so it needs 2-4 choices; it has ${q.choices.length}.`);
    }
    if (q.answerType === "choice" && q.choices.some((c) => !c.trim())) problems.push(`${label} has an empty choice.`);
    if (q.answerType === "free_text" && q.choices.length > 0) {
      problems.push(`${label} is free_text, so its choices must be empty.`);
    }
  });

  return problems.length ? { ok: false, problems } : { ok: true, value: questions };
}
