// The tutor's teaching rules that code can check from a transcript. The judge checks all six;
// where both check a rule, the eval shows both, so a judge that disagrees with code stands out.
import type { TimelineItem, TutorRule } from "@helix/contracts";

export type Verdict = { rule: TutorRule; verdict: "pass" | "fail" | "not_applicable"; evidence: string };
export type TurnRecord = { item: TimelineItem; taskId: string | null };
export type TaskRecord = { id: string; endedAt: string | null };

// Every finished task had a graded answer in it.
export function retrievalAtEnd(turns: TurnRecord[], tasks: TaskRecord[]): Verdict {
  const finished = tasks.filter((t) => t.endedAt !== null);
  if (finished.length === 0) return { rule: "retrieval_at_end", verdict: "not_applicable", evidence: "no task was finished" };
  const missing = finished.filter((t) => !turns.some((x) => x.taskId === t.id && x.item.type === "feedback"));
  return missing.length
    ? { rule: "retrieval_at_end", verdict: "fail", evidence: `${missing.length} finished task(s) without a graded answer` }
    : { rule: "retrieval_at_end", verdict: "pass", evidence: `all ${finished.length} finished task(s) had one` };
}

// Every tutor message asks at most one question: its question marks, plus one if a graded
// question card follows it. A heuristic: "Ready? Here's the question" counts as two.
export function oneQuestion(turns: TurnRecord[]): Verdict {
  const items = turns.map((t) => t.item);
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (item.type !== "tutor") continue;
    const asked = (item.text.match(/\?/g)?.length ?? 0) + (items[i + 1]?.type === "question" ? 1 : 0);
    if (asked > 1) return { rule: "one_question", verdict: "fail", evidence: `turn ${i + 1} asks ${asked}: "${item.text.slice(0, 80)}"` };
  }
  return { rule: "one_question", verdict: "pass", evidence: "every tutor message asks at most one" };
}
