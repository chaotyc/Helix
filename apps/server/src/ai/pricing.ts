// US dollars for one call, from the model catalog's prices (contracts' providers.ts; the settings
// tab shows them too). Models that only answer as Claude's refusal fallback are listed here.
// A call through a subscription tool, or to a model missing from both, gets no cost estimate
// rather than a wrong one.
import { MODELS } from "@helix/contracts";

type Prices = { inputPerM?: number; outputPerM?: number; longPrompt?: { aboveTokens: number; inputPerM: number; outputPerM: number } };

const FALLBACK_ONLY: Record<string, Prices> = {
  "claude-opus-5": { inputPerM: 5, outputPerM: 25 },
  "claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
};

// `model` is the id that answered; `requested` the one asked for. An API may answer with a dated
// name for the same model ("gpt-6.1-sol-2026-09-30"), which gets the requested model's prices.
export function costUsd(model: string, inputTokens: number, outputTokens: number, requested?: string): number | null {
  const info: Prices | undefined = MODELS[model] ?? FALLBACK_ONLY[model] ?? (requested ? MODELS[requested] : undefined);
  if (info?.inputPerM === undefined || info.outputPerM === undefined) return null;
  const long = info.longPrompt;
  const price = long && inputTokens > long.aboveTokens ? long : { inputPerM: info.inputPerM, outputPerM: info.outputPerM };
  return (inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1_000_000;
}
