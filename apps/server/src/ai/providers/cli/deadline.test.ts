// The two clocks that stop a tool: silence, and the ceiling. Real processes with tiny limits.
import { describe, expect, it } from "vitest";
import { QUIET_LIMITS, STREAMING_LIMITS, timeoutMessage } from "./deadline.ts";
import { runTool } from "./tools.ts";

// Each "tool" is Node running a short script, so the tests run the same on macOS, Linux, and Windows
// (there's no /bin/sh on Windows). The limits leave room for Node's startup on a slow CI machine.
const node = (script: string, idleTimeoutMs: number | undefined, timeoutMs: number) =>
  runTool({ command: process.execPath, args: ["-e", script], cwd: process.cwd(), env: process.env, idleTimeoutMs, timeoutMs });

describe("runTool's deadlines", () => {
  it("stops a tool that goes quiet", async () => {
    const result = await node(`process.stdout.write("started\\n"); setTimeout(() => {}, 10_000);`, 1_000, 20_000);
    expect(result).toMatchObject({ timedOut: true, timedOutBy: "idle", stdout: "started\n" });
  });

  it("lets a tool that keeps printing run past the idle limit, up to the ceiling", async () => {
    const started = Date.now();
    const result = await node(`setInterval(() => process.stdout.write(".\\n"), 50);`, 1_000, 2_500);
    expect(result.timedOutBy).toBe("total");
    expect(Date.now() - started).toBeGreaterThanOrEqual(2_400); // well past the 1 s idle limit
  });

  it("counts stderr as output too", async () => {
    const script = `let n = 0; const t = setInterval(() => { process.stderr.write(".\\n"); if (++n === 6) clearInterval(t); }, 300);`;
    const result = await node(script, 1_000, 20_000); // 1.8 s of stderr, longer than the idle limit
    expect(result).toMatchObject({ code: 0, timedOut: false, timedOutBy: null });
  });

  it("without an idle limit, only the ceiling applies (sign-in waits on a person)", async () => {
    const result = await node(`setTimeout(() => process.stdout.write("done\\n"), 1_500);`, undefined, 10_000);
    expect(result).toMatchObject({ code: 0, timedOutBy: null, stdout: "done\n" });
  });
});

describe("timeout messages", () => {
  it("say which clock ran out and what to try", () => {
    expect(timeoutMessage("Codex", "idle", QUIET_LIMITS)).toMatch(/^Codex went quiet for 15 minutes and was stopped/);
    expect(timeoutMessage("Claude Code", "idle", STREAMING_LIMITS)).toMatch(/^Claude Code went quiet for 5 minutes/);
    expect(timeoutMessage("Codex", "total", QUIET_LIMITS)).toMatch(/^Codex was still working after 45 minutes.*lower effort/);
  });
});
