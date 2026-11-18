// One grader-eval question, end to end, through the real agents:
//   1. The item writer writes a question, rubric, and model answer for one concept at one depth.
//   2. The simulated learner writes one answer of each kind (fully right, a slip, a misread, ...).
//   3. The grader grades each answer, as it would in a session.
//   4. The judge decides whether each grade is right, and whether its error tag fits.
// Concepts come from maps the map eval built (saved in results/maps-*.json), so the grader is
// tested on the concepts the app really produces, with no hand-written question set.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  AnswerKind,
  GoalMap,
  type Effort,
  type Grade,
  type GraderJudgment,
  type ModelId,
  type SimulatedAnswer,
  type WrittenItem,
} from "@helix/contracts";
import { implies } from "@helix/core";
import { createGoal, gradeAnswer, judgeGrade, openDatabase, simulateLearner, writeItem, type ModelCall } from "@helix/server";
import type { LoadedCase } from "./cases.ts";
import type { ItemPick } from "./grader-score.ts";
import { RESULTS_DIR } from "./results.ts";

// ---- Where the concepts come from ----

export type MapSource = { case: string; file: string; extractPromptVersion: string; extractModel: string; map: GoalMap };

const SavedMapsFile = z.object({
  runs: z.array(z.looseObject({ case: z.string(), extractPromptVersion: z.string(), extractModel: z.string(), map: GoalMap.optional() })),
});

// The newest saved map for each case, from results/maps-*.json (or only from `onlyFile`).
// Maps runs saved before maps were kept have no `map` and are passed over.
export function loadMapSources(dir = RESULTS_DIR, onlyFile?: string): Map<string, MapSource> {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith("maps-") && f.endsWith(".json")).sort();
  } catch {
    files = [];
  }
  if (onlyFile) files = files.filter((f) => f === onlyFile);
  const sources = new Map<string, MapSource>();
  for (const file of files) {
    const parsed = SavedMapsFile.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    if (!parsed.success) continue;
    for (const run of parsed.data.runs) {
      if (!run.map) continue;
      // Files sort oldest first, so a later file replaces an earlier one's map of the same case.
      sources.set(run.case, { case: run.case, file, extractPromptVersion: run.extractPromptVersion, extractModel: run.extractModel, map: run.map });
    }
  }
  return sources;
}

// ---- At most `max` model calls at a time ----

// Wraps a model call so no more than `max` run at once; the rest wait their turn. Lets the eval
// start every grading at once without starting dozens of model processes together.
export function limitCalls(call: ModelCall, max: number): ModelCall {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (request) => {
    if (running >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    running += 1;
    try {
      return await call(request);
    } finally {
      running -= 1;
      waiting.shift()?.();
    }
  };
}

// ---- One question ----

export type JudgedAnswer = SimulatedAnswer & { grade: Grade; judgment: GraderJudgment };

export type GraderItemRun = {
  run: number;
  case: string;
  conceptId: string;
  conceptName: string;
  depth: number;
  item: WrittenItem;
  answers: JudgedAnswer[];
  failures: string[]; // answers that couldn't be graded or judged: not counted
  versions: { item: string; learner: string; grader: string; judge: string };
  models: { item: string; learner: string; grader: string; judge: string };
  costUsd: number;
};

export type GraderRunOptions = {
  callModel: ModelCall;
  model: ModelId; // writes the question and grades: the teaching model, as in a session
  learnerModel: ModelId; // writes the learner answers
  judgeModel: ModelId; // judges the grades
  effort: Effort; // the item writer's and the grader's
  judgeEffort: Effort;
  run: number;
  log?: (line: string) => void;
};

export async function runGraderItem(pick: ItemPick, c: LoadedCase, source: MapSource, options: GraderRunOptions): Promise<GraderItemRun> {
  const log = options.log ?? (() => {});
  const db = openDatabase(":memory:");
  try {
    const { map } = source;
    const conceptOf = (id: string) => map.concepts.find((x) => x.id === id);
    const concept = conceptOf(pick.conceptId);
    if (!concept) throw new Error(`Concept ${pick.conceptId} is not in the ${pick.case} map.`);
    const goal = createGoal(db, { title: c.goal.title, kind: "course", prompt: c.goal.prompt, capstone: c.goal.capstone, examDate: c.goal.examDate });
    const buildsOn = implies(map.edges, pick)
      .filter((p) => p.conceptId !== pick.conceptId)
      .flatMap((p) => {
        const found = conceptOf(p.conceptId);
        return found ? [{ concept: found, depth: p.depth }] : [];
      });
    const teaching = { callModel: options.callModel, model: options.model, effort: options.effort };

    // ---- 1. The question ----
    const written = await writeItem(db, { goal, concept, depth: pick.depth, buildsOn, aimedAt: null, alreadyAsked: [] }, teaching);
    const item = written.item;

    // ---- 2. The answers ----
    const simulated = await simulateLearner(
      db,
      { concept, depth: pick.depth, item, kinds: AnswerKind.options },
      { callModel: options.callModel, model: options.learnerModel, effort: "medium" },
    );

    // ---- 3, 4. Grade each answer, then judge the grade ----
    const failures: string[] = [];
    let graderVersion = "";
    let graderModel = "";
    let judgeVersion = "";
    let judgeModel = "";
    const judged = await Promise.all(
      simulated.answers.map(async (a): Promise<JudgedAnswer | null> => {
        try {
          const graded = await gradeAnswer(
            db,
            { goalId: goal.id, concept, depth: pick.depth, question: item, answer: a.answer, confidence: a.confidence, misconceptions: [] },
            teaching,
          );
          const judgedGrade = await judgeGrade(
            db,
            { concept, depth: pick.depth, item, answer: a.answer, grade: graded.grade },
            { callModel: options.callModel, model: options.judgeModel, effort: options.judgeEffort },
          );
          graderVersion = graded.promptVersion;
          graderModel = graded.model;
          judgeVersion = judgedGrade.promptVersion;
          judgeModel = judgedGrade.model;
          const j = judgedGrade.judgment;
          const grade = graded.grade.correct ? "right" : `wrong (${graded.grade.errorTag})`;
          const tag = j.tagFits === "not_applicable" ? "" : j.tagFits === "yes" ? ", tag fits" : `, tag should be ${j.betterTag}`;
          log(`${a.kind}: graded ${grade}; judge: ${j.verdict}${tag}${j.rubricSound ? "" : ", rubric unsound"}`);
          if (j.verdict !== "right" || j.tagFits === "no") log(`    ${j.reason}`);
          return { ...a, grade: graded.grade, judgment: j };
        } catch (err) {
          const message = `${a.kind}: ${err instanceof Error ? err.message : String(err)}`;
          failures.push(message);
          log(`${message} (not counted)`);
          return null;
        }
      }),
    );

    const cost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_call").get();
    return {
      run: options.run,
      case: pick.case,
      conceptId: concept.id,
      conceptName: concept.name,
      depth: pick.depth,
      item,
      answers: judged.filter((a): a is JudgedAnswer => a !== null),
      failures,
      versions: { item: written.promptVersion, learner: simulated.promptVersion, grader: graderVersion, judge: judgeVersion },
      models: { item: written.model, learner: simulated.model, grader: graderModel, judge: judgeModel },
      costUsd: Number(cost?.cost ?? 0),
    };
  } finally {
    db.close();
  }
}
