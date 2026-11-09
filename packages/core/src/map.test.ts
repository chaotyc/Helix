import { describe, expect, it } from "vitest";
import type { Concept, ConceptMap, Edge } from "@helix/contracts";
import { applyChange, checkMap, describeChange, diffMaps, emptyMap, replayMap } from "./map.ts";

// ---- Small builders so each test reads clearly ----
function concept(id: string, name = id): Concept {
  return { id, name, kind: "concept", targetDepth: 3 };
}
function prereq(src: string, dst: string): Edge {
  return { src, dst, type: "prereq" };
}

// LTI systems → convolution → fourier-series
const signals: ConceptMap = {
  concepts: [concept("lti-systems"), concept("convolution"), concept("fourier-series")],
  edges: [prereq("lti-systems", "convolution"), prereq("convolution", "fourier-series")],
};

describe("describeChange: turns a command into a diary entry with before and after", () => {
  it("records a whole extracted map, with the old map as `before`", () => {
    const change = describeChange(emptyMap(), { op: "extract", map: signals });
    expect(change.before).toEqual(emptyMap());
    expect(change.after).toEqual(signals);
  });

  it("rejects an extracted map whose edge points to a missing concept", () => {
    const broken = { concepts: [concept("a")], edges: [prereq("a", "ghost")] };
    expect(() => describeChange(emptyMap(), { op: "extract", map: broken })).toThrow(/ghost/);
  });

  it("adds a concept, and refuses a duplicate id", () => {
    const change = describeChange(signals, { op: "add_concept", concept: concept("sampling") });
    expect(change.before).toBeNull();
    expect(change.after).toEqual(concept("sampling"));
    expect(() => describeChange(signals, { op: "add_concept", concept: concept("convolution") })).toThrow();
  });

  it("records an update's full concept before and after", () => {
    const change = describeChange(signals, {
      op: "update_concept",
      conceptId: "convolution",
      changes: { name: "Convolution integral", targetDepth: 4 },
    });
    expect(change.before).toEqual(concept("convolution"));
    expect(change.after).toEqual({ ...concept("convolution"), name: "Convolution integral", targetDepth: 4 });
  });

  it("keeps a deleted concept's edges in `before`, so nothing is lost from the record", () => {
    const change = describeChange(signals, { op: "delete_concept", conceptId: "convolution" });
    expect(change.before).toEqual({ concept: concept("convolution"), edges: signals.edges });
    expect(change.after).toBeNull();
  });

  it("refuses an edge to a missing concept, a duplicate edge, and an edge from a concept to itself", () => {
    expect(() => describeChange(signals, { op: "add_edge", edge: prereq("lti-systems", "ghost") })).toThrow();
    expect(() => describeChange(signals, { op: "add_edge", edge: prereq("lti-systems", "convolution") })).toThrow();
    expect(() => describeChange(signals, { op: "add_edge", edge: prereq("convolution", "convolution") })).toThrow();
  });

  it("refuses to update, delete, or unlink something that isn't there", () => {
    expect(() => describeChange(signals, { op: "update_concept", conceptId: "ghost", changes: {} })).toThrow();
    expect(() => describeChange(signals, { op: "delete_concept", conceptId: "ghost" })).toThrow();
    expect(() => describeChange(signals, { op: "delete_edge", edge: prereq("fourier-series", "lti-systems") })).toThrow();
  });
});

describe("applyChange: moves the map forward by one diary entry", () => {
  it("deleting a concept also removes its edges", () => {
    const change = describeChange(signals, { op: "delete_concept", conceptId: "convolution" });
    const after = applyChange(signals, change);
    expect(after.concepts.map((c) => c.id)).toEqual(["lti-systems", "fourier-series"]);
    expect(after.edges).toEqual([]);
  });

  it("doesn't modify the map it was given", () => {
    const copy = structuredClone(signals);
    applyChange(signals, describeChange(signals, { op: "add_concept", concept: concept("sampling") }));
    expect(signals).toEqual(copy);
  });
});

describe("replayMap: rebuilds a map from its whole diary", () => {
  it("gives the same map as applying each change as it happened", () => {
    const commands = [
      { op: "extract", map: signals },
      { op: "add_concept", concept: concept("sampling") },
      { op: "add_edge", edge: prereq("fourier-series", "sampling") },
      { op: "update_concept", conceptId: "lti-systems", changes: { name: "LTI systems" } },
      { op: "delete_edge", edge: prereq("lti-systems", "convolution") },
      { op: "delete_concept", conceptId: "convolution" },
    ] as const;

    // Live: apply each change as it's made, keeping the diary as we go.
    let live = emptyMap();
    const diary = [];
    for (const command of commands) {
      const change = describeChange(live, command);
      diary.push(change);
      live = applyChange(live, change);
    }

    // Rebuild: start from nothing and reread the diary.
    expect(replayMap(diary)).toEqual(live);
    expect(live.concepts.map((c) => c.id)).toEqual(["lti-systems", "fourier-series", "sampling"]);
    expect(live.edges).toEqual([prereq("fourier-series", "sampling")]);
  });

  it("an empty diary gives an empty map", () => {
    expect(replayMap([])).toEqual(emptyMap());
  });
});

describe("checkMap and diffMaps", () => {
  it("finds no problems in a valid map", () => {
    expect(checkMap(signals)).toEqual([]);
  });

  it("lists what was added, removed, and changed between two maps", () => {
    const edited: ConceptMap = {
      concepts: [concept("lti-systems", "LTI"), concept("convolution"), concept("sampling")],
      edges: [prereq("lti-systems", "convolution")],
    };
    const diff = diffMaps(signals, edited);
    expect(diff.conceptsAdded.map((c) => c.id)).toEqual(["sampling"]);
    expect(diff.conceptsRemoved.map((c) => c.id)).toEqual(["fourier-series"]);
    expect(diff.conceptsChanged.map((c) => c.after.name)).toEqual(["LTI"]);
    expect(diff.edgesAdded).toEqual([]);
    expect(diff.edgesRemoved).toEqual([prereq("convolution", "fourier-series")]);
  });

  it("finds no differences between a map and itself", () => {
    expect(diffMaps(signals, structuredClone(signals)).isEmpty).toBe(true);
  });
});
