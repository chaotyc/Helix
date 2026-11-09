import { describe, expect, it } from "vitest";
import { loadPrompt, promptVersion } from "./prompts.ts";

describe("prompt versions (D4)", () => {
  it("are computed from the text: same text, same version", () => {
    expect(promptVersion("extract-map", "Build a map.")).toBe(promptVersion("extract-map", "Build a map."));
  });

  it("change with any edit, however small", () => {
    expect(promptVersion("extract-map", "Build a map.")).not.toBe(promptVersion("extract-map", "Build a map!"));
  });

  it("look like name@8-hex-characters", () => {
    expect(loadPrompt("extract-map").version).toMatch(/^extract-map@[0-9a-f]{8}$/);
  });
});
