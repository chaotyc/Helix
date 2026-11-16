// Add a concept to this goal: creates it in the graph and adds it to this goal's map, as one action.
import { useState } from "react";
import { Concept, type MapEdit, type ViewEntry } from "@helix/contracts";
import { BUTTON, Field, INPUT } from "../ui.tsx";
import { slugify } from "./edits.ts";

type Props = { onEdit: (edits: MapEdit[]) => void };

export function AddConceptForm({ onEdit }: Props) {
  const [name, setName] = useState("");
  const [id, setId] = useState<string | null>(null); // null: follow the name
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Concept["kind"]>("concept");
  const [targetDepth, setTargetDepth] = useState<ViewEntry["targetDepth"]>(3);
  const [role, setRole] = useState<ViewEntry["role"]>("taught");

  const concept = Concept.safeParse({ id: id ?? slugify(name), name: name.trim(), description: description.trim(), kind });

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-zinc-200">Add a concept</div>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} autoFocus />
      </Field>
      <Field label="Id" hint="Lowercase words joined by hyphens. Can't be changed later.">
        <input value={id ?? slugify(name)} onChange={(e) => setId(e.target.value)} className={`${INPUT} font-mono`} />
      </Field>
      <Field label="Description" hint="One sentence saying what it is.">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={INPUT} />
      </Field>
      <div className="flex gap-3">
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as Concept["kind"])} className={INPUT}>
            <option value="concept">Concept</option>
            <option value="skill">Skill</option>
            <option value="decision">Decision</option>
          </select>
        </Field>
        <Field label="Depth">
          <select value={targetDepth} onChange={(e) => setTargetDepth(Number(e.target.value) as ViewEntry["targetDepth"])} className={INPUT}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as ViewEntry["role"])} className={INPUT}>
            <option value="taught">Taught</option>
            <option value="background">Background</option>
          </select>
        </Field>
      </div>
      <button
        disabled={!concept.success}
        onClick={() =>
          concept.success &&
          onEdit([
            { op: "add_concept", concept: concept.data },
            { op: "set_view_entry", entry: { conceptId: concept.data.id, targetDepth, role } },
          ])
        }
        className={BUTTON}
      >
        Add
      </button>
    </div>
  );
}
