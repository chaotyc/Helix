// Scores the grader against your labeled answers in gold/grader.json: accuracy, false passes,
// false fails, and error-tag agreement, per grader prompt version.
//   pnpm --filter @helix/evals grader                 every case, once
//   pnpm --filter @helix/evals grader --runs 3        each case 3 times (graders vary run to run)
//   pnpm --filter @helix/evals grader --table         just the table of saved runs: no calls, no cost
// The model comes from the settings tab (teaching); --model overrides it. Needs that model's key
// in apps/server/.env, or its subscription tool installed and signed in.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Effort, ModelId } from "@helix/contracts";
import { callModel, getSettings, gradeAnswer, missingSetup, openDatabase } from "@helix/server";
import { MAX_FALSE_PASS, MIN_ACCURACY, loadGraderCases, scoreGrader, type Graded, type GraderScore } from "./grader-score.ts";
import { RESULTS_DIR, fileTag, short } from "./results.ts";

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "1" },
    effort: { type: "string", default: "medium" },
    model: { type: "string" },
    case: { type: "string" },
    table: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type SavedGraderRun = { date: string; promptVersion: string; model: string; effort: string; score: GraderScore; costUsd: number; graded: Graded[] };

function table(): string {
  let files: string[] = [];
  try {
    files = readdirSync(RESULTS_DIR).filter((f) => f.startsWith("grader-") && f.endsWith(".json")).sort();
  } catch {
    return "No grader results yet.";
  }
  const pct = (x: number | null) => (x === null ? "  –" : `${Math.round(x * 100)}%`.padStart(4));
  const rows = files.map((f) => {
    const r = JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")) as SavedGraderRun;
    const s = r.score;
    return `${r.date.slice(0, 16)}  ${r.promptVersion.padEnd(16)}  ${short(r.model).padEnd(28)}  ${String(s.cases).padStart(5)}  ${pct(s.accuracy)}  ${pct(s.falsePass)}  ${pct(s.falseFail)}  ${pct(s.tagAgreement)}  ${s.meetsBar ? "yes" : "no"}`;
  });
  return [
    `Bar: accuracy ≥ ${MIN_ACCURACY * 100}%, false passes ≤ ${MAX_FALSE_PASS * 100}%`,
    "date              prompt            model                         cases   acc  fpass ffail   tag  bar",
    ...rows,
  ].join("\n");
}

if (values.table) {
  console.log(table());
  process.exit(0);
}

// ---- Guard clauses: check everything before spending anything ----

const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) fail("--runs must be a whole number, 1 or more.");
const effort = Effort.safeParse(values.effort);
if (!effort.success) fail(`--effort must be one of: ${Effort.options.join(", ")}`);
const model = ModelId.safeParse(values.model ?? getSettings(openDatabase()).models.teaching);
if (!model.success) fail("--model takes a model id: claude-opus-5-5, or <connection>:<model> such as codex:gpt-6.1-sol.");
const missing = missingSetup(model.data);
if (missing) fail(missing);

let cases = loadGraderCases();
if (values.case) cases = cases.filter((c) => c.id === values.case);
if (cases.length === 0) fail(`No case with id ${values.case}`);

// ---- Run: each grading in its own empty database, so only its own calls are logged ----

console.log(`Grading ${cases.length} labeled answer(s) × ${runs} run(s) with ${model.data} (effort ${effort.data}).`);
const graded: Graded[] = [];
let promptVersion = "";
let costUsd = 0;

for (const c of cases) {
  for (let run = 1; run <= runs; run += 1) {
    const db = openDatabase(":memory:");
    try {
      const result = await gradeAnswer(
        db,
        {
          concept: { id: c.id, ...c.concept },
          depth: c.depth,
          question: { prompt: c.question, rubric: c.rubric, expectedAnswer: c.expectedAnswer },
          answer: c.answer,
          confidence: c.confidence,
          misconceptions: c.misconceptions,
        },
        { callModel, model: model.data, effort: effort.data },
      );
      promptVersion = result.promptVersion;
      graded.push({ caseId: c.id, label: c.label, correct: result.grade.correct, errorTag: result.grade.errorTag });
      const agrees = result.grade.correct === c.label.correct;
      console.log(
        `[${c.id} ${run}/${runs}] ${agrees ? "agrees" : "DISAGREES"}: graded ${result.grade.correct ? "right" : `wrong (${result.grade.errorTag})`}, label ${c.label.correct ? "right" : `wrong (${c.label.errorTag})`}`,
      );
      if (!agrees) console.log(`    ${result.grade.explanation}`);
    } catch (err) {
      console.error(`[${c.id} ${run}/${runs}] failed, not counted: ${err instanceof Error ? err.message : String(err)}`);
    }
    const cost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_call").get();
    costUsd += Number(cost?.cost ?? 0);
  }
}

if (graded.length === 0) fail("Every grading failed; nothing was saved.");
const score = scoreGrader(graded);
const date = new Date().toISOString();
mkdirSync(RESULTS_DIR, { recursive: true });
const file = join(RESULTS_DIR, `grader-${date.slice(0, 16).replace("T", "-").replace(":", "")}-${promptVersion.split("@")[1]}-${fileTag(short(model.data))}.json`);
const saved: SavedGraderRun = { date, promptVersion, model: model.data, effort: effort.data, score, costUsd, graded };
writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`);
console.log(`\nCost $${costUsd.toFixed(2)}. Saved ${file}\n`);
console.log(table());
