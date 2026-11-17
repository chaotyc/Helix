import { z } from "zod";
import { ModelId } from "./providers.ts";

// The jobs a model can be chosen for (J1):
//   generation  builds maps: the clarifier and the extractor
//   teaching    the tutor, question writer, and answer grader (Steps 12–13)
//   evaluation  judges Helix's own output: the map judge, later the tutor eval
export const ModelRole = z.enum(["generation", "teaching", "evaluation"]);
export type ModelRole = z.infer<typeof ModelRole>;

// Each job's model, as a model id: "claude-opus-5-5" (Anthropic API) or "<connection>:<model>",
// e.g. "codex:gpt-6.1-sol". The catalog and connections are in providers.ts.
export const ModelSettings = z.object({
  generation: ModelId,
  teaching: ModelId,
  evaluation: ModelId,
});
export type ModelSettings = z.infer<typeof ModelSettings>;

export const Settings = z.object({ models: ModelSettings });
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = {
  models: { generation: "claude-opus-5-5", teaching: "claude-opus-5-5", evaluation: "claude-opus-5-5" },
};
