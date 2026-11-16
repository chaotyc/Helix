// A goal's map page (V3): building it (source → questions → map) and editing it by clicking.
//   - questions waiting        → answer them
//   - no map yet, or rebuilding → paste the source
//   - otherwise                 → the drawn map, with an inspector for whatever is selected
import { useEffect, useState } from "react";
import type { ClarifyAnswer, ConceptKnowledge, Edge, Effort, ExtractionStage, Goal, GoalMap, MapEdit, SharedWith, SourceKind } from "@helix/contracts";
import type { PendingQuestions } from "../../store.ts";
import { QUIET_BUTTON } from "../ui.tsx";
import { AddArrowForm } from "./AddArrowForm.tsx";
import { AddConceptForm } from "./AddConceptForm.tsx";
import { ArrowInspector } from "./ArrowInspector.tsx";
import { BuildMapPanel } from "./BuildMapPanel.tsx";
import { ConceptInspector } from "./ConceptInspector.tsx";
import { edgeKey, edgeSharedWith } from "./edits.ts";
import { MapCanvas } from "./MapCanvas.tsx";
import { QuestionsCard } from "./QuestionsCard.tsx";

type Props = {
  goal: Goal;
  map: GoalMap | undefined;
  sharedWith: SharedWith;
  knowledge: Record<string, ConceptKnowledge>;
  progress: { stage: ExtractionStage; detail: string } | undefined;
  questions: PendingQuestions | undefined;
  editError: string | undefined;
  serverError: string | null;
  onAsk: (sourceText: string | undefined, sourceKind: SourceKind) => void;
  onBuild: (roundId: string, answers: ClarifyAnswer[], effort: Effort) => void;
  onEdit: (edits: MapEdit[]) => void;
  onDismissError: () => void;
};

type Selection =
  | { kind: "concept"; conceptId: string }
  | { kind: "edge"; edge: Edge }
  | { kind: "add-concept" }
  | { kind: "add-arrow" }
  | null;

export function GoalMapView(props: Props) {
  const { goal, map, sharedWith, progress, questions } = props;
  const [rebuilding, setRebuilding] = useState(false);
  const [effort, setEffort] = useState<Effort>("high"); // chosen with the source, used when building
  const [selection, setSelection] = useState<Selection>(null);
  // What to select once the server confirms an edit. Until then the form stays open, so a
  // rejected edit loses nothing you typed.
  const [afterSave, setAfterSave] = useState<{ next: Selection } | null>(null);

  useEffect(() => {
    if (!afterSave) return;
    setSelection(afterSave.next);
    setAfterSave(null);
  }, [map]); // a new map from the server: the edit was saved

  useEffect(() => {
    if (props.editError) setAfterSave(null); // rejected: stay where you are
  }, [props.editError]);

  const hasMap = (map?.view.length ?? 0) > 0;
  const running = progress !== undefined && !["asked", "saved", "failed"].includes(progress.stage);

  function edit(edits: MapEdit[]): void {
    props.onDismissError();
    props.onEdit(edits);
    setAfterSave({ next: selectionAfter(selection, edits) });
  }

  // ---- Banners: progress, a failed call, a rejected edit ----
  const banners = (
    <>
      {progress && (running || progress.stage === "failed") && (
        <div className={`mx-6 mt-4 rounded-md px-3 py-2 text-xs ${running ? "bg-sky-950 text-sky-200" : "bg-red-950 text-red-200"}`}>
          {progress.stage}: {progress.detail}
          {progress.stage === "failed" && props.serverError && <div className="mt-1 text-red-300">{props.serverError}</div>}
        </div>
      )}
      {props.editError && (
        <div className="mx-6 mt-4 flex items-start justify-between gap-3 rounded-md bg-red-950 px-3 py-2 text-xs text-red-200">
          <span>Not saved: {props.editError}</span>
          <button onClick={props.onDismissError} className="text-red-300 hover:text-red-100">
            ✕
          </button>
        </div>
      )}
    </>
  );

  // ---- Building ----
  if (questions) {
    return (
      <>
        {banners}
        <QuestionsCard questions={questions.questions} onBuild={(answers) => props.onBuild(questions.roundId, answers, effort)} />
      </>
    );
  }
  if (running && !hasMap) return banners;
  if (!hasMap || rebuilding) {
    return (
      <>
        {banners}
        <BuildMapPanel
          hasMap={hasMap}
          onAsk={(text, kind, chosenEffort) => {
            setEffort(chosenEffort);
            setRebuilding(false);
            props.onAsk(text, kind);
          }}
          onCancel={hasMap ? () => setRebuilding(false) : undefined}
        />
      </>
    );
  }

  // ---- Editing ----
  const concept = selection?.kind === "concept" ? map!.concepts.find((c) => c.id === selection.conceptId) : undefined;
  const entry = selection?.kind === "concept" ? map!.view.find((e) => e.conceptId === selection.conceptId) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-6 py-2">
        <span className="text-xs text-zinc-500">
          {map!.view.length} concepts · {map!.edges.length} arrows · {goal.title}
        </span>
        <span className="flex-1" />
        <button onClick={() => setSelection({ kind: "add-concept" })} className={QUIET_BUTTON}>
          Add concept
        </button>
        <button onClick={() => setSelection({ kind: "add-arrow" })} className={QUIET_BUTTON}>
          Add arrow
        </button>
        <button onClick={() => setRebuilding(true)} className={QUIET_BUTTON}>
          Rebuild map
        </button>
      </div>
      {banners}

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <MapCanvas
            map={map!}
            sharedWith={sharedWith}
            knowledge={props.knowledge}
            selectedConceptId={selection?.kind === "concept" ? selection.conceptId : null}
            selectedEdgeKey={selection?.kind === "edge" ? edgeKey(selection.edge) : null}
            onSelectConcept={(conceptId) => setSelection({ kind: "concept", conceptId })}
            onSelectEdge={(edge) => setSelection({ kind: "edge", edge })}
            onClear={() => setSelection(null)}
          />
        </div>

        {selection && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-zinc-800 p-4">
            {/* key: a new selection starts its form fresh from the saved values */}
            {concept && entry && (
              <ConceptInspector key={JSON.stringify([concept, entry])} concept={concept} entry={entry} sharedWith={sharedWith[concept.id] ?? []} onEdit={edit} />
            )}
            {selection.kind === "edge" && (
              <ArrowInspector key={edgeKey(selection.edge)} edge={selection.edge} sharedWith={edgeSharedWith(selection.edge, sharedWith)} onEdit={edit} />
            )}
            {selection.kind === "add-concept" && <AddConceptForm onEdit={edit} />}
            {selection.kind === "add-arrow" && <AddArrowForm map={map!} onEdit={edit} />}
          </aside>
        )}
      </div>
    </div>
  );
}

// Where the inspector goes after a saved edit: a removed concept or deleted arrow is gone,
// an arrow whose depths changed is the new arrow, and an "add" form closes.
function selectionAfter(selection: Selection, edits: MapEdit[]): Selection {
  if (selection?.kind === "add-concept" || selection?.kind === "add-arrow") return null;
  if (edits.some((e) => e.op === "remove_view_entry")) return null;
  const added = edits.find((e) => e.op === "add_edge");
  if (selection?.kind === "edge") return added?.op === "add_edge" ? { kind: "edge", edge: added.edge } : null;
  return selection;
}
