import { useState } from "react";
import { Effort, SourceKind } from "@helix/contracts";
import { BUTTON, Field, INPUT, QUIET_BUTTON } from "../ui.tsx";

type Props = {
  hasMap: boolean; // rebuilding replaces the goal's current map (V4)
  onAsk: (sourceText: string | undefined, sourceKind: SourceKind, effort: Effort) => void;
  onCancel?: () => void;
};

const KIND_LABEL: Record<SourceKind, string> = { syllabus: "Syllabus", contents: "Table of contents", notes: "Notes", other: "Other" };

// Step 1 of building a map: paste the source (or none), then the clarifier asks its questions.
export function BuildMapPanel({ hasMap, onAsk, onCancel }: Props) {
  const [source, setSource] = useState("");
  const [kind, setKind] = useState<SourceKind>("syllabus");
  const [effort, setEffort] = useState<Effort>("high");

  function ask(): void {
    const confirmed = !hasMap || window.confirm("This replaces the map for this goal. Your earlier edits stay in the history.");
    if (confirmed) onAsk(source.trim() || undefined, kind, effort);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 p-8">
      <h2 className="text-base font-semibold text-zinc-100">{hasMap ? "Rebuild the map" : "Build the map"}</h2>

      <Field label="Source material (optional)" hint="Paste a syllabus, a table of contents, or notes. Leave empty to build from the goal and your answers.">
        <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={10} className={`${INPUT} font-mono text-xs`} />
      </Field>

      <div className="flex gap-4">
        <Field label="What is it?">
          <select value={kind} onChange={(e) => setKind(SourceKind.parse(e.target.value))} disabled={!source.trim()} className={INPUT}>
            {SourceKind.options.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Effort" hint="More thinking: better maps, more cost.">
          <select value={effort} onChange={(e) => setEffort(Effort.parse(e.target.value))} className={INPUT}>
            {Effort.options.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={ask} className={BUTTON}>
          Continue
        </button>
        {onCancel && (
          <button onClick={onCancel} className={QUIET_BUTTON}>
            Cancel
          </button>
        )}
        <span className="text-xs text-zinc-500">Next: a few questions about what you want from it.</span>
      </div>
    </div>
  );
}
