// What the server does for each kind of client message. `reply` can be called more than once:
// an extraction sends progress updates before its result.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ExtractionStage, ServerMsg } from "@helix/contracts";
import { callClaude, type ModelCall } from "./ai/claude.ts";
import { clarifyMap } from "./ai/clarification/clarify-map.ts";
import { extractMap } from "./ai/extraction/extract-map.ts";
import { createGoal, getGoal, listGoals } from "./db/goals.ts";
import { applyEdits, mapUpdate } from "./db/map-edits.ts";
import { rebuildConceptState } from "./db/learner.ts";
import { getSettings, saveSettings } from "./db/settings.ts";
import { listSessions } from "./db/sessions.ts";
import { learnerStateMsg } from "./sessions/context.ts";
import { endSessionNow, replyToSession, resumeSession, startSession, timelineMsg } from "./sessions/runner.ts";

// `callModel`: the real Claude by default; tests pass a fake.
export async function handle(
  db: DatabaseSync,
  msg: ClientMsg,
  reply: (msg: ServerMsg) => void,
  callModel: ModelCall = callClaude,
): Promise<void> {
  const deps = { callModel, emit: reply };
  switch (msg.type) {
    case "ping":
      reply({ type: "pong", text: msg.text, receivedAt: new Date().toISOString() });
      return;

    case "goal.create":
      reply({ type: "goal.created", goal: createGoal(db, msg.goal) });
      return;

    case "goal.list":
      reply({ type: "goals", goals: listGoals(db) });
      return;

    case "settings.get":
      reply({ type: "settings", settings: getSettings(db) });
      return;

    case "settings.set":
      reply({ type: "settings", settings: saveSettings(db, msg.settings) });
      return;

    case "map.get":
      reply(mapUpdate(db, msg.goalId));
      return;

    case "map.edit": {
      if (!getGoal(db, msg.goalId)) throw new Error(`No goal with id ${msg.goalId}`);
      try {
        applyEdits(db, msg.goalId, msg.edits);
      } catch (err) {
        reply({ type: "map.edit.rejected", goalId: msg.goalId, reason: err instanceof Error ? err.message : String(err) });
        return;
      }
      afterMapChange(db, reply);
      reply(mapUpdate(db, msg.goalId));
      return;
    }

    case "map.clarify": {
      const { roundId, questions } = await clarifyMap(
        db,
        { goalId: msg.goalId, sourceText: msg.sourceText, sourceKind: msg.sourceKind },
        { callModel, onProgress: progressTo(reply, msg.goalId) },
      );
      reply({ type: "map.questions", goalId: msg.goalId, roundId, questions });
      return;
    }

    case "map.extract": {
      const map = await extractMap(
        db,
        { goalId: msg.goalId, roundId: msg.roundId, answers: msg.answers, effort: msg.effort },
        { callModel, onProgress: progressTo(reply, msg.goalId) },
      );
      afterMapChange(db, reply);
      reply(mapUpdate(db, map.goalId));
      return;
    }

    case "learner.get":
      reply(learnerStateMsg(db));
      return;

    case "session.list":
      reply({ type: "sessions", sessions: listSessions(db) });
      return;

    case "session.open":
      reply(timelineMsg(db, msg.sessionId));
      return;

    case "session.start":
      await startSession(db, msg.goalId, msg.kind, deps);
      return;

    case "session.reply":
      await replyToSession(db, msg.sessionId, msg.text, msg.confidence, deps);
      return;

    case "session.resume":
      await resumeSession(db, msg.sessionId, deps);
      return;

    case "session.end":
      await endSessionNow(db, msg.sessionId, deps);
      return;
  }
}

// The arrows feed the learner state (right answers pass down them), so a map change can change
// what's held: rebuild it and send the new state.
function afterMapChange(db: DatabaseSync, reply: (msg: ServerMsg) => void): void {
  rebuildConceptState(db);
  reply(learnerStateMsg(db));
}

// Progress from an agent, sent on to the client.
function progressTo(reply: (msg: ServerMsg) => void, goalId: string) {
  return (stage: ExtractionStage, detail: string) => reply({ type: "map.progress", goalId, stage, detail });
}
