// Running a subscription tool (claude, codex, agy, grok, muse) for one answer.
//   - Find it: on PATH, or where installers usually put it. The Mac app starts with the bare
//     macOS PATH, which has none of these folders.
//   - Give it an environment without API keys, so it uses the subscription you signed in with
//     (Claude Code, for one, prefers ANTHROPIC_API_KEY over its login).
//   - Run it in a fresh empty folder, so even a tool call has no files to read or change.
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

const HOME = homedir();
const COMMON_DIRS = [
  join(HOME, ".local/bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  join(HOME, ".npm-global/bin"),
  join(HOME, ".bun/bin"),
  join(HOME, ".volta/bin"),
  join(HOME, ".grok/bin"),
  join(HOME, ".muse/bin"),
];

const API_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "META_API_KEY", "MODEL_API_KEY"];

function searchDirs(): string[] {
  return [...(process.env.PATH ?? "").split(delimiter).filter(Boolean), ...COMMON_DIRS];
}

// The tool's full path, or null when it isn't installed.
export function findCommand(name: string): string | null {
  for (const dir of searchDirs()) {
    const path = join(dir, name);
    try {
      accessSync(path, constants.X_OK);
      return path;
    } catch {
      // not here
    }
  }
  return null;
}

// The environment a tool runs with: no API keys, and a PATH that finds the tool's own helpers
// (a tool installed with npm needs `node` beside it).
export function toolEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of API_KEYS) delete env[key];
  env.PATH = [dirname(command), ...searchDirs()].join(delimiter);
  env.NO_COLOR = "1";
  return env;
}

export async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "helix-model-"));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type ToolRun = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin?: string;
  timeoutMs: number;
  onLine?: (line: string) => void; // each line of stdout, as it arrives
  onOutput?: (text: string) => void; // stdout and stderr as they arrive (sign-in shows this)
};

export type ToolResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

export function runTool(run: ToolRun): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(run.command, run.args, { cwd: run.cwd, env: run.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let partial = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, run.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (text: string) => {
      stdout += text;
      run.onOutput?.(text);
      if (!run.onLine) return;
      partial += text;
      const lines = partial.split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) run.onLine(line);
    });
    child.stderr.on("data", (text: string) => {
      stderr += text;
      run.onOutput?.(text);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (partial.trim()) run.onLine?.(partial);
      resolve({ code, stdout, stderr, timedOut });
    });
    child.stdin.on("error", () => {}); // a tool that exits early closes its stdin: not our error
    child.stdin.end(run.stdin ?? "");
  });
}

// The tool's last useful words when it fails: the end of stderr, else of stdout.
export function failureDetail(result: ToolResult): string {
  const text = (result.stderr.trim() || result.stdout.trim()).split("\n").slice(-5).join("\n");
  return text.slice(-800) || `exit code ${result.code}`;
}

export function requireCommand(name: string, label: string): string {
  const command = findCommand(name);
  if (!command) throw new Error(`${label}: \`${name}\` isn't installed (or isn't on PATH). See Settings → Connections.`);
  return command;
}

export const TOOL_TIMEOUT_MS = 15 * 60_000; // a whole-syllabus extraction at high effort can take minutes
