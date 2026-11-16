import { z } from "zod";
import { ErrorTag, StepKind } from "./learner.ts";
import { DepthLevel } from "./map.ts";

// A diagnostic measures what the learner already knows; a tutoring session teaches.
export const SessionKind = z.enum(["diagnostic", "tutoring"]);
export type SessionKind = z.infer<typeof SessionKind>;

// One sitting of study for a goal.
export const Session = z.object({
  id: z.string(),
  goalId: z.string(),
  kind: SessionKind,
  startedAt: z.string(),
  endedAt: z.string().optional(), // missing while the session is still going
  summary: z.string().optional(), // written when it ends (K6)
});
export type Session = z.infer<typeof Session>;

export const Confidence = z.number().int().min(1).max(5);
export type Confidence = z.infer<typeof Confidence>;

// One entry in a session's timeline. The `type` field says which kind it is.
export const TimelineItem = z.discriminatedUnion("type", [
  // What the tutor says. `streaming` while it's still being written.
  z.object({ type: z.literal("tutor"), id: z.string(), text: z.string(), streaming: z.boolean().optional() }),
  // A graded question: the answer to it goes to the grader, with a confidence rating.
  z.object({
    type: z.literal("question"),
    id: z.string(),
    itemId: z.string(),
    conceptId: z.string(),
    depth: DepthLevel,
    prompt: z.string(),
    step: z.string().optional(), // tutoring only: the step it tests (K2)
    stepKind: StepKind.optional(),
  }),
  z.object({ type: z.literal("answer"), id: z.string(), text: z.string(), confidence: Confidence.optional() }),
  // The grader's verdict on the answer above it.
  z.object({
    type: z.literal("feedback"),
    id: z.string(),
    correct: z.boolean(),
    errorTag: ErrorTag.nullable(),
    explanation: z.string(),
    misconception: z.string().optional(), // the misconception it showed, in words
  }),
  // A divider: the next task in a tutoring session ("Review: Convolution at depth 2").
  z.object({ type: z.literal("task"), id: z.string(), label: z.string() }),
  z.object({ type: z.literal("summary"), id: z.string(), text: z.string() }),
]);
export type TimelineItem = z.infer<typeof TimelineItem>;
