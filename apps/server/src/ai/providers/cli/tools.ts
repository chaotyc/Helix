// Running a subscription tool (claude, codex, agy, grok, muse) for one answer.
//   - Find it: on PATH, or where installers usually put it. An app started from the Dock, Start
//     menu, or a Linux launcher gets a bare PATH, which often has none of these folders.
//   - Give it an environment without API keys, so it uses the subscription you signed in with
//     (Claude Code, for one, prefers ANTHROPIC_API_KEY over its login).
//   - Run it in a fresh empty folder, so even a tool call has no files to read or change.
//   - Start it without a shell. On Windows, npm's `.cmd` shims become `node <script>` (windows-shim.ts).
import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { launchCommand, type Launch } from "./windows-shim.ts";

const HOME = homedir();
const WINDOWS = process.platform === "win32";

// Where installers put command-line tools, beyond PATH.
function installDirs(): string[] {
  if (WINDOWS) {
    const appData = process.env.APPDATA ?? join(HOME, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA ?? join(HOME, "AppData", "Local");
    return [
      join(appData, "npm"), // npm install -g
      join(localAppData, "pnpm"), // pnpm add -g
      join(HOME, ".local", "bin"), // Claude Code's own installer
      join(localAppData, "Microsoft", "WinGet", "Links"), // winget
      join(HOME, "scoop", "shims"), // Scoop
      join(HOME, ".bun", "bin"),
      join(localAppData, "Volta", "bin"),
      join(process.env.ProgramFiles ?? "C:\\Program Files", "nodejs"), // node itself, for npm's shims
      join(localAppData, "Programs", "Antigravity", "bin"),
      join(HOME, ".grok", "bin"),
      join(HOME, ".muse", "bin"),
    ];
  }
  return [
    join(HOME, ".local/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(HOME, ".npm-global/bin"),
    join(HOME, ".bun/bin"),
    join(HOME, ".volta/bin"),
    join(HOME, ".grok/bin"),
    join(HOME, ".muse/bin"),
    // Linux: the system's own, Snap, Homebrew on Linux, and pnpm's global folder.
    "/usr/bin",
    "/snap/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    join(HOME, ".local/share/pnpm"),
  ];
}
const COMMON_DIRS = installDirs();

const API_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY", "META_API_KEY", "MODEL_API_KEY"];

function searchDirs(): string[] {
  return [...(process.env.PATH ?? "").split(delimiter).filter(Boolean), ...COMMON_DIRS];
}

// The file names a command can have. On Windows: the name plus an extension Helix can start, in
// PATHEXT's order (`claude.exe`, `claude.cmd`); never the bare name, which npm also writes there
// as a shell script for Git Bash that Windows itself can't run.
function fileNames(name: string): string[] {
  if (!WINDOWS) return [name];
  const startable = [".exe", ".cmd", ".bat", ".com"];
  const order = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").toLowerCase().split(";");
  return order.filter((ext) => startable.includes(ext)).map((ext) => name + ext);
}

// The tool's full path, or null when it isn't installed.
export function findCommand(name: string): string | null {
  for (const dir of searchDirs()) {
    for (const file of fileNames(name)) {
      const path = join(dir, file);
      try {
        accessSync(path, constants.X_OK); // on Windows, only that it exists
        return path;
      } catch {
        // not here
      }
    }
  }
  return null;
}

// How to start a tool found by findCommand, without a shell.
export function toolLaunch(command: string, args: string[]): Launch {
  return launchCommand(command, args, () => findCommand("node"));
}

// The environment a tool runs with: no API keys, and a PATH that finds the tool's own helpers
// (a tool installed with npm needs `node` beside it). Windows names are case-insensitive and the
// copy isn't, so the old PATH may be spelled "Path": every spelling goes before PATH is set.
export function toolEnv(command: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase();
    if (API_KEYS.includes(upper) || upper === "PATH") delete env[key];
  }
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
    const launch = toolLaunch(run.command, run.args);
    const child = spawn(launch.command, launch.args, { cwd: run.cwd, env: run.env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
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
