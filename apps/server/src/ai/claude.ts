// The one place Helix calls Claude. Agents receive a `ModelCall` function instead of calling
// the SDK directly, so tests can hand them a fake model and never spend money.
import Anthropic from "@anthropic-ai/sdk";
import type { Effort } from "@helix/contracts";

export const DEFAULT_MODEL = "claude-opus-5-5";

export type ModelRequest = {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: Record<string, unknown>; // the JSON schema the answer must follow
  effort: Effort;
  onThinking?: () => void; // called as thinking streams in
  onText?: (textSoFar: string) => void; // called as the answer streams in
};

export type ModelResult = {
  stopReason: string | null; // "end_turn", or "refusal" / "max_tokens" when something went wrong
  text: string; // the answer: JSON matching the schema
  content: Anthropic.Beta.BetaMessageContentParam; // the whole reply, to send back on a retry
  model: string; // the model that answered (a refusal fallback can differ from the one requested)
  inputTokens: number;
  outputTokens: number;
};

export type ModelCall = (request: ModelRequest) => Promise<ModelResult>;

let client: Anthropic | null = null;

// Calls Claude with structured outputs, streaming (long answers would otherwise risk timeouts).
export const callClaude: ModelCall = async (request) => {
  client ??= new Anthropic(); // reads ANTHROPIC_API_KEY from the environment (apps/server/.env)

  const stream = client.beta.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 64000,
    // If a safety filter declines, retry on another model automatically; `model` below says which answered.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: request.effort, format: { type: "json_schema", schema: request.schema } },
    system: request.system,
    messages: request.messages,
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
    content: message.content,
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
};
