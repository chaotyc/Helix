// What the server does for each kind of client message. `reply` can be called more than once:
// an extraction sends progress updates before its result.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ExtractionStage, ServerMsg } from "@helix/contracts";
import { callClaude } from "./ai/claude.ts";
import { clarifyMap } from "./ai/clarification/clarify-map.ts";
import { extractMap } from "./ai/extraction/extract-map.ts";
import { createGoal, getGoal, listGoals } from "./db/goals.ts";
import { applyEdits, mapUpdate } from "./db/map-edits.ts";
import { getSettings, saveSettings } from "./db/settings.ts";

export async function handle(db: DatabaseSync, msg: ClientMsg, reply: (msg: ServerMsg) => void): Promise<void> {
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
      reply(mapUpdate(db, msg.goalId));
      return;
    }

    case "map.clarify": {
      const { roundId, questions } = await clarifyMap(
        db,
        { goalId: msg.goalId, sourceText: msg.sourceText, sourceKind: msg.sourceKind },
        { callModel: callClaude, onProgress: progressTo(reply, msg.goalId) },
      );
      reply({ type: "map.questions", goalId: msg.goalId, roundId, questions });
      return;
    }

    case "map.extract": {
      const map = await extractMap(
        db,
        { goalId: msg.goalId, roundId: msg.roundId, answers: msg.answers, effort: msg.effort },
        { callModel: callClaude, onProgress: progressTo(reply, msg.goalId) },
      );
      reply(mapUpdate(db, map.goalId));
      return;
    }
  }
}

// Progress from an agent, sent on to the client.
function progressTo(reply: (msg: ServerMsg) => void, goalId: string) {
  return (stage: ExtractionStage, detail: string) => reply({ type: "map.progress", goalId, stage, detail });
}
