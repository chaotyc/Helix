import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Goal, type GoalInput } from "@helix/contracts";

// A goal row as SQLite returns it (snake_case, NULL for missing values).
const GoalRow = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  prompt: z.string(),
  capstone: z.string(),
  exam_date: z.string().nullable(),
  created_at: z.string(),
});

// Row → contract type. Checked on the way out too: the database file is outside data (rule 2).
function toGoal(row: unknown): Goal {
  const r = GoalRow.parse(row);
  return Goal.parse({
    id: r.id,
    title: r.title,
    kind: r.kind,
    prompt: r.prompt || undefined,
    capstone: r.capstone || undefined,
    examDate: r.exam_date ?? undefined,
    createdAt: r.created_at,
  });
}

export function createGoal(db: DatabaseSync, input: GoalInput): Goal {
  const goal: Goal = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  db.prepare(
    `INSERT INTO goal (id, title, kind, prompt, capstone, exam_date, created_at)
     VALUES ($id, $title, $kind, $prompt, $capstone, $examDate, $createdAt)`,
  ).run({
    id: goal.id,
    title: goal.title,
    kind: goal.kind,
    prompt: goal.prompt ?? "",
    capstone: goal.capstone ?? "",
    examDate: goal.examDate ?? null,
    createdAt: goal.createdAt,
  });
  return goal;
}

export function getGoal(db: DatabaseSync, id: string): Goal | undefined {
  const row = db.prepare("SELECT * FROM goal WHERE id = $id").get({ id });
  return row ? toGoal(row) : undefined;
}

export function listGoals(db: DatabaseSync): Goal[] {
  return db.prepare("SELECT * FROM goal ORDER BY created_at").all().map(toGoal);
}
