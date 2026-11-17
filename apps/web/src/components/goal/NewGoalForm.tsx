import { useState } from "react";
import { GoalInput } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field, INPUT } from "../ui/form.tsx";
import { DocumentDrop, useDocuments } from "./DocumentDrop.tsx";

type Props = { onCreate: (goal: GoalInput, sourceText: string | undefined) => void; onCancel: () => void };

// The goal form: a title, the learner's own words, and any documents. Creating the goal goes
// straight on to the clarifier's questions, then the map.
export function NewGoalForm({ onCreate, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const documents = useDocuments();

  const goal = GoalInput.safeParse({ title: title.trim(), kind: "course", prompt: prompt.trim() || undefined });
  const ready = goal.success && !documents.reading;

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">New goal</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Say what you're working toward and add any material you have. Helix asks a few questions, then builds the concept map.</p>

      <form
        className="mt-7 flex flex-col gap-5 rounded-xl border border-line bg-raised p-6 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onCreate(goal.data, documents.sourceText);
        }}
      >
        <Field label="Title" hint="A course, a book, a job, or one specific problem.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="Signals and Systems" autoFocus />
        </Field>

        <Field label="What do you want?" hint="In your own words: what you want to be able to do, and why.">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className={`${INPUT} resize-y`}
            placeholder="I'm taking this course this semester and I want to be able to design and analyze a simple digital filter."
          />
        </Field>

        <Field label="Documents" hint="Optional. Without any, Helix builds the map from what you wrote and your answers." group>
          <DocumentDrop documents={documents} />
        </Field>

        <div className="-mx-6 mt-1 -mb-6 flex items-center justify-end gap-2 rounded-b-xl border-t border-line bg-sunken px-6 py-3.5">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!ready}>
            {documents.reading ? "Reading documents…" : "Create goal"}
          </Button>
        </div>
      </form>
    </div>
  );
}
