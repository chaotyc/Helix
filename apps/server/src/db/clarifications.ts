// Clarifying questions and the learner's answers, kept with the goal (C3).
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { AnswerType, ClarifyQuestion, QuestionTopic, type ClarifyAnswer, type ProposedQuestion } from "@helix/contracts";
import { inTransaction } from "./transaction.ts";

export type Round = { id: string; goalId: string; sourceId: string | null; questions: ClarifyQuestion[] };

// A question as SQLite returns it.
const QuestionRow = z.object({
  id: z.string(),
  about: QuestionTopic,
  question: z.string(),
  why: z.string(),
  answer_type: AnswerType,
  choices: z.string(), // JSON
  answer: z.string().nullable(),
});

function toQuestion(row: unknown): ClarifyQuestion {
  const r = QuestionRow.parse(row);
  return ClarifyQuestion.parse({
    id: r.id,
    about: r.about,
    question: r.question,
    why: r.why,
    answerType: r.answer_type,
    choices: JSON.parse(r.choices),
    answer: r.answer ?? undefined,
  });
}

// Saves one round of questions and returns it, with an id for each question.
export function createRound(
  db: DatabaseSync,
  input: { goalId: string; sourceId?: string; aiCallId?: number; questions: ProposedQuestion[] },
): Round {
  const id = randomUUID();
  inTransaction(db, () => {
    db.prepare(
      `INSERT INTO clarify_round (id, goal_id, source_id, ai_call_id, created_at)
       VALUES ($id, $goalId, $sourceId, $aiCallId, $createdAt)`,
    ).run({
      id,
      goalId: input.goalId,
      sourceId: input.sourceId ?? null,
      aiCallId: input.aiCallId ?? null,
      createdAt: new Date().toISOString(),
    });
    const insert = db.prepare(
      `INSERT INTO clarification (id, round_id, position, about, question, why, answer_type, choices)
       VALUES ($id, $roundId, $position, $about, $question, $why, $answerType, $choices)`,
    );
    input.questions.forEach((q, i) =>
      insert.run({
        id: randomUUID(),
        roundId: id,
        position: i + 1,
        about: q.about,
        question: q.question,
        why: q.why,
        answerType: q.answerType,
        choices: JSON.stringify(q.choices),
      }),
    );
  });
  return getRound(db, id)!;
}

export function getRound(db: DatabaseSync, id: string): Round | undefined {
  const round = db.prepare("SELECT goal_id, source_id FROM clarify_round WHERE id = $id").get({ id });
  if (!round) return undefined;
  const questions = db
    .prepare("SELECT * FROM clarification WHERE round_id = $id ORDER BY position")
    .all({ id })
    .map(toQuestion);
  return { id, goalId: String(round.goal_id), sourceId: round.source_id === null ? null : String(round.source_id), questions };
}

// Saves answers to a round's questions. Throws, saving nothing, if an answer is for a
// question outside the round.
export function saveAnswers(db: DatabaseSync, round: Round, answers: ClarifyAnswer[]): void {
  const ids = new Set(round.questions.map((q) => q.id));
  const stray = answers.find((a) => !ids.has(a.questionId));
  if (stray) throw new Error(`Question ${stray.questionId} isn't part of this round.`);

  const update = db.prepare("UPDATE clarification SET answer = $answer, answered_at = $at WHERE id = $id");
  const at = new Date().toISOString();
  inTransaction(db, () => {
    for (const a of answers) update.run({ id: a.questionId, answer: a.answer, at });
  });
}

// Every answered question for a goal, oldest first: what the learner has told us about it.
export function answersForGoal(db: DatabaseSync, goalId: string): ClarifyQuestion[] {
  return db
    .prepare(
      `SELECT c.* FROM clarification c JOIN clarify_round r ON r.id = c.round_id
       WHERE r.goal_id = $goalId AND c.answer IS NOT NULL
       ORDER BY r.created_at, c.position`,
    )
    .all({ goalId })
    .map(toQuestion);
}
