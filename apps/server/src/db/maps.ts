// Reading and writing concept maps. The map diary (map_event) is the source of truth;
// the concept and edge tables are a copy of the map it produces, kept for fast reads.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Concept, ConceptMap, Edge, MapEvent, type MapActor } from "@helix/contracts";
import { applyChange, describeChange, replayMap, type MapCommand } from "@helix/core";
import { inTransaction } from "./transaction.ts";

// ---- The current map (derived tables) ----

const ConceptRow = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.string(),
  source_ref: z.string().nullable(),
  target_depth: z.number(),
});

export function readMap(db: DatabaseSync, goalId: string): ConceptMap {
  const concepts = db
    .prepare("SELECT * FROM concept WHERE goal_id = $goalId ORDER BY position")
    .all({ goalId })
    .map((row) => {
      const r = ConceptRow.parse(row);
      return Concept.parse({
        id: r.id,
        name: r.name,
        kind: r.kind,
        sourceRef: r.source_ref ?? undefined,
        targetDepth: r.target_depth,
      });
    });
  const edges = db
    .prepare("SELECT src, dst, type FROM edge WHERE goal_id = $goalId ORDER BY rowid")
    .all({ goalId })
    .map((row) => Edge.parse(row));
  return { concepts, edges };
}

// Replaces the goal's rows in concept and edge with `map`. Call inside a transaction.
export function writeMap(db: DatabaseSync, goalId: string, map: ConceptMap): void {
  db.prepare("DELETE FROM edge WHERE goal_id = $goalId").run({ goalId });
  db.prepare("DELETE FROM concept WHERE goal_id = $goalId").run({ goalId });

  const insertConcept = db.prepare(
    `INSERT INTO concept (goal_id, id, name, kind, source_ref, position, target_depth)
     VALUES ($goalId, $id, $name, $kind, $sourceRef, $position, $targetDepth)`,
  );
  map.concepts.forEach((c, position) => {
    insertConcept.run({
      goalId,
      id: c.id,
      name: c.name,
      kind: c.kind,
      sourceRef: c.sourceRef ?? null,
      position,
      targetDepth: c.targetDepth,
    });
  });

  const insertEdge = db.prepare(
    "INSERT INTO edge (goal_id, src, dst, type) VALUES ($goalId, $src, $dst, $type)",
  );
  for (const e of map.edges) insertEdge.run({ goalId, src: e.src, dst: e.dst, type: e.type });
}

// ---- The map diary (map_event) ----

// Everything about a change that isn't the change itself.
export type ChangeInfo = {
  actor: MapActor;
  requestId?: string;
  instruction?: string;
  sourceId?: string;
  promptVersion?: string;
  model?: string;
};

// The one way to change a map. In one transaction: check the command against the current
// map, write it to the diary with before and after, and update the derived tables.
// Throws (and writes nothing) if the command breaks a map rule.
export function recordMapChange(
  db: DatabaseSync,
  goalId: string,
  command: MapCommand,
  info: ChangeInfo,
): void {
  inTransaction(db, () => {
    // Check against the map the diary says is current, not the derived tables:
    // if those were ever wrong, a new change shouldn't be judged against them.
    const current = replayMap(readMapEvents(db, goalId));
    const change = describeChange(current, command);

    db.prepare(
      `INSERT INTO map_event (goal_id, op, payload, before, after, actor, request_id,
                              instruction, source_id, prompt_version, model, ts)
       VALUES ($goalId, $op, $payload, $before, $after, $actor, $requestId,
               $instruction, $sourceId, $promptVersion, $model, $ts)`,
    ).run({
      goalId,
      op: change.op,
      payload: JSON.stringify(change.payload),
      before: change.before === null ? null : JSON.stringify(change.before),
      after: change.after === null ? null : JSON.stringify(change.after),
      actor: info.actor,
      requestId: info.requestId ?? null,
      instruction: info.instruction ?? null,
      sourceId: info.sourceId ?? null,
      promptVersion: info.promptVersion ?? null,
      model: info.model ?? null,
      ts: new Date().toISOString(),
    });

    writeMap(db, goalId, applyChange(current, change));
  });
}

const MapEventRow = z.object({
  seq: z.number(),
  goal_id: z.string(),
  op: z.string(),
  payload: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  actor: z.string(),
  request_id: z.string().nullable(),
  instruction: z.string().nullable(),
  source_id: z.string().nullable(),
  prompt_version: z.string().nullable(),
  model: z.string().nullable(),
  ts: z.string(),
});

// The goal's whole diary, oldest first, each entry checked against the contract.
export function readMapEvents(db: DatabaseSync, goalId: string): MapEvent[] {
  return db
    .prepare("SELECT * FROM map_event WHERE goal_id = $goalId ORDER BY seq")
    .all({ goalId })
    .map((row) => {
      const r = MapEventRow.parse(row);
      return MapEvent.parse({
        seq: r.seq,
        goalId: r.goal_id,
        op: r.op,
        payload: JSON.parse(r.payload),
        before: r.before === null ? null : JSON.parse(r.before),
        after: r.after === null ? null : JSON.parse(r.after),
        actor: r.actor,
        requestId: r.request_id,
        instruction: r.instruction,
        sourceId: r.source_id,
        promptVersion: r.prompt_version,
        model: r.model,
        ts: r.ts,
      });
    });
}
