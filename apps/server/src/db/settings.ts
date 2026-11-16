// The user's settings. A missing or unreadable value falls back to the default, so a
// fresh database (or an evaluation's empty one) always has working settings.
import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_SETTINGS, ModelSettings, type Settings } from "@helix/contracts";

export function getSettings(db: DatabaseSync): Settings {
  const row = db.prepare("SELECT value FROM setting WHERE key = 'models'").get();
  if (!row) return DEFAULT_SETTINGS;
  // Roles added after the value was saved get their default.
  const parsed = ModelSettings.safeParse({ ...DEFAULT_SETTINGS.models, ...JSON.parse(String(row.value)) });
  if (!parsed.success) {
    console.warn("Saved model settings are invalid; using the defaults.");
    return DEFAULT_SETTINGS;
  }
  return { models: parsed.data };
}

export function saveSettings(db: DatabaseSync, settings: Settings): Settings {
  db.prepare(
    `INSERT INTO setting (key, value, updated_at) VALUES ('models', $value, $at)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run({ value: JSON.stringify(settings.models), at: new Date().toISOString() });
  return getSettings(db);
}
