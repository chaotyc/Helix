// How each connection stands, for the settings tab: is the key set, is the tool installed and
// signed in, and which models does the account offer. Every check runs at once, each with a time
// limit, and none of them sends a prompt.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONNECTIONS, Connection, modelIdFor, type ProviderStatus } from "@helix/contracts";
import { agyModels } from "./cli/antigravity.ts";
import { failureDetail, findCommand, runTool, toolEnv, withTempDir } from "./cli/tools.ts";

const CHECK_TIMEOUT_MS = 20_000;

type Status = Omit<ProviderStatus, "connection" | "models"> & { models?: ProviderStatus["models"] };

export async function providerStatuses(): Promise<ProviderStatus[]> {
  return Promise.all(
    Connection.options.map(async (connection) => {
      let status: Status;
      try {
        status = await check(connection);
      } catch (err) {
        status = { state: "signed-out", detail: `Couldn't check: ${err instanceof Error ? err.message : String(err)}` };
      }
      return { connection, models: [], ...status };
    }),
  );
}

async function check(connection: Connection): Promise<Status> {
  const info = CONNECTIONS[connection];
  if (info.kind === "api") {
    return process.env[info.keyEnv!] ? { state: "ready", detail: `Key set (${info.keyEnv}).` } : { state: "missing", detail: `No key yet (${info.keyEnv}).` };
  }
  const command = findCommand(info.command!);
  if (!command) return { state: "missing", detail: `\`${info.command}\` isn't installed.` };
  switch (connection) {
    case "claude-code":
      return claudeCodeStatus(command);
    case "codex":
      return codexStatus(command);
    case "antigravity":
      return antigravityStatus();
    case "grok":
      return grokStatus(command);
    default:
      // Muse Code has no command that reports its sign-in without starting a session.
      return { state: "unchecked", detail: `Installed. Helix can't check the sign-in; if calls fail, run \`muse\` in Terminal and sign in.` };
  }
}

function run(command: string, args: string[]) {
  return withTempDir((cwd) => runTool({ command, args, cwd, env: toolEnv(command), timeoutMs: CHECK_TIMEOUT_MS }));
}

// `claude auth status` prints JSON: { loggedIn, authMethod: "claude.ai" | "console" | ... }.
async function claudeCodeStatus(command: string): Promise<Status> {
  const result = await run(command, ["auth", "status"]);
  let status: { loggedIn?: boolean; authMethod?: string };
  try {
    status = JSON.parse(result.stdout) as typeof status;
  } catch {
    return { state: "signed-out", detail: failureDetail(result) };
  }
  if (!status.loggedIn) return { state: "signed-out", detail: "Not signed in." };
  return status.authMethod === "claude.ai"
    ? { state: "ready", detail: "Signed in with your Claude plan." }
    : { state: "ready", detail: `Signed in (${status.authMethod ?? "unknown method"}), not with a Claude plan: calls bill that account.` };
}

// `codex login status`: "Logged in using ChatGPT" / "Logged in using an API key" / "Not logged in".
async function codexStatus(command: string): Promise<Status> {
  const result = await run(command, ["login", "status"]);
  const said = `${result.stdout}\n${result.stderr}`;
  if (/logged in using chatgpt/i.test(said)) return { state: "ready", detail: "Signed in with ChatGPT.", models: await codexModels() };
  if (/logged in using an api key/i.test(said)) return { state: "ready", detail: "Signed in with an API key, not ChatGPT: calls bill that key.", models: await codexModels() };
  return { state: "signed-out", detail: "Not signed in." };
}

// Codex keeps the models this account can use in $CODEX_HOME/models_cache.json.
async function codexModels(): Promise<ProviderStatus["models"]> {
  try {
    const file = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "models_cache.json");
    const cache = JSON.parse(await readFile(file, "utf8")) as { models?: { slug?: string; display_name?: string; visibility?: string }[] };
    return (cache.models ?? []).flatMap((m) =>
      m.slug && m.visibility === "list" && /^[\w.-]+$/.test(m.slug) ? [{ id: modelIdFor("codex", m.slug), label: m.display_name ?? m.slug }] : [],
    );
  } catch {
    return [];
  }
}

// `agy models` only works when signed in.
async function antigravityStatus(): Promise<Status> {
  const models = await agyModels(true);
  if (models.length === 0) return { state: "signed-out", detail: "Installed, but it listed no models: sign in." };
  return { state: "ready", detail: "Signed in.", models: models.map((m) => ({ id: modelIdFor("antigravity", m.base), label: m.label || m.base })) };
}

// `grok models` lists model slugs when signed in and says to log in otherwise (exit code 0 either way).
async function grokStatus(command: string): Promise<Status> {
  const result = await run(command, ["--no-auto-update", "models"]);
  const said = `${result.stdout}\n${result.stderr}`;
  if (/log ?in/i.test(said) && !/^\s*grok[\w.-]*/m.test(result.stdout)) return { state: "signed-out", detail: "Not signed in." };
  const slugs = [...new Set(result.stdout.split("\n").flatMap((line) => /^\s*\*?\s*(grok[\w.-]*)/.exec(line)?.[1] ?? []))];
  if (slugs.length === 0) return { state: "unchecked", detail: "Installed. Couldn't read its models; if calls fail, run `grok login`." };
  return { state: "ready", detail: "Signed in.", models: slugs.map((slug) => ({ id: modelIdFor("grok", slug), label: slug })) };
}
