// Evaluates the grader with no labeled answers: for a spread of concepts and depths from the
// maps the map eval built, the item writer writes a question, a simulated learner answers it in
// eight ways, the grader grades each answer, and a judge decides whether each grade is right.
// Scores: share of grades the judge accepts, false passes, false fails, error-tag agreement.
//   pnpm --filter @helix/evals grader                     4 questions × 8 answers, once
//   pnpm --filter @helix/evals grader --size 8 --runs 2   8 questions per run; run 2 picks new ones
//   pnpm --filter @helix/evals grader --table             just the table of saved runs: no calls, no cost
// Needs a saved map: run `pnpm --filter @helix/evals maps` first (the newest map of each case is
// used; --maps <file in results/> picks one file).
// Models come from the settings tab (teaching writes questions and grades, evaluation simulates
// the learner and judges); --model, --learner-model, and --judge-model override them. Each needs
// its key in apps/server/.env, or its subscription tool installed and signed in.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Effort, ModelId } from "@helix/contracts";
import { callModel, getSettings, missingSetup, openDatabase } from "@helix/server";
import { loadCases } from "./cases.ts";
import { limitCalls, loadMapSources, runGraderItem, type GraderItemRun } from "./grader-run.ts";
import { graderTable, pickItems, scoreGrader, type GraderRunSummary, type GraderScore } from "./grader-score.ts";
import { RESULTS_DIR, fileTag, short } from "./results.ts";

const { values } = parseArgs({
  options: {
    size: { type: "string", default: "4" },
    runs: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    parallel: { type: "string", default: "4" },
    effort: { type: "string", default: "medium" },
    "judge-effort": { type: "string", default: "high" },
    model: { type: "string" },
    "learner-model": { type: "string" },
    "judge-model": { type: "string" },
    maps: { type: "string" },
    table: { type: "boolean", default: false },
  },
});

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

type SavedGraderFile = GraderRunSummary & {
  effort: string;
  size: number;
  runs: number;
  seed: number;
  maps: { case: string; file: string; extractPromptVersion: string; extractModel: string }[];
  score: GraderScore;
  items: GraderItemRun[];
};

// Saved runs in the current format. Older files (scored against hand labels) are skipped.
const SavedSummary = z.looseObject({
  date: z.string(),
  graderPromptVersion: z.string(),
  graderModel: z.string(),
  itemPromptVersion: z.string(),
  learnerPromptVersion: z.string(),
  learnerModel: z.string(),
  judgePromptVersion: z.string(),
  judgeModel: z.string(),
  judgeEffort: z.string(),
  questions: z.number(),
  score: z.looseObject({
    graded: z.number(),
    accepted: z.number(),
    falsePass: z.number(),
    falseFail: z.number(),
    tagAgreement: z.number().nullable(),
    unsoundRubrics: z.number(),
    meetsBar: z.boolean(),
  }),
  costUsd: z.number(),
});

function table(): string {
  let files: string[] = [];
  try {
    files = readdirSync(RESULTS_DIR).filter((f) => f.startsWith("grader-") && f.endsWith(".json")).sort();
  } catch {
    return "No grader results yet.";
  }
  let skipped = 0;
  const runs = files.flatMap((f) => {
    const parsed = SavedSummary.safeParse(JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf8")));
    if (!parsed.success) skipped += 1;
    return parsed.success ? [parsed.data] : [];
  });
  const note = skipped ? `\n\n(${skipped} older run(s) scored against hand labels are not shown.)` : "";
  return graderTable(runs, short) + note;
}

if (values.table) {
  console.log(table());
  process.exit(0);
}

// ---- Guard clauses: check everything before spending anything ----

const whole = (name: string, value: string | undefined, min: number) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) fail(`--${name} must be a whole number, ${min} or more.`);
  return n;
};
const size = whole("size", values.size, 1);
const runs = whole("runs", values.runs, 1);
const seed = whole("seed", values.seed, 1);
const parallel = whole("parallel", values.parallel, 1);
const effort = Effort.safeParse(values.effort);
const judgeEffort = Effort.safeParse(values["judge-effort"]);
if (!effort.success || !judgeEffort.success) fail(`--effort and --judge-effort must be one of: ${Effort.options.join(", ")}`);

const settings = getSettings(openDatabase());
const model = ModelId.safeParse(values.model ?? settings.models.teaching);
const judgeModel = ModelId.safeParse(values["judge-model"] ?? settings.models.evaluation);
const learnerModel = ModelId.safeParse(values["learner-model"] ?? values["judge-model"] ?? settings.models.evaluation);
if (!model.success || !judgeModel.success || !learnerModel.success) {
  fail("--model, --learner-model, and --judge-model take a model id: claude-opus-5-5, or <connection>:<model> such as codex:gpt-6.1-sol.");
}
for (const id of new Set([model.data, judgeModel.data, learnerModel.data])) {
  const missing = missingSetup(id);
  if (missing) fail(missing);
}

const sources = loadMapSources(undefined, values.maps);
if (sources.size === 0) {
  fail(values.maps ? `No saved map in results/${values.maps}.` : "No saved map yet: run `pnpm --filter @helix/evals maps` first.");
}
const cases = new Map(loadCases().map((c) => [c.name, c]));
const usable = [...sources.values()].filter((s) => cases.has(s.case));
if (usable.length === 0) fail("None of the saved maps belongs to a case in cases/.");
const entries = usable.flatMap((s) => s.map.view.map((v) => ({ case: s.case, conceptId: v.conceptId, targetDepth: v.targetDepth })));

// ---- Run: every question at once; limitCalls keeps `parallel` model calls going ----

const limited = limitCalls(callModel, parallel);
console.log(
  `Grading ${size} question(s) × 8 answers × ${runs} run(s): ${model.data} writes and grades (effort ${effort.data}), ` +
    `${learnerModel.data} answers, ${judgeModel.data} judges (effort ${judgeEffort.data}). Maps: ${usable.map((s) => `${s.case} from ${s.file}`).join(", ")}.`,
);
const date = new Date().toISOString();
const jobs = Array.from({ length: runs }, (_, r) =>
  pickItems(entries, size, seed + r).map(async (pick, i) => {
    const label = `[run ${r + 1} q${i + 1} ${pick.conceptId}@${pick.depth}]`;
    try {
      return await runGraderItem(pick, cases.get(pick.case)!, sources.get(pick.case)!, {
        callModel: limited,
        model: model.data,
        learnerModel: learnerModel.data,
        judgeModel: judgeModel.data,
        effort: effort.data,
        judgeEffort: judgeEffort.data,
        run: r + 1,
        log: (line) => console.log(`${label} ${line}`),
      });
    } catch (err) {
      console.error(`${label} failed, not counted: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }),
).flat();
const items = (await Promise.all(jobs)).filter((x): x is GraderItemRun => x !== null && x.answers.length > 0);

if (items.length === 0) fail("Every question failed; nothing was saved.");
const score = scoreGrader(
  items.flatMap((it) =>
    it.answers.map((a) => ({
      kind: a.kind,
      gradedCorrect: a.grade.correct,
      verdict: a.judgment.verdict,
      tagFits: a.judgment.tagFits,
      rubricSound: a.judgment.rubricSound,
    })),
  ),
);
const first = items[0]!;
const costUsd = items.reduce((sum, it) => sum + it.costUsd, 0);
const saved: SavedGraderFile = {
  date,
  graderPromptVersion: first.versions.grader,
  graderModel: first.models.grader,
  itemPromptVersion: first.versions.item,
  learnerPromptVersion: first.versions.learner,
  learnerModel: first.models.learner,
  judgePromptVersion: first.versions.judge,
  judgeModel: first.models.judge,
  effort: effort.data,
  judgeEffort: judgeEffort.data,
  size,
  runs,
  seed,
  questions: items.length,
  maps: usable.map(({ map: _map, ...rest }) => rest),
  score,
  costUsd,
  items,
};
mkdirSync(RESULTS_DIR, { recursive: true });
const stamp = date.slice(0, 16).replace("T", "-").replace(":", "");
const file = join(RESULTS_DIR, `grader-${stamp}-${saved.graderPromptVersion.split("@")[1]}-${fileTag(short(model.data))}.json`);
writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`);

const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`\nBy kind of answer (the kind steers the simulated learner; the judge decides):`);
for (const [kind, k] of Object.entries(score.byKind)) {
  console.log(`  ${kind.padEnd(30)} ${String(k.graded).padStart(3)} graded, ${pct(k.accepted / k.graded).padStart(4)} accepted, ${k.falsePasses} false pass, ${k.falseFails} false fail`);
}
console.log(`\nCost $${costUsd.toFixed(2)}. Saved ${file}\n`);
console.log(table());
