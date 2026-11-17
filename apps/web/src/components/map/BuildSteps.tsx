// The three steps of building a map, with the current one marked: Source → Questions → Map.
import { CheckIcon } from "../ui/icons.tsx";

const STEPS = ["Source", "Questions", "Map"];

export function BuildSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Building the map">
      {STEPS.map((step, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={step} className="flex items-center gap-2" aria-current={now ? "step" : undefined}>
            {i > 0 && <span className={`h-px w-6 ${done || now ? "bg-accent/50" : "bg-line-strong"}`} />}
            <span
              className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                done ? "bg-accent text-accent-fg" : now ? "bg-accent-soft text-accent-text ring-1 ring-accent/40" : "bg-fill text-fg-subtle"
              }`}
            >
              {done ? <CheckIcon className="size-3" /> : i + 1}
            </span>
            <span className={now ? "font-medium text-fg" : "text-fg-subtle"}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}
