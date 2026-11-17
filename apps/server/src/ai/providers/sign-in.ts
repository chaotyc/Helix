// Signs a subscription tool in from the settings tab: runs its own login command (`codex login`,
// `claude auth login`, `grok login`), which opens the browser, and passes on what it prints so the
// page can show the link. The tool stores the login; Helix never sees it.
import { homedir } from "node:os";
import { CONNECTIONS, type Connection } from "@helix/contracts";
import { failureDetail, findCommand, runTool, toolEnv } from "./cli/tools.ts";

const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const running = new Set<Connection>();

export async function signIn(connection: Connection, onOutput: (text: string) => void): Promise<{ ok: boolean; detail: string }> {
  const info = CONNECTIONS[connection];
  if (!info.signInArgs) return { ok: false, detail: `Sign in from Terminal: ${info.signIn ?? "not available"}` };
  const command = findCommand(info.command!);
  if (!command) return { ok: false, detail: `\`${info.command}\` isn't installed. ${info.installUrl}` };
  if (running.has(connection)) return { ok: false, detail: "A sign-in is already running." };

  running.add(connection);
  try {
    const result = await runTool({
      command,
      args: info.signInArgs,
      cwd: homedir(),
      env: toolEnv(command),
      timeoutMs: SIGN_IN_TIMEOUT_MS,
      onOutput,
    });
    if (result.timedOut) return { ok: false, detail: "No sign-in after 5 minutes; stopped." };
    if (result.code !== 0) return { ok: false, detail: `It stopped: ${failureDetail(result)}. Try in Terminal: ${info.signIn}` };
    return { ok: true, detail: "Signed in." };
  } finally {
    running.delete(connection);
  }
}
