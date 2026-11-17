// A clarified goal → a course map in the global graph.
//   1. Check the round: it belongs to this goal, and every question is answered (C4).
//   2. Build the request: the round's source (or none), everything the learner has told us,
//      the existing concepts.
//   3. Ask Claude and check the answer, retrying once with the problems listed (E6).
//   4. Save it as one `extract` entry in the map diary (D2). Every call is logged (E7).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ExtractionProposal, type ClarifyAnswer, type Effort, type ExtractionStage, type GoalMap, type ModelId } from "@helix/contracts";
import { goalSlice, replayGraph } from "@helix/core";
import type { ModelCall } from "../model-call.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE } from "../request-parts.ts";
import { structuredCall } from "../structured-call.ts";
import { answersForGoal, getRound, saveAnswers } from "../../db/clarifications.ts";
import { getGoal } from "../../db/goals.ts";
import { getSettings } from "../../db/settings.ts";
import { readGraph, readMapEvents, recordMapChange } from "../../db/graph.ts";
import { getSource } from "../../db/sources.ts";
import { checkProposal } from "./proposal.ts";
import { firstMessage, MESSAGES_FILE, retryMessage } from "./messages.ts";

const AGENT = "extract-map";

// Sent to the API as the required output format. Structured outputs need
// `additionalProperties: false` on every object, which z.strictObject provides.
const { $schema: _unused, ...OUTPUT_SCHEMA } = z.toJSONSchema(ExtractionProposal);

// `model`: overrides the generation model from settings (evaluations use this).
export type ExtractInput = { goalId: string; roundId: string; answers: ClarifyAnswer[]; effort?: Effort; model?: ModelId };

export type ExtractDeps = {
  callModel: ModelCall;
  onProgress?: (stage: ExtractionStage, detail: string) => void;
};

export async function extractMap(db: DatabaseSync, input: ExtractInput, deps: ExtractDeps): Promise<GoalMap> {
  // ---- Guard clauses: nothing is spent unless the round is complete ----
  const goal = getGoal(db, input.goalId);
  if (!goal) throw new Error(`No goal with id ${input.goalId}`);
  const round = getRound(db, input.roundId);
  if (!round || round.goalId !== goal.id) throw new Error(`No clarifying round ${input.roundId} for this goal.`);

  const given = new Map(input.answers.map((a) => [a.questionId, a.answer.trim()]));
  const unanswered = round.questions.filter((q) => !q.answer && !given.get(q.id));
  if (unanswered.length) {
    throw new Error(`Answer every question before the map is built:\n- ${unanswered.map((q) => q.question).join("\n- ")}`);
  }
  saveAnswers(db, round, input.answers);

  // ---- Build the request ----
  const progress = deps.onProgress ?? (() => {});
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE], ["source-is-data"]);
  const effort = input.effort ?? "high";
  const source = round.sourceId ? getSource(db, round.sourceId) : undefined;
  const graph = replayGraph(readMapEvents(db)); // the diary's graph: what the proposal is checked against

  // ---- Ask, check, retry ----
  let conceptsShown = 0;
  const { value, result, aiCallIds } = await structuredCall(db, {
    agent: AGENT,
    goalId: goal.id,
    model: input.model ?? getSettings(db).models.generation,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort,
    firstMessage: firstMessage(goal, source, answersForGoal(db, goal.id), graph.concepts),
    check: (text) => {
      const check = checkProposal(graph, goal.id, text);
      return check.ok ? { ok: true, value: check } : check;
    },
    retryMessage,
    callModel: deps.callModel,
    progress,
    thinkingDetail: "Claude is working out the map",
    onText: (textSoFar) => {
      // A cheap running count: each finished concept has a "targetDepth" field.
      const count = textSoFar.split('"targetDepth"').length - 1;
      if (count > conceptsShown) {
        conceptsShown = count;
        progress("writing", `${count} concepts so far`);
      }
    },
  });

  // ---- Save it ----
  const command = { ...value.command, raw: { proposal: value.proposal, effort, aiCallIds, roundId: round.id } };
  recordMapChange(db, command, {
    actor: "extractor",
    sourceId: round.sourceId ?? undefined,
    promptVersion: prompt.version,
    model: result.model,
  });

  const map = goalSlice(readGraph(db), goal.id);
  progress("saved", `${map.concepts.length} concepts, ${map.edges.length} arrows`);
  return map;
}
