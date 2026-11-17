// Gemini through Google's own API (generateContent, streamed). Structured output: JSON mode with
// the schema as `responseJsonSchema`. Effort becomes the model's thinking level.
import { modelIdFor, parseModelId } from "@helix/contracts";
import type { ModelCall, ModelRequest } from "../model-call.ts";
import { effortFor } from "./effort.ts";
import { apiError, sseEvents } from "./sse.ts";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const REFUSALS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_SAFETY"]);

type Chunk = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
  error?: { message?: string };
};

export function geminiBody(request: ModelRequest): Record<string, unknown> {
  const effort = effortFor(request.model, request.effort);
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: request.schema,
      maxOutputTokens: 65536,
      // includeThoughts: thought summaries arrive (and are skipped), so progress can say "thinking".
      thinkingConfig: { includeThoughts: true, ...(effort ? { thinkingLevel: effort } : {}) },
    },
  };
}

export function makeGeminiCall(fetchFn: typeof fetch = fetch): ModelCall {
  return async (request) => {
    const { model } = parseModelId(request.model);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("No GEMINI_API_KEY found. Add it in Settings (Mac app) or apps/server/.env.");

    const response = await fetchFn(`${BASE_URL}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(geminiBody(request)),
    });
    if (!response.ok || !response.body) throw await apiError("The Gemini API", response);

    let text = "";
    let finishReason = "";
    let blocked = false;
    let usage: Chunk["usageMetadata"] = {};
    let answeredBy = model;
    for await (const data of sseEvents(response.body)) {
      const chunk = data as Chunk;
      if (chunk.error) throw new Error(`The Gemini API failed: ${chunk.error.message ?? "unknown error"}`);
      if (chunk.promptFeedback?.blockReason) blocked = true;
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
      if (chunk.modelVersion) answeredBy = chunk.modelVersion;
      const candidate = chunk.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts ?? []) {
        if (part.thought) request.onThinking?.();
        else if (part.text) {
          text += part.text;
          request.onText?.(text);
        }
      }
    }

    return {
      stopReason: blocked || REFUSALS.has(finishReason) ? "refusal" : finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn",
      text,
      model: modelIdFor("google", answeredBy),
      inputTokens: usage.promptTokenCount ?? 0,
      // Thinking is billed as output.
      outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
    };
  };
}

export const callGemini: ModelCall = makeGeminiCall();
