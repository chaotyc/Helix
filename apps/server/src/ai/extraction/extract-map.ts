// Syllabus (or nothing) → a course map in the global graph.
//   1. Build the request: the versioned prompt, the goal, the source, the existing concepts.
//   2. Ask Claude, streaming progress.
//   3. Check the answer. If it breaks a rule, show Claude the problems and ask once more (E6).
//   4. Save it as one `extract` entry in the map diary (D2). Log every call (E7).
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { ExtractionProposal, type Effort, type ExtractionStage, type GoalMap } from "@helix/contracts";
import { goalSlice, replayGraph } from "@helix/core";
import { DEFAULT_MODEL, type ModelCall, type ModelRequest, type ModelResult } from "../claude.ts";
import { costUsd } from "../pricing.ts";
import { loadPrompt } from "../prompts.ts";
import { logAiCall, type AiCallRecord } from "../../db/ai-calls.ts";
import { getGoal } from "../../db/goals.ts";
import { readGraph, readMapEvents, recordMapChange } from "../../db/graph.ts";
import { createSource } from "../../db/sources.ts";
import { checkProposal } from "./proposal.ts";
import { firstMessage, retryMessage } from "./messages.ts";

const AGENT = "extract-map";
const MAX_ATTEMPTS = 2;

// Sent to the API as the required output format. Structured outputs need
// `additionalProperties: false` on every object, which z.strictObject provides.
const { $schema: _unused, ...OUTPUT_SCHEMA } = z.toJSONSchema(ExtractionProposal);

export type ExtractInput = { goalId: string; sourceText?: string; effort?: Effort };

export type ExtractDeps = {
  callModel: ModelCall;
  onProgress?: (stage: ExtractionStage, detail: string) => void;
};

export async function extractMap(db: DatabaseSync, input: ExtractInput, deps: ExtractDeps): Promise<GoalMap> {
  const goal = getGoal(db, input.goalId);
  if (!goal) throw new Error(`No goal with id ${input.goalId}`);

  const progress = deps.onProgress ?? (() => {});
  const prompt = loadPrompt(AGENT);
  const effort = input.effort ?? "high";
  const sourceId = input.sourceText?.trim() ? createSource(db, goal.id, input.sourceText) : undefined;
  const graph = replayGraph(readMapEvents(db)); // the diary's graph: what the proposal is checked against

  const messages: ModelRequest["messages"] = [
    { role: "user", content: firstMessage(goal, input.sourceText, graph.concepts) },
  ];
  const aiCallIds: number[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    progress(attempt === 1 ? "started" : "retrying", `${prompt.version}, effort ${effort}`);

    const startedAt = new Date().toISOString();
    const started = Date.now();
    const log = (status: AiCallRecord["status"], result?: ModelResult, problems?: string[]) => {
      const id = logAiCall(db, {
        agent: AGENT,
        goalId: goal.id,
        promptVersion: prompt.version,
        modelRequested: DEFAULT_MODEL,
        model: result?.model,
        effort,
        attempt,
        status,
        problems,
        output: result?.text,
        inputTokens: result?.inputTokens,
        outputTokens: result?.outputTokens,
        costUsd: result ? costUsd(result.model, result.inputTokens, result.outputTokens) : null,
        durationMs: Date.now() - started,
        startedAt,
      });
      aiCallIds.push(id);
    };

    // ---- Ask Claude ----
    let result: ModelResult;
    let thinkingShown = false;
    let conceptsShown = 0;
    try {
      result = await deps.callModel({
        system: prompt.text,
        messages,
        schema: OUTPUT_SCHEMA,
        effort,
        onThinking: () => {
          if (thinkingShown) return;
          thinkingShown = true;
          progress("thinking", "Claude is working out the map");
        },
        onText: (textSoFar) => {
          // A cheap running count: each finished concept has a "targetDepth" field.
          const count = textSoFar.split('"targetDepth"').length - 1;
          if (count > conceptsShown) {
            conceptsShown = count;
            progress("writing", `${count} concepts so far`);
          }
        },
      });
    } catch (err) {
      log("error", undefined, [err instanceof Error ? err.message : String(err)]);
      progress("failed", "the call to Claude failed");
      throw err;
    }

    // ---- Guard against answers that can't be used at all ----
    if (result.stopReason === "refusal") {
      log("refused", result);
      progress("failed", "Claude declined this request");
      throw new Error("Claude declined to build this map (even after the automatic fallback).");
    }
    if (result.stopReason === "max_tokens") {
      log("truncated", result);
      progress("failed", "the answer was cut off");
      throw new Error("Claude's answer was cut off before it finished. Try lower effort or a shorter source.");
    }

    // ---- Check it ----
    progress("checking", "checking the map against the rules");
    const check = checkProposal(graph, goal.id, result.text);

    if (!check.ok) {
      log("invalid", result, check.problems);
      if (attempt === MAX_ATTEMPTS) {
        progress("failed", `still invalid after ${MAX_ATTEMPTS} tries`);
        throw new Error(`The map was still invalid after ${MAX_ATTEMPTS} tries:\n- ${check.problems.join("\n- ")}`);
      }
      messages.push({ role: "assistant", content: result.content });
      messages.push({ role: "user", content: retryMessage(check.problems) });
      continue;
    }

    // ---- Save it ----
    log("ok", result);
    const command = { ...check.command, raw: { proposal: check.proposal, effort, aiCallIds } };
    recordMapChange(db, command, {
      actor: "extractor",
      sourceId,
      promptVersion: prompt.version,
      model: result.model,
    });

    const map = goalSlice(readGraph(db), goal.id);
    progress("saved", `${map.concepts.length} concepts, ${map.edges.length} arrows`);
    return map;
  }

  throw new Error("unreachable"); // the loop always returns or throws
}
