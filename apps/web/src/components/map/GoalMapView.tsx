// A goal's map page (V3): building it (source → questions → map) and editing it by clicking.
//   - questions waiting        → answer them
//   - no map yet, or rebuilding → paste the source
//   - otherwise                 → the drawn map, with an inspector for whatever is selected
import { useEffect, useState } from "react";
import type { ClarifyAnswer, ConceptKnowledge, Edge, Effort, ExtractionStage, GoalMap, MapEdit, SharedWith, SourceKind } from "@helix/contracts";
import type { PendingQuestions } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Alert, Spinner } from "../ui/feedback.tsx";
import { PlusIcon, RefreshIcon } from "../ui/icons.tsx";
import { AddArrowForm } from "./AddArrowForm.tsx";
import { AddConceptForm } from "./AddConceptForm.tsx";
import { ArrowInspector } from "./ArrowInspector.tsx";
import { BuildMapPanel } from "./BuildMapPanel.tsx";
import { ConceptInspector } from "./ConceptInspector.tsx";
import { edgeKey, edgeLabel, edgeSharedWith } from "./edits.ts";
import { Inspector } from "./Inspector.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import { MapProgress, STAGE_LABEL } from "./MapProgress.tsx";
import { QuestionsCard } from "./QuestionsCard.tsx";

type Props = {
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

const INSPECTOR_INSET = 340 + 12; // the inspector's width and its gap from the edge

type Selection =
  | { kind: "concept"; conceptId: string }
  | { kind: "edge"; edge: Edge }
  | { kind: "add-concept" }
  | { kind: "add-arrow" }
  | null;

export function GoalMapView(props: Props) {
  const { map, sharedWith, progress, questions } = props;
  const [rebuilding, setRebuilding] = useState(false);
  const [effort, setEffort] = useState<Effort>("high"); // chosen with the source, used when building
  // Which step a running job is on, for the progress page: writing questions, or building the map.
  const [step, setStep] = useState<1 | 2>(2);
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

  // Esc closes the inspector, unless its form holds an unsaved edit (that would throw it away;
  // the close button still works). Each form marks itself with data-dirty while it differs.
  useEffect(() => {
    if (!selection) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[data-inspector] [data-dirty]")) return; // wherever focus is
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && !target.closest("[data-inspector]") && target.closest("input, textarea, select")) return;
      setSelection(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  const hasMap = (map?.view.length ?? 0) > 0;
  const running = progress !== undefined && !["asked", "saved", "failed"].includes(progress.stage);
  const failed = progress?.stage === "failed";

  function edit(edits: MapEdit[]): void {
    props.onDismissError();
    props.onEdit(edits);
    setAfterSave({ next: selectionAfter(selection, edits) });
  }

  const failure = failed && (
    <Alert tone="danger" title="Building the map failed">
      {progress.detail}
      {props.serverError && <div className="mt-1">{props.serverError}</div>}
    </Alert>
  );

  // ---- Building ----
  if (questions) {
    return (
      <QuestionsCard
        questions={questions.questions}
        onBuild={(answers) => {
          setStep(2);
          props.onBuild(questions.roundId, answers, effort);
        }}
      />
    );
  }
  if (running && !hasMap) return <MapProgress stage={progress.stage} detail={progress.detail} step={step} />;
  if (!hasMap || rebuilding) {
    return (
      <>
        {failure && <div className="mx-auto w-full max-w-2xl px-8 pt-8">{failure}</div>}
        <BuildMapPanel
          hasMap={hasMap}
          onAsk={(text, kind, chosenEffort) => {
            setEffort(chosenEffort);
            setStep(1);
            setRebuilding(false);
            props.onAsk(text, kind);
          }}
          onCancel={hasMap ? () => setRebuilding(false) : undefined}
        />
      </>
    );
  }

  // ---- Editing ----
  const name = (id: string) => map!.concepts.find((c) => c.id === id)?.name ?? id;
  const concept = selection?.kind === "concept" ? map!.concepts.find((c) => c.id === selection.conceptId) : undefined;
  const entry = selection?.kind === "concept" ? map!.view.find((e) => e.conceptId === selection.conceptId) : undefined;
  const close = () => setSelection(null);

  return (
    <div className="@container/map relative h-full bg-sunken">
      <MapCanvas
        map={map!}
        sharedWith={sharedWith}
        knowledge={props.knowledge}
        selectedConceptId={selection?.kind === "concept" ? selection.conceptId : null}
        selectedEdgeKey={selection?.kind === "edge" ? edgeKey(selection.edge) : null}
        onSelectConcept={(conceptId) => setSelection({ kind: "concept", conceptId })}
        onSelectEdge={(edge) => setSelection({ kind: "edge", edge })}
        onClear={close}
        rightInset={selection ? INSPECTOR_INSET : 0}
      />

      {/* Toolbar, top left over the canvas */}
      {/* Kept clear of the inspector: it never runs under it. */}
      <div
        className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col items-start gap-2"
        style={{ maxWidth: `calc(100% - ${(selection ? INSPECTOR_INSET : 0) + 24}px)` }}
      >
        <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-xl border border-line-strong bg-overlay p-1 shadow-sm">
          {/* The counts go first when there's no room (narrow window, inspector open). */}
          <span className={`items-center gap-1 ${selection ? "flex @max-[54rem]/map:hidden" : "flex @max-[30rem]/map:hidden"}`}>
            <span className="px-2.5 text-xs whitespace-nowrap text-fg-muted tabular-nums">
              {map!.view.length} concepts · {map!.edges.length} arrows
            </span>
            <span className="mx-0.5 h-4 w-px bg-line-strong" />
          </span>
          <Button variant="ghost" size="sm" icon={<PlusIcon className="size-3.5" />} onClick={() => setSelection({ kind: "add-concept" })}>
            Concept
          </Button>
          <Button variant="ghost" size="sm" icon={<PlusIcon className="size-3.5" />} onClick={() => setSelection({ kind: "add-arrow" })}>
            Arrow
          </Button>
          <Button variant="ghost" size="sm" icon={<RefreshIcon className="size-3.5" />} onClick={() => setRebuilding(true)}>
            Rebuild
          </Button>
        </div>
        {running && (
          <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-lg border border-line-strong bg-overlay px-3 py-2 text-xs text-fg-muted shadow-sm" role="status">
            <Spinner className="size-3.5 text-accent-text" />
            <span className="font-medium text-fg">{STAGE_LABEL[progress.stage]}</span>
            {progress.detail}
          </div>
        )}
        {failure && <div className="pointer-events-auto w-96 max-w-full">{failure}</div>}
        {props.editError && (
          <Alert tone="danger" title="Not saved" onDismiss={props.onDismissError} className="pointer-events-auto w-96 max-w-full bg-overlay">
            {props.editError}
          </Alert>
        )}
      </div>

      {selection && (
        <Inspector
          // key: a new selection starts its form fresh from the saved values
          key={selection.kind === "concept" ? `c-${selection.conceptId}` : selection.kind === "edge" ? `e-${edgeKey(selection.edge)}` : selection.kind}
          title={
            selection.kind === "concept"
              ? (concept?.name ?? "Concept")
              : selection.kind === "edge"
                ? selection.edge.type === "prereq"
                  ? "Prerequisite arrow"
                  : "Part-of arrow"
                : selection.kind === "add-concept"
                  ? "Add a concept"
                  : "Add an arrow"
          }
          subtitle={selection.kind === "concept" ? concept?.id : selection.kind === "edge" ? edgeLabel(selection.edge) : undefined}
          onClose={close}
        >
          {concept && entry && (
            <ConceptInspector
              key={JSON.stringify([concept, entry])}
              concept={concept}
              entry={entry}
              knowledge={props.knowledge[concept.id]}
              sharedWith={sharedWith[concept.id] ?? []}
              onEdit={edit}
            />
          )}
          {selection.kind === "edge" && <ArrowInspector edge={selection.edge} sharedWith={edgeSharedWith(selection.edge, sharedWith)} name={name} onEdit={edit} />}
          {selection.kind === "add-concept" && <AddConceptForm onEdit={edit} />}
          {selection.kind === "add-arrow" && <AddArrowForm map={map!} onEdit={edit} />}
        </Inspector>
      )}
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
