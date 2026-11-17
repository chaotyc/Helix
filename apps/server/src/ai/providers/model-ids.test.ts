import { describe, expect, it } from "vitest";
import { MODELS, MODEL_LIST, ModelId, modelIdFor, parseModelId } from "@helix/contracts";
import { effortFor, pickEffort } from "./effort.ts";
import { costUsd } from "../pricing.ts";

describe("model ids", () => {
  it("reads a bare Claude id as the Anthropic API, and a prefixed id as its connection", () => {
    expect(parseModelId("claude-opus-5-5")).toEqual({ connection: "anthropic", model: "claude-opus-5-5" });
    expect(parseModelId("codex:gpt-6.1-sol")).toEqual({ connection: "codex", model: "gpt-6.1-sol" });
    expect(parseModelId("antigravity:claude-opus-5-5")).toEqual({ connection: "antigravity", model: "claude-opus-5-5" });
  });

  it("writes Anthropic API ids bare, so older log rows keep their meaning", () => {
    expect(modelIdFor("anthropic", "claude-opus-5-5")).toBe("claude-opus-5-5");
    expect(modelIdFor("google", "gemini-4-argon")).toBe("google:gemini-4-argon");
  });

  it("accepts every catalog id and rejects ids from no connection", () => {
    for (const m of MODEL_LIST) expect(ModelId.safeParse(m.id).success, m.id).toBe(true);
    expect(ModelId.safeParse("gpt-6.1-sol").success).toBe(false); // bare ids are Claude only
    expect(ModelId.safeParse("anthropic:claude-opus-5-5").success).toBe(false); // one spelling per model
    expect(ModelId.safeParse("nowhere:model").success).toBe(false);
    expect(ModelId.safeParse("codex:").success).toBe(false);
  });

  it("keeps settings saved before connections existed valid", () => {
    for (const id of ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]) {
      expect(ModelId.safeParse(id).success).toBe(true);
      expect(MODELS[id]?.connection).toBe("anthropic");
    }
  });
});

describe("pickEffort", () => {
  it("keeps a level the model offers", () => {
    expect(pickEffort("medium", ["low", "medium", "high"])).toBe("medium");
  });

  it("steps down to the strongest level below one the model lacks", () => {
    expect(pickEffort("max", ["low", "medium", "high"])).toBe("high");
    expect(pickEffort("xhigh", ["low", "high"])).toBe("high");
    expect(pickEffort("medium", ["low", "high"])).toBe("low");
  });

  it("takes the weakest level when none is below, and none when the model has no control", () => {
    expect(pickEffort("low", ["high", "medium"])).toBe("medium");
    expect(pickEffort("high", [])).toBeUndefined();
  });

  it("uses the catalog, and passes a level through for models outside it", () => {
    expect(effortFor("google:gemini-4-argon", "max")).toBe("high");
    expect(effortFor("xai:grok-4.3", "high")).toBeUndefined();
    expect(effortFor("codex:gpt-9-unlisted", "xhigh")).toBe("xhigh");
  });
});

describe("costUsd", () => {
  it("prices API models from the catalog, including the long-prompt tier", () => {
    expect(costUsd("openai:gpt-6.1-sol", 100_000, 100_000)).toBeCloseTo(1.2); // $2 in, $10 out per M
    expect(costUsd("openai:gpt-6.1-sol", 300_000, 0)).toBeCloseTo(1.2); // above 272K: $4 per M
  });

  it("gives a dated answer the requested model's prices", () => {
    expect(costUsd("openai:gpt-6.1-sol-2026-09-30", 100_000, 0, "openai:gpt-6.1-sol")).toBeCloseTo(0.2);
  });

  it("has no estimate for a subscription tool's call", () => {
    expect(costUsd("codex:gpt-6.1-sol", 1_000_000, 1_000_000, "codex:gpt-6.1-sol")).toBeNull();
  });
});
