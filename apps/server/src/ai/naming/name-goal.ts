// The goal namer: a short title from the learner's words, the way a chat app titles a new chat.
// The goal starts with a stand-in title (the start of what the learner wrote) so it shows in
// the sidebar at once; the model's title replaces it when it arrives, unless the learner has
// renamed the goal by then.
import type { DatabaseSync } from "node:sqlite";
import { GoalName, type Goal } from "@helix/contracts";
import type { ModelCall } from "../model-call.ts";
import { outputSchema, parseAnswer, retryWith } from "../parse.ts";
import { loadPrompt } from "../prompts.ts";
import { fenced, REQUEST_PARTS_FILE } from "../request-parts.ts";
import { structuredCall, type Check } from "../structured-call.ts";
import { getSettings } from "../../db/settings.ts";

const AGENT = "name-goal";
const OUTPUT_SCHEMA = outputSchema(GoalName);
const MAX_TITLE = 40;
const STAND_IN_MAX = 48;
export const MESSAGES_FILE = import.meta.filename;

// The first line of the learner's words, cut at a word near STAND_IN_MAX characters.
export function standInTitle(prompt: string): string {
  const line = prompt.trim().split(/\r\n|\r|\n/)[0]!.trim();
  if (line.length <= STAND_IN_MAX) return line;
  const cut = line.slice(0, STAND_IN_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > STAND_IN_MAX / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

export async function nameGoal(db: DatabaseSync, goal: Goal, deps: { callModel: ModelCall }): Promise<string> {
  if (!goal.prompt) throw new Error("A goal is named from the learner's words, and this one has none.");
  const { value } = await structuredCall(db, {
    agent: AGENT,
    goalId: goal.id,
    model: getSettings(db).models.generation,
    prompt: loadPrompt(AGENT, [MESSAGES_FILE, REQUEST_PARTS_FILE]),
    schema: OUTPUT_SCHEMA,
    effort: "low",
    firstMessage: `# What the learner wrote\n${fenced("learner_prompt", goal.prompt)}`,
    check: checkName,
    retryMessage: retryWith,
    callModel: deps.callModel,
    progress: () => {},
    thinkingDetail: "naming the goal",
  });
  return value;
}

// Tidied (one line, quotes and an ending period dropped), then checked: not empty, not too long.
export function checkName(text: string): Check<string> {
  const parsed = parseAnswer(text, GoalName);
  if (!parsed.ok) return parsed;
  const title = parsed.value.title
    .replace(/\s+/g, " ") // line breaks and runs of spaces: a sidebar title is one line
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/\.$/, "")
    .trim();
  if (!title) return { ok: false, problems: ["title is empty."] };
  if (title.length > MAX_TITLE) return { ok: false, problems: [`title is ${title.length} characters; at most ${MAX_TITLE}.`] };
  return { ok: true, value: title };
}
