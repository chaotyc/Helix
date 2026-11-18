// Starting a subscription tool on Windows without a shell.
//
// npm (and pnpm) install a command-line tool on Windows as a batch file, `claude.cmd`, a "shim"
// that runs `node <the tool's script> %*`. Node can't start a batch file without a shell (cmd.exe),
// and Helix never uses one: cmd.exe reparses every argument, and Helix's arguments carry JSON
// schemas and whole prompts, whose quotes, %, ^, &, and | would be mangled or even run as commands.
// So Helix reads the shim, finds the script it points at, and starts `node <script> <args>` itself,
// with the arguments passed untouched. A native `.exe` (Claude Code's own installer, for one) needs
// none of this and starts directly. On macOS and Linux the command always starts directly.
import { existsSync, readFileSync } from "node:fs";
import { win32 } from "node:path";

export type Launch = { command: string; args: string[] };

// What a shim runs: a script for node, or a program it starts directly.
export type ShimTarget = { path: string; runner: "node" | "direct" };

// Reads an npm-style shim (the `cmd-shim` package, used by npm and pnpm). Its last line that passes
// on the arguments (`%*`) names the target, relative to the shim's folder (`%dp0%` or `%~dp0`):
//   npm 7+:   ... & "%_prog%"  "%dp0%\node_modules\@openai\codex\bin\codex.js" %*   (_prog is node)
//   npm 6, pnpm:  node  "%~dp0\..\pkg\cli.js" %*
//   no #! line:   "%dp0%\node_modules\pkg\bin\tool.exe"   %*
// Anything else (another interpreter such as sh, or a hand-written batch file) gives null.
export function shimTarget(shimPath: string, text: string): ShimTarget | null {
  const line = text
    .split(/\r?\n/)
    .filter((l) => l.includes("%*"))
    .at(-1);
  if (!line) return null;
  const quoted = [...line.matchAll(/"([^"]+)"/g)];
  const last = quoted.at(-1);
  if (!last || last.index === undefined) return null;
  const path = expandShimPath(shimPath, last[1]!);
  if (!path) return null;

  const before = line.slice(0, last.index).trim();
  const viaProg = /"%_prog%"$/i.test(before) && /SET\s+"_prog=(node|%dp0%\\node\.exe)"/i.test(text);
  const viaNode = /(^|[\s&@"\\])node(\.exe)?"?$/i.test(before);
  if (viaProg || viaNode) return { path, runner: "node" };
  if ((before === "" || before === "@") && /\.exe$/i.test(path)) return { path, runner: "direct" };
  return null;
}

// "%dp0%\node_modules\x\cli.js" or "%~dp0\..\x\cli.js" → that path beside the shim. Any other
// variable can't be expanded safely, so it gives null.
function expandShimPath(shimPath: string, raw: string): string | null {
  const relative = /^%(?:~dp0|dp0%)\\?(.*)$/i.exec(raw);
  if (relative) return relative[1]!.includes("%") ? null : win32.join(win32.dirname(shimPath), relative[1]!);
  return !raw.includes("%") && win32.isAbsolute(raw) ? raw : null;
}

// How to start `command` with `args` without a shell. `findNode` locates node.exe when the shim's
// folder has none (a shim prefers the node beside it, as here).
export function launchCommand(command: string, args: string[], findNode: () => string | null, platform: NodeJS.Platform = process.platform): Launch {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) return { command, args };
  const name = win32.basename(command);
  const target = shimTarget(command, readFileSync(command, "utf8"));
  if (!target) {
    throw new Error(`${name} is a batch file Helix can't start safely (it doesn't run a shell). Install the tool with npm, or its native .exe.`);
  }
  if (target.runner === "direct") return { command: target.path, args };
  const beside = win32.join(win32.dirname(command), "node.exe");
  const node = existsSync(beside) ? beside : findNode();
  if (!node) throw new Error(`${name} needs Node.js, which isn't installed (or isn't on PATH).`);
  return { command: node, args: [target.path, ...args] };
}
