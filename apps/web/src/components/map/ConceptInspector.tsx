// Edit one concept: its name, description, and kind (shared by every goal that uses it), and
// its target depth and role (this goal only). "Remove" takes it out of this goal only (V2).
import { useState } from "react";
import type { Concept, MapEdit, ViewEntry } from "@helix/contracts";
import { BUTTON, DANGER_BUTTON, Field, INPUT } from "../ui.tsx";
import { conceptEdits } from "./edits.ts";
import { SharedNote } from "./SharedNote.tsx";

type Props = {
  concept: Concept;
  entry: ViewEntry;
  sharedWith: string[];
  onEdit: (edits: MapEdit[]) => void;
};

const DEPTHS = [1, 2, 3, 4, 5] as const;
const DEPTH_NAMES = ["", "Orient", "Explain", "Apply", "Analyze", "Expert"];

export function ConceptInspector({ concept, entry, sharedWith, onEdit }: Props) {
  // Form state starts from the saved values; the parent remounts this when the selection changes.
  const [name, setName] = useState(concept.name);
  const [description, setDescription] = useState(concept.description);
  const [kind, setKind] = useState(concept.kind);
  const [targetDepth, setTargetDepth] = useState(entry.targetDepth);
  const [role, setRole] = useState(entry.role);

  const edits = conceptEdits(concept, entry, { ...concept, name: name.trim(), description: description.trim(), kind }, { ...entry, targetDepth, role });
  const valid = name.trim() !== "" && description.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono text-xs text-zinc-500">{concept.id}</div>
      <SharedNote goals={sharedWith} what="Name, description, and kind change there too; depth and role are for this goal only." />

      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
      </Field>
      <Field label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={INPUT} />
      </Field>
      <Field label="Kind">
        <select value={kind} onChange={(e) => setKind(e.target.value as Concept["kind"])} className={INPUT}>
          <option value="concept">Concept (an idea to understand)</option>
          <option value="skill">Skill (a procedure to perform)</option>
          <option value="decision">Decision (a choice between approaches)</option>
        </select>
      </Field>
      <div className="flex gap-3">
        <Field label="Target depth">
          <select value={targetDepth} onChange={(e) => setTargetDepth(Number(e.target.value) as ViewEntry["targetDepth"])} className={INPUT}>
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d} · {DEPTH_NAMES[d]}
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

      <div className="flex items-center justify-between">
        <button disabled={!valid || edits.length === 0} onClick={() => onEdit(edits)} className={BUTTON}>
          Save
        </button>
        <button onClick={() => onEdit([{ op: "remove_view_entry", conceptId: concept.id }])} className={DANGER_BUTTON}>
          Remove from this goal
        </button>
      </div>
    </div>
  );
}
