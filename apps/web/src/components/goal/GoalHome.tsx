// A goal's overview page: what the goal is, where the learner stands, and starting a session.
import { useEffect, useState, type ReactNode } from "react";
import type { ConceptKnowledge, Goal, GoalMap, Session, SessionKind } from "@helix/contracts";
import { dayAndTime, examLabel, SESSION_KIND_LABEL } from "../../format.ts";
import { Badge, LiveDot } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { Alert, EmptyState, Spinner } from "../ui/feedback.tsx";
import { ArrowRightIcon, CalendarIcon, ChatIcon, FlagIcon, GraphIcon, PlayIcon, TargetIcon } from "../ui/icons.tsx";

type Props = {
  goal: Goal;
  map: GoalMap | undefined; // undefined until the server sends it
  knowledge: Record<string, ConceptKnowledge>;
  sessions: Session[]; // this goal's, oldest first
  error: string | null;
  onStart: (kind: SessionKind) => boolean; // false: not connected, nothing was sent
  onOpenSession: (session: Session) => void;
  onOpenMap: () => void;
};

const KINDS: { kind: SessionKind; title: string; text: string; icon: ReactNode }[] = [
  {
    kind: "diagnostic",
    title: "Diagnostic",
    text: "Up to 15 questions to find what you already know. The map colors in as you answer.",
    icon: <TargetIcon className="size-[18px]" />,
  },
  {
    kind: "tutoring",
    title: "Tutoring session",
    text: "Two short reviews, then the next concept you're ready for, taught one step at a time.",
    icon: <ChatIcon className="size-[18px]" />,
  },
];

export function GoalHome({ goal, map, knowledge, sessions, error, onStart, onOpenSession, onOpenMap }: Props) {
  const view = map?.view ?? [];
  const hasMap = view.length > 0;
  const atTarget = view.filter((e) => (knowledge[e.conceptId]?.depthHeld ?? 0) >= e.targetDepth).length;
  const started = view.filter((e) => (knowledge[e.conceptId]?.depthHeld ?? 0) > 0).length;
  const recent = [...sessions].reverse();
  const live = recent.find((s) => s.endedAt === undefined);
  // The kind being started, until the session opens (this page goes away) or the server reports an error.
  const [starting, setStarting] = useState<SessionKind | null>(null);
  useEffect(() => {
    if (error) setStarting(null);
  }, [error]);

  function start(kind: SessionKind): void {
    if (onStart(kind)) setStarting(kind);
  }

  return (
    <div className="mx-auto w-full max-w-3xl animate-fade-in px-8 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{goal.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-fg-muted">
          {(goal.prompt || goal.capstone) && (
            <span className="flex min-w-0 items-center gap-1.5">
              <FlagIcon className="size-3.5 text-fg-subtle" />
              <span className="line-clamp-2 min-w-0">{goal.prompt || goal.capstone}</span>
            </span>
          )}
          {goal.examDate && (
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5 text-fg-subtle" />
              Exam {examLabel(goal.examDate)}
            </span>
          )}
        </div>
      </header>

      {map === undefined ? (
        <div className="mt-10 h-40 animate-pulse rounded-xl bg-fill" />
      ) : !hasMap ? (
        <div className="mt-10 rounded-xl border border-dashed border-line-strong">
          <EmptyState
            icon={<GraphIcon className="size-5" />}
            title="Build this goal's concept map"
            action={
              <Button variant="primary" size="lg" onClick={onOpenMap} icon={<ArrowRightIcon className="size-4" />}>
                Build the map
              </Button>
            }
          >
            Add your documents (a syllabus, textbook, notes), answer a few questions, and Helix lays out the concepts and what each one needs first. Sessions
            start once there's a map.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <Stat label="At target depth" value={`${atTarget}`} total={view.length} bar={atTarget / view.length} />
            <Stat label="Started" value={`${started}`} total={view.length} bar={started / view.length} muted />
            <button type="button" onClick={onOpenMap} className="group rounded-xl border border-line bg-raised p-4 text-left shadow-xs transition-colors hover:bg-fill">
              <div className="text-xs text-fg-muted">Concept map</div>
              <div className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold text-fg">
                {view.length} concepts
                <ArrowRightIcon className="size-4 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-fg-muted" />
              </div>
              <div className="mt-2.5 text-xs text-fg-subtle">{map.edges.length} arrows</div>
            </button>
          </div>

          {live && (
            <Alert
              tone="success"
              icon={<LiveDot className="mt-1" />}
              title="A session is still open"
              className="mt-6"
              action={
                <Button size="sm" variant="primary" onClick={() => onOpenSession(live)} icon={<PlayIcon className="size-3.5" />}>
                  Resume
                </Button>
              }
            >
              {SESSION_KIND_LABEL[live.kind]} · {dayAndTime(live.startedAt)}
            </Alert>
          )}

          <h2 className="mt-9 mb-3 text-sm font-semibold text-fg">Start a session</h2>
          <div className="grid grid-cols-2 gap-3">
            {KINDS.map((k) => (
              <div key={k.kind} className="flex flex-col rounded-xl border border-line bg-raised p-5 shadow-xs">
                <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-text">{k.icon}</div>
                <div className="text-sm font-semibold text-fg">{k.title}</div>
                <p className="mt-1 mb-5 flex-1 text-[13px] leading-relaxed text-fg-muted">{k.text}</p>
                <Button
                  variant={k.kind === "tutoring" && !live ? "primary" : "secondary"} // Resume leads while a session is open
                  onClick={() => start(k.kind)}
                  disabled={starting !== null}
                  icon={starting === k.kind ? <Spinner className="size-3.5" /> : undefined}
                  className="self-start"
                >
                  {starting === k.kind ? "Starting…" : `Start ${k.kind === "diagnostic" ? "diagnostic" : "tutoring"}`}
                </Button>
              </div>
            ))}
          </div>
          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="mt-9 mb-3 text-sm font-semibold text-fg">Recent sessions</h2>
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-xs">
                {recent.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onOpenSession(s)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-fill">
                      <span className="mt-0.5 text-fg-subtle">{s.kind === "diagnostic" ? <TargetIcon /> : <ChatIcon />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                          {SESSION_KIND_LABEL[s.kind]}
                          <span className="font-normal text-fg-subtle">{dayAndTime(s.startedAt)}</span>
                          {s.endedAt === undefined && <Badge tone="success">Open</Badge>}
                        </span>
                        {s.summary && <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-fg-muted">{s.summary}</span>}
                      </span>
                      <ArrowRightIcon className="mt-0.5 size-4 text-fg-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, total, bar, muted = false }: { label: string; value: string; total: number; bar: number; muted?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-raised p-4 shadow-xs">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-fg tabular-nums">
        {value} <span className="font-normal text-fg-subtle">of {total}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-track">
        <div className={`h-full rounded-full transition-[width] duration-500 ${muted ? "bg-accent" : "bg-success"}`} style={{ width: `${bar * 100}%` }} />
      </div>
    </div>
  );
}
