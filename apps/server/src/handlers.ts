// What the server does for each kind of client message. Each message gets one reply.
import type { DatabaseSync } from "node:sqlite";
import type { ClientMsg, ServerMsg } from "@helix/contracts";
import { createGoal, listGoals } from "./db/goals.ts";

export function handle(db: DatabaseSync, msg: ClientMsg): ServerMsg {
  switch (msg.type) {
    case "ping":
      return { type: "pong", text: msg.text, receivedAt: new Date().toISOString() };
    case "goal.create":
      return { type: "goal.created", goal: createGoal(db, msg.goal) };
    case "goal.list":
      return { type: "goals", goals: listGoals(db) };
  }
}
