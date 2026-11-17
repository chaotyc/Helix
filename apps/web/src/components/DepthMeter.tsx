// How deep the learner holds a concept, drawn as five segments (depths 1–5):
//   filled            held
//   partly filled     the next depth, filled by the chance it's mastered
//   empty track       still to go, up to this goal's target
//   faint             beyond the target (not needed for this goal)
import { depthName } from "@helix/contracts";

type Props = {
  held: number; // 0–5
  target: number; // 1–5
  next?: number; // 0–1: chance the next depth is mastered
  showLabel?: boolean; // "2/4" after the segments
  className?: string;
};

export function DepthMeter({ held, target, next = 0, showLabel = true, className = "" }: Props) {
  const reached = held >= target;
  return (
    <span
      role="img"
      aria-label={`Depth ${held} of ${target} (${depthName(target)})`}
      className={`inline-flex shrink-0 items-center gap-2 ${className}`}
    >
      <span className="flex gap-[3px]">
        {[1, 2, 3, 4, 5].map((d) => {
          const inTarget = d <= target;
          const filled = d <= held;
          const partial = !filled && d === held + 1 && inTarget ? next : 0;
          return (
            <span
              key={d}
              className={`relative h-1.5 w-2.5 overflow-hidden rounded-full ${
                filled ? (inTarget ? (reached ? "bg-success" : "bg-accent") : "bg-accent/40") : inTarget ? "bg-track" : "bg-track/35"
              }`}
            >
              {partial > 0 && <span className="absolute inset-y-0 left-0 bg-accent/55" style={{ width: `${Math.round(partial * 100)}%` }} />}
            </span>
          );
        })}
      </span>
      {showLabel && (
        <span className={`text-[11px] font-medium tabular-nums ${reached ? "text-success" : held > 0 ? "text-fg-muted" : "text-fg-subtle"}`}>
          {held}/{target}
        </span>
      )}
    </span>
  );
}
