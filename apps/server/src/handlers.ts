// What the server does for each kind of client message. `reply` can be called more than once:
// an extraction sends progress updates before its result.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ServerMsg } from "@helix/contracts";
import { goalSlice } from "@helix/core";
import { callClaude } from "./ai/claude.ts";
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

    case "map.extract": {
      const map = await extractMap(
        db,
        { goalId: msg.goalId, sourceText: msg.sourceText, effort: msg.effort },
        {
          callModel: callClaude,
          onProgress: (stage, detail) => reply({ type: "map.progress", goalId: msg.goalId, stage, detail }),
        },
      );
      reply({ type: "map.updated", map });
      return;
    }
  }
}
