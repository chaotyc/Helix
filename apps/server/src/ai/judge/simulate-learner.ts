// The grader eval's simulated learner: answers to one question, one per assigned kind (fully
// right, a slip, a misconception, ...). Eval-only. The kinds steer what gets written; they are not
// labels, and the eval never scores against them: the grader-eval judge decides.
import type { DatabaseSync } from "node:sqlite";
import { SimulatedAnswers, type AnswerKind, type Concept, type WrittenItem } from "@helix/contracts";
import type { AgentDeps } from "../items/write-item.ts";
import { LEARNER_PARTS_FILE, conceptSection } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "simulate-learner";
const OUTPUT_SCHEMA = outputSchema(SimulatedAnswers);
export const MESSAGES_FILE = import.meta.filename;

export type SimulateInput = { concept: Concept; depth: number; item: WrittenItem; kinds: AnswerKind[] };

export async function simulateLearner(
  db: DatabaseSync,
  input: SimulateInput,
  deps: AgentDeps,
): Promise<{ answers: SimulatedAnswers["answers"]; promptVersion: string; model: string }> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, LEARNER_PARTS_FILE], ["depth-levels"]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "medium",
    firstMessage: firstMessage(input),
    check: (text) => checkSimulated(text, input.kinds),
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "writing learner answers",
  });
  return { answers: value.answers, promptVersion: prompt.version, model: result.model };
}

export function checkSimulated(text: string, kinds: AnswerKind[]): Check<SimulatedAnswers> {
  const parsed = parseAnswer(text, SimulatedAnswers);
  if (!parsed.ok) return parsed;
  const { answers } = parsed.value;
  const problems: string[] = [];
  const got = answers.map((a) => a.kind).join(", ");
  if (got !== kinds.join(", ")) problems.push(`Write one answer per kind, in this order: ${kinds.join(", ")}. Got: ${got || "none"}.`);
  for (const a of answers) {
    if (a.confidence < 1 || a.confidence > 5) problems.push(`The ${a.kind} answer's confidence must be 1 to 5.`);
    if (a.kind !== "no_answer" && !a.answer.trim()) problems.push(`The ${a.kind} answer is empty.`);
  }
  return problems.length ? { ok: false, problems } : parsed;
}

function firstMessage(input: SimulateInput): string {
  return [
    conceptSection(input.concept, input.depth),
    `# Question\n${input.item.prompt}`,
    `# Rubric\n${input.item.rubric}`,
    `# Model answer\n${input.item.expectedAnswer}`,
    ["# Kinds to write, in this order", ...input.kinds.map((k, i) => `${i + 1}. ${k}`)].join("\n"),
  ].join("\n\n");
}
