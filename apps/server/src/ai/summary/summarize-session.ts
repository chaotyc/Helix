// The session summarizer (K6): about 5 lines when a session ends, read by the next sessions.
// Summaries never change mastery; only evidence does.
import type { DatabaseSync } from "node:sqlite";
import { SessionSummary, type Goal, type SessionKind, type TimelineItem } from "@helix/contracts";
import type { AgentDeps } from "../items/write-item.ts";
import { LEARNER_PARTS_FILE, transcriptLines } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, goalSection } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "summarize-session";
const OUTPUT_SCHEMA = outputSchema(SessionSummary);
export const MESSAGES_FILE = import.meta.filename;

export type SummaryInput = {
  goal: Goal;
  kind: SessionKind;
  tasks: { label: string; method: string | null; finished: boolean }[];
  transcript: TimelineItem[];
  conceptName: (conceptId: string) => string;
};

export async function summarizeSession(
  db: DatabaseSync,
  input: SummaryInput,
  deps: AgentDeps,
): Promise<{ summary: string; promptVersion: string; model: string }> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    goalId: input.goal.id,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "low",
    firstMessage: firstMessage(input),
    check: checkSummary,
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "summarizing",
  });
  return { summary: value.summary.trim(), promptVersion: prompt.version, model: result.model };
}

function checkSummary(text: string): Check<SessionSummary> {
  const parsed = parseAnswer(text, SessionSummary);
  if (parsed.ok && !parsed.value.summary.trim()) return { ok: false, problems: ["summary is empty."] };
  return parsed;
}

function firstMessage(input: SummaryInput): string {
  const tasks = input.tasks.length
    ? input.tasks.map((t) => `- ${t.label} (method: ${t.method ?? "not chosen"}; ${t.finished ? "finished" : "not finished"})`)
    : ["None (a diagnostic)."];
  return [
    goalSection(input.goal),
    `# Session kind\n${input.kind}`,
    ["# Tasks", ...tasks].join("\n"),
    ["# Transcript", ...transcriptLines(input.transcript, input.conceptName)].join("\n"),
  ].join("\n\n");
}
