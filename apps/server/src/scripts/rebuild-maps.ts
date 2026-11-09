// Rebuilds every goal's concept and edge rows from its map diary, and reports any place
// where the stored map didn't match what the diary says (D8).
// Run with: pnpm --filter @helix/server rebuild-maps
import { diffMaps, replayMap, type MapDiff } from "@helix/core";
import { openDatabase } from "../db/open.ts";
import { listGoals } from "../db/goals.ts";
import { readMap, readMapEvents, writeMap } from "../db/maps.ts";
import { inTransaction } from "../db/transaction.ts";

function describe(diff: MapDiff): string[] {
  return [
    ...diff.conceptsAdded.map((c) => `  restored concept "${c.id}"`),
    ...diff.conceptsRemoved.map((c) => `  removed extra concept "${c.id}"`),
    ...diff.conceptsChanged.map(({ before, after }) => `  fixed concept "${before.id}" (stored "${before.name}", diary says "${after.name}")`),
    ...diff.edgesAdded.map((e) => `  restored edge ${e.src} → ${e.dst}`),
    ...diff.edgesRemoved.map((e) => `  removed extra edge ${e.src} → ${e.dst}`),
  ];
}

const db = openDatabase();
let mismatches = 0;

for (const goal of listGoals(db)) {
  const events = readMapEvents(db, goal.id);
  const fromDiary = replayMap(events);
  const stored = readMap(db, goal.id);
  const diff = diffMaps(stored, fromDiary);

  if (diff.isEmpty) {
    console.log(`✓ ${goal.title}: matches its diary (${events.length} entries)`);
    continue;
  }

  mismatches += 1;
  console.log(`✗ ${goal.title}: stored map differed from its diary (${events.length} entries)`);
  for (const line of describe(diff)) console.log(line);
  inTransaction(db, () => writeMap(db, goal.id, fromDiary));
  console.log(`  rebuilt: ${fromDiary.concepts.length} concepts, ${fromDiary.edges.length} edges`);
}

console.log(mismatches === 0 ? "All maps match their diaries." : `Rebuilt ${mismatches} map(s).`);
