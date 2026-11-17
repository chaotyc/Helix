import { useState } from "react";
import type { ClarifyAnswer, ClarifyQuestion } from "@helix/contracts";
import { Button } from "../ui/Button.tsx";
import { INPUT } from "../ui/form.tsx";
import { CheckIcon, GraphIcon } from "../ui/icons.tsx";
import { BuildSteps } from "./BuildSteps.tsx";

type Props = {
  questions: ClarifyQuestion[];
  onBuild: (answers: ClarifyAnswer[]) => void;
};

// Step 2 of building a map: answer every clarifying question (C4), then build.
// Choice questions offer their suggested answers plus your own words (C2).
export function QuestionsCard({ questions, onBuild }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({}); // what's in each "own words" box
  const set = (id: string, answer: string) => setAnswers((current) => ({ ...current, [id]: answer }));
  // Picking a chip clears the box; typing in the box replaces the chip.
  const pick = (id: string, choice: string) => {
    set(id, choice);
    setTyped((current) => ({ ...current, [id]: "" }));
  };
  const typeAnswer = (id: string, text: string) => {
    set(id, text);
    setTyped((current) => ({ ...current, [id]: text }));
  };
  const answered = questions.filter((q) => answers[q.id]?.trim()).length;
  const complete = answered === questions.length;

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in px-8 py-10">
      <BuildSteps current={1} />
      <h1 className="mt-6 text-xl font-semibold tracking-tight text-fg">A few questions first</h1>
      <p className="mt-1 text-[13px] text-fg-muted">
        {questions.length ? "Every question needs an answer before the map is built." : "No questions needed this time."}
      </p>

      <ol className="mt-7 flex flex-col gap-3">
        {questions.map((q, i) => {
          const done = Boolean(answers[q.id]?.trim());
          return (
            <li key={q.id} className="rounded-xl border border-line bg-raised p-5 shadow-xs">
              <div className="flex gap-3">
                <span
                  className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    done ? "bg-accent text-accent-fg" : "bg-fill-strong text-fg-muted"
                  }`}
                >
                  {done ? <CheckIcon className="size-3" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div id={`question-${q.id}`} className="text-sm font-medium text-fg">
                    {q.question}
                  </div>
                  {q.why && <div className="mt-0.5 text-xs text-fg-subtle">{q.why}</div>}

                  {q.answerType === "choice" && (
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={q.question}>
                      {q.choices.map((choice) => {
                        const picked = answers[q.id] === choice && !typed[q.id];
                        return (
                          <button
                            key={choice}
                            type="button"
                            aria-pressed={picked}
                            onClick={() => pick(q.id, choice)}
                            className={`rounded-full border px-3 py-1 text-[13px] transition-colors ${
                              picked ? "border-accent bg-accent-soft font-medium text-accent-text" : "border-line-strong text-fg-muted hover:bg-fill hover:text-fg"
                            }`}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <textarea
                    rows={q.answerType === "choice" ? 1 : 2}
                    placeholder={q.answerType === "choice" ? "Or in your own words" : "Your answer"}
                    aria-labelledby={`question-${q.id}`}
                    value={typed[q.id] ?? ""}
                    onChange={(e) => typeAnswer(q.id, e.target.value)}
                    className={`${INPUT} mt-3 resize-none`}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-subtle tabular-nums">
          {answered} of {questions.length} answered
        </span>
        <Button
          variant="primary"
          size="lg"
          disabled={!complete}
          icon={<GraphIcon className="size-4" />}
          onClick={() => onBuild(questions.map((q) => ({ questionId: q.id, answer: answers[q.id]!.trim() })))}
        >
          Build map
        </Button>
      </div>
    </div>
  );
}
