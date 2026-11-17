import { useState } from "react";
import { GoalInput } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { Field, INPUT } from "../ui/form.tsx";

type Props = { onCreate: (goal: GoalInput) => void; onCancel: () => void };

// The goal form: title, kind, capstone, optional exam date. The map is built next, on the goal's map page.
export function NewGoalForm({ onCreate, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [capstone, setCapstone] = useState("");
  const [examDate, setExamDate] = useState("");

  const goal = GoalInput.safeParse({ title: title.trim(), kind: "course", capstone: capstone.trim(), examDate: examDate || undefined });

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">New goal</h1>
      <p className="mt-1 text-[13px] text-fg-muted">What you're working toward. Next, Helix builds its concept map from your course material.</p>

      <form
        className="mt-7 flex flex-col gap-5 rounded-xl border border-line bg-raised p-6 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          if (goal.success) onCreate(goal.data);
        }}
      >
        <Field label="Title" hint="A course, a book, or one specific problem.">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="Signals and Systems" autoFocus />
        </Field>

        <Field label="Kind" hint="Only courses for now." group>
          <span className="text-sm text-fg">Course</span>
        </Field>

        <Field label="Capstone" hint="What would prove you've got it?">
          <textarea
            value={capstone}
            onChange={(e) => setCapstone(e.target.value)}
            rows={3}
            className={`${INPUT} resize-none`}
            placeholder="Design and analyze a simple digital filter"
          />
        </Field>

        <Field label="Exam date" hint="Optional.">
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={`${INPUT} max-w-48 ${examDate ? "" : "[&:not(:focus)]:text-fg-subtle!"}`} />
        </Field>

        <div className="-mx-6 mt-1 -mb-6 flex items-center justify-end gap-2 rounded-b-xl border-t border-line bg-sunken px-6 py-3.5">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!goal.success}>
            Create goal
          </Button>
        </div>
      </form>
    </div>
  );
}
