import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { inTransaction } from "./transaction.ts";

const MIGRATIONS_DIR = join(import.meta.dirname, "../../migrations");

// Runs every migration in migrations/ that hasn't run yet, in number order.
// Each runs in its own transaction together with its schema_version row.
export function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version     INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    ) STRICT
  `);

  const rows = db.prepare("SELECT version FROM schema_version").all();
  const applied = new Set(rows.map((row) => Number(row.version)));

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{3}_.+\.sql$/.test(name)) // "001_init.sql"
    .sort();

  for (const file of files) {
    const version = Number(file.slice(0, 3));
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    inTransaction(db, () => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_version (version, name, applied_at) VALUES ($version, $name, $appliedAt)")
        .run({ version, name: file, appliedAt: new Date().toISOString() });
    });
    console.log(`Applied migration ${file}`);
  }
}
