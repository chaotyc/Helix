// The grader eval's judge: reads one question, its rubric, a learner's answer, and the grade the
// grader gave it, and decides whether the grade is right (or a false pass, or a false fail) and
// whether its error tag fits. Eval-only.
import type { DatabaseSync } from "node:sqlite";
import { GraderJudgment, type Concept, type Grade, type WrittenItem } from "@helix/contracts";
import type { AgentDeps } from "../items/write-item.ts";
import { LEARNER_PARTS_FILE, conceptSection } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, fenced } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "judge-grader";
const OUTPUT_SCHEMA = outputSchema(GraderJudgment);
export const MESSAGES_FILE = import.meta.filename;

export type JudgeGradeInput = { concept: Concept; depth: number; item: WrittenItem; answer: string; grade: Grade };

export async function judgeGrade(
  db: DatabaseSync,
  input: JudgeGradeInput,
  deps: AgentDeps,
): Promise<{ judgment: GraderJudgment; promptVersion: string; model: string }> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE], ["depth-levels"]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "high",
    firstMessage: firstMessage(input),
    check: (text) => checkJudgment(text, input.grade),
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "judging a grade",
  });
  return { judgment: value, promptVersion: prompt.version, model: result.model };
}

// The verdict must be possible for this grade, and the tag fields must match the verdict.
export function checkJudgment(text: string, grade: Grade): Check<GraderJudgment> {
  const parsed = parseAnswer(text, GraderJudgment);
  if (!parsed.ok) return parsed;
  const j = parsed.value;
  const problems: string[] = [];
  if (grade.correct && j.verdict === "false_fail") problems.push("The grade says right, so it can't be a false fail: use right or false_pass.");
  if (!grade.correct && j.verdict === "false_pass") problems.push("The grade says wrong, so it can't be a false pass: use right or false_fail.");
  const tagApplies = !grade.correct && j.verdict === "right";
  if (tagApplies && j.tagFits === "not_applicable") problems.push("The grade says wrong and you agree: set tagFits to yes or no.");
  if (!tagApplies && j.tagFits !== "not_applicable") problems.push("tagFits applies only when the grade says wrong and you agree: set it to not_applicable.");
  if (j.tagFits === "no" && j.betterTag === null) problems.push("tagFits is no: give the tag that fits as betterTag.");
  if (j.tagFits !== "no" && j.betterTag !== null) problems.push("betterTag is only for tagFits no: set it to null.");
  if (j.betterTag !== null && j.betterTag === grade.errorTag) problems.push("betterTag is the grader's own tag: if it fits, set tagFits to yes.");
  if (!j.reason.trim()) problems.push("reason is empty.");
  return problems.length ? { ok: false, problems } : parsed;
}

function firstMessage(input: JudgeGradeInput): string {
  const g = input.grade;
  const misconception = g.newMisconception ?? g.misconceptionId;
  return [
    conceptSection(input.concept, input.depth),
    `# Question\n${input.item.prompt}`,
    `# Rubric\n${input.item.rubric}`,
    `# Model answer\n${input.item.expectedAnswer}`,
    ["# The learner's answer", fenced("answer", input.answer)].join("\n"),
    [
      "# The grade",
      `Verdict: ${g.correct ? "right" : "wrong"}`,
      `Error tag: ${g.errorTag ?? "none"}`,
      ...(misconception ? [`Misconception named: ${misconception}`] : []),
      `Feedback to the learner: ${g.explanation}`,
    ].join("\n"),
  ].join("\n\n");
}
