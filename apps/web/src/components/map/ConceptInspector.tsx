// Edit one concept: its name, description, and kind (shared by every goal that uses it), and
// its target depth and role (this goal only). "Remove" takes it out of this goal only (V2).
// Below the form: what the learner model says the learner knows of it.
import { useState } from "react";
import { DEPTH_NAMES, type Concept, type ConceptKnowledge, type MapEdit, type ViewEntry } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field, INPUT, SegmentedControl, Select } from "../ui/form.tsx";
import { TrashIcon } from "../ui/icons.tsx";
import { DepthSelect } from "./DepthSelect.tsx";
import { conceptEdits } from "./edits.ts";
import { InspectorFooter } from "./Inspector.tsx";
import { ROLE_OPTIONS } from "./options.ts";
import { SharedNote } from "./SharedNote.tsx";

type Props = {
  concept: Concept;
  entry: ViewEntry;
  knowledge: ConceptKnowledge | undefined;
  sharedWith: string[];
  onEdit: (edits: MapEdit[]) => void;
};

export function ConceptInspector({ concept, entry, knowledge, sharedWith, onEdit }: Props) {
  // Form state starts from the saved values; the parent remounts this when the selection changes.
  const [name, setName] = useState(concept.name);
  const [description, setDescription] = useState(concept.description);
  const [kind, setKind] = useState(concept.kind);
  const [targetDepth, setTargetDepth] = useState(entry.targetDepth);
  const [role, setRole] = useState(entry.role);

  const edits = conceptEdits(concept, entry, { ...concept, name: name.trim(), description: description.trim(), kind }, { ...entry, targetDepth, role });
  const valid = name.trim() !== "" && description.trim() !== "";

  return (
    <>
      <div className="flex flex-col gap-4 p-4" data-dirty={edits.length > 0 || undefined}>
        <SharedNote goals={sharedWith} what="Name, description, and kind change there too; depth and role are for this goal only." />

        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} />
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT} resize-none`} />
        </Field>
        <Field label="Kind">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Concept["kind"])}>
            <option value="concept">Concept · an idea to understand</option>
            <option value="skill">Skill · a procedure to perform</option>
            <option value="decision">Decision · a choice between approaches</option>
          </Select>
        </Field>

        <div className="mt-1 border-t border-line pt-4 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">For this goal</div>
        <Field label="Target depth">
          <DepthSelect value={targetDepth} onChange={setTargetDepth} />
        </Field>
        <Field label="Role" group>
          <SegmentedControl label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
        </Field>

        <KnowledgeSection knowledge={knowledge} target={entry.targetDepth} />
      </div>

      <InspectorFooter>
        <Button variant="danger" onClick={() => onEdit([{ op: "remove_view_entry", conceptId: concept.id }])} icon={<TrashIcon className="size-4" />}>
          Remove from goal
        </Button>
        <Button variant="primary" disabled={!valid || edits.length === 0} onClick={() => onEdit(edits)}>
          Save
        </Button>
      </InspectorFooter>
    </>
  );
}

// The chance each depth is mastered, as bars, with the target marked.
function KnowledgeSection({ knowledge, target }: { knowledge: ConceptKnowledge | undefined; target: number }) {
  return (
    <section className="mt-1 border-t border-line pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[11px] font-medium tracking-wide text-fg-subtle uppercase">What you know</span>
        {knowledge && (
          <span className="text-[11px] text-fg-subtle">
            {knowledge.answers} {knowledge.answers === 1 ? "answer" : "answers"}
          </span>
        )}
      </div>
      {!knowledge ? (
        <p className="text-xs text-fg-subtle">No answers yet.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {knowledge.mastery.map((p, i) => {
              const depth = i + 1;
              const held = depth <= knowledge.depthHeld;
              return (
                <li key={depth} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs" title={depth > target ? "Beyond this goal's target" : undefined}>
                  <span className={held ? "font-medium text-fg" : depth > target ? "text-fg-subtle" : "text-fg-muted"}>
                    {depth} {DEPTH_NAMES[i]}
                  </span>
                  <span className={`h-1.5 overflow-hidden rounded-full ${depth > target ? "bg-track/50" : "bg-track"}`}>
                    <span
                      className={`block h-full rounded-full ${held ? "bg-accent" : depth > target ? "bg-accent/25" : "bg-accent/45"}`}
                      style={{ width: `${Math.round(p * 100)}%` }}
                    />
                  </span>
                  <span className="text-right text-fg-subtle tabular-nums">{Math.round(p * 100)}%</span>
                </li>
              );
            })}
          </ul>
          {knowledge.depthHeld > knowledge.depthTested && (
            <p className="mt-2.5 text-xs text-fg-subtle">
              Depth {knowledge.depthHeld} held through arrows (tested to {knowledge.depthTested}).
            </p>
          )}
        </>
      )}
    </section>
  );
}
