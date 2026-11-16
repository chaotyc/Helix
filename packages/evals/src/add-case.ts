// Adds one of your goals as an evaluation case (V5), so the eval can rebuild and judge its map.
//   pnpm --filter @helix/evals add-case --goal "Signals"           (id or part of the title)
//   pnpm --filter @helix/evals add-case --goal "Signals" --force   (overwrite an existing case)
// Writes packages/evals/cases/<name>.json (and <name>.source.md); review it before committing.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { answersForGoal, getSource, listGoals, openDatabase, readMapEvents } from "@helix/server";
import { CASES_DIR, EvalCase } from "./cases.ts";
import { caseFromGoal } from "./case-from-goal.ts";

const { values } = parseArgs({ options: { goal: { type: "string" }, force: { type: "boolean", default: false } } });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!values.goal) fail('Usage: add-case --goal <id or part of the title> [--force]');

const db = openDatabase();
const query = values.goal.toLowerCase();
const matches = listGoals(db).filter((g) => g.id === values.goal || g.title.toLowerCase().includes(query));
if (matches.length !== 1) {
  console.error(matches.length === 0 ? `No goal matches "${values.goal}".` : `"${values.goal}" matches several goals:`);
  for (const g of matches.length ? matches : listGoals(db)) console.error(`  ${g.id}  ${g.title}`);
  process.exit(1);
}
const goal = matches[0]!;

// The source the goal's latest map was built from.
const lastExtract = readMapEvents(db).findLast((e) => e.op === "extract" && e.goalId === goal.id);
if (!lastExtract) fail(`"${goal.title}" has no map yet. Build one first: the case uses its source and your answers.`);
const source = lastExtract.sourceId ? getSource(db, lastExtract.sourceId) : undefined;

const { case: built, sourceFile } = caseFromGoal(goal, source, answersForGoal(db, goal.id));
const checked = EvalCase.safeParse(built); // what we write must load back (rule 2)
if (!checked.success) fail(`The case doesn't match the case format: ${checked.error.message}`);

const casePath = join(CASES_DIR, `${built.name}.json`);
if (existsSync(casePath) && !values.force) fail(`cases/${built.name}.json already exists. Use --force to overwrite it.`);

writeFileSync(casePath, `${JSON.stringify(checked.data, null, 2)}\n`);
if (sourceFile) writeFileSync(join(CASES_DIR, sourceFile.name), sourceFile.text);
console.log(`Wrote cases/${built.name}.json${sourceFile ? ` and cases/${sourceFile.name}` : " (no source)"}, with ${built.answers.length} answers.`);
console.log(`Run it: pnpm --filter @helix/evals maps --case ${built.name}`);
