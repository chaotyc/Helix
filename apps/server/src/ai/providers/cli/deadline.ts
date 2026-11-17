// When a subscription tool is stopped. Two clocks:
//   - idle: no output for this long means the tool is stuck (a dropped connection, a login
//     prompt nobody will answer, a retry loop). Each line of output resets it.
//   - total: a ceiling no call may pass, however busy it looks.
// The numbers:
//   - 45 minutes total, for every tool: three times the longest map build seen (Codex, high
//     effort, ~14 minutes with the judge). Far past that, something is wrong, and an open call
//     holds a plan's usage.
//   - 5 minutes idle for Claude Code (STREAMING_LIMITS). It prints a thinking tick about every
//     second while it thinks and a piece of the answer every few tokens while it writes, so five
//     silent minutes is far outside normal.
//   - 15 minutes idle for the rest (QUIET_LIMITS). Codex and Antigravity print nothing while they
//     write their answer, which arrives in one piece at the end (Antigravity is silent while it
//     thinks, too): a large map (30K output tokens at ~50 tokens a second) can take ten silent
//     minutes. Grok and Muse haven't been run for real, so they get the cautious limit.
//     15 minutes was the old fixed limit, so no tool is stopped sooner than before.
export type Limits = { idleMs: number; totalMs: number };

const TOTAL_MS = 45 * 60_000;
export const STREAMING_LIMITS: Limits = { idleMs: 5 * 60_000, totalMs: TOTAL_MS };
export const QUIET_LIMITS: Limits = { idleMs: 15 * 60_000, totalMs: TOTAL_MS };

export type TimeoutKind = "idle" | "total";

export type Deadline = {
  touch: () => void; // output arrived: restart the idle clock
  clear: () => void;
};

export function startDeadline(limits: Limits, onExpire: (kind: TimeoutKind) => void): Deadline {
  let done = false;
  const expire = (kind: TimeoutKind) => {
    if (done) return;
    done = true;
    clearTimeout(idle);
    clearTimeout(total);
    onExpire(kind);
  };
  let idle = setTimeout(() => expire("idle"), limits.idleMs);
  const total = setTimeout(() => expire("total"), limits.totalMs);
  return {
    touch: () => {
      if (done) return;
      clearTimeout(idle);
      idle = setTimeout(() => expire("idle"), limits.idleMs);
    },
    clear: () => {
      done = true;
      clearTimeout(idle);
      clearTimeout(total);
    },
  };
}

// What the learner sees when a call was stopped: which clock ran out, and what to try.
export function timeoutMessage(label: string, kind: TimeoutKind, limits: Limits): string {
  return kind === "idle"
    ? `${label} went quiet for ${minutes(limits.idleMs)} and was stopped (it may be stuck, offline, or signed out). Try again; if it keeps happening, check the tool in Terminal.`
    : `${label} was still working after ${minutes(limits.totalMs)}, the longest one call may run, and was stopped. Try a lower effort or a shorter source.`;
}

function minutes(ms: number): string {
  const n = Math.round(ms / 60_000);
  return n === 1 ? "1 minute" : `${n} minutes`;
}
