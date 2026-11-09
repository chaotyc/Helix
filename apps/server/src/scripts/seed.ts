// Writes a demo goal whose map diary uses every kind of change, so the rebuild can be tested
// before Step 8 produces real maps. Run with: pnpm --filter @helix/server seed
import { randomUUID } from "node:crypto";
import type { Concept } from "@helix/contracts";
import { openDatabase } from "../db/open.ts";
import { createGoal } from "../db/goals.ts";
import { readMap, readMapEvents, recordMapChange } from "../db/maps.ts";
import { createSource } from "../db/sources.ts";

const db = openDatabase();

const goal = createGoal(db, {
  title: "Signals and Systems (demo)",
  kind: "course",
  capstone: "Design a filter and predict its output for any input",
});

const syllabus = `Week 1: Complex exponentials. Week 2: LTI systems. Week 3: Convolution.
Week 4: Fourier series. Week 5: Fourier transform. Week 6: Laplace transform.`;
const sourceId = createSource(db, goal.id, syllabus);

function c(id: string, name: string, sourceRef: string, targetDepth: number): Concept {
  return { id, name, kind: "concept", sourceRef, targetDepth };
}

// 1. The "extractor" proposes a whole map (a stand-in until Step 8's real extraction).
recordMapChange(
  db,
  goal.id,
  {
    op: "extract",
    map: {
      concepts: [
        c("complex-exp", "Complex exponentials", "Week 1", 3),
        c("lti", "LTI systems", "Week 2", 4),
        c("conv", "Conv", "Week 3", 4),
        c("fourier-series", "Fourier series", "Week 4", 3),
        c("fourier-transform", "Fourier transform", "Week 5", 3),
        c("laplace", "Laplace transform", "Week 6", 2),
      ],
      edges: [
        { src: "complex-exp", dst: "lti", type: "prereq" },
        { src: "lti", dst: "conv", type: "prereq" },
        { src: "conv", dst: "fourier-series", type: "prereq" },
        { src: "fourier-series", dst: "fourier-transform", type: "prereq" },
        { src: "fourier-series", dst: "laplace", type: "prereq" },
      ],
    },
  },
  { actor: "extractor", sourceId, promptVersion: "seed@demo", model: "none" },
);

// 2. The learner corrects it through the "editor": one instruction, possibly several changes.
const rename = randomUUID();
recordMapChange(
  db,
  goal.id,
  { op: "update_concept", conceptId: "conv", changes: { name: "Convolution" } },
  { actor: "editor", requestId: rename, instruction: "Call it Convolution, not Conv" },
);

const laplace = randomUUID();
const laplaceInstruction = "Laplace doesn't need Fourier series first, it builds on LTI systems";
recordMapChange(
  db,
  goal.id,
  { op: "delete_edge", edge: { src: "fourier-series", dst: "laplace", type: "prereq" } },
  { actor: "editor", requestId: laplace, instruction: laplaceInstruction },
);
recordMapChange(
  db,
  goal.id,
  { op: "add_edge", edge: { src: "lti", dst: "laplace", type: "prereq" } },
  { actor: "editor", requestId: laplace, instruction: laplaceInstruction },
);

// 3. A direct human edit: add a concept, then delete one (which also removes its edges).
recordMapChange(db, goal.id, { op: "add_concept", concept: c("sampling", "Sampling theorem", "Week 7", 3) }, {
  actor: "human",
});
recordMapChange(db, goal.id, { op: "delete_concept", conceptId: "fourier-transform" }, { actor: "human" });

const map = readMap(db, goal.id);
const entries = readMapEvents(db, goal.id).length;
console.log(`Seeded goal "${goal.title}" (${goal.id})`);
console.log(`Map: ${map.concepts.length} concepts, ${map.edges.length} edges, from ${entries} diary entries`);
