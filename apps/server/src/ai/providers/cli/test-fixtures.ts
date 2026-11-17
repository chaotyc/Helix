// What the subscription tools really print, for tests. Captured from the tools themselves
// (Codex CLI 0.169.0, Claude Code 2.1.325, Antigravity CLI 1.5.9) answering one small schema;
// trimmed to the fields Helix reads plus a few it ignores.
export const CODEX_OUTPUT = [
  '{"type":"thread.started","thread_id":"01a1e707-f2b0-71c0-a1cb-0ffb3c9ef0b2"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"answer\\":\\"hi\\",\\"n\\":3}"}}',
  '{"type":"turn.completed","usage":{"input_tokens":16872,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":19,"reasoning_output_tokens":0}}',
].join("\n");

// Claude Code with --output-format stream-json --verbose --include-partial-messages, answering
// with claude-opus-5-5 after a short think. The housekeeping Haiku shows up only in modelUsage.
const ev = (event: Record<string, unknown>) => JSON.stringify({ type: "stream_event", event, session_id: "aa51", parent_tool_use_id: null });
const json = (partial_json: string) => ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json } });
const system = (fields: Record<string, unknown>) => JSON.stringify({ type: "system", ...fields, session_id: "aa51" });
const assistant = (content: unknown[]) =>
  JSON.stringify({ type: "assistant", message: { model: "claude-opus-5-5", id: "msg_011C", role: "assistant", content }, parent_tool_use_id: null, session_id: "aa51" });
export const CLAUDE_OUTPUT = [
  system({ subtype: "init", tools: ["StructuredOutput"], model: "claude-opus-5-5", claude_code_version: "2.1.325" }),
  system({ subtype: "status", status: "requesting" }),
  ev({ type: "message_start", message: { model: "claude-opus-5-5", id: "msg_011C", role: "assistant", content: [], usage: { input_tokens: 2, output_tokens: 1 } } }),
  ev({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
  system({ subtype: "thinking_tokens", estimated_tokens: 50, estimated_tokens_delta: 50 }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "", estimated_tokens: 50 } }),
  system({ subtype: "thinking_tokens", estimated_tokens: 1237, estimated_tokens_delta: 1187 }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "CAQSrQcK" } }),
  assistant([{ type: "thinking", thinking: "", signature: "CAQSrQcK" }]),
  ev({ type: "content_block_stop", index: 0 }),
  ev({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_0174", name: "StructuredOutput", input: {} } }),
  json(""),
  json('{"answer": "h'),
  json('i", "n'),
  json('": 3}'),
  assistant([{ type: "tool_use", id: "toolu_0174", name: "StructuredOutput", input: { answer: "hi", n: 3 } }]),
  ev({ type: "content_block_stop", index: 1 }),
  JSON.stringify({ type: "user", message: { role: "user", content: [{ tool_use_id: "toolu_0174", type: "tool_result", content: "Structured output provided successfully" }] }, parent_tool_use_id: null }),
  ev({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { input_tokens: 2, cache_creation_input_tokens: 1520, output_tokens: 720 } }),
  ev({ type: "message_stop" }),
  JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType: "five_hour" } }),
  JSON.stringify({
    duration_api_ms: 8634,
    stop_reason: "tool_use",
    usage: { input_tokens: 2, cache_creation_input_tokens: 1520, cache_read_input_tokens: 0, output_tokens: 720, output_tokens_details: { thinking_tokens: 227 } },
    // Haiku first, and the requested model may be an alias: neither may name the answering model.
    modelUsage: { "claude-haiku-5-5": { inputTokens: 1192, outputTokens: 15 }, "claude-opus-5-5": { inputTokens: 2, outputTokens: 720 } },
    is_error: false,
    num_turns: 2,
    subtype: "success",
    result: '{"answer":"hi","n":3}',
    structured_output: { answer: "hi", n: 3 },
    type: "result",
  }),
].join("\n");

export const AGY_OUTPUT = [
  '{"event":"init","conversation_id":"b167","init":{"model":"gemini-3.8-flash-low","permission_mode":"request-review"}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":0,"state":"DONE","step_type":"user_input"}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"{\\"answer\\":\\"hi\\",\\"n\\":6}\\n","usage":{"input_tokens":9665,"output_tokens":18,"thinking_tokens":0}}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":2,"state":"DONE","step_type":"finish"}}',
  '{"event":"result","result":{"conversation_id":"b167","status":"SUCCESS","response":"{\\"answer\\":\\"hi\\",\\"n\\":6}\\n","num_turns":1,"structured_output":{"answer":"hi","n":6},"usage":{"input_tokens":9665,"output_tokens":18,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":9683}}}',
].join("\n");
