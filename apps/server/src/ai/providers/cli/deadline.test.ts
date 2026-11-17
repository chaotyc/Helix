// The two clocks that stop a tool: silence, and the ceiling. Real processes with tiny limits.
import { describe, expect, it } from "vitest";
import { QUIET_LIMITS, timeoutMessage } from "./deadline.ts";
import { runTool } from "./tools.ts";

const sh = (script: string, idleTimeoutMs: number, timeoutMs: number) =>
  runTool({ command: "/bin/sh", args: ["-c", script], cwd: process.cwd(), env: process.env, idleTimeoutMs, timeoutMs });

describe("runTool's deadlines", () => {
  it("stops a tool that goes quiet", async () => {
    const result = await sh("echo started; exec sleep 5", 300, 10_000); // exec: the kill reaches sleep
    expect(result).toMatchObject({ timedOut: true, timedOutBy: "idle", stdout: "started\n" });
  });

  it("lets a tool that keeps printing run past the idle limit, up to the ceiling", async () => {
    const started = Date.now();
    const result = await sh("while true; do echo .; sleep 0.05; done", 400, 1_200);
    expect(result.timedOutBy).toBe("total");
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_100); // well past the 400 ms idle limit
  });

  it("counts stderr as output too", async () => {
    const result = await sh("for i in 1 2 3 4 5 6 7 8; do echo . >&2; sleep 0.1; done", 400, 10_000);
    expect(result).toMatchObject({ code: 0, timedOut: false, timedOutBy: null });
  });

  it("without an idle limit, only the ceiling applies (sign-in waits on a person)", async () => {
    const result = await runTool({ command: "/bin/sh", args: ["-c", "sleep 0.5; echo done"], cwd: process.cwd(), env: process.env, timeoutMs: 5_000 });
    expect(result).toMatchObject({ code: 0, timedOutBy: null, stdout: "done\n" });
  });
});

describe("timeout messages", () => {
  it("say which clock ran out and what to try", () => {
    expect(timeoutMessage("Codex", "idle", QUIET_LIMITS)).toMatch(/^Codex went quiet for 15 minutes and was stopped/);
    expect(timeoutMessage("Codex", "total", QUIET_LIMITS)).toMatch(/^Codex was still working after 45 minutes.*lower effort/);
  });
});
