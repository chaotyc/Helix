// Saved evaluation runs and the table that compares them. Results are committed (J11), so
// the history of scores travels with the prompts that produced them.
//
// Scores are only comparable when the same judge produced them: a new judge prompt or judge
// model can change the numbers by itself. So the table groups runs by judge.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { spread } from "./score.ts";
import type { CaseRun } from "./run-case.ts";

export const RESULTS_DIR = join(import.meta.dirname, "../results");

export type ResultsFile = {
  date: string; // ISO timestamp of the run
  effort: string;
  judgeEffort: string;
  runs: CaseRun[];
};

// Only what the table reads is checked; the rest of each run is kept as saved.
const SavedRun = z.looseObject({
  case: z.string(),
  extractPromptVersion: z.string(),
  judgePromptVersion: z.string(),
  extractModel: z.string(),
  judgeModel: z.string(),
  score: z.looseObject({ majorsPer10: z.number(), majors: z.number(), minors: z.number(), warnings: z.number(), concepts: z.number() }),
  costUsd: z.number(),
});
const SavedFile = z.object({ date: z.string(), effort: z.string(), judgeEffort: z.string(), runs: z.array(SavedRun) });
type SavedFile = z.infer<typeof SavedFile>;

// maps-2026-11-11-1402-776cb030-opus-5-5.json: when, which extraction prompt version, which model.
export function saveResults(results: ResultsFile, dir = RESULTS_DIR): string {
  mkdirSync(dir, { recursive: true });
  const stamp = results.date.slice(0, 16).replace("T", "-").replace(":", "");
  const version = results.runs[0]?.extractPromptVersion.split("@")[1] ?? "none";
  const model = fileTag(short(results.runs[0]?.extractModel ?? "none"));
  const file = join(dir, `maps-${stamp}-${version}-${model}.json`);
  writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
  return file;
}

export function loadResults(dir = RESULTS_DIR): SavedFile[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("maps-") && f.endsWith(".json")).sort();
  } catch {
    return []; // no results yet
  }
  return files.flatMap((f) => {
    const parsed = SavedFile.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) {
      console.warn(`Skipping results/${f}: it doesn't match the results format.`);
      return [];
    }
    return [parsed.data];
  });
}

// "opus-5-5" for Claude by API key (a bare id); any other route keeps its prefix ("codex:gpt-6-luna").
export function short(model: string): string {
  return model.includes(":") ? model : model.replace(/^claude-/, "");
}

// A model id as part of a file name: runs of different models in the same minute get their own files.
export function fileTag(model: string): string {
  return model.replace(/[^\w.-]+/g, "_");
}

function pad(cells: string[], widths: number[]): string {
  return cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd();
}

// One row per (results file, case): the mean over that file's runs of the case.
export function comparisonTable(files: SavedFile[]): string {
  if (files.length === 0) return "No results yet.";

  type Row = { judge: string; cells: string[] };
  const rows: Row[] = [];
  for (const file of files) {
    const byCase = Map.groupBy(file.runs, (r) => r.case);
    for (const [caseName, runs] of byCase) {
      const first = runs[0]!;
      const headline = spread(runs.map((r) => r.score.majorsPer10));
      const headlineText =
        runs.length > 1
          ? `${headline.mean.toFixed(1)} (${headline.min.toFixed(1)}–${headline.max.toFixed(1)})`
          : headline.mean.toFixed(1);
      rows.push({
        judge: `${first.judgePromptVersion} on ${short(first.judgeModel)}, effort ${file.judgeEffort}`,
        cells: [
          file.date.slice(0, 16).replace("T", " "),
          first.extractPromptVersion,
          short(first.extractModel),
          file.effort,
          caseName,
          String(runs.length),
          String(Math.round(spread(runs.map((r) => r.score.concepts)).mean)),
          headlineText,
          spread(runs.map((r) => r.score.minors)).mean.toFixed(1),
          spread(runs.map((r) => r.score.warnings)).mean.toFixed(1),
          `$${runs.reduce((sum, r) => sum + r.costUsd, 0).toFixed(2)}`,
        ],
      });
    }
  }

  const header = ["date", "extract prompt", "model", "effort", "case", "runs", "concepts", "majors/10", "minors", "warnings", "cost"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r.cells[i]!.length)));

  const lines: string[] = [];
  for (const [judge, group] of Map.groupBy(rows, (r) => r.judge)) {
    lines.push("", `Judge: ${judge} (scores in this group are comparable)`);
    lines.push(pad(header, widths));
    for (const row of group) lines.push(pad(row.cells, widths));
  }
  return lines.join("\n").trimStart();
}
