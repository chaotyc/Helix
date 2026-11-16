import type { ConceptKnowledge, ExtractionStage, GoalMap } from "@helix/contracts";
import { depthClasses, masteryLine } from "../depth.ts";

type Props = {
  map: GoalMap | undefined;
  knowledge: Record<string, ConceptKnowledge>;
  progress: { stage: ExtractionStage; detail: string } | undefined;
};

// The selected course's concepts: depth held out of the depth the course needs, updated after
// every graded answer. A compact list; the drawn map and editing are on the goal's Map page.
export function MapPanel({ map, knowledge, progress }: Props) {
  const running = progress && !["asked", "saved", "failed"].includes(progress.stage);

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-1 text-sm font-semibold text-zinc-200">Concept map</div>
      <div className="mb-4 text-xs text-zinc-500">Depth held / target · 1 orient … 5 expert</div>

      {progress && (
        <div className={`mb-4 rounded-md px-2 py-1.5 text-xs ${running ? "bg-sky-950 text-sky-200" : "bg-zinc-900 text-zinc-400"}`}>
          {progress.stage}: {progress.detail}
        </div>
      )}

      {!map || map.view.length === 0 ? (
        <div className="text-xs text-zinc-600">No map yet</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {map.view.map((entry) => {
            const concept = map.concepts.find((c) => c.id === entry.conceptId);
            const k = knowledge[entry.conceptId];
            return (
              <li key={entry.conceptId} className="flex items-center gap-2 text-sm text-zinc-300" title={masteryLine(k)}>
                <span className={`w-9 shrink-0 rounded text-center font-mono text-xs leading-5 ${depthClasses(k?.depthHeld ?? 0)}`}>
                  {k?.depthHeld ?? 0}/{entry.targetDepth}
                </span>
                <span className="truncate">{concept?.name ?? entry.conceptId}</span>
                {entry.role === "background" && <span className="ml-auto text-xs text-zinc-600">background</span>}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
