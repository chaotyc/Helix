// Add a concept to this goal: creates it in the graph and adds it to this goal's map, as one action.
import { useState } from "react";
import { Concept, type MapEdit, type ViewEntry } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field, INPUT, SegmentedControl } from "../ui/form.tsx";
import { PlusIcon } from "../ui/icons.tsx";
import { DepthSelect } from "./DepthSelect.tsx";
import { slugify } from "./edits.ts";
import { InspectorFooter } from "./Inspector.tsx";
import { KIND_OPTIONS, ROLE_OPTIONS } from "./options.ts";

type Props = { onEdit: (edits: MapEdit[]) => void };

export function AddConceptForm({ onEdit }: Props) {
  const [name, setName] = useState("");
  const [id, setId] = useState<string | null>(null); // null: follow the name
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Concept["kind"]>("concept");
  const [targetDepth, setTargetDepth] = useState<ViewEntry["targetDepth"]>(3);
  const [role, setRole] = useState<ViewEntry["role"]>("taught");

  const dirty = name !== "" || id !== null || description !== "" || kind !== "concept" || targetDepth !== 3 || role !== "taught";
  const concept = Concept.safeParse({ id: id ?? slugify(name), name: name.trim(), description: description.trim(), kind });

  return (
    <>
      <div className="flex flex-col gap-4 p-4" data-dirty={dirty || undefined}>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Convolution" autoFocus />
        </Field>
        <Field label="Id" hint="Lowercase words joined by hyphens. Can't be changed later.">
          <input value={id ?? slugify(name)} onChange={(e) => setId(e.target.value)} className={`${INPUT} font-mono text-[13px]`} />
        </Field>
        <Field label="Description" hint="One sentence saying what it is.">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${INPUT} resize-none`} />
        </Field>
        <Field label="Kind" group>
          <SegmentedControl label="Kind" options={KIND_OPTIONS} value={kind} onChange={setKind} />
        </Field>
        <Field label="Target depth">
          <DepthSelect value={targetDepth} onChange={setTargetDepth} />
        </Field>
        <Field label="Role" group>
          <SegmentedControl label="Role" options={ROLE_OPTIONS} value={role} onChange={setRole} />
        </Field>
      </div>
      <InspectorFooter>
        <span />
        <Button
          variant="primary"
          disabled={!concept.success}
          icon={<PlusIcon className="size-4" />}
          onClick={() =>
            concept.success &&
            onEdit([
              { op: "add_concept", concept: concept.data },
              { op: "set_view_entry", entry: { conceptId: concept.data.id, targetDepth, role } },
            ])
          }
        >
          Add concept
        </Button>
      </InspectorFooter>
    </>
  );
}
