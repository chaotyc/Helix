// Reading and writing the global concept graph. The map diary (map_event) is the source of
// truth; the concept, edge, and goal_concept tables are a copy of the graph it produces,
// kept for fast reads.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { Concept, MapEvent, ViewEntry, type ConceptGraph, type Edge, type MapActor } from "@helix/contracts";
import { applyChange, describeChange, replayGraph, type MapCommand } from "@helix/core";
import { inTransaction } from "./transaction.ts";

// ---- The current graph (derived tables) ----

const EdgeRow = z.object({
  type: z.enum(["prereq", "part_of"]),
  src: z.string(),
  src_depth: z.number().nullable(),
  dst: z.string(),
  dst_depth: z.number().nullable(),
});

function toEdge(row: unknown): Edge {
  const r = EdgeRow.parse(row);
  if (r.type === "part_of") return { type: "part_of", src: r.src, dst: r.dst };
  return z
    .object({ type: z.literal("prereq"), src: z.string(), srcDepth: z.number(), dst: z.string(), dstDepth: z.number() })
    .parse({ type: "prereq", src: r.src, srcDepth: r.src_depth, dst: r.dst, dstDepth: r.dst_depth });
}

const ViewRow = z.object({
  goal_id: z.string(),
  concept_id: z.string(),
  target_depth: z.number(),
  role: z.string(),
});

export function readGraph(db: DatabaseSync): ConceptGraph {
  const concepts = db
    .prepare("SELECT id, name, description, kind FROM concept ORDER BY rowid")
    .all()
    .map((row) => Concept.parse(row));

  const edges = db
    .prepare("SELECT type, src, src_depth, dst, dst_depth FROM edge ORDER BY id")
    .all()
    .map(toEdge);

  const views: ConceptGraph["views"] = {};
  for (const row of db.prepare("SELECT * FROM goal_concept ORDER BY rowid").all()) {
    const r = ViewRow.parse(row);
    const entry = ViewEntry.parse({ conceptId: r.concept_id, targetDepth: r.target_depth, role: r.role });
    (views[r.goal_id] ??= []).push(entry);
  }

  return { concepts, edges, views };
}

// Replaces every row in concept, edge, and goal_concept with `graph`. Call inside a transaction.
export function writeGraph(db: DatabaseSync, graph: ConceptGraph): void {
  db.exec("DELETE FROM goal_concept; DELETE FROM edge; DELETE FROM concept;");

  const insertConcept = db.prepare(
    "INSERT INTO concept (id, name, description, kind) VALUES ($id, $name, $description, $kind)",
  );
  for (const c of graph.concepts) insertConcept.run(c);

  const insertEdge = db.prepare(
    `INSERT INTO edge (type, src, src_depth, dst, dst_depth)
     VALUES ($type, $src, $srcDepth, $dst, $dstDepth)`,
  );
  for (const e of graph.edges) {
    insertEdge.run({
      type: e.type,
      src: e.src,
      srcDepth: e.type === "prereq" ? e.srcDepth : null,
      dst: e.dst,
      dstDepth: e.type === "prereq" ? e.dstDepth : null,
    });
  }

  const insertEntry = db.prepare(
    `INSERT INTO goal_concept (goal_id, concept_id, target_depth, role)
     VALUES ($goalId, $conceptId, $targetDepth, $role)`,
  );
  for (const [goalId, entries] of Object.entries(graph.views)) {
    for (const e of entries) insertEntry.run({ goalId, ...e });
  }
}

// ---- The map diary (map_event) ----

// Everything about a change that isn't the change itself.
export type ChangeInfo = {
  actor: MapActor;
  goalId?: string; // the course this change was made for; filled in automatically for view changes
  requestId?: string;
  instruction?: string;
  sourceId?: string;
  promptVersion?: string;
  model?: string;
};

function goalOf(command: MapCommand): string | undefined {
  return "goalId" in command ? command.goalId : undefined;
}

function json(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

// The one way to change the graph. In one transaction: rebuild the current graph from the
// diary, check the command against it, write it to the diary with before and after, and
// update the derived tables. Throws (and writes nothing) if the command breaks a rule.
export function recordMapChange(db: DatabaseSync, command: MapCommand, info: ChangeInfo): void {
  inTransaction(db, () => {
    // Check against the graph the diary says is current, not the derived tables:
    // if those were ever wrong, a new change shouldn't be judged against them.
    const current = replayGraph(readMapEvents(db));
    const change = describeChange(current, command);

    db.prepare(
      `INSERT INTO map_event (goal_id, op, payload, before, after, actor, request_id,
                              instruction, source_id, prompt_version, model, ts)
       VALUES ($goalId, $op, $payload, $before, $after, $actor, $requestId,
               $instruction, $sourceId, $promptVersion, $model, $ts)`,
    ).run({
      goalId: goalOf(command) ?? info.goalId ?? null,
      op: change.op,
      payload: JSON.stringify(change.payload),
      before: json(change.before),
      after: json(change.after),
      actor: info.actor,
      requestId: info.requestId ?? null,
      instruction: info.instruction ?? null,
      sourceId: info.sourceId ?? null,
      promptVersion: info.promptVersion ?? null,
      model: info.model ?? null,
      ts: new Date().toISOString(),
    });

    writeGraph(db, applyChange(current, change));
  });
}

const MapEventRow = z.object({
  seq: z.number(),
  goal_id: z.string().nullable(),
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

// The whole diary, oldest first, each entry checked against the contract.
export function readMapEvents(db: DatabaseSync): MapEvent[] {
  return db
    .prepare("SELECT * FROM map_event ORDER BY seq")
    .all()
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
