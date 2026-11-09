// The messages the clarifier is sent. The instructions live in prompts/clarify-map.md;
// these only carry the data.
import type { ClarifyQuestion, Goal } from "@helix/contracts";
import { answersSection, goalSection, sourceSection, type SourceInput } from "../request-parts.ts";

export const MESSAGES_FILE = import.meta.filename;

export function firstMessage(goal: Goal, source: SourceInput | undefined, answered: ClarifyQuestion[]): string {
  return [goalSection(goal), sourceSection(source), answersSection(answered)].join("\n\n");
}

export function retryMessage(problems: string[]): string {
  return [
    "The checker rejected those questions:",
    ...problems.map((p) => `- ${p}`),
    "",
    "Return the complete corrected list of questions.",
  ].join("\n");
}
