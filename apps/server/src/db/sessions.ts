// Sessions, their tasks (tutoring), and their transcripts.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Session, TimelineItem, type SessionKind } from "@helix/contracts";
import type { PlannedTask } from "@helix/core";

// ---- Sessions ----

const SessionRow = z.object({
  id: z.string(),
  goal_id: z.string(),
  kind: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  summary: z.string().nullable(),
});

function toSession(row: unknown): Session {
  const r = SessionRow.parse(row);
  return Session.parse({
    id: r.id,
    goalId: r.goal_id,
    kind: r.kind,
    startedAt: r.started_at,
    endedAt: r.ended_at ?? undefined,
    summary: r.summary ?? undefined,
  });
}

export function createSession(db: DatabaseSync, goalId: string, kind: SessionKind): Session {
  const session: Session = { id: randomUUID(), goalId, kind, startedAt: new Date().toISOString() };
  db.prepare("INSERT INTO session (id, goal_id, kind, started_at) VALUES ($id, $goalId, $kind, $startedAt)").run(session);
  return session;
}

export function getSession(db: DatabaseSync, id: string): Session | undefined {
  const row = db.prepare("SELECT * FROM session WHERE id = $id").get({ id });
  return row ? toSession(row) : undefined;
}

export function listSessions(db: DatabaseSync): Session[] {
  return db.prepare("SELECT * FROM session ORDER BY started_at").all().map(toSession);
}

// The last few summaries for a goal, oldest first (K6: the next session reads the last 2).
export function recentSummaries(db: DatabaseSync, goalId: string, limit: number): string[] {
  return db
    .prepare(
      `SELECT summary FROM session WHERE goal_id = $goalId AND summary IS NOT NULL
       ORDER BY started_at DESC LIMIT $limit`,
    )
    .all({ goalId, limit })
    .map((row) => z.object({ summary: z.string() }).parse(row).summary)
    .reverse();
}

export type SummaryRecord = { text: string; promptVersion: string; model: string };

export function endSession(db: DatabaseSync, id: string, summary: SummaryRecord | null): Session {
  db.prepare(
    `UPDATE session SET ended_at = $endedAt, summary = $summary, summary_prompt_version = $promptVersion,
                        summary_model = $model
     WHERE id = $id AND ended_at IS NULL`,
  ).run({
    id,
    endedAt: new Date().toISOString(),
    summary: summary?.text ?? null,
    promptVersion: summary?.promptVersion ?? null,
    model: summary?.model ?? null,
  });
  const session = getSession(db, id);
  if (!session) throw new Error(`No session with id ${id}`);
  return session;
}

// ---- Transcript ----

export type Turn = { item: TimelineItem; taskId: string | null };

export function addTurn(db: DatabaseSync, sessionId: string, item: TimelineItem, taskId: string | null = null): TimelineItem {
  db.prepare(
    "INSERT INTO session_turn (session_id, task_id, item, created_at) VALUES ($sessionId, $taskId, $item, $createdAt)",
  ).run({ sessionId, taskId, item: JSON.stringify(item), createdAt: new Date().toISOString() });
  return item;
}

const TurnRow = z.object({ item: z.string(), task_id: z.string().nullable() });

export function readTurns(db: DatabaseSync, sessionId: string): Turn[] {
  return db
    .prepare("SELECT item, task_id FROM session_turn WHERE session_id = $sessionId ORDER BY seq")
    .all({ sessionId })
    .map((row) => {
      const r = TurnRow.parse(row);
      return { item: TimelineItem.parse(JSON.parse(r.item)), taskId: r.task_id };
    });
}

// ---- Tasks (tutoring) ----

export type Task = PlannedTask & {
  id: string;
  sessionId: string;
  position: number;
  method: string | null;
  startedAt: string | null;
  endedAt: string | null;
};

const TaskRow = z.object({
  id: z.string(),
  session_id: z.string(),
  position: z.number(),
  kind: z.enum(["review", "focus"]),
  concept_id: z.string(),
  depth: z.number(),
  aimed_at: z.string().nullable(),
  reason: z.string(),
  method: z.string().nullable(),
  started_at: z.string().nullable(),
  ended_at: z.string().nullable(),
});

export function createTasks(db: DatabaseSync, sessionId: string, tasks: PlannedTask[]): void {
  const insert = db.prepare(
    `INSERT INTO task (id, session_id, position, kind, concept_id, depth, aimed_at, reason)
     VALUES ($id, $sessionId, $position, $kind, $conceptId, $depth, $aimedAt, $reason)`,
  );
  tasks.forEach((t, position) => insert.run({ id: randomUUID(), sessionId, position, ...t }));
}

export function listTasks(db: DatabaseSync, sessionId: string): Task[] {
  return db
    .prepare("SELECT * FROM task WHERE session_id = $sessionId ORDER BY position")
    .all({ sessionId })
    .map((row) => {
      const r = TaskRow.parse(row);
      return {
        id: r.id,
        sessionId: r.session_id,
        position: r.position,
        kind: r.kind,
        conceptId: r.concept_id,
        depth: r.depth,
        aimedAt: r.aimed_at,
        reason: r.reason,
        method: r.method,
        startedAt: r.started_at,
        endedAt: r.ended_at,
      };
    });
}

export function startTask(db: DatabaseSync, taskId: string): void {
  db.prepare("UPDATE task SET started_at = $now WHERE id = $taskId AND started_at IS NULL").run({ taskId, now: new Date().toISOString() });
}

export function endTask(db: DatabaseSync, taskId: string): void {
  db.prepare("UPDATE task SET ended_at = $now WHERE id = $taskId AND ended_at IS NULL").run({ taskId, now: new Date().toISOString() });
}

// The teaching method is recorded once per task, as the tutor first chose it.
export function setTaskMethod(db: DatabaseSync, taskId: string, method: string): void {
  db.prepare("UPDATE task SET method = $method WHERE id = $taskId AND method IS NULL").run({ taskId, method });
}
