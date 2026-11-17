// Each subscription adapter against a fake of its tool: small scripts named codex, claude, agy, and
// grok, put first on PATH. They record the arguments, stdin, and environment they got, and answer
// like the real tool (test-fixtures.ts; Grok speaks ACP). Muse goes through Meta's SDK and its own
// protocol, so it has no fake here.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ModelRequest } from "../../model-call.ts";
import { callAntigravity } from "./antigravity.ts";
import { callClaudeCode } from "./claude-code.ts";
import { callCodex } from "./codex.ts";
import { callGrokCli } from "./grok.ts";
import { AGY_OUTPUT, CLAUDE_OUTPUT, CODEX_OUTPUT } from "./test-fixtures.ts";

let root: string;
let logs: string;
const saved = { ...process.env };

// A shell script that records what it got, then prints its fixture.
function fakeTool(bin: string, name: string, output: string): void {
  writeFileSync(join(logs, `${name}.out`), output);
  const script = [
    "#!/bin/sh",
    `printf '%s\\n' "$@" > "${join(logs, `${name}.args`)}"`,
    `cat > "${join(logs, `${name}.stdin`)}"`,
    `env | grep '_API_KEY=' > "${join(logs, `${name}.env`)}"`,
    `cat "${join(logs, `${name}.out`)}"`,
  ].join("\n");
  writeFileSync(join(bin, name), script);
  chmodSync(join(bin, name), 0o755);
}

// A fake Grok agent speaking ACP. It asks for a permission before answering, and answers only
// once Helix has refused it, so the test can see the refusal.
const GROK_AGENT = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const log = process.env.FAKE_LOG_DIR + "/grok.jsonl";
fs.writeFileSync(process.env.FAKE_LOG_DIR + "/grok.args", process.argv.slice(2).join("\n"));
const write = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const update = (u) => write({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update: u } });
let promptId = null;
require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {
  fs.appendFileSync(log, line + "\n");
  const msg = JSON.parse(line);
  if (msg.id === 900 && !msg.method) {
    update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } });
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Sure:\n` + "```" + String.raw`json\n{\"ok\":" } });
    update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "true}\n` + "```" + String.raw`" } });
    write({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn", usage: { inputTokens: 50, outputTokens: 9 } } });
    return;
  }
  const reply = (result) => write({ jsonrpc: "2.0", id: msg.id, result });
  if (msg.method === "initialize") reply({ protocolVersion: 1, authMethods: [{ id: "cached_token" }, { id: "xai.api_key" }] });
  else if (msg.method === "authenticate") reply({});
  else if (msg.method === "session/new")
    reply({
      sessionId: "s1",
      models: {
        currentModelId: "grok-4.6",
        availableModels: [
          { modelId: "grok-4.6", _meta: { reasoningEfforts: [{ value: "low" }, { value: "high" }, { value: "xhigh" }] } },
          { modelId: "grok-4.6-fast", _meta: { reasoningEfforts: [{ value: "low" }, { value: "high" }] } },
        ],
      },
    });
  else if (msg.method === "session/set_model") reply({});
  else if (msg.method === "session/prompt") {
    promptId = msg.id;
    write({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: { sessionId: "s1", options: [] } });
  }
});
`;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "helix-fake-tools-"));
  const bin = join(root, "bin");
  logs = join(root, "logs");
  mkdirSync(bin);
  mkdirSync(logs);
  fakeTool(bin, "codex", CODEX_OUTPUT);
  fakeTool(bin, "claude", CLAUDE_OUTPUT);
  fakeTool(bin, "agy", AGY_OUTPUT);
  writeFileSync(join(bin, "grok"), GROK_AGENT);
  chmodSync(join(bin, "grok"), 0o755);
  process.env.PATH = `${bin}:${process.env.PATH}`;
  process.env.FAKE_LOG_DIR = logs;
  process.env.ANTHROPIC_API_KEY = "sk-ant-should-not-reach-the-tool";
  process.env.OPENAI_API_KEY = "sk-should-not-reach-the-tool";
});

afterAll(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

const read = (file: string) => readFileSync(join(logs, file), "utf8");
const args = (tool: string) => read(`${tool}.args`).trimEnd().split("\n");

function request(model: string, effort: ModelRequest["effort"] = "medium"): ModelRequest {
  return {
    model,
    system: "You check things.",
    messages: [{ role: "user", content: "Check this." }],
    schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    effort,
  };
}

describe("Codex", () => {
  it("runs exec read-only with the schema file, the model, and the effort; prompt on stdin", async () => {
    let thinking = false;
    const activities: string[] = [];
    const result = await callCodex({ ...request("codex:gpt-6-luna", "high"), onThinking: () => (thinking = true), onActivity: (a) => activities.push(a) });
    expect(result).toMatchObject({ text: '{"answer":"hi","n":3}', model: "codex:gpt-6-luna", inputTokens: 16872, outputTokens: 19 });
    const a = args("codex");
    expect(a.slice(0, 2)).toEqual(["exec", "--json"]);
    expect(a).toContain("--ignore-user-config");
    expect(a.slice(a.indexOf("-s"), a.indexOf("-s") + 2)).toEqual(["-s", "read-only"]);
    expect(a.slice(a.indexOf("-m"), a.indexOf("-m") + 2)).toEqual(["-m", "gpt-6-luna"]);
    expect(a).toContain('model_reasoning_effort="high"');
    expect(a).toContain('model_reasoning_summary="auto"'); // the summaries are its only progress
    expect(thinking).toBe(true);
    expect(activities).toEqual(["Checking primes below 250"]);
    expect(a[a.indexOf("--output-schema") + 1]).toMatch(/schema\.json$/);
    expect(a.at(-1)).toBe("-");
    expect(read("codex.stdin")).toMatch(/^<instructions>\nYou check things\.\n<\/instructions>\n\nCheck this\./);
    expect(read("codex.env")).toBe(""); // no API keys: the tool uses your ChatGPT login
  });
});

describe("Claude Code", () => {
  it("replaces Claude Code's prompt with the agent's, gives it no tools, and enforces the schema", async () => {
    const streamed: string[] = [];
    const result = await callClaudeCode({ ...request("claude-code:claude-opus-5-5", "xhigh"), onText: (t) => streamed.push(t) });
    expect(result).toMatchObject({ text: '{"answer":"hi","n":3}', model: "claude-code:claude-opus-5-5" });
    expect(streamed).toEqual(['{"answer": "h', '{"answer": "hi", "n', '{"answer": "hi", "n": 3}']);
    const a = args("claude");
    expect(a[0]).toBe("-p");
    expect(a[a.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(a).toContain("--verbose");
    expect(a).toContain("--include-partial-messages");
    expect(a[a.indexOf("--system-prompt") + 1]).toBe("You check things.");
    expect(a[a.indexOf("--tools") + 1]).toBe("");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-opus-5-5");
    expect(a[a.indexOf("--effort") + 1]).toBe("xhigh");
    expect(JSON.parse(a[a.indexOf("--json-schema") + 1]!)).toMatchObject({ required: ["ok"] });
    expect(a).toContain("--no-session-persistence");
    expect(read("claude.stdin")).toMatch(/^Check this\./); // the system prompt went by flag, not stdin
    expect(read("claude.env")).toBe(""); // ANTHROPIC_API_KEY would win over the Claude plan
  });
});

describe("Antigravity", () => {
  it("sends the prompt as one stream-json line and picks the model variant for the effort", async () => {
    const streamed: string[] = [];
    const result = await callAntigravity({ ...request("antigravity:gemini-4-argon", "max"), onText: (t) => streamed.push(t) });
    expect(result).toMatchObject({ text: '{"answer":"hi","n":6}', model: "antigravity:gemini-4-argon", inputTokens: 9665 });
    const a = args("agy");
    expect(a[0]).toBe("--print=");
    expect(a[a.indexOf("--model") + 1]).toBe("gemini-4-argon-high"); // Argon stops at high
    expect(a[a.indexOf("--input-format") + 1]).toBe("stream-json");
    const line = JSON.parse(read("agy.stdin")) as { event: string; message: { role: string; content: string } };
    expect(line.event).toBe("user");
    expect(line.message.content).toContain("Check this.");
    expect(streamed).toEqual(['{"answer":"hi","n":6}\n']);
  });
});

describe("Grok CLI over ACP", () => {
  it("signs in with the saved login, sets model and effort, refuses permissions, and cuts out the JSON", async () => {
    let thought = false;
    const result = await callGrokCli({ ...request("grok:grok-4.6-fast", "medium"), onThinking: () => (thought = true) });
    expect(result).toEqual({ stopReason: "end_turn", text: '{"ok":true}', model: "grok:grok-4.6-fast", inputTokens: 50, outputTokens: 9 });
    expect(thought).toBe(true);
    expect(read("grok.args").split("\n")).toEqual(["--no-auto-update", "--permission-mode", "default", "agent", "stdio"]);

    const sent = read("grok.jsonl").trimEnd().split("\n").map((l) => JSON.parse(l) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown });
    expect(sent.map((m) => m.method ?? "reply")).toEqual(["initialize", "authenticate", "session/new", "session/set_model", "session/prompt", "reply"]);
    expect(sent[1]!.params).toEqual({ methodId: "cached_token", _meta: { headless: true } });
    // Medium isn't offered on grok-4.6-fast: the step down is low.
    expect(sent[3]!.params).toEqual({ sessionId: "s1", modelId: "grok-4.6-fast", _meta: { reasoningEffort: "low" } });
    expect(String((sent[4]!.params!.prompt as { text: string }[])[0]!.text)).toContain("matches this JSON schema");
    expect(sent[5]).toEqual({ jsonrpc: "2.0", id: 900, result: { outcome: { outcome: "cancelled" } } });
  });
});
