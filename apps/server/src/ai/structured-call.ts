// One structured answer from a model, checked, with one retry (E6) and every call logged (E7).
// Shared by every agent that returns JSON.
//   1. Ask the model, streaming progress.
//   2. Stop at once on a refusal or a cut-off answer: retrying won't help.
//   3. Check the answer. If it breaks a rule, show the model its answer and the problems, and ask again.
import type { DatabaseSync } from "node:sqlite";
import type { Effort, ExtractionStage, ModelId } from "@helix/contracts";
import type { ModelCall, ModelRequest, ModelResult } from "./model-call.ts";
import { costUsd } from "./pricing.ts";
import type { Prompt } from "./prompts.ts";
import { logAiCall, type AiCallRecord } from "../db/ai-calls.ts";

export const MAX_ATTEMPTS = 2;

export type Check<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export type StructuredCall<T> = {
  agent: string; // "clarify-map", "extract-map", "grader", ...
  goalId?: string; // missing when an eval grades a labeled answer outside any goal
  model: ModelId;
  prompt: Prompt;
  schema: Record<string, unknown>;
  effort: Effort;
  firstMessage: string;
  check: (text: string) => Check<T>;
  retryMessage: (problems: string[]) => string;
  callModel: ModelCall;
  progress: (stage: ExtractionStage, detail: string) => void;
  thinkingDetail: string; // shown once, when the model starts thinking
  onText?: (textSoFar: string) => void; // agent-specific progress as the answer streams in
};

export type StructuredAnswer<T> = { value: T; result: ModelResult; aiCallIds: number[] };

export async function structuredCall<T>(db: DatabaseSync, call: StructuredCall<T>): Promise<StructuredAnswer<T>> {
  const { progress, prompt } = call;
  const messages: ModelRequest["messages"] = [{ role: "user", content: call.firstMessage }];
  const aiCallIds: number[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    progress(attempt === 1 ? "started" : "retrying", `${prompt.version}, effort ${call.effort}`);

    const startedAt = new Date().toISOString();
    const started = Date.now();
    const log = (status: AiCallRecord["status"], result?: ModelResult, problems?: string[]) => {
      aiCallIds.push(
        logAiCall(db, {
          agent: call.agent,
          goalId: call.goalId,
          promptVersion: prompt.version,
          modelRequested: call.model,
          model: result?.model,
          effort: call.effort,
          attempt,
          status,
          problems,
          output: result?.text,
          inputTokens: result?.inputTokens,
          outputTokens: result?.outputTokens,
          costUsd: result ? costUsd(result.model, result.inputTokens, result.outputTokens, call.model) : null,
          durationMs: Date.now() - started,
          startedAt,
        }),
      );
    };

    // ---- Ask the model ----
    let result: ModelResult;
    let thinkingShown = false;
    try {
      result = await call.callModel({
        model: call.model,
        system: prompt.text,
        messages,
        schema: call.schema,
        effort: call.effort,
        onThinking: () => {
          if (thinkingShown) return;
          thinkingShown = true;
          progress("thinking", call.thinkingDetail);
        },
        onText: call.onText,
      });
    } catch (err) {
      log("error", undefined, [err instanceof Error ? err.message : String(err)]);
      progress("failed", "the call to the model failed");
      throw err;
    }

    // ---- Guard against answers that can't be used at all ----
    if (result.stopReason === "refusal") {
      log("refused", result);
      progress("failed", "the model declined this request");
      throw new Error("The model declined this request (on Claude, even after the automatic fallback).");
    }
    if (result.stopReason === "max_tokens") {
      log("truncated", result);
      progress("failed", "the answer was cut off");
      throw new Error("The answer was cut off before it finished. Try lower effort or a shorter source.");
    }

    // ---- Check it ----
    progress("checking", "checking the answer against the rules");
    const check = call.check(result.text);

    if (!check.ok) {
      log("invalid", result, check.problems);
      if (attempt === MAX_ATTEMPTS) {
        progress("failed", `still invalid after ${MAX_ATTEMPTS} tries`);
        throw new Error(`The answer was still invalid after ${MAX_ATTEMPTS} tries:\n- ${check.problems.join("\n- ")}`);
      }
      messages.push({ role: "assistant", content: result.text, native: result.native });
      messages.push({ role: "user", content: call.retryMessage(check.problems) });
      continue;
    }

    log("ok", result);
    return { value: check.value, result, aiCallIds };
  }

  throw new Error("unreachable"); // the loop always returns or throws
}
