import { DEPTH_NAMES, type ConceptKnowledge, type ExtractionStage, type GoalMap, type ViewEntry } from "@helix/contracts";
import { masteryLine, nextDepthChance } from "../depth.ts";
import { DepthMeter } from "./DepthMeter.tsx";
import { Spinner } from "./ui/feedback.tsx";
import { IconButton } from "./ui/Button.tsx";
import { XIcon } from "./ui/icons.tsx";

type Props = {
  map: GoalMap | undefined;
  knowledge: Record<string, ConceptKnowledge>;
  progress: { stage: ExtractionStage; detail: string } | undefined;
  onClose: () => void;
};

// Beside a session: the goal's concepts, each with the depth held out of the depth this goal
// needs, updated after every graded answer. The drawn map and editing are on the map page.
export function MapPanel({ map, knowledge, progress, onClose }: Props) {
  const running = progress && !["asked", "saved", "failed"].includes(progress.stage);
  const view = map?.view ?? [];
  const atTarget = view.filter((e) => (knowledge[e.conceptId]?.depthHeld ?? 0) >= e.targetDepth).length;
  const name = (id: string) => map?.concepts.find((c) => c.id === id)?.name ?? id;

  return (
    <aside aria-label="Concepts" className="flex w-72 shrink-0 flex-col border-l border-line">
      <div className="app-drag flex h-12 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <h2 className="text-[13px] font-semibold text-fg">Concepts</h2>
        <IconButton label="Hide concepts (⌘\)" size="sm" onClick={onClose}>
          <XIcon className="size-4" />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {running && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent-text">
            <Spinner className="size-3.5" />
            <span className="min-w-0 truncate">{progress.detail}</span>
          </div>
        )}

        {progress?.stage === "failed" && (
          <div role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            Building the map failed: {progress.detail}
          </div>
        )}

        {view.length === 0 ? (
          <p className="text-[13px] text-fg-subtle">No map yet.</p>
        ) : (
          <>
            <div className="mb-5">
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className="text-fg-muted">At target depth</span>
                <span className="font-medium text-fg tabular-nums">
                  {atTarget} of {view.length}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${(atTarget / view.length) * 100}%` }} />
              </div>
            </div>

            <ConceptList title="Taught" entries={view.filter((e) => e.role === "taught")} knowledge={knowledge} name={name} />
            <ConceptList title="Background" entries={view.filter((e) => e.role === "background")} knowledge={knowledge} name={name} />
          </>
        )}
      </div>

      {view.length > 0 && (
        <div className="shrink-0 border-t border-line px-4 py-3 text-[11px] leading-relaxed text-fg-subtle">
          <div className="mb-0.5 font-medium text-fg-muted">Depth held / target</div>
          <div className="grid grid-cols-3 gap-x-2">
            {DEPTH_NAMES.map((n, i) => (
              <span key={n} className="whitespace-nowrap">
                {i + 1} {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

type ListProps = {
  title: string;
  entries: ViewEntry[];
  knowledge: Record<string, ConceptKnowledge>;
  name: (conceptId: string) => string;
};

function ConceptList({ title, entries, knowledge, name }: ListProps) {
  if (entries.length === 0) return null;
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">{title}</h3>
      <ul className="-mx-2 flex flex-col">
        {entries.map((entry) => {
          const k = knowledge[entry.conceptId];
          return (
            <li key={entry.conceptId} title={masteryLine(k)} className="flex h-8 items-center gap-3 rounded-md px-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{name(entry.conceptId)}</span>
              <DepthMeter held={k?.depthHeld ?? 0} target={entry.targetDepth} next={nextDepthChance(k, entry.targetDepth)} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
