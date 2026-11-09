// Before a map is built: goal + source (or nothing) → up to 3 questions for the learner (C1).
//   1. Save the source, so the extraction that follows uses exactly this text.
//   2. Ask Claude which questions would change the map most, given what the learner already told us.
//   3. Check the questions (at most 3, the first about the goal) and save them as one round.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ClarifyProposal, type ClarifyQuestion, type ExtractionStage, type SourceKind } from "@helix/contracts";
import type { ModelCall } from "../claude.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE } from "../request-parts.ts";
import { structuredCall } from "../structured-call.ts";
import { answersForGoal, createRound } from "../../db/clarifications.ts";
import { getGoal } from "../../db/goals.ts";
import { createSource } from "../../db/sources.ts";
import { firstMessage, MESSAGES_FILE, retryMessage } from "./messages.ts";
import { checkQuestions } from "./questions.ts";

const AGENT = "clarify-map";
const EFFORT = "medium"; // it only reads and asks; the map itself gets the user's chosen effort (C7)

const { $schema: _unused, ...OUTPUT_SCHEMA } = z.toJSONSchema(ClarifyProposal);

export type ClarifyInput = { goalId: string; sourceText?: string; sourceKind?: SourceKind };

export type ClarifyDeps = {
  callModel: ModelCall;
  onProgress?: (stage: ExtractionStage, detail: string) => void;
};

export async function clarifyMap(
  db: DatabaseSync,
  input: ClarifyInput,
  deps: ClarifyDeps,
): Promise<{ roundId: string; questions: ClarifyQuestion[] }> {
  const goal = getGoal(db, input.goalId);
  if (!goal) throw new Error(`No goal with id ${input.goalId}`);

  const progress = deps.onProgress ?? (() => {});
  const text = input.sourceText?.trim();
  const source = text ? { text, kind: input.sourceKind ?? "other" } : undefined;
  const sourceId = source ? createSource(db, goal.id, source.text, source.kind) : undefined;
  const answered = answersForGoal(db, goal.id);

  const { value, aiCallIds } = await structuredCall(db, {
    agent: AGENT,
    goalId: goal.id,
    prompt: loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE]),
    schema: OUTPUT_SCHEMA,
    effort: EFFORT,
    firstMessage: firstMessage(goal, source, answered),
    check: (answer) => checkQuestions(answer, answered.some((q) => q.about === "goal")),
    retryMessage,
    callModel: deps.callModel,
    progress,
    thinkingDetail: "Claude is choosing what to ask",
  });

  const round = createRound(db, { goalId: goal.id, sourceId, aiCallId: aiCallIds.at(-1), questions: value });
  progress("asked", round.questions.length ? `${round.questions.length} questions to answer` : "no questions needed");
  return { roundId: round.id, questions: round.questions };
}
