import { describe, expect, it } from "vitest";
import type { Concept, ConceptGraph, Edge, MapActor, MapChange, MapEvent, ViewEntry } from "@helix/contracts";
import { applyChange, describeChange, emptyGraph, type MapCommand } from "./graph.ts";
import { actionLabel, inverseCommands, planUndo, undoableActions } from "./undo.ts";

// ---- Builders ----
const concept = (id: string, name = id): Concept => ({ id, name, description: `About ${id}.`, kind: "concept" });
const needs = (dst: string, src: string): Extract<Edge, { type: "prereq" }> => ({ type: "prereq", src, srcDepth: 1, dst, dstDepth: 1 });
const partOf = (src: string, dst: string): Edge => ({ type: "part_of", src, dst });
const taught = (conceptId: string, targetDepth = 3): ViewEntry => ({ conceptId, targetDepth, role: "taught" });

// A tiny diary: each command becomes an event, applied in order.
type Diary = { graph: ConceptGraph; events: MapEvent[] };
const start = (): Diary => ({ graph: emptyGraph(), events: [] });

function record(diary: Diary, commands: MapCommand[], info: { actor?: MapActor; requestId?: string; goalId?: string; undoes?: number } = {}): Diary {
  let { graph } = diary;
  const events = [...diary.events];
  const requestId = info.requestId ?? `r${events.length}`;
  for (const command of commands) {
    let change = describeChange(graph, command);
    if (info.undoes !== undefined && change.op !== "extract") change = { ...change, payload: { ...change.payload, undoes: info.undoes } } as MapChange;
    graph = applyChange(graph, change);
    events.push({
      ...change,
      seq: events.length + 1,
      goalId: "goalId" in command ? command.goalId : (info.goalId ?? "g"),
      actor: info.actor ?? "human",
      requestId,
      instruction: null,
      sourceId: null,
      promptVersion: null,
      model: null,
      ts: "2026-11-17T00:00:00.000Z",
    });
  }
  return { graph, events };
}

// Applies planUndo's steps, the way the server records them.
function undo(diary: Diary, action: MapEvent[]): Diary {
  let next = diary;
  for (const step of planUndo(diary.graph, action)) next = record(next, [step.command], { undoes: step.undoes, requestId: "undo" });
  return next;
}

const addToGoal = (id: string, name = id): MapCommand[] => [
  { op: "add_concept", concept: concept(id, name) },
  { op: "set_view_entry", goalId: "g", entry: taught(id) },
];

// A small map built by hand: a ← b, with c part of b.
function base(): Diary {
  let d = record(start(), [...addToGoal("a"), ...addToGoal("b"), ...addToGoal("c")], { requestId: "base" });
  d = record(d, [{ op: "add_edge", edge: needs("b", "a") }, { op: "add_edge", edge: partOf("c", "b") }], { requestId: "arrows" });
  return d;
}

const lastAction = (d: Diary) => undoableActions(d.events, "g")[0]!;

describe("inverseCommands: one entry's opposite", () => {
  it("covers every op a human edit can produce", () => {
    const d = base();
    const byOp = (op: string) => d.events.find((e) => e.op === op)!;
    // add_concept → delete_concept is refused while the concept is still in a view (checked below),
    // so the rest are checked on the graph as it stands.
    expect(inverseCommands(d.graph, byOp("add_edge"))).toEqual([{ op: "delete_edge", edge: needs("b", "a") }]);
    expect(inverseCommands(d.graph, byOp("set_view_entry"))).toEqual([{ op: "remove_view_entry", goalId: "g", conceptId: "a" }]);
  });

  it("refuses when the graph has moved on since the edit", () => {
    let d = base();
    const added = d.events.find((e) => e.op === "add_edge")!;
    d = record(d, [{ op: "delete_edge", edge: needs("b", "a") }]);
    expect(() => inverseCommands(d.graph, added)).toThrow(/already gone/);
  });

  it("won't undo a map build", () => {
    const d = record(start(), [{ op: "extract", goalId: "g", concepts: [concept("a")], edges: [], view: [taught("a")], raw: null }], { actor: "extractor" });
    expect(() => inverseCommands(d.graph, d.events[0]!)).toThrow(/can't be undone/);
  });
});

describe("planUndo: taking back a whole action", () => {
  it("undoes adding a concept: out of the view first, then deleted", () => {
    let d = record(base(), addToGoal("d"));
    d = undo(d, lastAction(d));
    expect(d.graph.concepts.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(d.graph.views["g"]!.map((e) => e.conceptId)).toEqual(["a", "b", "c"]);
    const undoEvents = d.events.slice(-2);
    expect(undoEvents.map((e) => e.op)).toEqual(["remove_view_entry", "delete_concept"]);
    expect(undoEvents.map((e) => (e.op === "extract" ? undefined : e.payload.undoes))).toEqual([d.events.length - 2, d.events.length - 3]);
  });

  it("undoes a concept edit (name and target depth) back to the old values", () => {
    let d = record(base(), [
      { op: "update_concept", conceptId: "a", changes: { name: "Alpha" } },
      { op: "set_view_entry", goalId: "g", entry: taught("a", 5) },
    ]);
    d = undo(d, lastAction(d));
    expect(d.graph.concepts.find((c) => c.id === "a")).toEqual(concept("a"));
    expect(d.graph.views["g"]!.find((e) => e.conceptId === "a")).toEqual(taught("a"));
  });

  it("undoes 'remove from goal': the entry comes back, and with it the arrows drawn in this goal", () => {
    let d = record(base(), [{ op: "remove_view_entry", goalId: "g", conceptId: "b" }]);
    d = undo(d, lastAction(d));
    expect(d.graph.views["g"]!.find((e) => e.conceptId === "b")).toEqual(taught("b"));
    expect(d.graph.edges).toHaveLength(2); // never removed from the global graph
  });

  it("undoes an arrow's depth change (delete + add) back to the old arrow", () => {
    const changed: Edge = { ...needs("b", "a"), srcDepth: 2, dstDepth: 3 };
    let d = record(base(), [{ op: "delete_edge", edge: needs("b", "a") }, { op: "add_edge", edge: changed }]);
    d = undo(d, lastAction(d));
    expect(d.graph.edges).toContainEqual(needs("b", "a"));
    expect(d.graph.edges).not.toContainEqual(changed);
  });

  it("undoes a concept deletion with its arrows and its place in every goal", () => {
    let d = record(base(), [{ op: "set_view_entry", goalId: "h", entry: taught("b", 2) }]);
    d = record(d, [{ op: "delete_concept", conceptId: "b" }]);
    expect(d.graph.edges).toEqual([]);
    d = undo(d, lastAction(d));
    expect(d.graph.concepts.map((c) => c.id)).toContain("b");
    expect(d.graph.edges).toEqual(expect.arrayContaining([needs("b", "a"), partOf("c", "b")]));
    expect(d.graph.views["g"]!.map((e) => e.conceptId)).toContain("b");
    expect(d.graph.views["h"]).toEqual([taught("b", 2)]);
  });

  it("refuses to bring back an arrow that would now make a loop, and changes nothing", () => {
    let d = record(base(), [{ op: "delete_edge", edge: needs("b", "a") }]);
    const deletion = lastAction(d);
    d = record(d, [{ op: "add_edge", edge: needs("a", "b") }]); // a now needs b
    expect(() => planUndo(d.graph, deletion)).toThrow(/^Can't undo: .*prerequisite loop/);
  });

  it("refuses to delete an added concept another goal now uses", () => {
    let d = record(base(), addToGoal("d"));
    const adding = lastAction(d);
    d = record(d, [{ op: "set_view_entry", goalId: "h", entry: taught("d") }]);
    expect(() => planUndo(d.graph, adding)).toThrow(/now used by a goal/);
  });
});

describe("undoableActions: the undo stack", () => {
  it("offers the newest edit first, skips what's undone, and repeats down the stack", () => {
    let d = base();
    d = record(d, [{ op: "remove_view_entry", goalId: "g", conceptId: "c" }], { requestId: "remove" });
    expect(lastAction(d).map((e) => e.requestId)).toEqual(["remove"]);
    d = undo(d, lastAction(d));
    expect(lastAction(d)[0]!.requestId).toBe("arrows");
    d = undo(d, lastAction(d));
    expect(lastAction(d)[0]!.requestId).toBe("base");
    expect(d.graph.edges).toEqual([]);
  });

  it("stops at the goal's last map build", () => {
    let d = record(start(), [{ op: "extract", goalId: "g", concepts: [concept("a")], edges: [], view: [taught("a")], raw: null }], { actor: "extractor" });
    expect(undoableActions(d.events, "g")).toEqual([]);
    d = record(d, addToGoal("b"));
    expect(undoableActions(d.events, "g")).toHaveLength(1);
    expect(undoableActions(d.events, "other")).toEqual([]);
  });
});

describe("actionLabel", () => {
  it("names an action in a few words", () => {
    let d = record(base(), addToGoal("d", "Delta"));
    expect(actionLabel(d.graph, lastAction(d))).toBe("Add “Delta”");
    d = record(d, [{ op: "remove_view_entry", goalId: "g", conceptId: "d" }]);
    expect(actionLabel(d.graph, lastAction(d))).toBe("Remove “Delta” from this goal");
    d = record(d, [{ op: "delete_edge", edge: needs("b", "a") }, { op: "add_edge", edge: { ...needs("b", "a"), srcDepth: 2 } }]);
    expect(actionLabel(d.graph, lastAction(d))).toBe("Change arrow “a” → “b”");
    d = record(d, [{ op: "update_concept", conceptId: "a", changes: { name: "Alpha" } }]);
    expect(actionLabel(d.graph, lastAction(d))).toBe("Edit “Alpha”");
  });
});
