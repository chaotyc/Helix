// The OpenAI-style and Gemini adapters against a fake fetch that streams server-sent events.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModelRequest } from "../model-call.ts";
import { makeGeminiCall } from "./gemini.ts";
import { makeResponsesCall } from "./openai-responses.ts";

const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };

function request(model: string, effort: ModelRequest["effort"] = "high"): ModelRequest {
  return {
    model,
    system: "You check things.",
    messages: [
      { role: "user", content: "Check this." },
      { role: "assistant", content: '{"ok":"yes"}', native: [{ type: "text" }] },
      { role: "user", content: "ok must be a boolean." },
    ],
    schema: SCHEMA,
    effort,
  };
}

// A fetch that records what it was sent and streams `events` back, one SSE event each.
function fakeFetch(events: unknown[], status = 200) {
  const sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    if (status !== 200) return new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status });
    const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    // Split mid-event, as a network would, to check the parser joins the pieces.
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 37));
        controller.enqueue(bytes.slice(37));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchFn, sent };
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.XAI_API_KEY = "xai-test";
  process.env.META_API_KEY = "LLM_test";
  process.env.GEMINI_API_KEY = "AIza-test";
});
afterEach(() => {
  process.env = { ...saved };
});

describe("Responses API (OpenAI, xAI, Meta)", () => {
  const completed = (extra: Record<string, unknown> = {}) => ({
    type: "response.completed",
    response: { model: "gpt-6.1-sol-2026-09-30", status: "completed", usage: { input_tokens: 120, output_tokens: 30 }, ...extra },
  });

  it("sends the schema strictly, the turns, and the effort; streams the answer", async () => {
    const { fetchFn, sent } = fakeFetch([
      { type: "response.reasoning_summary_text.delta", delta: "…" },
      { type: "response.output_text.delta", delta: '{"ok":' },
      { type: "response.output_text.delta", delta: "true}" },
      completed(),
    ]);
    const streamed: string[] = [];
    let thought = false;
    const result = await makeResponsesCall(fetchFn)({
      ...request("openai:gpt-6.1-sol", "max"),
      onText: (t) => streamed.push(t),
      onThinking: () => (thought = true),
    });

    expect(sent[0]!.url).toBe("https://api.openai.com/v1/responses");
    expect(sent[0]!.headers.authorization).toBe("Bearer sk-test");
    expect(sent[0]!.body).toMatchObject({
      model: "gpt-6.1-sol",
      instructions: "You check things.",
      input: [
        { role: "user", content: "Check this." },
        { role: "assistant", content: '{"ok":"yes"}' },
        { role: "user", content: "ok must be a boolean." },
      ],
      text: { format: { type: "json_schema", name: "answer", schema: SCHEMA, strict: true } },
      reasoning: { effort: "max" },
      store: false,
      stream: true,
    });
    expect(thought).toBe(true);
    expect(streamed).toEqual(['{"ok":', '{"ok":true}']);
    expect(result).toEqual({ stopReason: "end_turn", text: '{"ok":true}', model: "openai:gpt-6.1-sol-2026-09-30", inputTokens: 120, outputTokens: 30 });
  });

  it("reaches xAI and Meta at their own addresses, stepping effort down to what the model has", async () => {
    const xai = fakeFetch([completed({ model: "grok-4.6" })]);
    await makeResponsesCall(xai.fetchFn)(request("xai:grok-4.6", "max"));
    expect(xai.sent[0]!.url).toBe("https://api.x.ai/v1/responses");
    expect(xai.sent[0]!.body.reasoning).toEqual({ effort: "xhigh" });

    const meta = fakeFetch([completed({ model: "muse-spark-1.3" })]);
    await makeResponsesCall(meta.fetchFn)(request("meta:muse-spark-1.3"));
    expect(meta.sent[0]!.url).toBe("https://api.meta.ai/v1/responses");
    expect(meta.sent[0]!.headers.authorization).toBe("Bearer LLM_test");
    expect(meta.sent[0]!.body).not.toHaveProperty("store"); // not documented for Meta
  });

  it("reads a cut-off answer, a refusal, and an HTTP error", async () => {
    const cut = fakeFetch([{ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }]);
    expect((await makeResponsesCall(cut.fetchFn)(request("openai:gpt-6-luna"))).stopReason).toBe("max_tokens");

    const refused = fakeFetch([{ type: "response.refusal.delta", delta: "I can't" }, completed()]);
    expect((await makeResponsesCall(refused.fetchFn)(request("openai:gpt-6-luna"))).stopReason).toBe("refusal");

    const denied = fakeFetch([], 401);
    await expect(makeResponsesCall(denied.fetchFn)(request("openai:gpt-6-luna"))).rejects.toThrow("The OpenAI API answered 401: Incorrect API key provided");
  });

  it("says which key is missing", async () => {
    delete process.env.XAI_API_KEY;
    await expect(makeResponsesCall(fakeFetch([]).fetchFn)(request("xai:grok-4.6"))).rejects.toThrow("No XAI_API_KEY found");
  });
});

describe("Gemini API", () => {
  it("sends JSON mode with the schema and a thinking level; skips thought parts", async () => {
    const { fetchFn, sent } = fakeFetch([
      { candidates: [{ content: { parts: [{ text: "planning…", thought: true }] } }] },
      { candidates: [{ content: { parts: [{ text: '{"ok":' }] } }] },
      {
        candidates: [{ content: { parts: [{ text: "true}" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 6, thoughtsTokenCount: 40 },
        modelVersion: "gemini-4-argon",
      },
    ]);
    let thought = false;
    const result = await makeGeminiCall(fetchFn)({ ...request("google:gemini-4-argon", "max"), onThinking: () => (thought = true) });

    expect(sent[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse");
    expect(sent[0]!.headers["x-goog-api-key"]).toBe("AIza-test");
    expect(sent[0]!.body).toMatchObject({
      systemInstruction: { parts: [{ text: "You check things." }] },
      contents: [
        { role: "user", parts: [{ text: "Check this." }] },
        { role: "model", parts: [{ text: '{"ok":"yes"}' }] },
        { role: "user", parts: [{ text: "ok must be a boolean." }] },
      ],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: SCHEMA, thinkingConfig: { thinkingLevel: "high" } },
    });
    expect(thought).toBe(true);
    expect(result).toEqual({ stopReason: "end_turn", text: '{"ok":true}', model: "google:gemini-4-argon", inputTokens: 80, outputTokens: 46 });
  });

  it("reads a cut-off answer and a blocked prompt", async () => {
    const cut = fakeFetch([{ candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }] }]);
    expect((await makeGeminiCall(cut.fetchFn)(request("google:gemini-3.8-flash"))).stopReason).toBe("max_tokens");
    const blocked = fakeFetch([{ promptFeedback: { blockReason: "SAFETY" } }]);
    expect((await makeGeminiCall(blocked.fetchFn)(request("google:gemini-3.8-flash"))).stopReason).toBe("refusal");
  });
});
