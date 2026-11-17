// What every agent sends a model and gets back, whichever provider answers. Agents receive a
// `ModelCall` function instead of calling a provider directly, so tests can hand them a fake model
// and never spend money. call-model.ts picks the provider from the model id.
import type { Effort, ModelId } from "@helix/contracts";

// One turn of the conversation. A retry sends the model its earlier answer and the checker's
// problems, so an assistant turn can carry the provider's own form of the reply (`native`, e.g.
// Anthropic's content blocks with thinking) for that provider to send back as it was.
export type ChatMessage = { role: "user" | "assistant"; content: string; native?: unknown };

export type ModelRequest = {
  model: ModelId; // chosen per role in settings (J1): "claude-opus-5-5", "codex:gpt-6.1-sol", ...
  system: string;
  messages: ChatMessage[];
  schema: Record<string, unknown>; // the JSON schema the answer must follow
  effort: Effort;
  onThinking?: () => void; // called as thinking streams in
  onText?: (textSoFar: string) => void; // called as the answer streams in
};

export type ModelResult = {
  stopReason: string | null; // "end_turn", or "refusal" / "max_tokens" when something went wrong
  text: string; // the answer: JSON matching the schema
  native?: unknown; // the provider's own form of the reply, to send back on a retry
  model: string; // the model id that answered (a refusal fallback can differ from the one requested)
  inputTokens: number;
  outputTokens: number;
};

export type ModelCall = (request: ModelRequest) => Promise<ModelResult>;
