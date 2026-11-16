// Ending a session: a summary for the next ones (K6), then the end time. A failed summary
// doesn't keep the session open: it ends without one, and the failure is logged in ai_call.
import { summarizeSession } from "../ai/summary/summarize-session.ts";
import { getGoal } from "../db/goals.ts";
import { readGraph } from "../db/graph.ts";
import { endSession, listTasks, readTurns, type SummaryRecord } from "../db/sessions.ts";
import { namer, newId, pushTurn, teaching, type SessionCtx } from "./context.ts";

export async function finishSession(ctx: SessionCtx): Promise<void> {
  const { db, session } = ctx;
  if (session.endedAt) return;
  const goal = getGoal(db, session.goalId);
  const transcript = readTurns(db, session.id).map((t) => t.item);

  let summary: SummaryRecord | null = null;
  if (goal && transcript.some((i) => i.type === "answer")) {
    ctx.status("Writing the session summary…");
    const name = namer(readGraph(db));
    try {
      const tasks = listTasks(db, session.id).map((t) => ({
        label: `${t.kind === "review" ? "Review" : "Learn"}: ${name(t.conceptId)} at depth ${t.depth}`,
        method: t.method,
        finished: t.endedAt !== null,
      }));
      const result = await summarizeSession(db, { goal, kind: session.kind, tasks, transcript, conceptName: name }, teaching(ctx));
      summary = { text: result.summary, promptVersion: result.promptVersion, model: result.model };
      pushTurn(ctx, { type: "summary", id: newId(), text: result.summary });
    } catch (err) {
      console.error("The session summary failed; ending without one:", err);
    }
  }

  const ended = endSession(db, session.id, summary);
  ctx.session = ended;
  ctx.emit({ type: "session.ended", session: ended });
}
