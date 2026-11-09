import { describe, expect, it } from "vitest";
import type { Concept, ConceptGraph, Edge, MapChange, ViewEntry } from "@helix/contracts";
import {
  applyChange,
  checkGraph,
  describeChange,
  diffGraphs,
  emptyGraph,
  goalSlice,
  replayGraph,
  type MapCommand,
} from "./graph.ts";

// ---- Small builders so each test reads clearly ----
function concept(id: string, name = id): Concept {
  return { id, name, description: `About ${id}.`, kind: "concept" };
}
function needs(dst: string, dstDepth: number, src: string, srcDepth: number): Edge {
  return { type: "prereq", src, srcDepth, dst, dstDepth };
}
function taught(conceptId: string, targetDepth = 3): ViewEntry {
  return { conceptId, targetDepth, role: "taught" };
}
function background(conceptId: string, targetDepth = 2): ViewEntry {
  return { conceptId, targetDepth, role: "background" };
}
function run(graph: ConceptGraph, command: MapCommand): ConceptGraph {
  return applyChange(graph, describeChange(graph, command));
}

// A first course: Signals.
const signalsExtract: MapCommand = {
  op: "extract",
  goalId: "signals",
  concepts: [concept("complex-numbers"), concept("lti"), concept("convolution")],
  edges: [needs("lti", 1, "complex-numbers", 2), needs("convolution", 1, "lti", 1)],
  view: [background("complex-numbers", 3), taught("lti", 4), taught("convolution", 4)],
  raw: { note: "the extractor's whole answer would go here" },
};
const signals = run(emptyGraph(), signalsExtract);

describe("extract: one course's proposed map, merged into the global graph", () => {
  it("adds the concepts, arrows, and the course's view; `before` records no prior view", () => {
    const change = describeChange(emptyGraph(), signalsExtract);
    expect(change.op).toBe("extract");
    if (change.op !== "extract") return;
    expect(change.before.view).toBeNull();
    expect(change.after.addedConcepts.map((c) => c.id)).toEqual(["complex-numbers", "lti", "convolution"]);
    expect(signals.views["signals"]).toEqual(signalsExtract.op === "extract" ? signalsExtract.view : []);
  });

  it("reuses concepts the graph already has instead of adding them twice", () => {
    const control = run(signals, {
      op: "extract",
      goalId: "control",
      concepts: [concept("complex-numbers", "Complex arithmetic"), concept("stability")],
      edges: [needs("stability", 1, "complex-numbers", 2)],
      view: [background("complex-numbers", 2), taught("stability", 4)],
      raw: null,
    });
    expect(control.concepts.map((c) => c.id)).toEqual(["complex-numbers", "lti", "convolution", "stability"]);
    // The existing concept keeps its name; each course keeps its own target depth.
    expect(control.concepts[0]?.name).toBe("complex-numbers");
    expect(control.views["signals"]?.[0]?.targetDepth).toBe(3);
    expect(control.views["control"]?.[0]?.targetDepth).toBe(2);
  });

  it("refuses a second course whose arrows make a loop with the first course's arrows", () => {
    expect(() =>
      run(signals, {
        op: "extract",
        goalId: "other",
        concepts: [concept("lti")],
        edges: [needs("complex-numbers", 2, "lti", 1)], // complex-numbers@2 → lti@1 already exists
        view: [taught("lti")],
        raw: null,
      }),
    ).toThrow(/loop/);
  });

  it("refuses a view entry for a concept that doesn't exist", () => {
    expect(() =>
      run(emptyGraph(), { op: "extract", goalId: "g", concepts: [], edges: [], view: [taught("ghost")], raw: null }),
    ).toThrow(/ghost/);
  });

  it("refuses a proposal that lists the same concept id twice", () => {
    expect(() =>
      run(emptyGraph(), {
        op: "extract",
        goalId: "g",
        concepts: [concept("a"), concept("a")],
        edges: [],
        view: [],
        raw: null,
      }),
    ).toThrow(/twice/);
  });
});

describe("concept changes", () => {
  it("adds a concept, and refuses a duplicate id", () => {
    const g = run(signals, { op: "add_concept", concept: concept("sampling") });
    expect(g.concepts.map((c) => c.id)).toContain("sampling");
    expect(() => run(signals, { op: "add_concept", concept: concept("lti") })).toThrow();
  });

  it("records an update's full concept before and after", () => {
    const change = describeChange(signals, { op: "update_concept", conceptId: "lti", changes: { name: "LTI systems" } });
    expect(change.before).toEqual(concept("lti"));
    expect(change.after).toEqual({ ...concept("lti"), name: "LTI systems" });
  });

  it("keeps a deleted concept's arrows and view entries in `before`, and removes them from the graph", () => {
    const change = describeChange(signals, { op: "delete_concept", conceptId: "lti" });
    if (change.op !== "delete_concept") throw new Error("wrong op");
    expect(change.before.edges).toHaveLength(2);
    expect(change.before.views).toEqual([{ goalId: "signals", entry: taught("lti", 4) }]);

    const g = applyChange(signals, change);
    expect(g.edges).toEqual([]);
    expect(g.views["signals"]?.map((e) => e.conceptId)).toEqual(["complex-numbers", "convolution"]);
  });
});

describe("arrow changes", () => {
  it("allows a spiral back to a deeper level of an earlier concept", () => {
    const g = run(signals, { op: "add_edge", edge: needs("complex-numbers", 3, "lti", 2) });
    expect(g.edges).toHaveLength(3);
  });

  it("refuses a loop, an arrow to a missing concept, a duplicate, and an arrow to itself", () => {
    expect(() => run(signals, { op: "add_edge", edge: needs("lti", 1, "convolution", 1) })).toThrow(/loop/);
    expect(() => run(signals, { op: "add_edge", edge: needs("ghost", 1, "lti", 1) })).toThrow(/ghost/);
    expect(() => run(signals, { op: "add_edge", edge: needs("convolution", 1, "lti", 1) })).toThrow(/duplicate/);
    expect(() => run(signals, { op: "add_edge", edge: needs("lti", 3, "lti", 1) })).toThrow(/itself/);
  });

  it("deletes an arrow, and refuses to delete one that isn't there", () => {
    const g = run(signals, { op: "delete_edge", edge: needs("convolution", 1, "lti", 1) });
    expect(g.edges).toHaveLength(1);
    expect(() => run(g, { op: "delete_edge", edge: needs("convolution", 1, "lti", 1) })).toThrow();
  });
});

describe("view changes", () => {
  it("changes a course's target depth for one concept, recording before and after", () => {
    const change = describeChange(signals, { op: "set_view_entry", goalId: "signals", entry: taught("lti", 5) });
    expect(change.before).toEqual(taught("lti", 4));
    expect(applyChange(signals, change).views["signals"]?.[1]).toEqual(taught("lti", 5));
  });

  it("removes a concept from one course without touching the global graph", () => {
    const g = run(signals, { op: "remove_view_entry", goalId: "signals", conceptId: "complex-numbers" });
    expect(g.views["signals"]).toHaveLength(2);
    expect(g.concepts).toHaveLength(3);
  });
});

describe("replayGraph: rebuilds the graph from its whole diary", () => {
  it("gives the same graph as applying each change as it happened", () => {
    const commands: MapCommand[] = [
      signalsExtract,
      { op: "add_concept", concept: concept("sampling") },
      { op: "add_edge", edge: needs("sampling", 1, "convolution", 2) },
      { op: "update_concept", conceptId: "lti", changes: { name: "LTI systems" } },
      { op: "set_view_entry", goalId: "signals", entry: taught("sampling", 3) },
      { op: "delete_edge", edge: needs("lti", 1, "complex-numbers", 2) },
      { op: "delete_concept", conceptId: "convolution" },
    ];

    let live = emptyGraph();
    const diary: MapChange[] = [];
    for (const command of commands) {
      const change = describeChange(live, command);
      diary.push(change);
      live = applyChange(live, change);
    }

    expect(replayGraph(diary)).toEqual(live);
    expect(live.concepts.map((c) => c.id)).toEqual(["complex-numbers", "lti", "sampling"]);
    expect(live.edges).toEqual([]);
  });

  it("doesn't modify the graph it was given", () => {
    const copy = structuredClone(signals);
    run(signals, { op: "delete_concept", conceptId: "lti" });
    expect(signals).toEqual(copy);
  });
});

describe("goalSlice: one course's part of the global graph", () => {
  it("includes the course's concepts and only the arrows between them", () => {
    const g = run(signals, {
      op: "extract",
      goalId: "control",
      concepts: [concept("complex-numbers"), concept("stability")],
      edges: [needs("stability", 1, "complex-numbers", 2)],
      view: [background("complex-numbers"), taught("stability")],
      raw: null,
    });
    const slice = goalSlice(g, "control");
    expect(slice.concepts.map((c) => c.id)).toEqual(["complex-numbers", "stability"]);
    expect(slice.edges).toEqual([needs("stability", 1, "complex-numbers", 2)]);
    expect(slice.view).toEqual([background("complex-numbers"), taught("stability")]);
  });

  it("is empty for a course with no map yet", () => {
    expect(goalSlice(signals, "nothing")).toEqual({ goalId: "nothing", concepts: [], view: [], edges: [] });
  });
});

describe("checkGraph and diffGraphs", () => {
  it("finds no problems in a valid graph", () => {
    expect(checkGraph(signals)).toEqual([]);
  });

  it("lists what changed between two graphs, view entries included", () => {
    const edited = run(
      run(signals, { op: "update_concept", conceptId: "lti", changes: { name: "LTI" } }),
      { op: "set_view_entry", goalId: "signals", entry: taught("lti", 5) },
    );
    const diff = diffGraphs(signals, edited);
    expect(diff.conceptsChanged.map((c) => c.after.name)).toEqual(["LTI"]);
    expect(diff.viewEntriesChanged).toEqual([{ goalId: "signals", before: taught("lti", 4), after: taught("lti", 5) }]);
    expect(diff.isEmpty).toBe(false);
    expect(diffGraphs(signals, structuredClone(signals)).isEmpty).toBe(true);
  });
});
