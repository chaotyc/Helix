// How long the map build has been running ("2:05"), ticking every second. Nothing when the
// server didn't say when it started.
import { useEffect, useState } from "react";

export function ElapsedClock({ startedAt, className = "" }: { startedAt: number | undefined; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (startedAt === undefined) return null;
  return (
    <span className={`tabular-nums ${className}`} title="Time since this step started">
      {formatElapsed(now - startedAt)}
    </span>
  );
}

// 65_000 → "1:05"; an hour or more → "1:02:05".
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
