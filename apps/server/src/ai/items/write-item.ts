// The item writer (Step 12): one question for one concept at one depth, with a rubric and a
// model answer for the grader. Used by the diagnostic; the tutor writes its own questions.
import type { DatabaseSync } from "node:sqlite";
import { WrittenItem, type Concept, type Effort, type Goal, type ModelId } from "@helix/contracts";
import type { ModelCall } from "../model-call.ts";
import { LEARNER_PARTS_FILE, conceptSection } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, goalSection } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "item-writer";
const OUTPUT_SCHEMA = outputSchema(WrittenItem);
export const MESSAGES_FILE = import.meta.filename;

export type WriteItemInput = {
  goal: Goal;
  concept: Concept;
  depth: number;
  buildsOn: { concept: Concept; depth: number }[]; // the prerequisites at this depth
  aimedAt: string | null; // a misconception to test, in words
  alreadyAsked: string[]; // earlier questions on this concept at this depth
};

export type AgentDeps = { callModel: ModelCall; model: ModelId; effort?: Effort };

export type WrittenItemResult = { item: WrittenItem; promptVersion: string; model: string };

export async function writeItem(db: DatabaseSync, input: WriteItemInput, deps: AgentDeps): Promise<WrittenItemResult> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE], ["depth-levels"]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    goalId: input.goal.id,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "medium",
    firstMessage: firstMessage(input),
    check: checkItem,
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "writing a question",
  });
  return { item: value, promptVersion: prompt.version, model: result.model };
}

export function checkItem(text: string): Check<WrittenItem> {
  const parsed = parseAnswer(text, WrittenItem);
  if (!parsed.ok) return parsed;
  const empty = (["prompt", "rubric", "expectedAnswer"] as const).filter((k) => !parsed.value[k].trim());
  return empty.length ? { ok: false, problems: empty.map((k) => `\`${k}\` is empty.`) } : parsed;
}

function firstMessage(input: WriteItemInput): string {
  const buildsOn = input.buildsOn.length
    ? input.buildsOn.map((b) => `- ${b.concept.name} at depth ${b.depth}`)
    : ["Nothing in the map."];
  const asked = input.alreadyAsked.length ? input.alreadyAsked.map((q) => `- ${q}`) : ["None."];
  return [
    goalSection(input.goal),
    conceptSection(input.concept, input.depth),
    ["# What it builds on at this depth", ...buildsOn].join("\n"),
    ["# Aim", input.aimedAt ? `Test whether this misconception is fixed: ${input.aimedAt}` : "None: test the depth itself."].join("\n"),
    ["# Already asked (write a different question)", ...asked].join("\n"),
  ].join("\n\n");
}
