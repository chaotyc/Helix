import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@helix/contracts";
import { openDatabase } from "./open.ts";
import { getSettings, saveSettings } from "./settings.ts";

describe("settings", () => {
  it("default to Opus 5.5 for every job on a fresh database", () => {
    expect(getSettings(openDatabase(":memory:"))).toEqual(DEFAULT_SETTINGS);
  });

  it("save and read back a choice", () => {
    const db = openDatabase(":memory:");
    const chosen = { models: { ...DEFAULT_SETTINGS.models, evaluation: "claude-fable-5-1" as const } };
    expect(saveSettings(db, chosen)).toEqual(chosen);
    expect(getSettings(db).models.evaluation).toBe("claude-fable-5-1");
  });

  it("fall back to the defaults when the saved value is unreadable", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO setting (key, value, updated_at) VALUES ('models', $v, 'x')").run({ v: '{"generation":"gpt-9"}' });
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});
