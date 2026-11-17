// Claude through the Anthropic API, with structured outputs and streaming (long answers would
// otherwise risk timeouts). The key comes from ANTHROPIC_API_KEY (apps/server/.env, or the Mac app).
import Anthropic from "@anthropic-ai/sdk";
import { MODELS } from "@helix/contracts";
import type { ModelCall } from "../model-call.ts";

let client: Anthropic | null = null;

export const callAnthropic: ModelCall = async (request) => {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const stream = client.beta.messages.stream({
    model: request.model,
    max_tokens: 64000,
    // If a safety filter declines, retry on another model automatically; `model` below says which
    // answered. Only some models offer this; on the others a refusal simply comes back.
    ...(MODELS[request.model]?.refusalFallback
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: request.effort, format: { type: "json_schema", schema: request.schema } },
    system: request.system,
    messages: request.messages.map((m) => ({
      role: m.role,
      // A retry sends Claude's earlier reply back whole (thinking included) when we have it.
      content: m.role === "assistant" && m.native ? (m.native as Anthropic.Beta.BetaContentBlockParam[]) : m.content,
    })),
  });

  let textSoFar = "";
  stream.on("thinking", () => request.onThinking?.());
  stream.on("text", (delta) => {
    textSoFar += delta;
    request.onText?.(textSoFar);
  });

  const message = await stream.finalMessage();
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");

  return {
    stopReason: message.stop_reason,
    text,
    native: message.content,
    model: message.model, // a bare Claude id: the Anthropic API's model ids have no prefix
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
};
