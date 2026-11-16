import { useState } from "react";
import type { ClarifyAnswer, ClarifyQuestion } from "@helix/contracts";
import { BUTTON, INPUT } from "../ui.tsx";

type Props = {
  questions: ClarifyQuestion[];
  onBuild: (answers: ClarifyAnswer[]) => void;
};

// Step 2 of building a map: answer every clarifying question (C4), then build.
// Choice questions offer their suggested answers plus your own words (C2).
export function QuestionsCard({ questions, onBuild }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const set = (id: string, answer: string) => setAnswers((current) => ({ ...current, [id]: answer }));
  const complete = questions.every((q) => answers[q.id]?.trim());

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-8">
      <div>
        <h2 className="text-base font-semibold text-zinc-100">A few questions first</h2>
        <p className="text-sm text-zinc-500">
          {questions.length ? "Every question needs an answer before the map is built." : "No questions needed this time."}
        </p>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-2">
          <div className="text-sm text-zinc-200">
            {i + 1}. {q.question}
          </div>
          {q.answerType === "choice" && (
            <div className="flex flex-wrap gap-2">
              {q.choices.map((choice) => (
                <button
                  key={choice}
                  onClick={() => set(q.id, choice)}
                  className={`rounded-md border px-2.5 py-1 text-sm ${
                    answers[q.id] === choice ? "border-sky-500 bg-sky-950 text-sky-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          )}
          <textarea
            rows={q.answerType === "choice" ? 1 : 2}
            placeholder={q.answerType === "choice" ? "Or your own answer" : "Your answer"}
            value={q.choices.includes(answers[q.id] ?? "") ? "" : (answers[q.id] ?? "")}
            onChange={(e) => set(q.id, e.target.value)}
            className={INPUT}
          />
        </div>
      ))}

      <button
        disabled={!complete}
        onClick={() => onBuild(questions.map((q) => ({ questionId: q.id, answer: answers[q.id]!.trim() })))}
        className={BUTTON}
      >
        Build map
      </button>
    </div>
  );
}
