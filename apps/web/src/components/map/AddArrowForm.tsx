// Add an arrow between two of this goal's concepts: "first (at depth) needs second (at depth)",
// or "first is part of second".
import { useState } from "react";
import type { Edge, GoalMap, MapEdit } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field, SegmentedControl, Select } from "../ui/form.tsx";
import { PlusIcon } from "../ui/icons.tsx";
import { DepthSelect } from "./DepthSelect.tsx";
import { InspectorFooter } from "./Inspector.tsx";

type Props = { map: GoalMap; onEdit: (edits: MapEdit[]) => void };
type Level = number; // a depth, 1–5 (the contract checks the range)

const TYPE_OPTIONS = [
  { value: "prereq" as const, label: "Prerequisite", title: "This concept needs another one first" },
  { value: "part_of" as const, label: "Part of", title: "This concept is a part of another one" },
];

export function AddArrowForm({ map, onEdit }: Props) {
  const ids = map.view.map((e) => e.conceptId);
  const [type, setType] = useState<Edge["type"]>("prereq");
  const [first, setFirst] = useState(ids[0] ?? "");
  const [firstDepth, setFirstDepth] = useState<Level>(1);
  const [second, setSecond] = useState(ids[1] ?? ids[0] ?? "");
  const [secondDepth, setSecondDepth] = useState<Level>(1);

  // A prerequisite arrow runs from what's needed (src) to what needs it (dst);
  // part-of runs from the part (src) to the whole (dst).
  const edge: Edge =
    type === "prereq"
      ? { type, dst: first, dstDepth: firstDepth, src: second, srcDepth: secondDepth }
      : { type, src: first, dst: second };
  const name = (id: string) => map.concepts.find((c) => c.id === id)?.name ?? id;
  const same = first === second;
  const dirty = type !== "prereq" || first !== (ids[0] ?? "") || second !== (ids[1] ?? ids[0] ?? "") || firstDepth !== 1 || secondDepth !== 1;

  const conceptSelect = (value: string, onChange: (id: string) => void) => (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {ids.map((id) => (
        <option key={id} value={id}>
          {name(id)}
        </option>
      ))}
    </Select>
  );

  return (
    <>
      <div className="flex flex-col gap-4 p-4" data-dirty={dirty || undefined}>
        <Field label="Kind" group>
          <SegmentedControl label="Kind" options={TYPE_OPTIONS} value={type} onChange={setType} />
        </Field>
        <Field label="This concept…">{conceptSelect(first, setFirst)}</Field>
        {type === "prereq" && (
          <Field label="…at depth">
            <DepthSelect value={firstDepth} onChange={setFirstDepth} />
          </Field>
        )}
        <Field label={type === "prereq" ? "…needs this one first…" : "…is part of"}>{conceptSelect(second, setSecond)}</Field>
        {type === "prereq" && (
          <Field label="…at depth">
            <DepthSelect value={secondDepth} onChange={setSecondDepth} />
          </Field>
        )}
        <p className={`rounded-lg px-3 py-2 text-xs ${same ? "bg-danger-soft text-danger" : "bg-fill text-fg-muted"}`}>
          {same
            ? "Pick two different concepts."
            : type === "prereq"
              ? `${name(first)} at depth ${firstDepth} needs ${name(second)} at depth ${secondDepth} first.`
              : `${name(first)} is part of ${name(second)}.`}
        </p>
      </div>
      <InspectorFooter>
        <span />
        <Button variant="primary" disabled={!first || !second || same} icon={<PlusIcon className="size-4" />} onClick={() => onEdit([{ op: "add_edge", edge }])}>
          Add arrow
        </Button>
      </InspectorFooter>
    </>
  );
}
