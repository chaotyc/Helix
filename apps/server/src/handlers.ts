// What the server does for each kind of client message. `reply` can be called more than once:
// an extraction sends progress updates before its result.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ExtractionStage, ServerMsg } from "@helix/contracts";
import { goalSlice } from "@helix/core";
import { callClaude } from "./ai/claude.ts";
import { clarifyMap } from "./ai/clarification/clarify-map.ts";
import { extractMap } from "./ai/extraction/extract-map.ts";
import { createGoal, listGoals } from "./db/goals.ts";
import { readGraph } from "./db/graph.ts";

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

    case "map.get":
      reply({ type: "map.updated", map: goalSlice(readGraph(db), msg.goalId) });
      return;

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
      reply({ type: "map.updated", map });
      return;
    }
  }
}

// Progress from an agent, sent on to the client.
function progressTo(reply: (msg: ServerMsg) => void, goalId: string) {
  return (stage: ExtractionStage, detail: string) => reply({ type: "map.progress", goalId, stage, detail });
}
