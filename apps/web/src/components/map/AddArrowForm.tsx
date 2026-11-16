// Add an arrow between two of this goal's concepts: "first (at depth) needs second (at depth)",
// or "first is part of second".
import { useState } from "react";
import type { Edge, GoalMap, MapEdit } from "@helix/contracts";
import { BUTTON, Field, INPUT } from "../ui.tsx";
import { DepthSelect } from "./ArrowInspector.tsx";

type Props = { map: GoalMap; onEdit: (edits: MapEdit[]) => void };
type Level = number; // a depth, 1–5 (the contract checks the range)

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

  const conceptSelect = (value: string, onChange: (id: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      {ids.map((id) => (
        <option key={id} value={id}>
          {name(id)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-zinc-200">Add an arrow</div>
      <Field label="Kind">
        <select value={type} onChange={(e) => setType(e.target.value as Edge["type"])} className={INPUT}>
          <option value="prereq">Prerequisite (needs)</option>
          <option value="part_of">Part of</option>
        </select>
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
      <button disabled={!first || !second || first === second} onClick={() => onEdit([{ op: "add_edge", edge }])} className={BUTTON}>
        Add
      </button>
    </div>
  );
}
