// Scoring the grader by a judge's verdicts. Pure functions: the script runs the calls.
//
// No labels: a simulated learner writes answers of assigned kinds (a slip, a misconception, ...),
// the grader grades each, and a judge decides whether each grade is right. The assigned kind only
// steers what gets written; it is never compared with the grade. Only the judge's verdict counts.
//
// Two kinds of mistakes, like a detector's false alarms and misses:
//   false pass  a wrong answer graded right: the learner model believes something that isn't so,
//               and the tutor moves on too early. The costlier mistake.
//   false fail  a right answer graded wrong: the learner is held back and loses trust.
// "Wrong" and "right" here are the judge's reading of the answer.
import type { AnswerKind, GradeVerdict, GraderJudgment } from "@helix/contracts";

// The bar for trusting the grader (default; yours to change).
export const MIN_ACCEPTED = 0.9;
export const MAX_FALSE_PASS = 0.05;

// ---- Picking what to test ----

export type ConceptEntry = { case: string; conceptId: string; targetDepth: number };
export type ItemPick = { case: string; conceptId: string; depth: number };

// A small seeded random number generator (mulberry32): the same seed gives the same picks, so a
// run can be repeated exactly. Returns numbers in [0, 1).
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `size` (concept, depth) pairs spread over the maps: depths taken in turn (1, 2, 3, ... starting
// where the seed says), each with a random concept whose target depth reaches it, and no concept
// twice until every concept that fits has been used.
export function pickItems(entries: ConceptEntry[], size: number, seed: number): ItemPick[] {
  const rand = seededRandom(seed);
  const key = (e: ConceptEntry) => `${e.case}/${e.conceptId}`;
  const sorted = [...entries].sort((a, b) => key(a).localeCompare(key(b))); // input order doesn't matter
  const depths = [1, 2, 3, 4, 5].filter((d) => sorted.some((e) => e.targetDepth >= d));
  if (depths.length === 0) return [];

  const used = new Set<string>();
  const picks: ItemPick[] = [];
  for (let i = 0; i < size; i += 1) {
    const depth = depths[(i + seed - 1) % depths.length]!;
    const fits = sorted.filter((e) => e.targetDepth >= depth);
    const fresh = fits.filter((e) => !used.has(key(e)));
    const pool = fresh.length ? fresh : fits;
    const e = pool[Math.floor(rand() * pool.length)]!;
    used.add(key(e));
    picks.push({ case: e.case, conceptId: e.conceptId, depth });
  }
  return picks;
}

// ---- Scoring ----

export type Judged = {
  kind: AnswerKind;
  gradedCorrect: boolean;
  verdict: GradeVerdict;
  tagFits: GraderJudgment["tagFits"];
  rubricSound: boolean;
};

export type KindCounts = { graded: number; accepted: number; falsePasses: number; falseFails: number };

export type GraderScore = {
  graded: number;
  accepted: number; // share of grades the judge accepts
  falsePass: number; // share of answers the judge calls wrong that were graded right
  falseFail: number; // share of answers the judge calls right that were graded wrong
  tagAgreement: number | null; // among answers both call wrong, share whose error tag the judge accepts
  unsoundRubrics: number; // share of grades on a question whose rubric the judge called unsound
  meetsBar: boolean;
  byKind: Partial<Record<AnswerKind, KindCounts>>; // where the misses come from
};

export function scoreGrader(judged: Judged[]): GraderScore {
  const rate = (hits: number, total: number) => (total === 0 ? 0 : hits / total);
  const count = (pred: (j: Judged) => boolean) => judged.filter(pred).length;

  const falsePasses = count((j) => j.verdict === "false_pass");
  const falseFails = count((j) => j.verdict === "false_fail");
  const judgeWrong = falsePasses + count((j) => !j.gradedCorrect && j.verdict === "right");
  const judgeRight = falseFails + count((j) => j.gradedCorrect && j.verdict === "right");
  const tagged = judged.filter((j) => j.tagFits !== "not_applicable");
  const accepted = rate(count((j) => j.verdict === "right"), judged.length);
  const falsePass = rate(falsePasses, judgeWrong);

  const byKind: GraderScore["byKind"] = {};
  for (const j of judged) {
    const k = (byKind[j.kind] ??= { graded: 0, accepted: 0, falsePasses: 0, falseFails: 0 });
    k.graded += 1;
    if (j.verdict === "right") k.accepted += 1;
    if (j.verdict === "false_pass") k.falsePasses += 1;
    if (j.verdict === "false_fail") k.falseFails += 1;
  }

  return {
    graded: judged.length,
    accepted,
    falsePass,
    falseFail: rate(falseFails, judgeRight),
    tagAgreement: tagged.length ? rate(tagged.filter((j) => j.tagFits === "yes").length, tagged.length) : null,
    unsoundRubrics: rate(count((j) => !j.rubricSound), judged.length),
    meetsBar: judged.length > 0 && accepted >= MIN_ACCEPTED && falsePass <= MAX_FALSE_PASS,
    byKind,
  };
}

// ---- The comparison table ----

// What the table reads from a saved run.
export type GraderRunSummary = {
  date: string;
  graderPromptVersion: string;
  graderModel: string;
  itemPromptVersion: string;
  learnerPromptVersion: string;
  learnerModel: string;
  judgePromptVersion: string;
  judgeModel: string;
  judgeEffort: string;
  questions: number;
  score: Pick<GraderScore, "graded" | "accepted" | "falsePass" | "falseFail" | "tagAgreement" | "unsoundRubrics" | "meetsBar">;
  costUsd: number;
};

// Scores are comparable only when the same judge, on the same model, judged answers from the same
// simulated learner: a new judge or simulator can move the numbers by itself. So rows are grouped
// by both, like the map eval groups by judge. `short` shortens a model id for display.
export function graderTable(runs: GraderRunSummary[], short: (model: string) => string = (m) => m): string {
  if (runs.length === 0) return "No grader results yet.";
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  const header = ["date", "grader prompt", "grader model", "item writer", "questions", "grades", "accepted", "false pass", "false fail", "tag", "bad rubric", "bar", "cost"];
  const rows = runs.map((r) => ({
    group: `${r.judgePromptVersion} on ${short(r.judgeModel)}, effort ${r.judgeEffort}; answers by ${r.learnerPromptVersion} on ${short(r.learnerModel)}`,
    cells: [
      r.date.slice(0, 16).replace("T", " "),
      r.graderPromptVersion,
      short(r.graderModel),
      r.itemPromptVersion,
      String(r.questions),
      String(r.score.graded),
      pct(r.score.accepted),
      pct(r.score.falsePass),
      pct(r.score.falseFail),
      pct(r.score.tagAgreement),
      pct(r.score.unsoundRubrics),
      r.score.meetsBar ? "yes" : "no",
      `$${r.costUsd.toFixed(2)}`,
    ],
  }));
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r.cells[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();

  const lines = [`Bar: accepted ≥ ${MIN_ACCEPTED * 100}%, false passes ≤ ${MAX_FALSE_PASS * 100}% (both per the judge)`];
  for (const [group, groupRows] of Map.groupBy(rows, (r) => r.group)) {
    lines.push("", `Judge: ${group} (scores in this group are comparable)`, line(header), ...groupRows.map((r) => line(r.cells)));
  }
  return lines.join("\n");
}
