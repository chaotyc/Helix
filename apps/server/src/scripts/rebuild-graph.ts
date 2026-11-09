// Rebuilds the global graph's tables from the map diary, and reports any place where the
// stored graph didn't match what the diary says (D8).
// Run with: pnpm --filter @helix/server rebuild-graph
import { diffGraphs, edgeLabel, replayGraph, type GraphDiff } from "@helix/core";
import { openDatabase } from "../db/open.ts";
import { readGraph, readMapEvents, writeGraph } from "../db/graph.ts";
import { inTransaction } from "../db/transaction.ts";

// `diff` is from the stored graph to the diary's graph, so "added" means "the diary has it, the table lost it".
function describe(diff: GraphDiff): string[] {
  return [
    ...diff.conceptsAdded.map((c) => `restored concept "${c.id}"`),
    ...diff.conceptsRemoved.map((c) => `removed extra concept "${c.id}"`),
    ...diff.conceptsChanged.map(({ before, after }) => `fixed concept "${before.id}" (stored "${before.name}", diary says "${after.name}")`),
    ...diff.edgesAdded.map((e) => `restored arrow "${edgeLabel(e)}"`),
    ...diff.edgesRemoved.map((e) => `removed extra arrow "${edgeLabel(e)}"`),
    ...diff.viewEntriesAdded.map(({ goalId, entry }) => `restored "${entry.conceptId}" in goal ${goalId}`),
    ...diff.viewEntriesRemoved.map(({ goalId, entry }) => `removed extra "${entry.conceptId}" from goal ${goalId}`),
    ...diff.viewEntriesChanged.map(({ goalId, before, after }) =>
      `fixed "${after.conceptId}" in goal ${goalId} (stored depth ${before.targetDepth}, diary says ${after.targetDepth})`),
  ];
}

const db = openDatabase();
const events = readMapEvents(db);
const fromDiary = replayGraph(events);
const diff = diffGraphs(readGraph(db), fromDiary);

if (diff.isEmpty) {
  console.log(`✓ The graph matches its diary (${events.length} entries).`);
} else {
  console.log(`✗ The stored graph differed from its diary (${events.length} entries):`);
  for (const line of describe(diff)) console.log(`  ${line}`);
  inTransaction(db, () => writeGraph(db, fromDiary));
  console.log(`  Rebuilt: ${fromDiary.concepts.length} concepts, ${fromDiary.edges.length} arrows.`);
}
