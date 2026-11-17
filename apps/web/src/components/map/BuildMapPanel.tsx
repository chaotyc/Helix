import { useState } from "react";
import { Effort } from "@helix/contracts";
import { DocumentDrop, useDocuments } from "../goal/DocumentDrop.tsx";
import { Button } from "../ui/Button.tsx";
import { Alert } from "../ui/feedback.tsx";
import { Field, SegmentedControl } from "../ui/form.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import { BuildSteps } from "./BuildSteps.tsx";

type Props = {
  hasMap: boolean; // rebuilding replaces the goal's current map (V4)
  onAsk: (sourceText: string | undefined, effort: Effort) => void;
  onCancel?: () => void;
};

const EFFORT_LABEL: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

// Step 1 of building a map: add documents (or none), then the clarifier asks its questions.
export function BuildMapPanel({ hasMap, onAsk, onCancel }: Props) {
  const documents = useDocuments();
  const [effort, setEffort] = useState<Effort>("high");

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <BuildSteps current={0} />
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-fg">{hasMap ? "Rebuild the map" : "Build the map"}</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Give Helix the material: a syllabus, textbook, notes, or posting. It asks a few questions next, then lays out the concepts.</p>

      <div className="mt-7 flex flex-col gap-5 rounded-xl border border-line bg-raised p-6 shadow-xs">
        <Field label="Documents" hint="Optional. Without any, Helix builds the map from the goal and your answers." group>
          <DocumentDrop documents={documents} />
        </Field>

        <Field label="Effort" hint="More thinking: better maps, more cost." group>
          <SegmentedControl
            label="Effort"
            options={Effort.options.map((level) => ({ value: level, label: EFFORT_LABEL[level] }))}
            value={effort}
            onChange={setEffort}
            className="self-start"
          />
        </Field>

        {hasMap && <Alert tone="warning">This replaces the map for this goal. Your earlier edits stay in the history.</Alert>}

        <div className="-mx-6 mt-1 -mb-6 flex items-center justify-between gap-3 rounded-b-xl border-t border-line bg-sunken px-6 py-3.5">
          <span className="text-xs text-fg-subtle">Next: a few questions about what you want from it.</span>
          <div className="flex gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              disabled={documents.reading}
              onClick={() => onAsk(documents.sourceText, effort)}
              icon={<ArrowRightIcon className="size-4" />}
            >
              {documents.reading ? "Reading documents…" : hasMap ? "Replace map and continue" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
