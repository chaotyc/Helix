// Subscription tools take one prompt, not a system prompt and a list of turns. This file writes
// that prompt. The wording here reaches the model on CLI routes only; it isn't part of an agent's
// prompt version, so the route in the logged model id ("codex:…") is what marks it.
import type { ChatMessage } from "../../model-call.ts";

const NO_TOOLS = "Answer from the text above alone. Do not use tools, read files, run commands, or ask questions.";

// The agent's instructions, then the conversation: just the message on a first try; on a retry,
// every turn, so the model sees its earlier answer and what the checker found wrong.
export function oneShotPrompt(system: string | null, messages: ChatMessage[], options: { schema?: Record<string, unknown> } = {}): string {
  const parts: string[] = [];
  if (system) parts.push(`<instructions>\n${system}\n</instructions>`);
  if (messages.length === 1) parts.push(messages[0]!.content);
  else {
    const turns = messages.map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`).join("\n\n");
    parts.push(`<conversation>\n${turns}\n</conversation>\n\nWrite the assistant's reply to the last user message.`);
  }
  parts.push(NO_TOOLS);
  if (options.schema) {
    parts.push(
      `Reply with only a JSON object that matches this JSON schema: no Markdown fences, no other text.\n${JSON.stringify(options.schema)}`,
    );
  }
  return parts.join("\n\n");
}

// The JSON object in a reply that may wrap it in fences or a sentence. Returns the text unchanged
// when there's no object, so the checker reports what came back.
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
  if (fenced) return fenced[1]!.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  return start !== -1 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}
