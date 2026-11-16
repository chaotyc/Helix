// What every session step works with, and small helpers they share.
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Concept, ConceptGraph, ServerMsg, Session, TimelineItem } from "@helix/contracts";
import type { ModelCall } from "../ai/claude.ts";
import type { AgentDeps } from "../ai/items/write-item.ts";
import { learnerSnapshot } from "../db/learner.ts";
import { addTurn } from "../db/sessions.ts";
import { getSettings } from "../db/settings.ts";

export type SessionCtx = {
  db: DatabaseSync;
  session: Session;
  callModel: ModelCall;
  emit: (msg: ServerMsg) => void; // to the window that asked
  status: (detail: string) => void; // "Grading…", shown while the server works
};

// Adds an item to the transcript and sends it to the window.
export function pushTurn(ctx: SessionCtx, item: TimelineItem, taskId: string | null = null): void {
  addTurn(ctx.db, ctx.session.id, item, taskId);
  ctx.emit({ type: "session.item", sessionId: ctx.session.id, item });
}

export function newId(): string {
  return randomUUID();
}

// Every agent in a session uses the teaching model from settings (J1).
export function teaching(ctx: SessionCtx): AgentDeps {
  return { callModel: ctx.callModel, model: getSettings(ctx.db).models.teaching };
}

// A concept by id. One deleted from the graph since still has a name in old transcripts.
export function conceptIn(graph: ConceptGraph, conceptId: string): Concept {
  return graph.concepts.find((c) => c.id === conceptId) ?? { id: conceptId, name: conceptId, description: "", kind: "concept" };
}

export function namer(graph: ConceptGraph): (conceptId: string) => string {
  return (conceptId) => conceptIn(graph, conceptId).name;
}

export function learnerStateMsg(db: DatabaseSync): ServerMsg {
  return { type: "learner.state", knowledge: learnerSnapshot(db).knowledge };
}
