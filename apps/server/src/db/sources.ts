import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

// Saves source material (a syllabus, for now) and returns its id (D3).
export function createSource(db: DatabaseSync, goalId: string, text: string): string {
  const id = randomUUID();
  const sha256 = createHash("sha256").update(text).digest("hex");
  db.prepare(
    `INSERT INTO source (id, goal_id, text, sha256, created_at)
     VALUES ($id, $goalId, $text, $sha256, $createdAt)`,
  ).run({ id, goalId, text, sha256, createdAt: new Date().toISOString() });
  return id;
}
