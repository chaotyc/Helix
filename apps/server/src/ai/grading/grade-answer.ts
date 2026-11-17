// The grader (Step 12): right or wrong, the kind of mistake, feedback for the learner, a note
// for the tutor's memory, and any misconception the answer shows (K3). The tutor never grades.
import type { DatabaseSync } from "node:sqlite";
import { Grade, type Concept } from "@helix/contracts";
import type { AgentDeps } from "../items/write-item.ts";
import { LEARNER_PARTS_FILE, conceptSection } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, fenced } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "grader";
const OUTPUT_SCHEMA = outputSchema(Grade);
export const MESSAGES_FILE = import.meta.filename;

export type GradeInput = {
  goalId?: string; // missing in the grader eval
  concept: Concept;
  depth: number;
  question: { prompt: string; rubric: string; expectedAnswer: string };
  answer: string;
  confidence: number | null;
  misconceptions: { id: string; description: string }[]; // known ones for this concept
};

export type GradeResult = { grade: Grade; promptVersion: string; model: string };

export async function gradeAnswer(db: DatabaseSync, input: GradeInput, deps: AgentDeps): Promise<GradeResult> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE], ["depth-levels"]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    goalId: input.goalId,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "medium",
    firstMessage: firstMessage(input),
    check: (text) => checkGrade(text, input.misconceptions.map((m) => m.id)),
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "grading",
  });
  return { grade: value, promptVersion: prompt.version, model: result.model };
}

export function checkGrade(text: string, knownIds: string[]): Check<Grade> {
  const parsed = parseAnswer(text, Grade);
  if (!parsed.ok) return parsed;
  const g = parsed.value;
  const problems: string[] = [];
  if (g.correct && g.errorTag !== null) problems.push("A right answer has no errorTag: set it to null.");
  if (!g.correct && g.errorTag === null) problems.push("A wrong answer needs an errorTag.");
  if (g.correct && (g.misconceptionId !== null || g.newMisconception !== null)) {
    problems.push("A right answer shows no misconception: set misconceptionId and newMisconception to null.");
  }
  if (g.misconceptionId !== null && g.newMisconception !== null) {
    problems.push("Use misconceptionId for a listed misconception or newMisconception for a new one, not both.");
  }
  if (g.misconceptionId !== null && !knownIds.includes(g.misconceptionId)) {
    problems.push(`misconceptionId "${g.misconceptionId}" is not on the list. Use a listed id, or newMisconception.`);
  }
  if (g.newMisconception !== null && !g.newMisconception.trim()) problems.push("newMisconception is empty: use null.");
  if (!g.explanation.trim()) problems.push("explanation is empty.");
  return problems.length ? { ok: false, problems } : parsed;
}

function firstMessage(input: GradeInput): string {
  const known = input.misconceptions.length ? input.misconceptions.map((m) => `- ${m.id}: ${m.description}`) : ["None yet."];
  return [
    conceptSection(input.concept, input.depth),
    `# Question\n${input.question.prompt}`,
    `# Rubric\n${input.question.rubric}`,
    `# Model answer\n${input.question.expectedAnswer}`,
    ["# Known misconceptions for this concept", ...known].join("\n"),
    [
      "# The learner's answer",
      `Confidence, rated before feedback: ${input.confidence ? `${input.confidence}/5` : "not given"}`,
      fenced("answer", input.answer),
    ].join("\n"),
  ].join("\n\n");
}
