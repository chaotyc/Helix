import { useState } from "react";
import { Effort, SourceKind } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Alert } from "../ui/feedback.tsx";
import { Field, INPUT, SegmentedControl } from "../ui/form.tsx";
import { ArrowRightIcon } from "../ui/icons.tsx";
import { BuildSteps } from "./BuildSteps.tsx";

type Props = {
  hasMap: boolean; // rebuilding replaces the goal's current map (V4)
  onAsk: (sourceText: string | undefined, sourceKind: SourceKind, effort: Effort) => void;
  onCancel?: () => void;
};

const KIND_LABEL: Record<SourceKind, string> = { syllabus: "Syllabus", contents: "Table of contents", notes: "Notes", other: "Other" };
const EFFORT_LABEL: Record<Effort, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

// Step 1 of building a map: paste the source (or none), then the clarifier asks its questions.
export function BuildMapPanel({ hasMap, onAsk, onCancel }: Props) {
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<SourceKind>("syllabus");
  const [effort, setEffort] = useState<Effort>("high");

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <BuildSteps current={0} />
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-fg">{hasMap ? "Rebuild the map" : "Build the map"}</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Give Helix the course material. It asks a few questions next, then lays out the concepts.</p>

      <div className="mt-7 flex flex-col gap-5 rounded-xl border border-line bg-raised p-6 shadow-xs">
        <Field label="Source material" hint="Optional. Leave it empty to build from the goal and your answers.">
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={11}
            placeholder="Paste a syllabus, a table of contents, or notes…"
            className={`${INPUT} resize-y font-mono text-[12.5px] leading-relaxed`}
          />
        </Field>

        <Field label="What is it?" group>
          <SegmentedControl
            label="What is it?"
            options={SourceKind.options.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            value={kind}
            onChange={setKind}
            disabled={!source.trim()}
            className="self-start"
          />
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
            <Button variant="primary" onClick={() => onAsk(source.trim() || undefined, kind, effort)} icon={<ArrowRightIcon className="size-4" />}>
              {hasMap ? "Replace map and continue" : "Continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
