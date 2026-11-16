// A graded answer, start to finish (Step 12's flow):
//   answer + confidence → predicted chance of a right answer (K8) → grader → misconception
//   linked or named (K3) → evidence row → knowledge recomputed → the map recolors.
import type { StepKind, TimelineItem } from "@helix/contracts";
import { pairKey, predictCorrect } from "@helix/core";
import { gradeAnswer } from "../ai/grading/grade-answer.ts";
import { createMisconception, insertEvidence, learnerSnapshot, listMisconceptions, rebuildConceptState, type Item } from "../db/learner.ts";
import { inTransaction } from "../db/transaction.ts";
import { conceptIn, learnerStateMsg, newId, teaching, type SessionCtx } from "./context.ts";

export type AnswerToGrade = {
  item: Item;
  answer: string;
  confidence: number | null;
  taskId: string | null;
  step: string | null;
  stepKind: StepKind | null;
};

// Returns the feedback item for the timeline (the caller adds it).
export async function gradeAndRecord(ctx: SessionCtx, a: AnswerToGrade): Promise<Extract<TimelineItem, { type: "feedback" }>> {
  const { db } = ctx;
  const before = learnerSnapshot(db);
  const predictedP = predictCorrect(before.mastery.get(pairKey(a.item.conceptId, a.item.depth)) ?? 0);
  const known = listMisconceptions(db, a.item.conceptId);

  ctx.status("Grading…");
  const { grade, promptVersion, model } = await gradeAnswer(
    db,
    {
      goalId: ctx.session.goalId,
      concept: conceptIn(before.graph, a.item.conceptId),
      depth: a.item.depth,
      question: a.item,
      answer: a.answer,
      confidence: a.confidence,
      misconceptions: known,
    },
    teaching(ctx),
  );

  // The misconception this answer showed: a new one is named here, in the same transaction as the evidence.
  const misconception = inTransaction(db, () => {
    const description = grade.newMisconception?.trim();
    const shown = description
      ? { id: createMisconception(db, a.item.conceptId, description), description }
      : (known.find((m) => m.id === grade.misconceptionId) ?? null);
    insertEvidence(db, {
      goalId: ctx.session.goalId,
      conceptId: a.item.conceptId,
      depth: a.item.depth,
      itemId: a.item.id,
      sessionId: ctx.session.id,
      taskId: a.taskId,
      answer: a.answer,
      correct: grade.correct,
      confidence: a.confidence,
      errorTag: grade.errorTag,
      explanation: grade.explanation,
      notes: grade.notes,
      misconceptionId: shown?.id ?? null,
      predictedP,
      step: a.step,
      stepKind: a.stepKind,
      promptVersion,
      model,
    });
    return shown;
  });
  rebuildConceptState(db);
  ctx.emit(learnerStateMsg(db));

  return {
    type: "feedback",
    id: newId(),
    correct: grade.correct,
    errorTag: grade.errorTag,
    explanation: grade.explanation,
    ...(misconception ? { misconception: misconception.description } : {}),
  };
}
