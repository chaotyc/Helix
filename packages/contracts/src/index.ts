import { z } from "zod";
import { ClarifyAnswer, ClarifyQuestion } from "./clarification.ts";
import { Effort, ExtractionStage, SourceKind } from "./extraction.ts";
import { Settings } from "./settings.ts";
import { GoalMap } from "./map.ts";
import { MapEdit, SharedWith } from "./map-edit.ts";

export * from "./map.ts";
export * from "./map-edit.ts";
export * from "./extraction.ts";
export * from "./clarification.ts";
export * from "./settings.ts";
export * from "./judge.ts";

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

// One sitting of study for a goal.
export const Session = z.object({
  id: z.string(),
  goalId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(), // missing while the session is still going
});
export type Session = z.infer<typeof Session>;

// One entry in a session's timeline. The `type` field says which kind it is.
export const TimelineItem = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tutor"), id: z.string(), text: z.string() }),
  z.object({
    type: z.literal("question"),
    id: z.string(),
    conceptId: z.string(),
    depth: Depth,
    prompt: z.string(),
  }),
  z.object({
    type: z.literal("answer"),
    id: z.string(),
    text: z.string(),
    confidence: z.number().int().min(1).max(5).optional(),
  }),
]);
export type TimelineItem = z.infer<typeof TimelineItem>;

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
]);
export type ServerMsg = z.infer<typeof ServerMsg>;
