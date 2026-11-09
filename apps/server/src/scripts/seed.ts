// Writes two demo courses that share concepts, so the global graph, spirals, and the
// rebuild can be tried before Step 8 produces real maps.
// Run with: pnpm --filter @helix/server seed
import { randomUUID } from "node:crypto";
import type { Concept, Edge, ViewEntry } from "@helix/contracts";
import { openDatabase } from "../db/open.ts";
import { createGoal } from "../db/goals.ts";
import { readGraph, readMapEvents, recordMapChange } from "../db/graph.ts";
import { createSource } from "../db/sources.ts";

const db = openDatabase();

function c(id: string, name: string, description: string): Concept {
  return { id, name, description, kind: "concept" };
}
// `dst` at `dstDepth` needs `src` at `srcDepth`.
function needs(dst: string, dstDepth: number, src: string, srcDepth: number): Edge {
  return { type: "prereq", src, srcDepth, dst, dstDepth };
}
function taught(conceptId: string, targetDepth: number): ViewEntry {
  return { conceptId, targetDepth, role: "taught" };
}
function background(conceptId: string, targetDepth: number): ViewEntry {
  return { conceptId, targetDepth, role: "background" };
}

// ---- Course 1: Signals and Systems ----

const signals = createGoal(db, {
  title: "Signals and Systems (demo)",
  kind: "course",
  capstone: "Design a filter and predict its output for any input",
});
recordMapChange(
  db,
  {
    op: "extract",
    goalId: signals.id,
    concepts: [
      c("complex-numbers", "Complex numbers", "Numbers a + bj, their arithmetic, and polar form."),
      c("complex-exp", "Complex exponentials", "Signals of the form e^(st) and Euler's formula."),
      c("lti", "LTI systems", "Systems that are linear and time-invariant."),
      c("convolution", "Conv", "Computing an LTI system's output from its input and impulse response."),
      c("fourier-series", "Fourier series", "Writing a periodic signal as a sum of complex exponentials."),
      c("laplace", "Laplace transform", "Representing signals and systems as functions of complex frequency s."),
    ],
    edges: [
      needs("complex-exp", 1, "complex-numbers", 2),
      needs("lti", 2, "complex-exp", 1),
      needs("complex-exp", 3, "lti", 2), // the spiral: why exponentials matter comes after LTI
      needs("convolution", 1, "lti", 1),
      needs("fourier-series", 1, "complex-exp", 2),
      needs("fourier-series", 2, "convolution", 2),
      needs("laplace", 1, "fourier-series", 1), // wrong; the editor fixes it below
    ],
    view: [
      background("complex-numbers", 3),
      taught("complex-exp", 4),
      taught("lti", 4),
      taught("convolution", 4),
      taught("fourier-series", 3),
      taught("laplace", 2),
    ],
    raw: { note: "stand-in for the extractor's answer" },
  },
  {
    actor: "extractor",
    sourceId: createSource(db, signals.id, "Week 1: Complex exponentials. Week 2: LTI systems. Week 3: Convolution...", "syllabus"),
    promptVersion: "seed@demo",
    model: "none",
  },
);

// ---- Course 2: Control Systems, which reuses complex numbers and Laplace ----

const control = createGoal(db, {
  title: "Control Systems (demo)",
  kind: "course",
  capstone: "Design a feedback controller that keeps a system stable",
});
recordMapChange(
  db,
  {
    op: "extract",
    goalId: control.id,
    concepts: [
      c("complex-numbers", "Complex arithmetic", "Numbers a + bj and their arithmetic."), // reused: keeps its old name
      c("laplace", "Laplace transform", "Signals and systems as functions of s."), // reused
      c("transfer-functions", "Transfer functions", "A system's output-to-input ratio in the s-domain."),
      c("stability", "Stability", "Whether a system's output stays bounded, read from its poles."),
      c("feedback", "Feedback", "Feeding a system's output back to change its behavior."),
    ],
    edges: [
      needs("transfer-functions", 1, "laplace", 2),
      needs("stability", 1, "transfer-functions", 2),
      needs("stability", 2, "complex-numbers", 3),
      needs("stability", 2, "feedback", 1),
    ],
    view: [
      background("complex-numbers", 3),
      background("laplace", 3), // same concept, a deeper target than Signals needs
      taught("transfer-functions", 4),
      taught("stability", 4),
      taught("feedback", 3),
    ],
    raw: { note: "stand-in for the extractor's answer" },
  },
  {
    actor: "extractor",
    sourceId: createSource(db, control.id, "Unit 1: Laplace review. Unit 2: Transfer functions. Unit 3: Stability...", "syllabus"),
    promptVersion: "seed@demo",
    model: "none",
  },
);

// ---- Corrections, through the "editor" (one instruction can make several changes) ----

recordMapChange(
  db,
  { op: "update_concept", conceptId: "convolution", changes: { name: "Convolution" } },
  { actor: "editor", goalId: signals.id, requestId: randomUUID(), instruction: "Call it Convolution, not Conv" },
);

const laplaceFix = { requestId: randomUUID(), instruction: "Laplace builds on LTI systems, not Fourier series" };
recordMapChange(db, { op: "delete_edge", edge: needs("laplace", 1, "fourier-series", 1) }, {
  actor: "editor",
  goalId: signals.id,
  ...laplaceFix,
});
recordMapChange(db, { op: "add_edge", edge: needs("laplace", 1, "lti", 2) }, {
  actor: "editor",
  goalId: signals.id,
  ...laplaceFix,
});

// A change that would create a loop is refused, and nothing is written.
try {
  recordMapChange(db, { op: "add_edge", edge: needs("lti", 1, "convolution", 1) }, { actor: "human" });
} catch (err) {
  console.log(`Refused as expected: ${err instanceof Error ? err.message : err}`);
}

// ---- Summary ----

const graph = readGraph(db);
console.log(`Seeded "${signals.title}" and "${control.title}"`);
console.log(
  `Global graph: ${graph.concepts.length} concepts, ${graph.edges.length} arrows, ` +
    `from ${readMapEvents(db).length} diary entries`,
);
for (const goal of [signals, control]) {
  const view = graph.views[goal.id] ?? [];
  console.log(`  ${goal.title}: ${view.map((e) => `${e.conceptId}→${e.targetDepth}`).join(", ")}`);
}
