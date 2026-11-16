// The tutor (Step 13): one turn of a tutoring session. Code has already decided what the session
// covers (the planner); the tutor decides how to teach it, one message at a time.
// Each call rebuilds the whole request: the briefing (K7), the plan, and the transcript so far.
import type { DatabaseSync } from "node:sqlite";
import { TutorTurn, depthName, type ClarifyQuestion, type Concept, type Goal, type TimelineItem } from "@helix/contracts";
import type { AgentDeps } from "../items/write-item.ts";
import { LEARNER_PARTS_FILE, conceptSection, depthLabel, transcriptLines } from "../learner-parts.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { partialStringField } from "../partial-json.ts";
import { loadPrompt } from "../prompts.ts";
import { REQUEST_PARTS_FILE, answersSection, goalSection } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";

const AGENT = "tutor";
const OUTPUT_SCHEMA = outputSchema(TutorTurn);
export const MESSAGES_FILE = import.meta.filename;

export type PlanLine = { label: string; reason: string; status: "done" | "now" | "later" };

// What the tutor reads at the start of every turn (K7: computed fresh, never stored).
export type TutorBriefing = {
  goal: Goal;
  answered: ClarifyQuestion[]; // what the learner told the clarifier
  plan: PlanLine[];
  task: {
    concept: Concept;
    depth: number;
    targetDepth: number;
    mastery: number[]; // depths 1–5
    buildsOn: { name: string; depth: number; mastery: number }[];
    aimedAt: string | null; // the misconception this task targets
    misconceptions: string[]; // active, on this concept and what it builds on
    notes: string[]; // the grader's notes on recent answers
  };
  summaries: string[]; // the last 2 sessions (K6)
  transcript: TimelineItem[];
  conceptName: (conceptId: string) => string;
  gradedInTask: boolean; // a graded answer exists in the current task
};

export type TutorResult = { turn: TutorTurn; promptVersion: string; model: string };

export async function tutorTurn(
  db: DatabaseSync,
  briefing: TutorBriefing,
  deps: AgentDeps & { onMessage?: (textSoFar: string) => void },
): Promise<TutorResult> {
  const prompt = loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE, LEARNER_PARTS_FILE], ["depth-levels"]);
  const { value, result } = await structuredCall(db, {
    agent: AGENT,
    goalId: briefing.goal.id,
    model: deps.model,
    prompt,
    schema: OUTPUT_SCHEMA,
    effort: deps.effort ?? "medium",
    firstMessage: firstMessage(briefing),
    check: (text) => checkTurn(text, briefing.gradedInTask),
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "the tutor is thinking",
    onText: (json) => {
      const message = partialStringField(json, "message");
      if (message) deps.onMessage?.(message);
    },
  });
  return { turn: value, promptVersion: prompt.version, model: result.model };
}

// The rules code can check (rule 6: the tutor can't end a task on its own say-so).
export function checkTurn(text: string, gradedInTask: boolean): Check<TutorTurn> {
  const parsed = parseAnswer(text, TutorTurn);
  if (!parsed.ok) return parsed;
  const t = parsed.value;
  const problems: string[] = [];
  if (!t.message.trim()) problems.push("message is empty.");
  if (t.question && t.taskDone) problems.push("Either ask a graded question or finish the task, not both in one turn.");
  if (t.taskDone && !gradedInTask) {
    problems.push("Each task ends with a retrieval question: ask one (set `question`) and finish the task only after it's answered.");
  }
  if (t.question && (!t.question.prompt.trim() || !t.question.rubric.trim())) problems.push("A graded question needs a prompt and a rubric.");
  return problems.length ? { ok: false, problems } : parsed;
}

function firstMessage(b: TutorBriefing): string {
  const t = b.task;
  const mastery = t.mastery.map((p, i) => `${i + 1} ${depthName(i + 1)}: ${p.toFixed(2)}`).join(" · ");
  const buildsOn = t.buildsOn.length
    ? t.buildsOn.map((x) => `- ${x.name} at depth ${x.depth} (mastery ${x.mastery.toFixed(2)})`)
    : ["Nothing in the map."];
  const list = (lines: string[], empty: string) => (lines.length ? lines.map((l) => `- ${l}`) : [empty]);

  return [
    goalSection(b.goal),
    answersSection(b.answered),
    ["# Session plan", ...b.plan.map((p, i) => `${i + 1}. [${p.status}] ${p.label}: ${p.reason}`)].join("\n"),
    [
      "# Briefing: the current task",
      conceptSection(t.concept, t.depth).replace("# Concept\n", ""),
      `This goal's target depth: ${depthLabel(t.targetDepth)}`,
      `Mastery by depth: ${mastery}`,
      t.aimedAt ? `This task targets a misconception: ${t.aimedAt}` : "",
      "## What it builds on",
      ...buildsOn,
      "## Active misconceptions here and in what it builds on",
      ...list(t.misconceptions, "None."),
      "## Grader notes on recent answers",
      ...list(t.notes, "None."),
    ]
      .filter(Boolean)
      .join("\n"),
    ["# Earlier sessions", ...list(b.summaries, "None.")].join("\n"),
    ["# This session so far", ...(b.transcript.length ? transcriptLines(b.transcript, b.conceptName) : ["Nothing yet: open the task."])].join("\n"),
    [
      "# Your turn",
      b.gradedInTask
        ? "The current task has had a graded answer."
        : "The current task has had no graded answer yet, so it can't be finished this turn.",
      "Write the tutor's next turn.",
    ].join("\n"),
  ].join("\n\n");
}
