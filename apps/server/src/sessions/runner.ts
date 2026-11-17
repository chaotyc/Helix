// The entry points for sessions, used by the message handlers. Each one:
//   - works on one session at a time (a second request while it's busy is refused),
//   - tells the window it's busy and what it's doing, then that it's done,
//   - on a failure, says so and resends the saved timeline (dropping half-streamed text).
import type { DatabaseSync } from "node:sqlite";
import type { Confidence, ServerMsg, Session, SessionKind } from "@helix/contracts";
import type { ModelCall } from "../ai/model-call.ts";
import { getGoal } from "../db/goals.ts";
import { createSession, createTasks, getSession, readTurns } from "../db/sessions.ts";
import type { SessionCtx } from "./context.ts";
import { answerDiagnostic, askNext, openDiagnostic, resumeDiagnostic } from "./diagnostic.ts";
import { finishSession } from "./finish.ts";
import { beginTutoring, planFor, replyTutoring, resumeTutoring } from "./tutoring.ts";

export type RunnerDeps = { callModel: ModelCall; emit: (msg: ServerMsg) => void };

const busy = new Set<string>();

async function run(db: DatabaseSync, session: Session, deps: RunnerDeps, work: (ctx: SessionCtx) => Promise<void>): Promise<void> {
  if (busy.has(session.id)) throw new Error("Helix is still working on this session.");
  busy.add(session.id);
  const status = (detail: string) => deps.emit({ type: "session.status", sessionId: session.id, busy: true, detail });
  const ctx: SessionCtx = { db, session, callModel: deps.callModel, emit: deps.emit, status };
  status("Working…");
  try {
    await work(ctx);
    deps.emit({ type: "session.status", sessionId: session.id, busy: false, detail: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.emit({ type: "session.status", sessionId: session.id, busy: false, detail: `Failed: ${message}` });
    deps.emit(timelineMsg(db, session.id));
    throw err;
  } finally {
    busy.delete(session.id);
  }
}

function openSession(db: DatabaseSync, sessionId: string): Session {
  const session = getSession(db, sessionId);
  if (!session) throw new Error(`No session with id ${sessionId}`);
  return session;
}

export function timelineMsg(db: DatabaseSync, sessionId: string): ServerMsg {
  return { type: "session.timeline", sessionId, items: readTurns(db, sessionId).map((t) => t.item) };
}

export async function startSession(db: DatabaseSync, goalId: string, kind: SessionKind, deps: RunnerDeps): Promise<Session> {
  if (!getGoal(db, goalId)) throw new Error(`No goal with id ${goalId}`);
  const tasks = kind === "tutoring" ? planFor(db, goalId) : []; // refuses before anything is saved
  const session = createSession(db, goalId, kind);
  if (kind === "tutoring") createTasks(db, session.id, tasks);
  deps.emit({ type: "session.started", session });

  await run(db, session, deps, async (ctx) => {
    if (kind === "diagnostic") {
      openDiagnostic(ctx);
      await askNext(ctx);
    } else {
      await beginTutoring(ctx);
    }
  });
  return session;
}

export async function replyToSession(
  db: DatabaseSync,
  sessionId: string,
  text: string,
  confidence: Confidence | undefined,
  deps: RunnerDeps,
): Promise<void> {
  const session = openSession(db, sessionId);
  if (session.endedAt) throw new Error("This session has ended.");
  await run(db, session, deps, (ctx) =>
    session.kind === "diagnostic" ? answerDiagnostic(ctx, text, confidence) : replyTutoring(ctx, text, confidence),
  );
}

export async function resumeSession(db: DatabaseSync, sessionId: string, deps: RunnerDeps): Promise<void> {
  const session = openSession(db, sessionId);
  if (session.endedAt) return;
  await run(db, session, deps, (ctx) => (session.kind === "diagnostic" ? resumeDiagnostic(ctx) : resumeTutoring(ctx)));
}

export async function endSessionNow(db: DatabaseSync, sessionId: string, deps: RunnerDeps): Promise<void> {
  const session = openSession(db, sessionId);
  if (session.endedAt) return;
  await run(db, session, deps, finishSession);
}
