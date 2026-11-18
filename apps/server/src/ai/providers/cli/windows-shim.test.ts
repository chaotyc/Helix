// Reading npm's Windows shims, and starting tools through them without a shell. The shims below are
// what npm 7+ (cmd-shim), npm 6, and pnpm write. The last test runs only on Windows: it starts a
// real shim through runTool and checks that arguments full of cmd.exe's special characters arrive
// unchanged.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { launchCommand, shimTarget } from "./windows-shim.ts";
import { runTool } from "./tools.ts";

const SHIM = "C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd";
const NPM_DIR = "C:\\Users\\me\\AppData\\Roaming\\npm";

// cmd-shim's output for a script with `#!/usr/bin/env node`.
const NPM7 = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
  "",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  "  SET PATHEXT=%PATHEXT:;.JS;=;%",
  ")",
  "",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
  "",
].join("\r\n");

const NPM6 = [
  '@IF EXIST "%~dp0\\node.exe" (',
  '  "%~dp0\\node.exe"  "%~dp0\\node_modules\\npm\\bin\\npm-cli.js" %*',
  ") ELSE (",
  "  @SETLOCAL",
  "  @SET PATHEXT=%PATHEXT:;.JS;=;%",
  '  node  "%~dp0\\node_modules\\npm\\bin\\npm-cli.js" %*',
  ")",
].join("\r\n");

const PNPM = [
  "@SETLOCAL",
  "@IF NOT DEFINED NODE_PATH (",
  '  @SET "NODE_PATH=C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules"',
  ")",
  '@IF EXIST "%~dp0\\node.exe" (',
  '  "%~dp0\\node.exe"  "%~dp0\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
  ") ELSE (",
  "  @SET PATHEXT=%PATHEXT:;.JS;=;%",
  '  node  "%~dp0\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*',
  ")",
].join("\r\n");

// cmd-shim's output for a target with no #! line (a native program).
const NATIVE = ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL", "CALL :find_dp0", '"%dp0%\\node_modules\\tool\\bin\\tool.exe"   %*'].join("\r\n");

// cmd-shim's output for `#!/bin/sh`: Helix won't run it.
const SH = NPM7.replace('SET "_prog=%dp0%\\node.exe"', 'SET "_prog=%dp0%\\/bin/sh.exe"').replace('SET "_prog=node"', 'SET "_prog=/bin/sh"').replace("codex.js", "codex.sh");

describe("shimTarget", () => {
  it("reads npm 7+ shims", () => {
    expect(shimTarget(SHIM, NPM7)).toEqual({ path: `${NPM_DIR}\\node_modules\\@openai\\codex\\bin\\codex.js`, runner: "node" });
  });

  it("reads npm 6 and pnpm shims", () => {
    expect(shimTarget(SHIM, NPM6)).toEqual({ path: `${NPM_DIR}\\node_modules\\npm\\bin\\npm-cli.js`, runner: "node" });
    expect(shimTarget("C:\\Users\\me\\AppData\\Local\\pnpm\\claude.cmd", PNPM)).toEqual({
      path: "C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
      runner: "node",
    });
  });

  it("starts a native target directly", () => {
    expect(shimTarget(SHIM, NATIVE)).toEqual({ path: `${NPM_DIR}\\node_modules\\tool\\bin\\tool.exe`, runner: "direct" });
  });

  it("refuses other interpreters and hand-written batch files", () => {
    expect(shimTarget(SHIM, SH)).toBeNull();
    expect(shimTarget(SHIM, '@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0..\\App.exe" "%~dp0..\\resources\\cli.js" %*')).toBeNull();
    expect(shimTarget(SHIM, '@echo off\r\n"%TOOL_HOME%\\tool.exe" %*')).toBeNull();
    expect(shimTarget(SHIM, "@echo off\r\necho hi")).toBeNull();
  });
});

describe("launchCommand", () => {
  const args = ["exec", '{"type":"object"}', "a & b | c ^ %PATH% \"quoted\""];

  it("passes commands through unchanged off Windows, and for .exe files", () => {
    expect(launchCommand("/usr/local/bin/codex", args, () => null, "darwin")).toEqual({ command: "/usr/local/bin/codex", args });
    expect(launchCommand("C:\\tools\\claude.exe", args, () => null, "win32")).toEqual({ command: "C:\\tools\\claude.exe", args });
  });

  it("runs a shim's script with node, untouched arguments after it", () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-shim-"));
    try {
      const shim = join(dir, "codex.cmd");
      writeFileSync(shim, NPM7);
      const launch = launchCommand(shim, args, () => "C:\\node\\node.exe", "win32");
      expect(launch.command).toBe("C:\\node\\node.exe");
      expect(launch.args.slice(1)).toEqual(args);
      expect(launch.args[0]).toMatch(/node_modules\\@openai\\codex\\bin\\codex\.js$/);
      expect(() => launchCommand(shim, args, () => null, "win32")).toThrow(/needs Node\.js/);
      writeFileSync(shim, SH);
      expect(() => launchCommand(shim, args, () => "node.exe", "win32")).toThrow(/can't start safely/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === "win32")("starts a real shim on Windows with arguments intact", async () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-shim-"));
    try {
      mkdirSync(join(dir, "node_modules", "echo-args"), { recursive: true });
      writeFileSync(join(dir, "node_modules", "echo-args", "cli.js"), "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n");
      writeFileSync(join(dir, "echo-args.cmd"), NPM7.replace("@openai\\codex\\bin\\codex.js", "echo-args\\cli.js"));
      const tricky = [...args, "", "line one\nline two", "100%", "!x!", "trailing\\"];
      const result = await runTool({ command: join(dir, "echo-args.cmd"), args: tricky, cwd: dir, env: process.env, timeoutMs: 20_000 });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(tricky);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
