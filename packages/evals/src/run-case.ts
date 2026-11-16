// One evaluation run of one case: build its map, judge it, check it with rules, score it.
// Each run gets its own empty in-memory database (M6), so runs never touch your data or
// each other, and the map is built from the case alone.
//   1. Set up the goal, the source, and the fixed clarifying answers (M5: no clarifier call).
//   2. Build the map through the same code the app uses (extractMap).
//   3. Judge it (judgeMap) and run the rule checks (lintMap).
//   4. Score it, and total the cost of every call.
import type { Effort, ExtractionStage, JudgedProblem, ModelId } from "@helix/contracts";
import { createGoal, createRound, createSource, extractMap, judgeMap, openDatabase, type ModelCall } from "@helix/server";
import type { LoadedCase } from "./cases.ts";
import { lintMap, type Warning } from "./lint.ts";
import { scoreRun, type RunScore } from "./score.ts";

export type RunOptions = {
  callModel: ModelCall;
  model: ModelId; // builds the map
  judgeModel: ModelId; // judges it
  effort: Effort;
  judgeEffort: Effort;
  run: number; // 1, 2, ... when a case runs several times
  onProgress?: (stage: ExtractionStage, detail: string) => void;
};

export type CaseRun = {
  case: string;
  run: number;
  extractPromptVersion: string;
  judgePromptVersion: string;
  extractModel: string; // the model that answered (a refusal fallback can differ)
  judgeModel: string;
  score: RunScore;
  problems: JudgedProblem[];
  warnings: Warning[];
  costUsd: number;
};

export async function runCase(c: LoadedCase, options: RunOptions): Promise<CaseRun> {
  const db = openDatabase(":memory:");
  try {
    // ---- 1. The case's fixed input ----
    const goal = createGoal(db, { title: c.goal.title, kind: "course", capstone: c.goal.capstone, examDate: c.goal.examDate });
    const sourceId = c.source && c.sourceText ? createSource(db, goal.id, c.sourceText, c.source.kind) : undefined;
    const round = createRound(db, {
      goalId: goal.id,
      sourceId,
      questions: c.answers.map((a) => ({
        about: a.about,
        question: a.question,
        why: "A fixed answer from the evaluation case.",
        answerType: "free_text" as const,
        choices: [],
      })),
    });
    const answers = round.questions.map((q, i) => ({ questionId: q.id, answer: c.answers[i]!.answer }));

    // ---- 2. Build the map ----
    await extractMap(
      db,
      { goalId: goal.id, roundId: round.id, answers, effort: options.effort, model: options.model },
      { callModel: options.callModel, onProgress: options.onProgress },
    );

    // ---- 3. Judge it, check it ----
    const judged = await judgeMap(
      db,
      { goalId: goal.id, model: options.judgeModel, effort: options.judgeEffort },
      { callModel: options.callModel, onProgress: options.onProgress },
    );
    const warnings = lintMap(judged.map);

    // ---- 4. Score it ----
    const extractCall = db
      .prepare("SELECT prompt_version, model FROM ai_call WHERE agent = 'extract-map' AND status = 'ok' ORDER BY id DESC LIMIT 1")
      .get();
    const cost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM ai_call").get();

    return {
      case: c.name,
      run: options.run,
      extractPromptVersion: String(extractCall?.prompt_version),
      judgePromptVersion: judged.promptVersion,
      extractModel: String(extractCall?.model),
      judgeModel: judged.model,
      score: scoreRun(judged.map, judged.report, warnings),
      problems: judged.report.problems,
      warnings,
      costUsd: Number(cost?.cost ?? 0),
    };
  } finally {
    db.close();
  }
}
