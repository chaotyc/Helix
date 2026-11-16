// Whether a misconception is still active (K3), worked out from the evidence log. The grader
// names a misconception when an answer shows it; a question can be aimed at one. It counts as
// fixed after right answers to aimed questions in CLEAR_AFTER different sessions, none of them
// the session where it was last shown: a good moment right after the explanation isn't a fix.
import type { Answer } from "./mastery.ts";

export const CLEAR_AFTER = 2;

export type MisconceptionEvent = { seq: number; sessionId: string | null; kind: "shown" | "corrected" };

export function misconceptionEvents(evidence: Answer[], misconceptionId: string): MisconceptionEvent[] {
  return evidence
    .filter((a) => a.misconceptionId === misconceptionId || (a.aimedAt === misconceptionId && a.correct))
    .sort((x, y) => x.seq - y.seq)
    .map((a) => ({ seq: a.seq, sessionId: a.sessionId, kind: a.misconceptionId === misconceptionId ? "shown" : "corrected" }));
}

export function misconceptionActive(events: MisconceptionEvent[]): boolean {
  const lastShown = events.findLast((e) => e.kind === "shown");
  if (!lastShown) return false;
  const fixedIn = new Set(
    events
      .filter((e) => e.seq > lastShown.seq && e.kind === "corrected" && e.sessionId !== lastShown.sessionId)
      .map((e) => e.sessionId),
  );
  return fixedIn.size < CLEAR_AFTER;
}
