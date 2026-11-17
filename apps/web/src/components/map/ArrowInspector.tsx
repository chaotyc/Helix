// Edit one arrow: change its depths (delete + add, as one action) or delete it.
import { useState } from "react";
import { depthName, type Edge, type MapEdit } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field } from "../ui/form.tsx";
import { ArrowDownIcon, TrashIcon } from "../ui/icons.tsx";
import { DepthSelect } from "./DepthSelect.tsx";
import { InspectorFooter } from "./Inspector.tsx";
import { SharedNote } from "./SharedNote.tsx";

type Props = { edge: Edge; sharedWith: string[]; name: (conceptId: string) => string; onEdit: (edits: MapEdit[]) => void };
type Level = number; // a depth, 1–5 (the contract checks the range)

export function ArrowInspector({ edge, sharedWith, name, onEdit }: Props) {
  const [dstDepth, setDstDepth] = useState<Level>(edge.type === "prereq" ? edge.dstDepth : 1);
  const [srcDepth, setSrcDepth] = useState<Level>(edge.type === "prereq" ? edge.srcDepth : 1);
  const changed = edge.type === "prereq" && (dstDepth !== edge.dstDepth || srcDepth !== edge.srcDepth);

  return (
    <>
      <div className="flex flex-col gap-4 p-4" data-dirty={changed || undefined}>
        {/* The arrow in words: what's needed, then what needs it. */}
        <div className="flex flex-col items-stretch gap-1.5">
          <EndCard name={name(edge.src)} detail={edge.type === "prereq" ? `at depth ${edge.srcDepth} · ${depthName(edge.srcDepth)}` : undefined} />
          <div className="flex items-center gap-2 pl-3 text-[11px] font-medium text-fg-subtle">
            <ArrowDownIcon className="size-3.5" />
            {edge.type === "prereq" ? "is needed for" : "is part of"}
          </div>
          <EndCard name={name(edge.dst)} detail={edge.type === "prereq" ? `at depth ${edge.dstDepth} · ${depthName(edge.dstDepth)}` : undefined} />
        </div>
        <SharedNote goals={sharedWith} what="This arrow is in their map too; changing it changes theirs." />

        {edge.type === "prereq" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${name(edge.src)} at depth`}>
              <DepthSelect value={srcDepth} onChange={setSrcDepth} />
            </Field>
            <Field label={`is needed for ${name(edge.dst)} at depth`}>
              <DepthSelect value={dstDepth} onChange={setDstDepth} />
            </Field>
          </div>
        )}
      </div>

      <InspectorFooter>
        <Button variant="danger" onClick={() => onEdit([{ op: "delete_edge", edge }])} icon={<TrashIcon className="size-4" />}>
          Delete arrow
        </Button>
        {edge.type === "prereq" && (
          <Button
            variant="primary"
            disabled={!changed}
            onClick={() => onEdit([{ op: "delete_edge", edge }, { op: "add_edge", edge: { ...edge, dstDepth, srcDepth } }])}
          >
            Save
          </Button>
        )}
      </InspectorFooter>
    </>
  );
}

function EndCard({ name, detail }: { name: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-line-strong bg-raised px-3 py-2">
      <div className="truncate text-[13px] font-medium text-fg">{name}</div>
      {detail && <div className="text-xs text-fg-subtle">{detail}</div>}
    </div>
  );
}
