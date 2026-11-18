// The first-run tutorial: whether this computer has seen it, and the model it suggests for each
// connection. In the desktop app the "seen" flag is a file in the app's data folder (the page's own
// storage is lost each launch); in a browser it's the page's local storage. If neither can be
// read, the tutorial just shows again next time.
import { MODELS, modelIdFor, type Connection, type ModelId, type ProviderStatus } from "@helix/contracts";
import { desktop } from "./desktop.ts";

const SEEN_KEY = "helix.tutorial.seen";

export async function tutorialSeen(): Promise<boolean> {
  try {
    if (desktop?.tutorialSeen) return await desktop.tutorialSeen();
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialSeen(): void {
  try {
    if (desktop?.markTutorialSeen) void desktop.markTutorialSeen().catch(() => {});
    else localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // nothing to do: the tutorial shows again next launch
  }
}

// A connection Helix can try now: a key is set, or the tool is installed. "unchecked" means
// installed but its sign-in can't be checked without using it, so the card asks to make sure.
export function usable(status: ProviderStatus | undefined): boolean {
  return status?.state === "ready" || status?.state === "unchecked";
}

// The model the tutorial offers for a connection: each maker's strong all-round model, so one
// click covers every job. Picked from the catalog, not the most expensive.
const SUGGESTED: Record<Connection, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-6.1-sol",
  google: "gemini-4-argon",
  xai: "grok-4.7",
  meta: "muse-spark-1.3",
  "claude-code": "claude-opus-5-5",
  codex: "gpt-6.1-sol",
  antigravity: "gemini-4-argon",
  grok: "grok-4.6",
  muse: "muse-spark-1.3",
};

// The suggested model, if the account offers it (or reports no list); else the first it reports.
export function suggestedModel(status: ProviderStatus): { id: ModelId; label: string } {
  const id = modelIdFor(status.connection, SUGGESTED[status.connection]);
  const reported = status.models;
  const pick = reported.length === 0 || reported.some((m) => m.id === id) ? { id, label: SUGGESTED[status.connection] } : reported[0]!;
  return { id: pick.id, label: MODELS[pick.id]?.label ?? pick.label };
}
