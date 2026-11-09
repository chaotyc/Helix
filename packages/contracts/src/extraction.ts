import { z } from "zod";

// How hard Claude thinks before answering. More effort: better reasoning, more tokens (E9).
export const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
export type Effort = z.infer<typeof Effort>;

// What kind of source material the extractor is given. The prompt says how to read each.
export const SourceKind = z.enum(["syllabus", "contents", "notes", "other"]);
export type SourceKind = z.infer<typeof SourceKind>;

// ---------------------------------------------------------------------------
// What the extractor (Claude) must return. This schema is sent to the API as the
// required output format, so it only uses what structured outputs support: no number
// ranges, no string patterns. Code checks those after (rule 2).
// ---------------------------------------------------------------------------

const Level = z.literal([1, 2, 3, 4, 5]);

export const ProposedConcept = z.strictObject({
  id: z.string().describe("lowercase-with-hyphens; reuse an existing concept's id when it is the same concept"),
  name: z.string(),
  description: z.string().describe("one sentence saying what the concept is"),
  kind: z.enum(["concept", "skill", "decision"]),
  role: z.enum(["taught", "background"]).describe("background: the course assumes it rather than teaching it"),
  targetDepth: Level.describe("how deep this course needs it: 1 orient … 5 expert"),
});
export type ProposedConcept = z.infer<typeof ProposedConcept>;

// "`concept` at `depth` needs `needs` at `needsDepth` first."
export const ProposedPrereq = z.strictObject({
  concept: z.string(),
  depth: Level,
  needs: z.string(),
  needsDepth: Level,
  why: z.string().describe("one line: why this is needed first"),
});
export type ProposedPrereq = z.infer<typeof ProposedPrereq>;

export const ProposedPartOf = z.strictObject({
  part: z.string(),
  whole: z.string(),
});

export const ExtractionProposal = z.strictObject({
  concepts: z.array(ProposedConcept),
  prerequisites: z.array(ProposedPrereq),
  partOf: z.array(ProposedPartOf),
});
export type ExtractionProposal = z.infer<typeof ExtractionProposal>;

// Progress updates while questions are chosen or a map is extracted. "asked": the questions
// are ready and waiting for answers.
export const ExtractionStage = z.enum(["started", "thinking", "writing", "checking", "retrying", "asked", "saved", "failed"]);
export type ExtractionStage = z.infer<typeof ExtractionStage>;
