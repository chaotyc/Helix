// GPT on your ChatGPT plan, through the Codex CLI:
//   codex exec --json --ephemeral --ignore-user-config -s read-only --output-schema <file> -
// Codex has no system-prompt flag, so the agent's instructions lead the prompt (stdin). It adds
// its own agent instructions (about 17K tokens per call, counted against the plan, not billed).
// The schema is enforced. --ignore-user-config skips your Codex config (MCP servers, plugins);
// the ChatGPT login still comes from ~/.codex.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { modelIdFor, parseModelId } from "@helix/contracts";
import type { ModelCall, ModelResult } from "../../model-call.ts";
import { effortFor } from "../effort.ts";
import { QUIET_LIMITS, timeoutMessage } from "./deadline.ts";
import { oneShotPrompt } from "./prompt.ts";
import { failureDetail, requireCommand, runTool, toolEnv, withTempDir } from "./tools.ts";

type CodexEvent = {
  type?: string;
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
  message?: string;
  error?: { message?: string };
};

export const callCodex: ModelCall = async (request) => {
  const command = requireCommand("codex", "Codex");
  const { model } = parseModelId(request.model);
  const effort = effortFor(request.model, request.effort);
  const result = await withTempDir(async (dir) => {
    const work = join(dir, "work");
    const schemaFile = join(dir, "schema.json");
    await writeFile(schemaFile, JSON.stringify(request.schema));
    await mkdir(work);
    return runTool({
      command,
      args: [
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--ignore-rules",
        "-s", "read-only",
        "-C", work,
        "-m", model,
        ...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : []),
        "--output-schema", schemaFile,
        "-",
      ],
      cwd: work,
      env: toolEnv(command),
      stdin: oneShotPrompt(request.system, request.messages),
      timeoutMs: QUIET_LIMITS.totalMs,
      idleTimeoutMs: QUIET_LIMITS.idleMs,
    });
  });
  if (result.timedOutBy) throw new Error(timeoutMessage("Codex", result.timedOutBy, QUIET_LIMITS));
  const parsed = parseCodexEvents(result.stdout, model);
  if (!parsed) throw new Error(`Codex failed: ${failureDetail(result)}`);
  request.onText?.(parsed.text);
  return parsed;
};

// Codex prints one JSON event per line; the answer is the last agent message, the token counts
// come with turn.completed. Null when no answer came.
export function parseCodexEvents(stdout: string, model: string): ModelResult | null {
  let text: string | null = null;
  let usage: CodexEvent["usage"] = {};
  for (const line of stdout.split("\n")) {
    let event: CodexEvent;
    try {
      event = JSON.parse(line) as CodexEvent;
    } catch {
      continue;
    }
    if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text ?? "";
    else if (event.type === "turn.completed") usage = event.usage ?? {};
    else if (event.type === "turn.failed" || event.type === "error") {
      throw new Error(`Codex failed: ${event.error?.message ?? event.message ?? "unknown error"}`);
    }
  }
  if (text === null) return null;
  return {
    stopReason: "end_turn",
    text,
    model: modelIdFor("codex", model),
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}
