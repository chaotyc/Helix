import { z } from "zod";
import { ClarifyAnswer, ClarifyQuestion } from "./clarification.ts";
import { Effort, ExtractionStage, SourceKind } from "./extraction.ts";
import { Settings } from "./settings.ts";
import { GoalMap } from "./map.ts";
import { MapEdit, SharedWith } from "./map-edit.ts";
import { ConceptKnowledge } from "./learner.ts";
import { Confidence, Session, SessionKind, TimelineItem } from "./session.ts";

export * from "./map.ts";
export * from "./map-edit.ts";
export * from "./extraction.ts";
export * from "./clarification.ts";
export * from "./settings.ts";
export * from "./judge.ts";
export * from "./learner.ts";
export * from "./session.ts";

// How deep a learner holds a concept: 0 = not at all, 1 = orient ... 5 = expert.
export const Depth = z.number().int().min(0).max(5);
export type Depth = z.infer<typeof Depth>;

// What the learner is working toward. Only courses for now; jobs and projects come later.
export const Goal = z.object({
  id: z.string(),
  title: z.string().min(1),
  kind: z.enum(["course"]),
  capstone: z.string(), // "what would prove you've got it?"
  examDate: z.iso.date().optional(), // "2026-12-14"
  createdAt: z.string(), // ISO timestamp, e.g. "2026-11-08T21:46:01.065Z"
});
export type Goal = z.infer<typeof Goal>;

// What the UI sends to create a goal: a goal without the parts the server fills in.
export const GoalInput = Goal.omit({ id: true, createdAt: true });
export type GoalInput = z.infer<typeof GoalInput>;

// Messages over websocket

// Client (UI) to server
export const ClientMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping"), text: z.string() }),
  z.object({ type: z.literal("goal.create"), goal: GoalInput }),
  z.object({ type: z.literal("goal.list") }),
  // Building a map takes two steps. First, the clarifier reads the goal and source and asks
  // up to 3 questions (reply: map.questions). No source text: Claude works from the goal and answers.
  z.object({
    type: z.literal("map.clarify"),
    goalId: z.string(),
    sourceText: z.string().optional(),
    sourceKind: SourceKind.optional(), // what sourceText is; default "other"
  }),
  // Then the map is built from that round's source and every answer (all are required).
  z.object({
    type: z.literal("map.extract"),
    goalId: z.string(),
    roundId: z.string(), // from map.questions
    answers: z.array(ClarifyAnswer),
    effort: Effort.optional(), // default "high"
  }),
  z.object({ type: z.literal("map.get"), goalId: z.string() }),
  // One or more click edits, applied together or not at all. Reply: map.updated or map.edit.rejected.
  z.object({ type: z.literal("map.edit"), goalId: z.string(), edits: z.array(MapEdit).min(1) }),
  // Which model does each job (J1). Both reply with `settings`.
  z.object({ type: z.literal("settings.get") }),
  z.object({ type: z.literal("settings.set"), settings: Settings }),
  // Sessions (Steps 12–13). Every session step replies with session.item / session.status messages.
  z.object({ type: z.literal("session.list") }),
  z.object({ type: z.literal("session.start"), goalId: z.string(), kind: SessionKind }),
  z.object({ type: z.literal("session.open"), sessionId: z.string() }), // reply: session.timeline
  // The learner's reply. Answering a graded question needs a confidence rating (1–5).
  z.object({ type: z.literal("session.reply"), sessionId: z.string(), text: z.string().trim().min(1), confidence: Confidence.optional() }),
  // Carry on after a failed call: ask the next question, or get the tutor's next turn.
  z.object({ type: z.literal("session.resume"), sessionId: z.string() }),
  z.object({ type: z.literal("session.end"), sessionId: z.string() }),
  z.object({ type: z.literal("learner.get") }), // reply: learner.state
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// Server to client (UI)
export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pong"), text: z.string(), receivedAt: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("goals"), goals: z.array(Goal) }),
  z.object({ type: z.literal("goal.created"), goal: Goal }),
  z.object({ type: z.literal("map.progress"), goalId: z.string(), stage: ExtractionStage, detail: z.string() }),
  z.object({ type: z.literal("map.questions"), goalId: z.string(), roundId: z.string(), questions: z.array(ClarifyQuestion) }),
  z.object({ type: z.literal("map.updated"), map: GoalMap, sharedWith: SharedWith }),
  // An edit broke a rule (a loop, a missing concept, ...); nothing was changed.
  z.object({ type: z.literal("map.edit.rejected"), goalId: z.string(), reason: z.string() }),
  z.object({ type: z.literal("settings"), settings: Settings }),
  z.object({ type: z.literal("sessions"), sessions: z.array(Session) }),
  z.object({ type: z.literal("session.started"), session: Session }),
  z.object({ type: z.literal("session.timeline"), sessionId: z.string(), items: z.array(TimelineItem) }),
  // A new timeline item, or a newer version of one already sent (same id: the tutor's text as it streams).
  z.object({ type: z.literal("session.item"), sessionId: z.string(), item: TimelineItem }),
  // Whether the server is working on this session ("Writing a question…"), and what failed if a step did.
  z.object({ type: z.literal("session.status"), sessionId: z.string(), busy: z.boolean(), detail: z.string() }),
  z.object({ type: z.literal("session.ended"), session: Session }),
  // What the learner knows, per concept, across every goal. Sent after every graded answer.
  z.object({ type: z.literal("learner.state"), knowledge: z.array(ConceptKnowledge) }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;
