// The one place Helix calls a model. The model id names the connection ("codex:gpt-6.1-sol" goes
// through the Codex CLI, "claude-opus-5-5" through the Anthropic API), and this picks its adapter.
import { CONNECTIONS, parseModelId, type Connection, type ModelId } from "@helix/contracts";
import type { ModelCall } from "./model-call.ts";
import { callAnthropic } from "./providers/anthropic.ts";
import { callGemini } from "./providers/gemini.ts";
import { callResponsesApi } from "./providers/openai-responses.ts";
import { callAntigravity } from "./providers/cli/antigravity.ts";
import { callClaudeCode } from "./providers/cli/claude-code.ts";
import { callCodex } from "./providers/cli/codex.ts";
import { callGrokCli } from "./providers/cli/grok.ts";
import { callMuse } from "./providers/cli/muse.ts";
import { findCommand } from "./providers/cli/tools.ts";

const ADAPTERS: Record<Connection, ModelCall> = {
  anthropic: callAnthropic,
  openai: callResponsesApi,
  xai: callResponsesApi,
  meta: callResponsesApi,
  google: callGemini,
  "claude-code": callClaudeCode,
  codex: callCodex,
  antigravity: callAntigravity,
  grok: callGrokCli,
  muse: callMuse,
};

export const callModel: ModelCall = (request) => ADAPTERS[parseModelId(request.model).connection](request);

// Why this model can't be called yet (no key, tool not installed), or null. Scripts and evals
// check before spending anything. A tool's sign-in is only found out by calling it.
export function missingSetup(model: ModelId): string | null {
  const info = CONNECTIONS[parseModelId(model).connection];
  if (info.kind === "api") {
    return process.env[info.keyEnv!] ? null : `${model} needs ${info.keyEnv}. Add it to apps/server/.env (or in the Mac app's Settings).`;
  }
  return findCommand(info.command!) ? null : `${model} needs the \`${info.command}\` command (${info.label}). Install it: ${info.installUrl}`;
}
