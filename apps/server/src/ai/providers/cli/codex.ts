// GPT on your ChatGPT plan, through the Codex CLI:
//   codex exec --json --ephemeral --ignore-user-config -s read-only --output-schema <file> -
// Codex has no system-prompt flag, so the agent's instructions lead the prompt (stdin). It adds
// its own agent instructions (about 17K tokens per call, counted against the plan, not billed).
// The schema is enforced. --ignore-user-config skips your Codex config (MCP servers, plugins);
// the ChatGPT login still comes from ~/.codex.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { modelIdFor, parseModelId } from "@helix/contracts";
import type { ModelCall, ModelResult } from "../../model-call.ts";
import { effortFor } from "../effort.ts";
import { QUIET_LIMITS, timeoutMessage } from "./deadline.ts";
import { oneShotPrompt } from "./prompt.ts";
import { failureDetail, requireCommand, runTool, toolEnv, withTempDir } from "./tools.ts";

// One line of `codex exec --json`: only the fields Helix reads. Other event and item types
// (command runs, file changes, item.started, ...) pass the check and are ignored; a field in an
// unexpected shape is dropped rather than losing the whole event.
const CodexEvent = z.object({
  type: z.string(),
  item: z.object({ type: z.string(), text: z.string().optional() }).optional().catch(undefined),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional().catch(undefined),
  message: z.string().optional().catch(undefined),
  error: z.object({ message: z.string().optional() }).optional().catch(undefined),
});
type CodexEvent = z.infer<typeof CodexEvent>;

// A line as an event, or null when it isn't one (a log line, an unexpected shape).
export function readCodexLine(line: string): CodexEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const event = CodexEvent.safeParse(json);
  return event.success ? event.data : null;
}

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
// come with turn.completed. A failed turn throws; so does an error event when no answer followed
// (Codex also reports errors it recovers from, like a dropped connection it retries). Null when
// no answer came and nothing said why.
export function parseCodexEvents(stdout: string, model: string): ModelResult | null {
  let text: string | null = null;
  let usage: CodexEvent["usage"] = {};
  let lastError: string | null = null;
  for (const line of stdout.split("\n")) {
    const event = readCodexLine(line);
    if (!event) continue;
    if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text ?? "";
    else if (event.type === "turn.completed") usage = event.usage ?? {};
    else if (event.type === "turn.failed") throw new Error(`Codex failed: ${event.error?.message ?? event.message ?? "unknown error"}`);
    else if (event.type === "error") lastError = event.error?.message ?? event.message ?? "unknown error";
  }
  if (text === null && lastError) throw new Error(`Codex failed: ${lastError}`);
  if (text === null) return null;
  return {
    stopReason: "end_turn",
    text,
    model: modelIdFor("codex", model),
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}
