// Claude on your Claude plan, through Claude Code in print mode:
//   claude -p --output-format json --json-schema <schema> --system-prompt <the agent's prompt>
//          --tools "" ...   (prompt on stdin)
// --system-prompt replaces Claude Code's own instructions, and --tools "" gives it no tools, so
// the model sees what the API would send (about 1.5K tokens of overhead). The schema is enforced.
import { modelIdFor, parseModelId } from "@helix/contracts";
import type { ModelCall, ModelResult } from "../../model-call.ts";
import { effortFor } from "../effort.ts";
import { oneShotPrompt } from "./prompt.ts";
import { TOOL_TIMEOUT_MS, failureDetail, requireCommand, runTool, toolEnv, withTempDir } from "./tools.ts";

type ClaudeResult = {
  type?: string;
  subtype?: string; // "success", or an error kind
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  modelUsage?: Record<string, unknown>;
};

export const callClaudeCode: ModelCall = async (request) => {
  const command = requireCommand("claude", "Claude Code");
  const { model } = parseModelId(request.model);
  const effort = effortFor(request.model, request.effort);
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(request.schema),
    "--model", model,
    ...(effort ? ["--effort", effort] : []),
    "--system-prompt", request.system,
    "--tools", "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-session-persistence",
  ];
  const result = await withTempDir((cwd) =>
    runTool({ command, args, cwd, env: toolEnv(command), stdin: oneShotPrompt(null, request.messages), timeoutMs: TOOL_TIMEOUT_MS }),
  );
  if (result.timedOut) throw new Error("Claude Code took too long and was stopped.");
  const parsed = parseClaudeOutput(result.stdout, model);
  if (!parsed) throw new Error(`Claude Code failed: ${failureDetail(result)}`);
  request.onText?.(parsed.text);
  return parsed;
};

// The one JSON object Claude Code prints. Null when there isn't one (it failed before answering).
export function parseClaudeOutput(stdout: string, requested: string): ModelResult | null {
  let out: ClaudeResult;
  try {
    out = JSON.parse(stdout.trim()) as ClaudeResult;
  } catch {
    return null;
  }
  if (out.is_error || (out.subtype && out.subtype !== "success")) {
    throw new Error(`Claude Code failed: ${out.result || out.subtype || "unknown error"}`);
  }
  const usage = out.usage ?? {};
  const answeredBy = Object.keys(out.modelUsage ?? {})[0] ?? requested;
  return {
    stopReason: out.stop_reason === "refusal" ? "refusal" : out.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
    text: out.structured_output !== undefined ? JSON.stringify(out.structured_output) : (out.result ?? ""),
    model: modelIdFor("claude-code", answeredBy),
    inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
  };
}
