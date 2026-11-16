import { z } from "zod";

// The jobs a model can be chosen for (J1):
//   generation  builds maps: the clarifier and the extractor
//   teaching    the tutor, question writer, and answer grader (Steps 12–13)
//   evaluation  judges Helix's own output: the map judge, later the tutor eval
export const ModelRole = z.enum(["generation", "teaching", "evaluation"]);
export type ModelRole = z.infer<typeof ModelRole>;

// The models the user can choose from. Other providers come later.
export const ModelId = z.enum(["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);
export type ModelId = z.infer<typeof ModelId>;

export type ModelInfo = {
  id: ModelId;
  label: string;
  // US dollars per million tokens (checked 2026-11).
  inputPerM: number;
  outputPerM: number;
  // Some models charge more once the prompt passes a size.
  longPrompt?: { aboveTokens: number; inputPerM: number; outputPerM: number };
  // Whether the API can re-run a refused request on another model automatically.
  refusalFallback: boolean;
};

export const MODELS: Record<ModelId, ModelInfo> = {
  "claude-fable-5-1": { id: "claude-fable-5-1", label: "Fable 5.1", inputPerM: 10, outputPerM: 50, refusalFallback: true },
  "claude-opus-5-5": { id: "claude-opus-5-5", label: "Opus 5.5", inputPerM: 4, outputPerM: 20, refusalFallback: true },
  "claude-sonnet-5-5": { id: "claude-sonnet-5-5", label: "Sonnet 5.5", inputPerM: 2, outputPerM: 10, refusalFallback: false },
  "claude-haiku-5-5": {
    id: "claude-haiku-5-5",
    label: "Haiku 5.5",
    inputPerM: 0.1,
    outputPerM: 0.5,
    longPrompt: { aboveTokens: 100_000, inputPerM: 0.5, outputPerM: 2.5 },
    refusalFallback: false,
  },
};

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
