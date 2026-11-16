// Edit one arrow: change its depths (delete + add, as one action) or delete it.
import { useState } from "react";
import type { Edge, MapEdit } from "@helix/contracts";
import { BUTTON, DANGER_BUTTON, Field, INPUT } from "../ui.tsx";
import { edgeLabel } from "./edits.ts";
import { SharedNote } from "./SharedNote.tsx";

type Props = { edge: Edge; sharedWith: string[]; onEdit: (edits: MapEdit[]) => void };
type Level = number; // a depth, 1–5 (the contract checks the range)

export function ArrowInspector({ edge, sharedWith, onEdit }: Props) {
  const [dstDepth, setDstDepth] = useState<Level>(edge.type === "prereq" ? edge.dstDepth : 1);
  const [srcDepth, setSrcDepth] = useState<Level>(edge.type === "prereq" ? edge.srcDepth : 1);
  const changed = edge.type === "prereq" && (dstDepth !== edge.dstDepth || srcDepth !== edge.srcDepth);

  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-xs text-zinc-300">{edgeLabel(edge)}</div>
      <SharedNote goals={sharedWith} what="This arrow is in their map too; changing it changes theirs." />

      {edge.type === "prereq" && (
        <div className="flex gap-3">
          <Field label={`${edge.dst} at depth`}>
            <DepthSelect value={dstDepth} onChange={setDstDepth} />
          </Field>
          <Field label={`needs ${edge.src} at depth`}>
            <DepthSelect value={srcDepth} onChange={setSrcDepth} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between">
        {edge.type === "prereq" ? (
          <button
            disabled={!changed}
            onClick={() => onEdit([{ op: "delete_edge", edge }, { op: "add_edge", edge: { ...edge, dstDepth, srcDepth } }])}
            className={BUTTON}
          >
            Save
          </button>
        ) : (
          <span />
        )}
        <button onClick={() => onEdit([{ op: "delete_edge", edge }])} className={DANGER_BUTTON}>
          Delete arrow
        </button>
      </div>
    </div>
  );
}

export function DepthSelect({ value, onChange }: { value: Level; onChange: (d: Level) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value) as Level)} className={INPUT}>
      {[1, 2, 3, 4, 5].map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
