// Evaluates the tutor: replays each scripted case in tutor/, checks the transcript against the
// teaching rules (in code where possible, by the judge for all), saves the verdicts, and prints a
// table of pass rates per rule for each tutor prompt version.
//   pnpm --filter @helix/evals tutor                       every case, once
//   pnpm --filter @helix/evals tutor --case signals-new-learner --runs 3
//   pnpm --filter @helix/evals tutor --table               just the table: no calls, no cost
// Models come from the settings tab (teaching runs the session, evaluation judges); --model and
// --judge-model override them. Each needs its key in apps/server/.env, or its subscription tool
// installed and signed in.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { ModelId, TutorRule } from "@helix/contracts";
import { callModel, getSettings, missingSetup, openDatabase } from "@helix/server";
import { RESULTS_DIR, fileTag, short } from "./results.ts";
import { loadTutorCases, runTutorCase, type TutorRun } from "./run-tutor-case.ts";

const { values } = parseArgs({
  options: {
    case: { type: "string" },
    runs: { type: "string", default: "1" },
    model: { type: "string" },
    "judge-model": { type: "string" },
    table: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type SavedTutorFile = { date: string; runs: TutorRun[] };

// One row per (results file, tutor prompt version): the share of applicable verdicts that passed,
// per rule, from the judge; code-checked rules show "judge/code".
function table(): string {
  let files: string[] = [];
  try {
    files = readdirSync(RESULTS_DIR).filter((f) => f.startsWith("tutor-") && f.endsWith(".json")).sort();
  } catch {
    return "No tutor results yet.";
  }
  const rules = TutorRule.options;
  const header = ["date", "tutor prompt", "tutor model", "judge prompt", ...rules.map((r) => r.replace(/_/g, " "))];
  const rows = files.map((f) => {
    const saved = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")) as SavedTutorFile;
    const first = saved.runs[0];
    const rate = (verdicts: { verdict: string }[]) => {
      const applicable = verdicts.filter((v) => v.verdict !== "not_applicable");
      return applicable.length ? `${Math.round((100 * applicable.filter((v) => v.verdict === "pass").length) / applicable.length)}%` : "–";
    };
    const cells = rules.map((rule) => {
      const judged = rate(saved.runs.flatMap((r) => r.judge.filter((v) => v.rule === rule)));
      const coded = saved.runs.flatMap((r) => r.code.filter((v) => v.rule === rule));
      return coded.length ? `${judged}/${rate(coded)}` : judged;
    });
    return [saved.date.slice(0, 16), first?.tutorPromptVersion ?? "?", short(first?.tutorModel ?? "?"), first?.judgePromptVersion ?? "?", ...cells];
  });
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();
  return ["Pass rate per rule (judge/code where code also checks it)", line(header), ...rows.map(line)].join("\n");
}

if (values.table) {
  console.log(table());
  process.exit(0);
}

// ---- Guard clauses ----

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a whole number, 1 or more.");
const settings = getSettings(openDatabase());
const tutorModel = ModelId.safeParse(values.model ?? settings.models.teaching);
const judgeModel = ModelId.safeParse(values["judge-model"] ?? settings.models.evaluation);
if (!tutorModel.success || !judgeModel.success) fail("--model and --judge-model take a model id: claude-opus-5-5, or <connection>:<model> such as codex:gpt-6.1-sol.");
for (const id of [tutorModel.data, judgeModel.data]) {
  const missing = missingSetup(id);
  if (missing) fail(missing);
}

let cases;
try {
  cases = loadTutorCases(undefined, values.case);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

// ---- Run ----

const date = new Date().toISOString();
const results: TutorRun[] = [];
for (const c of cases) {
  for (let run = 1; run <= runs; run += 1) {
    const label = `[${c.name} ${run}/${runs}]`;
    try {
      const result = await runTutorCase(c, { callModel, tutorModel: tutorModel.data, judgeModel: judgeModel.data, log: (line) => console.log(`  ${label} ${line}`) });
      results.push(result);
      console.log(`${label} ${result.ended ? "session ended" : "script ran out first"}, ${result.learnerTurnsUsed} learner turns, $${result.costUsd.toFixed(2)}`);
      for (const v of [...result.code.map((v) => ({ ...v, by: "code" })), ...result.judge.map((v) => ({ ...v, by: "judge" }))]) {
        console.log(`    ${v.by.padEnd(5)} ${v.rule.padEnd(22)} ${v.verdict.padEnd(14)} ${v.evidence}`);
      }
    } catch (err) {
      console.error(`${label} failed, not saved: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

if (results.length === 0) fail("Every run failed; nothing was saved.");
mkdirSync(RESULTS_DIR, { recursive: true });
const version = results[0]!.tutorPromptVersion.split("@")[1] ?? "none";
const file = join(RESULTS_DIR, `tutor-${date.slice(0, 16).replace("T", "-").replace(":", "")}-${version}-${fileTag(short(tutorModel.data))}.json`);
writeFileSync(file, `${JSON.stringify({ date, runs: results } satisfies SavedTutorFile, null, 2)}\n`);
console.log(`\nSaved ${file}\n`);
console.log(table());
