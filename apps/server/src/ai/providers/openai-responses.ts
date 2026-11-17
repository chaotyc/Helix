// OpenAI, xAI, and Meta through the Responses API, which all three offer at their own address
// with the same shape. Structured output: `text.format` with a strict JSON schema (every Helix
// schema meets the strict rules: all fields required, no extra properties). Streams the answer.
import { parseModelId, modelIdFor, type Connection } from "@helix/contracts";
import type { ModelCall, ModelRequest, ModelResult } from "../model-call.ts";
import { effortFor } from "./effort.ts";
import { apiError, sseEvents } from "./sse.ts";

type ResponsesApi = {
  name: string;
  baseUrl: string;
  keyEnv: string;
  extra: Record<string, unknown>; // body fields only this API is known to accept
};

const APIS: Partial<Record<Connection, ResponsesApi>> = {
  // store: false keeps OpenAI and xAI from saving the conversation on their side.
  openai: { name: "The OpenAI API", baseUrl: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY", extra: { store: false, max_output_tokens: 64000 } },
  xai: { name: "The xAI API", baseUrl: "https://api.x.ai/v1", keyEnv: "XAI_API_KEY", extra: { store: false } },
  meta: { name: "The Meta Model API", baseUrl: "https://api.meta.ai/v1", keyEnv: "META_API_KEY", extra: {} },
};

type ResponseObject = {
  model?: string;
  status?: string; // "completed" | "incomplete" | "failed"
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

type StreamEvent = { type?: string; delta?: string; response?: ResponseObject; message?: string };

export function responsesBody(request: ModelRequest, model: string, extra: Record<string, unknown>): Record<string, unknown> {
  const effort = effortFor(request.model, request.effort);
  return {
    model,
    instructions: request.system,
    input: request.messages.map((m) => ({ role: m.role, content: m.content })),
    text: { format: { type: "json_schema", name: "answer", schema: request.schema, strict: true } },
    ...(effort ? { reasoning: { effort } } : {}),
    stream: true,
    ...extra,
  };
}

export function makeResponsesCall(fetchFn: typeof fetch = fetch): ModelCall {
  return async (request) => {
    const { connection, model } = parseModelId(request.model);
    const api = APIS[connection];
    if (!api) throw new Error(`${connection} isn't a Responses API connection.`);
    const key = process.env[api.keyEnv];
    if (!key) throw new Error(`No ${api.keyEnv} found. Add it in Settings (Mac app) or apps/server/.env.`);

    const response = await fetchFn(`${api.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(responsesBody(request, model, api.extra)),
    });
    if (!response.ok || !response.body) throw await apiError(api.name, response);

    let textSoFar = "";
    let refused = false;
    let final: ResponseObject | undefined;
    for await (const data of sseEvents(response.body)) {
      const event = data as StreamEvent;
      const type = event.type ?? "";
      if (type === "response.output_text.delta" && event.delta) {
        textSoFar += event.delta;
        request.onText?.(textSoFar);
      } else if (type.startsWith("response.reasoning")) {
        request.onThinking?.();
      } else if (type === "response.refusal.delta") {
        refused = true;
      } else if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
        final = event.response;
      } else if (type === "error") {
        throw new Error(`${api.name} failed: ${event.message ?? "unknown error"}`);
      }
    }
    if (!final) throw new Error(`${api.name} ended the stream without a final response.`);
    return toResult(final, textSoFar, refused, connection, model, api.name);
  };
}

function toResult(r: ResponseObject, streamed: string, refused: boolean, connection: Connection, model: string, name: string): ModelResult {
  if (r.status === "failed") throw new Error(`${name} failed: ${r.error?.message ?? "unknown error"}`);
  const parts = (r.output ?? []).flatMap((item) => item.content ?? []);
  const text = streamed || parts.flatMap((p) => (p.type === "output_text" && p.text ? [p.text] : [])).join("");
  const reason = r.incomplete_details?.reason;
  const stopReason =
    refused || parts.some((p) => p.type === "refusal") || reason === "content_filter"
      ? "refusal"
      : r.status === "incomplete" && reason === "max_output_tokens"
        ? "max_tokens"
        : "end_turn";
  return {
    stopReason,
    text,
    model: modelIdFor(connection, r.model ?? model),
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
  };
}

export const callResponsesApi: ModelCall = makeResponsesCall();
