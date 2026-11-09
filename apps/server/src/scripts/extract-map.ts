// Builds a course's map with Claude from the command line: first up to 3 clarifying questions,
// answered here in the terminal, then the map.
//   pnpm --filter @helix/server extract-map --goal "Signals" --file syllabus.txt --kind syllabus
//   pnpm --filter @helix/server extract-map --goal "Signals" --effort medium     (no source: goal and answers only)
// --goal takes a goal id or part of its title. --kind: syllabus | contents | notes | other (default).
// Needs ANTHROPIC_API_KEY in apps/server/.env.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { Effort, SourceKind } from "@helix/contracts";
import { callClaude } from "../ai/claude.ts";
import { clarifyMap } from "../ai/clarification/clarify-map.ts";
import { extractMap } from "../ai/extraction/extract-map.ts";
import { openDatabase } from "../db/open.ts";
import { listGoals } from "../db/goals.ts";
import { askQuestions } from "./ask-questions.ts";

const { values } = parseArgs({
  options: {
    goal: { type: "string" },
    file: { type: "string" },
    kind: { type: "string", default: "other" },
    effort: { type: "string", default: "high" },
  },
});

const db = openDatabase();

// ---- Guard clauses: check the arguments before spending anything ----

if (!values.goal) {
  console.error('Usage: extract-map --goal <id or title> [--file syllabus.txt] [--kind syllabus|contents|notes|other] [--effort low|medium|high|xhigh|max]');
  process.exit(1);
}

const query = values.goal.toLowerCase();
const matches = listGoals(db).filter((g) => g.id === values.goal || g.title.toLowerCase().includes(query));
if (matches.length !== 1) {
  console.error(matches.length === 0 ? `No goal matches "${values.goal}".` : `"${values.goal}" matches several goals:`);
  for (const g of matches.length ? matches : listGoals(db)) console.error(`  ${g.id}  ${g.title}`);
  process.exit(1);
}
const goal = matches[0]!;

const effort = Effort.safeParse(values.effort);
if (!effort.success) {
  console.error(`--effort must be one of: ${Effort.options.join(", ")}`);
  process.exit(1);
}

const kind = SourceKind.safeParse(values.kind);
if (!kind.success) {
  console.error(`--kind must be one of: ${SourceKind.options.join(", ")}`);
  process.exit(1);
}

// pnpm runs scripts from apps/server; INIT_CWD is the folder you ran the command from.
const sourceText = values.file
  ? readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), values.file), "utf8")
  : undefined;

// ---- Run ----

const runStart = new Date().toISOString();
const onProgress = (stage: string, detail: string) => console.log(`  [${stage}] ${detail}`);
const terminal = createInterface({ input: process.stdin, output: process.stdout });

console.log(`Building a map for "${goal.title}" ${sourceText ? `from ${values.file} (${kind.data})` : "from the goal and your answers"}…`);
try {
  console.log("Choosing clarifying questions…");
  const round = await clarifyMap(db, { goalId: goal.id, sourceText, sourceKind: kind.data }, { callModel: callClaude, onProgress });
  const answers = await askQuestions(round.questions, (prompt) => terminal.question(prompt), console.log);
  terminal.close();

  console.log("\nBuilding the map…");
  const map = await extractMap(
    db,
    { goalId: goal.id, roundId: round.roundId, answers, effort: effort.data },
    { callModel: callClaude, onProgress },
  );
  const cost = db
    .prepare("SELECT SUM(cost_usd) AS cost FROM ai_call WHERE goal_id = $goalId AND started_at >= $since")
    .get({ goalId: goal.id, since: runStart });
  console.log(`Done: ${map.concepts.length} concepts, ${map.edges.length} arrows. Cost of this run: $${Number(cost?.cost ?? 0).toFixed(2)}`);
  for (const entry of map.view) {
    const c = map.concepts.find((x) => x.id === entry.conceptId);
    console.log(`  ${entry.role === "background" ? "(bg) " : "     "}${c?.name ?? entry.conceptId} → depth ${entry.targetDepth}`);
  }
} catch (err) {
  terminal.close();
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("No ANTHROPIC_API_KEY found. Copy apps/server/.env.example to apps/server/.env and add your key.");
  }
  process.exit(1);
}
