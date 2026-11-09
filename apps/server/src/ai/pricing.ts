// US dollars per million tokens, from Anthropic's published prices (checked 2026-11).
// A model missing here gets no cost estimate rather than a wrong one.
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-fable-5-1": { input: 10, output: 50 },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
