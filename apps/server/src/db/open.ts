import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "./migrate.ts";

// Development database: apps/server/.helix-data/helix.sqlite (gitignored).
// HELIX_DB_PATH overrides it (the Mac app will point it at Application Support).
const DEFAULT_PATH = join(import.meta.dirname, "../../.helix-data/helix.sqlite");

export function openDatabase(file: string = process.env.HELIX_DB_PATH ?? DEFAULT_PATH): DatabaseSync {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON"); // SQLite leaves these off unless asked
  db.exec("PRAGMA journal_mode = WAL"); // safer and faster writes
  migrate(db);
  return db;
}
