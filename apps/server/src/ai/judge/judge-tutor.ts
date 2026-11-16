// The tutor eval's judge: reads one tutoring transcript and gives a verdict on each teaching
// rule. Rules code can check (retrieval at the end of each task) are also checked in code by
// the eval; this covers the ones that need judgment.
import type { DatabaseSync } from "node:sqlite";
import { TutorJudgeReport, TutorRule, type Goal, type ModelId, type TimelineItem } from "@helix/contracts";
import type { ModelCall } from "../claude.ts";
import { LEARNER_PARTS_FILE, transcriptLines } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, goalSection } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "judge-tutor";
const OUTPUT_SCHEMA = outputSchema(TutorJudgeReport);
export const MESSAGES_FILE = import.meta.filename;

export type JudgeTutorInput = {
  goal: Goal;
  plan: string[]; // task labels, in order
  transcript: TimelineItem[];
  conceptName: (conceptId: string) => string;
};

export async function judgeTutor(
  db: DatabaseSync,
  input: JudgeTutorInput,
  deps: { callModel: ModelCall; model: ModelId },
): Promise<{ report: TutorJudgeReport; promptVersion: string; model: string }> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    goalId: input.goal.id,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: "high",
    firstMessage: [
      goalSection(input.goal),
      ["# Session plan", ...input.plan.map((p, i) => `${i + 1}. ${p}`)].join("\n"),
      ["# Transcript", ...transcriptLines(input.transcript, input.conceptName)].join("\n"),
    ].join("\n\n"),
    check: checkJudgeReport,
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "judging the tutor",
  });
  return { report: value, promptVersion: prompt.version, model: result.model };
}

export function checkJudgeReport(text: string): Check<TutorJudgeReport> {
  const parsed = parseAnswer(text, TutorJudgeReport);
  if (!parsed.ok) return parsed;
  const problems = TutorRule.options.flatMap((rule) => {
    const n = parsed.value.verdicts.filter((v) => v.rule === rule).length;
    return n === 1 ? [] : [`Give exactly one verdict for ${rule}; there are ${n}.`];
  });
  return problems.length ? { ok: false, problems } : parsed;
}
