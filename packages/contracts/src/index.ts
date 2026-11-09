import { z } from "zod";
import { Effort, ExtractionStage } from "./extraction.ts";
import { GoalMap } from "./map.ts";

export * from "./map.ts";
export * from "./extraction.ts";

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
  // Build a course's map with Claude. No source text: Claude works from the goal alone.
  z.object({
    type: z.literal("map.extract"),
    goalId: z.string(),
    sourceText: z.string().optional(),
    effort: Effort.optional(), // default "high"
  }),
  z.object({ type: z.literal("map.get"), goalId: z.string() }),
]);
export type ClientMsg = z.infer<typeof ClientMsg>;

// Server to client (UI)
export const ServerMsg = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pong"), text: z.string(), receivedAt: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("goals"), goals: z.array(Goal) }),
  z.object({ type: z.literal("goal.created"), goal: Goal }),
  z.object({ type: z.literal("map.progress"), goalId: z.string(), stage: ExtractionStage, detail: z.string() }),
  z.object({ type: z.literal("map.updated"), map: GoalMap }),
]);
export type ServerMsg = z.infer<typeof ServerMsg>;
