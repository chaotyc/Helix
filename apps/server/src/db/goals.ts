import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Goal } from "@helix/contracts";

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

// A goal as it's saved: the UI's input with its title settled (see GoalInput).
export type NewGoal = Omit<Goal, "id" | "createdAt">;

export function createGoal(db: DatabaseSync, input: NewGoal): Goal {
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

// The learner's new title. Throws when there's no such goal.
export function renameGoal(db: DatabaseSync, id: string, title: string): Goal {
  db.prepare("UPDATE goal SET title = $title WHERE id = $id").run({ id, title });
  const goal = getGoal(db, id);
  if (!goal) throw new Error(`No goal with id ${id}`);
  return goal;
}

// The namer's title, saved only if the title is still `expected` (the stand-in), so it never
// replaces a name the learner typed meanwhile. Returns the goal if it changed.
export function nameGoalIfUnchanged(db: DatabaseSync, id: string, expected: string, title: string): Goal | undefined {
  const { changes } = db.prepare("UPDATE goal SET title = $title WHERE id = $id AND title = $expected").run({ id, expected, title });
  return changes > 0 ? getGoal(db, id) : undefined;
}
