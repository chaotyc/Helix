// US dollars for one call. Prices for the selectable models live in the contracts' model
// catalog (the settings tab shows them too); models that only answer as a refusal fallback
// are listed here. A model missing from both gets no cost estimate rather than a wrong one.
import { MODELS, type ModelId } from "@helix/contracts";

const FALLBACK_ONLY: Record<string, { inputPerM: number; outputPerM: number }> = {
  "claude-opus-5": { inputPerM: 5, outputPerM: 25 },
  "claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const info = MODELS[model as ModelId];
  const base = info ?? FALLBACK_ONLY[model];
  if (!base) return null;
  const price = info?.longPrompt && inputTokens > info.longPrompt.aboveTokens ? info.longPrompt : base;
  return (inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1_000_000;
}
