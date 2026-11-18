// What the server does for each kind of client message. `reply` can be called more than once:
// an extraction sends progress updates before its result.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ExtractionStage, ServerMsg } from "@helix/contracts";
import { callModel as callAnyModel } from "./ai/call-model.ts";
import type { ModelCall } from "./ai/model-call.ts";
import { signIn } from "./ai/providers/sign-in.ts";
import { providerStatuses } from "./ai/providers/status.ts";
import { clarifyMap } from "./ai/clarification/clarify-map.ts";
import { extractMap } from "./ai/extraction/extract-map.ts";
import { nameGoal, standInTitle } from "./ai/naming/name-goal.ts";
import { createGoal, getGoal, listGoals, nameGoalIfUnchanged, renameGoal } from "./db/goals.ts";
import { applyEdits, mapUpdate } from "./db/map-edits.ts";
import { undoLastEdit } from "./db/map-undo.ts";
import { rebuildConceptState } from "./db/learner.ts";
import { getSettings, saveSettings } from "./db/settings.ts";
import { listSessions } from "./db/sessions.ts";
import { learnerStateMsg } from "./sessions/context.ts";
import { endSessionNow, replyToSession, resumeSession, startSession, timelineMsg } from "./sessions/runner.ts";

// Goals the learner renamed while the model was still naming them: the model's name must not
// replace theirs, even when they typed the stand-in itself (so the title alone can't tell).
const naming = new Set<string>(); // goals whose name the model is writing now
const renamedByLearner = new Set<string>();

// `callModel`: the real models by default; tests pass a fake.
export async function handle(
  db: DatabaseSync,
  msg: ClientMsg,
  reply: (msg: ServerMsg) => void,
  callModel: ModelCall = callAnyModel,
): Promise<void> {
  const deps = { callModel, emit: reply };
  switch (msg.type) {
    case "ping":
      reply({ type: "pong", text: msg.text, receivedAt: new Date().toISOString() });
      return;

    // Without a title, the goal gets a stand-in at once and the model's name when it comes.
    // Naming is a nicety: if it fails, the stand-in stays and nothing is reported.
    case "goal.create": {
      const named = msg.goal.title !== undefined;
      const goal = createGoal(db, { ...msg.goal, title: msg.goal.title ?? standInTitle(msg.goal.prompt ?? "") });
      if (!named) naming.add(goal.id); // before the reply, so a rename right after it counts
      reply({ type: "goal.created", goal });
      if (named) return;
      try {
        const title = await nameGoal(db, goal, { callModel });
        const renamed = renamedByLearner.has(goal.id) ? undefined : nameGoalIfUnchanged(db, goal.id, goal.title, title);
        if (renamed) reply({ type: "goal.updated", goal: renamed });
      } catch (err) {
        console.warn(`Naming goal ${goal.id} failed; it keeps its stand-in title.`, err);
      } finally {
        naming.delete(goal.id);
        renamedByLearner.delete(goal.id);
      }
      return;
    }

    case "goal.rename": {
      const goal = renameGoal(db, msg.goalId, msg.title);
      if (naming.has(goal.id)) renamedByLearner.add(goal.id);
      reply({ type: "goal.updated", goal });
      return;
    }

    case "goal.list":
      reply({ type: "goals", goals: listGoals(db) });
      return;

    case "settings.get":
      reply({ type: "settings", settings: getSettings(db) });
      return;

    case "settings.set":
      reply({ type: "settings", settings: saveSettings(db, msg.settings) });
      return;

    case "providers.get":
      reply({ type: "providers", providers: await providerStatuses() });
      return;

    case "provider.signIn": {
      const { ok, detail } = await signIn(msg.connection, (text) => reply({ type: "provider.signIn.output", connection: msg.connection, text }));
      reply({ type: "provider.signIn.done", connection: msg.connection, ok, detail });
      reply({ type: "providers", providers: await providerStatuses() });
      return;
    }

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

    case "map.undo": {
      if (!getGoal(db, msg.goalId)) throw new Error(`No goal with id ${msg.goalId}`);
      let undid: string;
      try {
        undid = undoLastEdit(db, msg.goalId);
      } catch (err) {
        reply({ type: "map.edit.rejected", goalId: msg.goalId, reason: err instanceof Error ? err.message : String(err) });
        return;
      }
      reply({ type: "map.undone", goalId: msg.goalId, undid });
      afterMapChange(db, reply);
      reply(mapUpdate(db, msg.goalId));
      return;
    }

    case "map.clarify": {
      const { roundId, questions } = await failingVisibly(reply, msg.goalId, () =>
        clarifyMap(db, { goalId: msg.goalId, sourceText: msg.sourceText, sourceKind: msg.sourceKind }, { callModel, onProgress: progressTo(reply, msg.goalId) }),
      );
      reply({ type: "map.questions", goalId: msg.goalId, roundId, questions });
      return;
    }

    case "map.extract": {
      const map = await failingVisibly(reply, msg.goalId, () =>
        extractMap(db, { goalId: msg.goalId, roundId: msg.roundId, answers: msg.answers, effort: msg.effort }, { callModel, onProgress: progressTo(reply, msg.goalId) }),
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

// A map job that fails before or after the model call (a stale round, no such goal) would leave
// the goal's page waiting forever on its "started" progress: say it failed, for that goal, then
// report the error as usual. (A failed model call already says so; saying it twice is harmless.)
async function failingVisibly<T>(reply: (msg: ServerMsg) => void, goalId: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    reply({ type: "map.progress", goalId, stage: "failed", detail: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

// Progress from an agent, sent on to the client with the time since the request started.
function progressTo(reply: (msg: ServerMsg) => void, goalId: string) {
  const started = Date.now();
  return (stage: ExtractionStage, detail: string) => reply({ type: "map.progress", goalId, stage, detail, elapsedMs: Date.now() - started });
}
