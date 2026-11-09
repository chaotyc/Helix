import type { DatabaseSync } from "node:sqlite";

export type AiCallStatus = "ok" | "invalid" | "refused" | "truncated" | "error";

export type AiCallRecord = {
  agent: string;
  goalId?: string;
  promptVersion: string;
  modelRequested: string;
  model?: string;
  effort?: string;
  attempt: number;
  status: AiCallStatus;
  problems?: string[];
  output?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
  durationMs: number;
  startedAt: string;
};

// Appends one call to the log and returns its id.
export function logAiCall(db: DatabaseSync, call: AiCallRecord): number {
  const result = db
    .prepare(
      `INSERT INTO ai_call (agent, goal_id, prompt_version, model_requested, model, effort, attempt,
                            status, problems, output, input_tokens, output_tokens, cost_usd,
                            duration_ms, started_at)
       VALUES ($agent, $goalId, $promptVersion, $modelRequested, $model, $effort, $attempt,
               $status, $problems, $output, $inputTokens, $outputTokens, $costUsd,
               $durationMs, $startedAt)`,
    )
    .run({
      agent: call.agent,
      goalId: call.goalId ?? null,
      promptVersion: call.promptVersion,
      modelRequested: call.modelRequested,
      model: call.model ?? null,
      effort: call.effort ?? null,
      attempt: call.attempt,
      status: call.status,
      problems: call.problems ? JSON.stringify(call.problems) : null,
      output: call.output ?? null,
      inputTokens: call.inputTokens ?? null,
      outputTokens: call.outputTokens ?? null,
      costUsd: call.costUsd ?? null,
      durationMs: call.durationMs,
      startedAt: call.startedAt,
    });
  return Number(result.lastInsertRowid);
}
