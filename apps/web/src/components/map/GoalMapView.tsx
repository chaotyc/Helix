// A goal's map page (V3): building it (source → questions → map) and editing it by clicking.
//   - questions waiting        → answer them
//   - no map yet, or rebuilding → paste the source
//   - otherwise                 → the drawn map, with an inspector for whatever is selected
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClarifyAnswer, ConceptKnowledge, Edge, Effort, GoalMap, MapEdit, SharedWith } from "@helix/contracts";
import type { BuildProgress, PendingQuestions } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Alert, Spinner } from "../ui/feedback.tsx";
import { PlusIcon, RefreshIcon, UndoIcon } from "../ui/icons.tsx";
import { AddArrowForm } from "./AddArrowForm.tsx";
import { AddConceptForm } from "./AddConceptForm.tsx";
import { ArrowInspector } from "./ArrowInspector.tsx";
import { BuildMapPanel } from "./BuildMapPanel.tsx";
import { ConceptInspector } from "./ConceptInspector.tsx";
import { edgeKey, edgeLabel, edgeSharedWith } from "./edits.ts";
import { ElapsedClock } from "./ElapsedClock.tsx";
import { Inspector } from "./Inspector.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import { MapNotice, type Notice } from "./MapNotice.tsx";
import { MapProgress, STAGE_LABEL } from "./MapProgress.tsx";
import { QuestionsCard } from "./QuestionsCard.tsx";

type Props = {
  map: GoalMap | undefined;
  sharedWith: SharedWith;
  knowledge: Record<string, ConceptKnowledge>;
  progress: BuildProgress | undefined;
  questions: PendingQuestions | undefined;
  editError: string | undefined;
  serverError: string | null;
  step: 1 | 2; // which job is running: writing questions (1) or building the map (2)
  onAsk: (sourceText: string | undefined) => void;
  onBuild: (roundId: string, answers: ClarifyAnswer[], effort: Effort) => void;
  onEdit: (edits: MapEdit[]) => void;
  nextUndo: string | null; // what Undo would take back, in words; null when there's nothing
  undone: { undid: string; n: number } | undefined; // the latest undo the server confirmed
  onUndo: () => void;
  onDismissError: () => void;
};

const INSPECTOR_INSET = 340 + 12; // the inspector's width and its gap from the edge
const UNDO_KEYS = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘Z" : "Ctrl+Z";

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
  const [selection, setSelection] = useState<Selection>(null);
  // What to select once the server confirms an edit. Until then the form stays open, so a
  // rejected edit loses nothing you typed.
  // `removed`: a concept just taken out of this goal, to offer Undo for once it's saved.
  const [afterSave, setAfterSave] = useState<{ next: Selection; removed?: { id: string; name: string } } | null>(null);
  // A note over the map; `restore` is the concept its Undo brings back (and selects again).
  const [notice, setNotice] = useState<(Notice & { restore?: string }) | null>(null);
  const [undoing, setUndoing] = useState(false); // whether the last request was an undo, for the error title
  const dismissNotice = useCallback(() => setNotice(null), []);
  const say = (message: string, restore?: string) =>
    setNotice((old) => ({ message, undoable: restore !== undefined, restore, n: (old?.n ?? 0) + 1 }));

  useEffect(() => {
    if (afterSave) {
      setSelection(afterSave.next);
      if (afterSave.removed) say(`Removed “${afterSave.removed.name}” from this goal.`, afterSave.removed.id);
      setAfterSave(null);
      return;
    }
    // Changed some other way (an undo, a rebuild): let go of anything that's no longer there.
    if (map) setSelection((current) => (stillThere(current, map) ? current : null));
  }, [map]); // a new map from the server: the edit was saved

  useEffect(() => {
    if (props.editError) setAfterSave(null); // rejected: stay where you are
  }, [props.editError]);

  // The server confirmed an undo: say what it took back. Not on opening the page with an old one.
  const seenUndo = useRef(props.undone?.n);
  useEffect(() => {
    if (!props.undone || props.undone.n === seenUndo.current) return;
    seenUndo.current = props.undone.n;
    say(`Undid: ${props.undone.undid}`);
  }, [props.undone?.n]);

  // `restore`: the concept to select again once the undo is saved (undoing "Remove from goal").
  function undo(restore?: string): void {
    if (!props.nextUndo) return;
    props.onDismissError();
    setNotice(null);
    props.onUndo();
    setUndoing(true);
    if (restore) setAfterSave({ next: { kind: "concept", conceptId: restore } });
  }

  // Cmd+Z (Ctrl+Z) undoes the last map edit, unless focus is in a text field (that's the field's
  // own undo) or the inspector holds an unsaved edit (it would be thrown away).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key.toLowerCase() !== "z" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("[data-inspector] [data-dirty]")) return;
      event.preventDefault();
      undo();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
    setUndoing(false);
    setNotice(null);
    const id = edits.length === 1 && edits[0]!.op === "remove_view_entry" ? edits[0]!.conceptId : undefined;
    const removed = id === undefined ? undefined : { id, name: map?.concepts.find((c) => c.id === id)?.name ?? id };
    setAfterSave({ next: selectionAfter(selection, edits), removed });
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
        onBuild={(answers) => props.onBuild(questions.roundId, answers, effort)}
      />
    );
  }
  if (running && !hasMap) return <MapProgress stage={progress.stage} detail={progress.detail} startedAt={progress.startedAt} step={props.step} />;
  if (!hasMap || rebuilding) {
    return (
      <>
        {failure && <div className="mx-auto w-full max-w-2xl px-8 pt-8">{failure}</div>}
        <BuildMapPanel
          hasMap={hasMap}
          onAsk={(text, chosenEffort) => {
            setEffort(chosenEffort);
            setRebuilding(false);
            props.onAsk(text);
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
          <Button
            variant="ghost"
            size="sm"
            icon={<UndoIcon className="size-3.5" />}
            disabled={!props.nextUndo}
            aria-label={props.nextUndo ? `Undo: ${props.nextUndo}` : "Undo"}
            aria-keyshortcuts="Meta+Z Control+Z"
            title={props.nextUndo ? `Undo: ${props.nextUndo} (${UNDO_KEYS})` : "Nothing to undo"}
            onClick={() => undo()}
          >
            Undo
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
            <ElapsedClock startedAt={progress.startedAt} className="text-fg-subtle" />
          </div>
        )}
        {failure && <div className="pointer-events-auto w-96 max-w-full">{failure}</div>}
        {props.editError && (
          <Alert tone="danger" title={undoing ? "Not undone" : "Not saved"} onDismiss={props.onDismissError} className="pointer-events-auto w-96 max-w-full bg-overlay">
            {props.editError}
          </Alert>
        )}
        {notice && <MapNotice notice={notice} onUndo={() => undo(notice.restore)} onDismiss={dismissNotice} />}
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
          returnFocus={() => drawnElement(selection)}
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

// The drawn node or arrow for a selection, to give focus back to when the inspector closes.
function drawnElement(selection: Selection): Element | null {
  if (selection?.kind === "concept") return document.querySelector(`.react-flow__node[data-id="${CSS.escape(selection.conceptId)}"]`);
  if (selection?.kind === "edge") return document.querySelector(`.react-flow__edge[data-id="${CSS.escape(edgeKey(selection.edge))}"]`);
  return null;
}

// Whether a selection still points at something on the map (an undo can take it away).
function stillThere(selection: Selection, map: GoalMap): boolean {
  if (selection?.kind === "concept") return map.view.some((e) => e.conceptId === selection.conceptId);
  if (selection?.kind === "edge") return map.edges.some((e) => edgeKey(e) === edgeKey(selection.edge));
  return true;
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
