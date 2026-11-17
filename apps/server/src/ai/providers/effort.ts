// Helix asks for an effort per agent ("high" for the extractor, "medium" for the grader, ...).
// Models offer different ladders: Gemini 4 Argon stops at "high", Grok 4.6 at "xhigh". A level
// the model lacks becomes the strongest one it has below it, or its weakest if none is below.
import { Effort, MODELS, type ModelId } from "@helix/contracts";

const ORDER = Effort.options; // low → max

export function pickEffort(wanted: Effort, offered: readonly Effort[]): Effort | undefined {
  if (offered.length === 0) return undefined; // the model has no effort control
  if (offered.includes(wanted)) return wanted;
  const rank = (e: Effort) => ORDER.indexOf(e);
  const sorted = [...offered].sort((a, b) => rank(a) - rank(b));
  const below = sorted.filter((e) => rank(e) < rank(wanted));
  return below.at(-1) ?? sorted[0];
}

// The effort to send for this call. Models outside the catalog (offered by a signed-in tool) get
// the level asked for as it is, and the tool decides.
export function effortFor(model: ModelId, wanted: Effort): Effort | undefined {
  const info = MODELS[model];
  return info ? pickEffort(wanted, info.efforts) : wanted;
}
