// A goal's map → a list of specific problems with it (J3). Rule checks catch what code can
// see; this catches what needs judgment: wrong or missing arrows, missing or off-topic
// concepts (the hallucination check), wrong depths and roles.
//   1. Gather what the extractor had: the goal, the source the map was built from, the answers.
//   2. Show Claude that and the bare map, and ask what's wrong or missing.
//   3. Check the report (ids must be in the map), retrying once.
// Nothing is written to the map: the report is returned to the caller (the evaluation).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { JudgeReport, type Effort, type ExtractionStage, type GoalMap, type ModelId } from "@helix/contracts";
import { goalSlice } from "@helix/core";
import type { ModelCall } from "../claude.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE } from "../request-parts.ts";
import { structuredCall } from "../structured-call.ts";
import { answersForGoal } from "../../db/clarifications.ts";
import { getGoal } from "../../db/goals.ts";
import { readGraph, readMapEvents } from "../../db/graph.ts";
import { getSettings } from "../../db/settings.ts";
import { getSource } from "../../db/sources.ts";
import { firstMessage, MESSAGES_FILE, retryMessage } from "./messages.ts";
import { checkReport } from "./report.ts";

const AGENT = "judge-map";

const { $schema: _unused, ...OUTPUT_SCHEMA } = z.toJSONSchema(JudgeReport);

// `model`: overrides the evaluation model from settings. Effort defaults to xhigh: a judge
// writes far less than an extractor, so thinking harder is affordable.
export type JudgeInput = { goalId: string; model?: ModelId; effort?: Effort };

export type JudgeDeps = {
  callModel: ModelCall;
  onProgress?: (stage: ExtractionStage, detail: string) => void;
};

export type JudgeResult = { report: JudgeReport; map: GoalMap; promptVersion: string; model: string; aiCallIds: number[] };

export async function judgeMap(db: DatabaseSync, input: JudgeInput, deps: JudgeDeps): Promise<JudgeResult> {
  const goal = getGoal(db, input.goalId);
  if (!goal) throw new Error(`No goal with id ${input.goalId}`);
  const map = goalSlice(readGraph(db), goal.id);
  if (map.view.length === 0) throw new Error("This goal has no map to judge yet.");

  // The source of the most recent extraction for this goal, if it had one.
  const lastExtract = readMapEvents(db).findLast((e) => e.op === "extract" && e.goalId === goal.id);
  const source = lastExtract?.sourceId ? getSource(db, lastExtract.sourceId) : undefined;

  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE]);
  const { value, result, aiCallIds } = await structuredCall(db, {
    agent: AGENT,
    goalId: goal.id,
    model: input.model ?? getSettings(db).models.evaluation,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: input.effort ?? "xhigh",
    firstMessage: firstMessage(goal, source, answersForGoal(db, goal.id), map),
    check: (text) => checkReport(text, map),
    retryMessage,
    callModel: deps.callModel,
    progress: deps.onProgress ?? (() => {}),
    thinkingDetail: "Claude is checking the map",
  });

  return { report: value, map, promptVersion: prompt.version, model: result.model, aiCallIds };
}
