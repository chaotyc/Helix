// Builds a course's map with Claude from the command line.
//   pnpm --filter @helix/server extract-map --goal "Signals" --file syllabus.txt
//   pnpm --filter @helix/server extract-map --goal "Signals" --effort medium     (no source: goal only)
// --goal takes a goal id or part of its title. Needs ANTHROPIC_API_KEY in apps/server/.env.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Effort } from "@helix/contracts";
import { callClaude } from "../ai/claude.ts";
import { extractMap } from "../ai/extraction/extract-map.ts";
import { openDatabase } from "../db/open.ts";
import { listGoals } from "../db/goals.ts";

const { values } = parseArgs({
  options: {
    goal: { type: "string" },
    file: { type: "string" },
    effort: { type: "string", default: "high" },
  },
});

const db = openDatabase();

// ---- Guard clauses: check the arguments before spending anything ----

if (!values.goal) {
  console.error('Usage: extract-map --goal <id or title> [--file syllabus.txt] [--effort low|medium|high|xhigh|max]');
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

// pnpm runs scripts from apps/server; INIT_CWD is the folder you ran the command from.
const sourceText = values.file
  ? readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), values.file), "utf8")
  : undefined;

// ---- Run ----

console.log(`Extracting a map for "${goal.title}" ${sourceText ? `from ${values.file}` : "from the goal alone"}…`);
try {
  const map = await extractMap(
    db,
    { goalId: goal.id, sourceText, effort: effort.data },
    { callModel: callClaude, onProgress: (stage, detail) => console.log(`  [${stage}] ${detail}`) },
  );
  const cost = db
    .prepare("SELECT SUM(cost_usd) AS cost FROM ai_call WHERE goal_id = $goalId AND started_at >= $since")
    .get({ goalId: goal.id, since: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
  console.log(`Done: ${map.concepts.length} concepts, ${map.edges.length} arrows. Cost this hour: $${Number(cost?.cost ?? 0).toFixed(2)}`);
  for (const entry of map.view) {
    const c = map.concepts.find((x) => x.id === entry.conceptId);
    console.log(`  ${entry.role === "background" ? "(bg) " : "     "}${c?.name ?? entry.conceptId} → depth ${entry.targetDepth}`);
  }
} catch (err) {
  console.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("No ANTHROPIC_API_KEY found. Copy apps/server/.env.example to apps/server/.env and add your key.");
  }
  process.exit(1);
}
