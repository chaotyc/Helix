import { useState } from "react";
import { GoalInput } from "@helix/contracts";
import { BUTTON, Field, INPUT } from "../ui.tsx";

type Props = { onCreate: (goal: GoalInput) => void };

// The goal form: title, kind, capstone, optional exam date. The map is built next, on the goal's map page.
export function NewGoalForm({ onCreate }: Props) {
  const [title, setTitle] = useState("");
  const [capstone, setCapstone] = useState("");
  const [examDate, setExamDate] = useState("");

  const goal = GoalInput.safeParse({ title: title.trim(), kind: "course", capstone: capstone.trim(), examDate: examDate || undefined });

  return (
    <form
      className="flex max-w-xl flex-col gap-4 p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (goal.success) onCreate(goal.data);
      }}
    >
      <h1 className="text-lg font-semibold text-zinc-100">New goal</h1>

      <Field label="Title" hint="A course, a book, or one specific problem.">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={INPUT} placeholder="Signals and Systems" autoFocus />
      </Field>

      <Field label="Kind">
        <select value="course" disabled className={INPUT}>
          <option value="course">Course</option>
        </select>
      </Field>

      <Field label="Capstone" hint="What would prove you've got it?">
        <textarea value={capstone} onChange={(e) => setCapstone(e.target.value)} rows={2} className={INPUT} placeholder="Design and analyze a simple digital filter" />
      </Field>

      <Field label="Exam date (optional)">
        <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={INPUT} />
      </Field>

      <button type="submit" disabled={!goal.success} className={BUTTON}>
        Create goal
      </button>
    </form>
  );
}
