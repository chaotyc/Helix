import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { SourceKind } from "@helix/contracts";

// Saves source material (a syllabus, notes, ...) and returns its id (D3).
export function createSource(db: DatabaseSync, goalId: string, text: string, kind: SourceKind): string {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(text).digest("hex");
  db.prepare(
    `INSERT INTO source (id, goal_id, kind, text, sha256, created_at)
     VALUES ($id, $goalId, $kind, $text, $sha256, $createdAt)`,
  ).run({ id, goalId, kind, text, sha256, createdAt: new Date().toISOString() });
  return id;
}

export function getSource(db: DatabaseSync, id: string): { text: string; kind: SourceKind } | undefined {
  const row = db.prepare("SELECT text, kind FROM source WHERE id = $id").get({ id });
  return row ? { text: String(row.text), kind: SourceKind.parse(row.kind) } : undefined;
}
