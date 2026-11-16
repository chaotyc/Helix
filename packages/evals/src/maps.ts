// Evaluates map extraction: builds a map for every case, has the judge check it, runs the
// rule checks, saves the scores, and prints a table comparing every saved run.
//   pnpm --filter @helix/evals maps                          every case, once
//   pnpm --filter @helix/evals maps --case signals-demo --runs 3
//   pnpm --filter @helix/evals maps --table                  just the table: no calls, no cost
// Models come from the settings tab (generation builds, evaluation judges); --model and
// --judge-model override them for one run. Needs ANTHROPIC_API_KEY in apps/server/.env.
import { parseArgs } from "node:util";
import { Effort, ModelId } from "@helix/contracts";
import { callClaude, getSettings, openDatabase } from "@helix/server";
import { loadCases } from "./cases.ts";
import { comparisonTable, loadResults, saveResults } from "./results.ts";
import { runCase, type CaseRun } from "./run-case.ts";

const { values } = parseArgs({
  options: {
    case: { type: "string" },
    runs: { type: "string", default: "1" },
    effort: { type: "string", default: "high" },
    "judge-effort": { type: "string", default: "xhigh" },
    model: { type: "string" },
    "judge-model": { type: "string" },
    table: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (values.table) {
  console.log(comparisonTable(loadResults()));
  process.exit(0);
}

// ---- Guard clauses: check everything before spending anything ----

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a whole number, 1 or more.");
const effort = Effort.safeParse(values.effort);
const judgeEffort = Effort.safeParse(values["judge-effort"]);
if (!effort.success || !judgeEffort.success) fail(`--effort and --judge-effort must be one of: ${Effort.options.join(", ")}`);

const settings = getSettings(openDatabase()); // your settings tab's choices
const model = ModelId.safeParse(values.model ?? settings.models.generation);
const judgeModel = ModelId.safeParse(values["judge-model"] ?? settings.models.evaluation);
if (!model.success || !judgeModel.success) fail(`--model and --judge-model must be one of: ${ModelId.options.join(", ")}`);

if (!process.env.ANTHROPIC_API_KEY) fail("No ANTHROPIC_API_KEY found. Copy apps/server/.env.example to apps/server/.env and add your key.");

let cases;
try {
  cases = loadCases(undefined, values.case);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

// ---- Run ----

console.log(`Evaluating ${cases.length} case(s) × ${runs} run(s): ${model.data} builds (effort ${effort.data}), ${judgeModel.data} judges (effort ${judgeEffort.data}).`);
const date = new Date().toISOString();
const results: CaseRun[] = [];

for (const c of cases) {
  for (let run = 1; run <= runs; run += 1) {
    const label = `[${c.name} ${run}/${runs}]`;
    try {
      const result = await runCase(c, {
        callModel: callClaude,
        model: model.data,
        judgeModel: judgeModel.data,
        effort: effort.data,
        judgeEffort: judgeEffort.data,
        run,
        onProgress: (stage, detail) => console.log(`  ${label} ${stage}: ${detail}`),
      });
      results.push(result);
      const s = result.score;
      console.log(`${label} ${s.concepts} concepts, ${s.majors} major / ${s.minors} minor problems, ${s.warnings} warnings, $${result.costUsd.toFixed(2)}`);
      for (const p of result.problems) console.log(`    ${p.severity === "major" ? "MAJOR" : "minor"} ${p.type} [${p.conceptIds.join(", ")}]: ${p.reason}`);
      for (const w of result.warnings) console.log(`    warning ${w.rule}: ${w.message}`);
    } catch (err) {
      console.error(`${label} failed, not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

if (results.length === 0) fail("Every run failed; nothing was saved.");
const file = saveResults({ date, effort: effort.data, judgeEffort: judgeEffort.data, runs: results });
console.log(`\nSaved ${file}\n`);
console.log(comparisonTable(loadResults()));
