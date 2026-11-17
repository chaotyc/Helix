// The parsers read each tool's real output (test-fixtures.ts).
import { describe, expect, it } from "vitest";
import { geminiSafeSchema, groupAgyModels, parseAgyEvents } from "./antigravity.ts";
import { parseClaudeOutput } from "./claude-code.ts";
import { parseCodexEvents } from "./codex.ts";
import { extractJson, oneShotPrompt } from "./prompt.ts";
import { AGY_OUTPUT, CLAUDE_OUTPUT, CODEX_OUTPUT } from "./test-fixtures.ts";

const AGY_MODELS = [
  "Fetching available models...",
  "gemini-4-argon-medium\tGemini 4 Argon (Medium)",
  "gemini-4-argon-high\tGemini 4 Argon (High)",
  "gemini-4-argon-low\tGemini 4 Argon (Low)",
  "gemini-4-hydrogen-xhigh\tGemini 4 Hydrogen (XHigh)",
  "gemini-4-hydrogen-low\tGemini 4 Hydrogen (Low)",
  "gemini-pro-orchestrator-g1-pro\tOrchestrator (Argon)",
  "claude-opus-5-5-high\tClaude Opus 5.5 (High)",
].join("\n");

describe("Codex output", () => {
  it("takes the last agent message and turn.completed's tokens", () => {
    expect(parseCodexEvents(CODEX_OUTPUT, "gpt-6-luna")).toEqual({
      stopReason: "end_turn",
      text: '{"answer":"hi","n":3}',
      model: "codex:gpt-6-luna",
      inputTokens: 16872,
      outputTokens: 19,
    });
  });

  it("reports a failed turn, and no answer as null", () => {
    expect(() => parseCodexEvents('{"type":"turn.failed","error":{"message":"usage limit reached"}}', "m")).toThrow("usage limit reached");
    expect(parseCodexEvents('{"type":"thread.started"}', "m")).toBeNull();
  });
});

describe("Claude Code output", () => {
  it("takes the structured output, the model that answered, and every input token", () => {
    expect(parseClaudeOutput(CLAUDE_OUTPUT, "claude-haiku-5-5")).toEqual({
      stopReason: "end_turn",
      text: '{"answer":"hi","n":3}',
      model: "claude-code:claude-haiku-5-5",
      inputTokens: 1477,
      outputTokens: 74,
    });
  });

  it("names the requested model, not the Haiku that Claude Code runs on the side", () => {
    const out = JSON.parse(CLAUDE_OUTPUT) as Record<string, unknown>;
    out.modelUsage = { "claude-haiku-5-5": { outputTokens: 40 }, "claude-opus-5-5": { outputTokens: 900 } };
    expect(parseClaudeOutput(JSON.stringify(out), "claude-opus-5-5")?.model).toBe("claude-code:claude-opus-5-5");
    // An alias it resolved: the model that wrote the most.
    expect(parseClaudeOutput(JSON.stringify(out), "opus")?.model).toBe("claude-code:claude-opus-5-5");
  });

  it("reports an error result, and nothing printed as null", () => {
    expect(() => parseClaudeOutput(JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "Not logged in" }), "m")).toThrow("Not logged in");
    expect(parseClaudeOutput("", "m")).toBeNull();
  });
});

describe("Antigravity output", () => {
  it("takes the result line's structured output and counts thinking as output", () => {
    expect(parseAgyEvents(AGY_OUTPUT, "gemini-3.8-flash")).toEqual({
      stopReason: "end_turn",
      text: '{"answer":"hi","n":6}',
      model: "antigravity:gemini-3.8-flash",
      inputTokens: 9665,
      outputTokens: 18,
    });
  });

  it("reports an error result", () => {
    const failed = '{"event":"result","result":{"status":"ERROR","error":"stream input message is missing the \\"event\\" field"}}';
    expect(() => parseAgyEvents(failed, "m")).toThrow('missing the "event" field');
  });

  it("rewrites number enums, which Gemini's function declarations reject, and keeps the rest", () => {
    const schema = {
      type: "object",
      properties: {
        depth: { type: "number", enum: [1, 2, 3, 4, 5] },
        odd: { type: "number", enum: [1, 5], description: "Odd ones." },
        role: { type: "string", enum: ["target", "background"] },
        list: { type: "array", items: { type: "object", properties: { needsDepth: { type: "number", enum: [3, 1, 2] } } } },
      },
    };
    expect(geminiSafeSchema(schema)).toEqual({
      type: "object",
      properties: {
        depth: { type: "integer", minimum: 1, maximum: 5 },
        odd: { type: "number", description: "Odd ones. One of: 1, 5." },
        role: { type: "string", enum: ["target", "background"] },
        list: { type: "array", items: { type: "object", properties: { needsDepth: { type: "integer", minimum: 1, maximum: 3 } } } },
      },
    });
  });

  it("groups each model's effort variants", () => {
    expect(groupAgyModels(AGY_MODELS)).toEqual([
      { base: "gemini-4-argon", label: "Gemini 4 Argon", efforts: ["medium", "high", "low"] },
      { base: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", efforts: ["xhigh", "low"] },
      { base: "gemini-pro-orchestrator-g1-pro", label: "Orchestrator (Argon)", efforts: [] },
      { base: "claude-opus-5-5", label: "Claude Opus 5.5", efforts: ["high"] },
    ]);
  });
});

describe("one-shot prompts", () => {
  it("puts the instructions first and the message after on a first try", () => {
    const prompt = oneShotPrompt("You grade answers.", [{ role: "user", content: "Grade this." }]);
    expect(prompt.startsWith("<instructions>\nYou grade answers.\n</instructions>\n\nGrade this.")).toBe(true);
    expect(prompt).toContain("Do not use tools");
    expect(prompt).not.toContain("<conversation>");
  });

  it("shows every turn on a retry, and the schema when the tool can't enforce it", () => {
    const prompt = oneShotPrompt(
      null,
      [
        { role: "user", content: "Grade this." },
        { role: "assistant", content: '{"correct":"maybe"}' },
        { role: "user", content: "The checker rejected that answer." },
      ],
      { schema: { type: "object" } },
    );
    expect(prompt).toContain('<assistant>\n{"correct":"maybe"}\n</assistant>');
    expect(prompt).toContain("Write the assistant's reply to the last user message.");
    expect(prompt).toContain('matches this JSON schema: no Markdown fences, no other text.\n{"type":"object"}');
  });

  it("cuts the JSON object out of fences or a sentence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('Here it is: {"a":{"b":2}} Done.')).toBe('{"a":{"b":2}}');
    expect(extractJson("no json here")).toBe("no json here");
  });
});
