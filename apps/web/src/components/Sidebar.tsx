// The left column: new goal and search, then each goal with its pages (overview, map) and
// its sessions, newest first. Settings and the connection sit at the bottom.
import { useEffect, useState, type ReactNode } from "react";
import type { Goal, Session } from "@helix/contracts";
import { dayAndTime, SESSION_KIND_LABEL, shortWhen } from "../format.ts";
import { ConnectionIndicator } from "./ConnectionIndicator.tsx";
import { Kbd, LiveDot } from "./ui/Badge.tsx";
import { ChatIcon, ChevronRightIcon, GraphIcon, OverviewIcon, PlusIcon, SearchIcon, SlidersIcon, TargetIcon } from "./ui/icons.tsx";

// Which page is showing, so its row can be highlighted.
export type Page =
  | { kind: "overview"; goalId: string }
  | { kind: "map"; goalId: string }
  | { kind: "session"; sessionId: string }
  | { kind: "settings" }
  | { kind: "new-goal" }
  | { kind: "home" };

type Props = {
  goals: Goal[];
  sessions: Session[];
  page: Page;
  selectedGoalId: string | null;
  onHome: () => void;
  onSelectGoal: (goalId: string) => void;
  onOpenOverview: (goalId: string) => void;
  onOpenMap: (goalId: string) => void;
  onSelectSession: (session: Session) => void;
  onNewGoal: () => void;
  onSearch: () => void;
  onOpenSettings: () => void;
};

const SESSIONS_SHOWN = 4; // per goal, before "Show more"

export function Sidebar(props: Props) {
  // Which goals are open. The selected goal always opens, so its pages are in view.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (props.selectedGoalId) setExpanded((open) => new Set(open).add(props.selectedGoalId!));
  }, [props.selectedGoalId]);

  function toggle(goalId: string): void {
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(goalId)) next.add(goalId);
      return next;
    });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col select-none">
      {/* Lined up with the top bar. In the Mac app the window buttons sit at its left, so the logo moves over. */}
      <div className="app-drag mt-2 flex h-12 shrink-0 items-center px-2 windowed:pl-[84px]">
        <button type="button" onClick={props.onHome} title="All goals" className="flex h-8 items-center gap-2 rounded-md px-2 hover:bg-fill">
          <img src="/brand/helix-mark.svg" alt="" className="size-[18px] dark:hidden" />
          <img src="/brand/helix-mark-on-dark.svg" alt="" className="hidden size-[18px] dark:block" />
          <span className="text-sm font-semibold tracking-tight text-fg">Helix</span>
        </button>
      </div>

      <div className="flex flex-col gap-px px-2">
        <NavItem icon={<PlusIcon />} active={props.page.kind === "new-goal"} onClick={props.onNewGoal}>
          New goal
        </NavItem>
        <NavItem icon={<SearchIcon />} onClick={props.onSearch} trailing={<Kbd className="opacity-80">⌘K</Kbd>}>
          Search
        </NavItem>
      </div>

      <nav aria-label="Goals" className="mt-5 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <div className="mb-1 px-2 text-[11px] font-medium tracking-wide text-fg-subtle uppercase">Goals</div>
        {props.goals.length === 0 && <div className="px-2 py-1 text-[13px] text-fg-subtle">No goals yet</div>}
        {props.goals.map((goal) => (
          <GoalGroup
            key={goal.id}
            goal={goal}
            sessions={props.sessions.filter((s) => s.goalId === goal.id).reverse()}
            open={expanded.has(goal.id)}
            selected={goal.id === props.selectedGoalId && props.page.kind !== "settings" && props.page.kind !== "new-goal"}
            page={props.page}
            onToggle={() => toggle(goal.id)}
            onSelect={() => {
              setExpanded((open) => new Set(open).add(goal.id));
              props.onSelectGoal(goal.id);
            }}
            onOpenOverview={() => props.onOpenOverview(goal.id)}
            onOpenMap={() => props.onOpenMap(goal.id)}
            onSelectSession={props.onSelectSession}
          />
        ))}
      </nav>

      <div className="border-t border-line px-2 pt-2 pb-2">
        <NavItem icon={<SlidersIcon />} active={props.page.kind === "settings"} onClick={props.onOpenSettings}>
          Settings
        </NavItem>
        <ConnectionIndicator />
      </div>
    </aside>
  );
}

type GroupProps = {
  goal: Goal;
  sessions: Session[]; // newest first
  open: boolean;
  selected: boolean;
  page: Page;
  onToggle: () => void;
  onSelect: () => void;
  onOpenOverview: () => void;
  onOpenMap: () => void;
  onSelectSession: (session: Session) => void;
};

function GoalGroup({ goal, sessions, open, selected, page, onToggle, onSelect, onOpenOverview, onOpenMap, onSelectSession }: GroupProps) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? sessions : sessions.slice(0, SESSIONS_SHOWN);
  const hidden = sessions.length - shown.length;

  return (
    <div className="mb-0.5">
      <div className={`group flex h-8 items-center rounded-md ${selected ? "text-fg" : "text-fg-muted hover:bg-fill hover:text-fg"}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${goal.title}` : `Expand ${goal.title}`}
          aria-expanded={open}
          className="flex size-6 shrink-0 items-center justify-center rounded text-fg-faint hover:text-fg"
        >
          <ChevronRightIcon className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button type="button" onClick={onSelect} className="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 text-left">
          <GoalAvatar title={goal.title} />
          <span className={`truncate text-[13px] ${selected ? "font-semibold" : "font-medium"}`}>{goal.title}</span>
        </button>
      </div>

      {open && (
        <div className="relative mt-px mb-1.5 ml-[18px] flex flex-col gap-px border-l border-line pl-2">
          <NavItem small icon={<OverviewIcon className="size-3.5" />} active={page.kind === "overview" && page.goalId === goal.id} onClick={onOpenOverview}>
            Overview
          </NavItem>
          <NavItem small icon={<GraphIcon className="size-3.5" />} active={page.kind === "map" && page.goalId === goal.id} onClick={onOpenMap}>
            Concept map
          </NavItem>

          {sessions.length > 0 && <div className="mt-1.5 mb-0.5 px-2 text-[11px] font-medium text-fg-subtle">Sessions</div>}
          {shown.map((session) => {
            const live = session.endedAt === undefined;
            const Icon = session.kind === "diagnostic" ? TargetIcon : ChatIcon;
            return (
              <NavItem
                key={session.id}
                small
                icon={<Icon className="size-3.5" />}
                active={page.kind === "session" && page.sessionId === session.id}
                onClick={() => onSelectSession(session)}
                title={`${SESSION_KIND_LABEL[session.kind]} · ${dayAndTime(session.startedAt)}${live ? " · still open" : ""}`}
                trailing={
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-fg-subtle tabular-nums">
                    {shortWhen(session.startedAt)}
                    {live && <LiveDot />}
                  </span>
                }
              >
                <span className="truncate">{SESSION_KIND_LABEL[session.kind]}</span>
              </NavItem>
            );
          })}
          {hidden > 0 && (
            <button type="button" onClick={() => setShowAll(true)} className="h-6 rounded-md px-2 text-left text-xs text-fg-subtle hover:bg-fill hover:text-fg">
              Show {hidden} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type NavItemProps = {
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  small?: boolean;
  trailing?: ReactNode;
  title?: string;
};

function NavItem({ icon, children, onClick, active = false, small = false, trailing, title }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-current={active ? "page" : undefined}
      className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 text-left ${small ? "h-7 text-[12.5px]" : "h-8 text-[13px]"} ${
        active ? "bg-fill-strong font-medium text-fg" : "text-fg-muted hover:bg-fill hover:text-fg"
      }`}
    >
      <span className={active ? "text-fg" : "text-fg-subtle"}>{icon}</span>
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
      {trailing}
    </button>
  );
}

// A goal's first letter in a small tile, so goals are easy to tell apart at a glance.
function GoalAvatar({ title }: { title: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-line-strong bg-raised text-[10px] font-semibold text-fg-muted uppercase shadow-xs">
      {title.trim().charAt(0)}
    </span>
  );
}
