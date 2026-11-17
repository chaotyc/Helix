// Reading what Claude Code prints with `--output-format stream-json --verbose
// --include-partial-messages`: one JSON event per line.
//   - stream_event: the API's own stream. With --json-schema the answer is the input of a
//     StructuredOutput tool call, so it arrives as input_json_delta pieces; thinking arrives as
//     thinking_delta ticks (empty text: Claude Code doesn't show thinking, but it still ticks).
//   - system/thinking_tokens: a running estimate of how much it has thought, about every second.
//   - assistant: each finished message, with the model that wrote it.
//   - result: the last line: the structured output, token counts, errors.
// Other event types (other system events, user, rate_limit_event, ...) are ignored, and so is any line that
// doesn't pass its schema.
import { z } from "zod";
import { modelIdFor } from "@helix/contracts";
import type { ModelRequest, ModelResult } from "../../model-call.ts";

const SubagentId = z.string().nullable().optional(); // set on events from a subagent's turn

const StreamEvent = z.object({
  type: z.literal("stream_event"),
  parent_tool_use_id: SubagentId,
  event: z.object({
    type: z.string(),
    content_block: z.object({ type: z.string() }).optional().catch(undefined),
    delta: z.object({ type: z.string(), partial_json: z.string().optional() }).optional().catch(undefined),
  }),
});

const AssistantEvent = z.object({
  type: z.literal("assistant"),
  parent_tool_use_id: SubagentId,
  message: z.object({ model: z.string() }),
});

const ThinkingTokens = z.object({
  type: z.literal("system"),
  subtype: z.literal("thinking_tokens"),
  estimated_tokens: z.number(),
});

const ResultEvent = z.object({
  type: z.literal("result"),
  subtype: z.string().optional(), // "success", or an error kind
  is_error: z.boolean().optional(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  stop_reason: z.string().nullable().optional(),
  usage: z
    .object({
      input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
    })
    .optional()
    .catch(undefined),
  modelUsage: z.record(z.string(), z.object({ outputTokens: z.number().optional() })).optional().catch(undefined),
});

const ClaudeEvent = z.discriminatedUnion("type", [StreamEvent, AssistantEvent, ThinkingTokens, ResultEvent]);
type ClaudeEvent = z.infer<typeof ClaudeEvent>;

// A line as an event Helix reads, or null (another event type, a log line, an unexpected shape).
export function readClaudeLine(line: string): ClaudeEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const event = ClaudeEvent.safeParse(json);
  return event.success ? event.data : null;
}

// Follows the stream line by line: the answer's JSON so far goes to onText (the same text the
// API routes stream), thinking ticks to onThinking, and every thousand thinking tokens to
// onActivity. A new tool call starts the JSON over (Claude Code asks again when the structured
// output fails its schema).
export function followClaudeStream(request: Pick<ModelRequest, "onText" | "onThinking" | "onActivity">): (line: string) => void {
  let json = "";
  let inAnswer = false;
  let thousandsShown = 0;
  return (line) => {
    const event = readClaudeLine(line);
    if (event?.type === "system") {
      const thousands = Math.floor(event.estimated_tokens / 1000);
      if (thousands > thousandsShown) {
        thousandsShown = thousands;
        request.onActivity?.(`Thinking (about ${(thousands * 1000).toLocaleString("en-US")} tokens so far)`);
      }
      return;
    }
    if (event?.type !== "stream_event" || event.parent_tool_use_id) return;
    const { type, content_block, delta } = event.event;
    if (type === "content_block_start") {
      inAnswer = content_block?.type === "tool_use";
      if (inAnswer) json = "";
    } else if (type === "content_block_delta" && delta) {
      if (delta.type === "thinking_delta") request.onThinking?.();
      else if (delta.type === "input_json_delta" && inAnswer && delta.partial_json) {
        json += delta.partial_json;
        request.onText?.(json);
      }
    }
  };
}

// The whole output → the answer. Null when there's no result line (it failed before answering).
// The model is the one that wrote the last top-level assistant message. modelUsage can't say:
// it also lists the model Claude Code runs for its own housekeeping (Haiku), which once got
// logged as the answering model.
export function parseClaudeStream(stdout: string, requested: string): ModelResult | null {
  let result: z.infer<typeof ResultEvent> | undefined;
  let answeredBy: string | undefined;
  for (const line of stdout.split("\n")) {
    const event = readClaudeLine(line);
    if (event?.type === "result") result = event;
    else if (event?.type === "assistant" && !event.parent_tool_use_id && event.message.model !== "<synthetic>") {
      answeredBy = event.message.model; // "<synthetic>": a message Claude Code wrote itself (an error)
    }
  }
  if (!result) return null;
  if (result.is_error || (result.subtype && result.subtype !== "success")) {
    throw new Error(`Claude Code failed: ${result.result || result.subtype || "unknown error"}`);
  }
  const usage = result.usage ?? {};
  return {
    stopReason: result.stop_reason === "refusal" ? "refusal" : result.stop_reason === "max_tokens" ? "max_tokens" : "end_turn",
    text: result.structured_output !== undefined ? JSON.stringify(result.structured_output) : (result.result ?? ""),
    model: modelIdFor("claude-code", answeredBy ?? fromModelUsage(result.modelUsage ?? {}, requested)),
    inputTokens: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
    outputTokens: usage.output_tokens ?? 0,
  };
}

// Only when no assistant message named its model: the requested model if it's listed, else the
// one that wrote the most.
function fromModelUsage(modelUsage: Record<string, { outputTokens?: number }>, requested: string): string {
  const used = Object.entries(modelUsage);
  if (used.some(([m]) => m === requested)) return requested;
  return used.sort(([, a], [, b]) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0))[0]?.[0] ?? requested;
}
