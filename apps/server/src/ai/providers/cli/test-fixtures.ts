// What the subscription tools really print, for tests. Captured from the tools themselves
// (Codex CLI 0.169.0, Claude Code 2.1.325, Antigravity CLI 1.5.9) answering one small schema;
// trimmed to the fields Helix reads plus a few it ignores.
export const CODEX_OUTPUT = [
  '{"type":"thread.started","thread_id":"01a1e707-f2b0-71c0-a1cb-0ffb3c9ef0b2"}',
  '{"type":"turn.started"}',
  '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"answer\\":\\"hi\\",\\"n\\":3}"}}',
  '{"type":"turn.completed","usage":{"input_tokens":16872,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":19,"reasoning_output_tokens":0}}',
].join("\n");

export const CLAUDE_OUTPUT = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  stop_reason: "tool_use",
  result: '{"answer":"hi","n":3}',
  structured_output: { answer: "hi", n: 3 },
  usage: { input_tokens: 2, cache_creation_input_tokens: 1475, cache_read_input_tokens: 0, output_tokens: 74 },
  modelUsage: { "claude-haiku-5-5": { inputTokens: 1181, outputTokens: 91 } },
  num_turns: 2,
});

export const AGY_OUTPUT = [
  '{"event":"init","conversation_id":"b167","init":{"model":"gemini-3.8-flash-low","permission_mode":"request-review"}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":0,"state":"DONE","step_type":"user_input"}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"{\\"answer\\":\\"hi\\",\\"n\\":6}\\n","usage":{"input_tokens":9665,"output_tokens":18,"thinking_tokens":0}}}',
  '{"event":"step_update","step_update":{"conversation_id":"b167","step_index":2,"state":"DONE","step_type":"finish"}}',
  '{"event":"result","result":{"conversation_id":"b167","status":"SUCCESS","response":"{\\"answer\\":\\"hi\\",\\"n\\":6}\\n","num_turns":1,"structured_output":{"answer":"hi","n":6},"usage":{"input_tokens":9665,"output_tokens":18,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":9683}}}',
].join("\n");
