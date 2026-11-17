// What the main panel shows with no goal picked: the goals as cards, or, before there are
// any, what Helix does and a button to make the first goal.
import type { Goal, Session } from "@helix/contracts";
import { dayLabel, examLabel } from "../../format.ts";
import { Button } from "../ui/Button.tsx";
import { CalendarIcon, ChatIcon, GraphIcon, PlusIcon, TargetIcon } from "../ui/icons.tsx";

type Props = {
  goals: Goal[];
  sessions: Session[];
  onSelectGoal: (goalId: string) => void;
  onNewGoal: () => void;
};

const STEPS = [
  { icon: <GraphIcon className="size-[18px]" />, title: "Map it", text: "Add a syllabus, textbook, or posting. Helix lays out its concepts and what each one needs first." },
  { icon: <TargetIcon className="size-[18px]" />, title: "Find your level", text: "A short diagnostic measures how deep you already hold each concept." },
  { icon: <ChatIcon className="size-[18px]" />, title: "Learn the next thing", text: "Tutoring sessions teach what you're ready for, one step at a time." },
];

export function Welcome({ goals, sessions, onSelectGoal, onNewGoal }: Props) {
  if (goals.length === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-3xl animate-fade-in flex-col justify-center px-8 py-12">
        <img src="/brand/helix-mark.svg" alt="" className="mb-6 size-10 dark:hidden" />
        <img src="/brand/helix-mark-on-dark.svg" alt="" className="mb-6 hidden size-10 dark:block" />
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Learn anything, to the depth you need.</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
          Pick a goal: a course you're taking, a job you're after, or a project. Helix turns its material into a map of concepts, finds what you already know, and tutors you
          through the rest.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-line bg-raised p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-text">{step.icon}</span>
                <span className="text-xs font-medium text-fg-subtle tabular-nums">{i + 1}</span>
              </div>
              <div className="text-sm font-semibold text-fg">{step.title}</div>
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{step.text}</p>
            </div>
          ))}
        </div>
        <Button variant="primary" size="lg" onClick={onNewGoal} icon={<PlusIcon className="size-4" />} className="mt-10 self-start">
          Create your first goal
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-fg">Your goals</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Pick one to see where you stand, or start something new.</p>
      <div className="mt-7 grid grid-cols-2 gap-3">
        {goals.map((goal) => {
          const goalSessions = sessions.filter((s) => s.goalId === goal.id);
          const last = goalSessions.at(-1);
          const lastDay = last ? dayLabel(last.startedAt) : null;
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => onSelectGoal(goal.id)}
              className="flex min-h-32 flex-col rounded-xl border border-line bg-raised p-5 text-left shadow-xs transition-colors hover:border-line-strong hover:bg-fill"
            >
              <div className="text-sm font-semibold text-fg">{goal.title}</div>
              {(goal.prompt || goal.capstone) && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-fg-muted">{goal.prompt || goal.capstone}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-fg-subtle">
                <span>
                  {goalSessions.length} {goalSessions.length === 1 ? "session" : "sessions"}
                  {lastDay && ` · last ${lastDay === "Today" || lastDay === "Yesterday" ? lastDay.toLowerCase() : lastDay}`}
                </span>
                {goal.examDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="size-3" /> {examLabel(goal.examDate)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onNewGoal}
          className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-[13px] font-medium text-fg-muted transition-colors hover:bg-fill hover:text-fg"
        >
          <PlusIcon className="size-5" />
          New goal
        </button>
      </div>
    </div>
  );
}
