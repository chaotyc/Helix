import { useEffect, useState } from "react";
import type { ClarifyAnswer, Confidence, Effort, GoalInput, MapEdit, Session, SessionKind, Settings, SourceKind } from "@helix/contracts";
import { send } from "./connection.ts";
import { desktop } from "./desktop.ts";
import { dayAndTime, SESSION_KIND_LABEL } from "./format.ts";
import { useAppStore } from "./store.ts";
import { useShortcut } from "./hooks/useShortcut.ts";
import { CommandPalette, type Command } from "./components/CommandPalette.tsx";
import { GoalHome } from "./components/goal/GoalHome.tsx";
import { NewGoalForm } from "./components/goal/NewGoalForm.tsx";
import { Welcome } from "./components/goal/Welcome.tsx";
import { GoalMapView } from "./components/map/GoalMapView.tsx";
import { MapPanel } from "./components/MapPanel.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { SessionView } from "./components/session/SessionView.tsx";
import { Sidebar, type Page } from "./components/Sidebar.tsx";
import { TopBar, type Crumb } from "./components/TopBar.tsx";
import { Badge, LiveDot } from "./components/ui/Badge.tsx";
import { Button, IconButton } from "./components/ui/Button.tsx";
import { Spinner } from "./components/ui/feedback.tsx";
import { ChatIcon, GraphIcon, OverviewIcon, PanelRightIcon, PlusIcon, SlidersIcon, StopIcon, TargetIcon } from "./components/ui/icons.tsx";

// What the main panel shows. "session" is a goal's overview when no session is picked.
type View = "session" | "map" | "settings" | "new-goal";

const PANEL_MIN_WIDTH = 1100; // px of window width for the concepts panel to start open

export function App() {
  // ---- App-wide state from the store (shared with the connection module). ----
  const status = useAppStore((state) => state.status);
  const goals = useAppStore((state) => state.goals);
  const sessions = useAppStore((state) => state.sessions);
  const timelines = useAppStore((state) => state.timelines);
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const startedSessionId = useAppStore((state) => state.startedSessionId);
  const knowledge = useAppStore((state) => state.knowledge);
  const maps = useAppStore((state) => state.maps);
  const extraction = useAppStore((state) => state.extraction);
  const settings = useAppStore((state) => state.settings);
  const sharedWith = useAppStore((state) => state.sharedWith);
  const questions = useAppStore((state) => state.questions);
  const editErrors = useAppStore((state) => state.editErrors);
  const serverError = useAppStore((state) => state.serverError);
  const createdGoalId = useAppStore((state) => state.createdGoalId);

  // ---- State only this screen uses. ----
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [view, setView] = useState<View>("session");
  // The concepts panel beside a session starts open on a wide window, and closes when the window
  // is narrowed past that width (the session column needs the room). ⌘\ still opens it.
  const [mapOpen, setMapOpen] = useState(() => window.innerWidth >= PANEL_MIN_WIDTH);
  useEffect(() => {
    let wasWide = window.innerWidth >= PANEL_MIN_WIDTH;
    function onResize(): void {
      const wide = window.innerWidth >= PANEL_MIN_WIDTH;
      if (wasWide && !wide) setMapOpen(false);
      wasWide = wide;
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [beforeNewGoal, setBeforeNewGoal] = useState<View>("session"); // where Cancel on New goal returns

  // ---- Values worked out from state (not stored separately, so they can't go stale). ----
  const selectedGoal = goals.find((g) => g.id === selectedGoalId);
  // A session only counts as selected under its own goal.
  const selectedSession = sessions.find((s) => s.id === selectedSessionId && s.goalId === selectedGoalId);
  const goalMap = selectedGoalId ? maps[selectedGoalId] : undefined;
  const conceptName = (conceptId: string) => goalMap?.concepts.find((c) => c.id === conceptId)?.name ?? conceptId;
  const progress = selectedGoalId ? extraction[selectedGoalId] : undefined;
  const sessionBusy = selectedSession ? (sessionStatus[selectedSession.id]?.busy ?? false) : false;

  const page: Page =
    view === "settings"
      ? { kind: "settings" }
      : view === "new-goal"
        ? { kind: "new-goal" }
        : !selectedGoal
          ? { kind: "home" }
          : view === "map"
            ? { kind: "map", goalId: selectedGoal.id }
            : selectedSession
              ? { kind: "session", sessionId: selectedSession.id }
              : { kind: "overview", goalId: selectedGoal.id };

  // ---- Actions: the only places state changes. ----

  // Opening a goal: its open session if one is still going, otherwise its overview.
  function selectGoal(goalId: string, openMap = false): void {
    setSelectedGoalId(goalId);
    send({ type: "map.get", goalId }); // the map fills in when the server replies
    const live = sessions.findLast((s) => s.goalId === goalId && s.endedAt === undefined);
    if (live && !openMap) send({ type: "session.open", sessionId: live.id });
    setSelectedSessionId(openMap ? null : (live?.id ?? null));
    setView(openMap ? "map" : "session");
  }

  function openOverview(goalId: string): void {
    if (goalId !== selectedGoalId) send({ type: "map.get", goalId });
    setSelectedGoalId(goalId);
    setSelectedSessionId(null);
    setView("session");
  }

  function openMap(goalId: string): void {
    if (goalId !== selectedGoalId) {
      send({ type: "map.get", goalId });
      setSelectedSessionId(null); // that session belongs to the other goal
    }
    setSelectedGoalId(goalId);
    setView("map");
  }

  function selectSession(session: Session): void {
    if (session.goalId !== selectedGoalId) send({ type: "map.get", goalId: session.goalId }); // for concept names
    send({ type: "session.open", sessionId: session.id }); // the timeline fills in when the server replies
    setSelectedGoalId(session.goalId);
    setSelectedSessionId(session.id);
    setView("session");
  }

  function openNewGoal(): void {
    if (view !== "new-goal") setBeforeNewGoal(view);
    setView("new-goal");
  }

  function goHome(): void {
    setSelectedGoalId(null);
    setSelectedSessionId(null);
    setView("session");
  }

  // A goal this window created opens on its map page once the server confirms it.
  useEffect(() => {
    if (!createdGoalId || !goals.some((g) => g.id === createdGoalId)) return;
    useAppStore.getState().setCreatedGoalId(null);
    selectGoal(createdGoalId, true);
  }, [createdGoalId, goals]);

  // A session this window started opens as soon as the server confirms it (under its own goal).
  useEffect(() => {
    if (!startedSessionId) return;
    useAppStore.getState().setStartedSessionId(null);
    const started = useAppStore.getState().sessions.find((s) => s.id === startedSessionId);
    if (started) setSelectedGoalId(started.goalId);
    setSelectedSessionId(startedSessionId);
    setView("session");
  }, [startedSessionId]);

  function sendOrWarn(msg: Parameters<typeof send>[0], what: string): boolean {
    const sent = send(msg);
    if (!sent) console.warn(`Not connected, so ${what}.`);
    return sent;
  }

  // Saved on the server; the page shows the server's reply, so it never shows an unsaved choice.
  function changeSettings(next: Settings): void {
    sendOrWarn({ type: "settings.set", settings: next }, "the settings weren't saved");
  }

  function createGoal(goal: GoalInput): void {
    sendOrWarn({ type: "goal.create", goal }, "the goal wasn't created");
  }

  // Building a map: the source goes to the clarifier first; the answers then build the map.
  function askQuestions(goalId: string, sourceText: string | undefined, sourceKind: SourceKind): void {
    useAppStore.getState().setServerError(null);
    sendOrWarn({ type: "map.clarify", goalId, sourceText, sourceKind }, "the map wasn't started");
  }

  function buildMap(goalId: string, roundId: string, answers: ClarifyAnswer[], effort: Effort): void {
    useAppStore.getState().setQuestions(goalId, null); // answered: the card closes, progress shows
    useAppStore.getState().setServerError(null);
    sendOrWarn({ type: "map.extract", goalId, roundId, answers, effort }, "the map wasn't built");
  }

  function editMap(goalId: string, edits: MapEdit[]): void {
    sendOrWarn({ type: "map.edit", goalId, edits }, "the edit wasn't saved");
  }

  // Sessions: the server runs them; the window sends what the learner does and shows what comes back.
  // Returns whether the request went out (false when not connected).
  function startSession(kind: SessionKind): boolean {
    if (!selectedGoalId) return false; // guard: a session needs a goal to belong to
    useAppStore.getState().setServerError(null);
    return sendOrWarn({ type: "session.start", goalId: selectedGoalId, kind }, "the session wasn't started");
  }

  function newSession(): void {
    setSelectedSessionId(null); // the goal's overview offers the kinds to start
    setView("session");
  }

  function reply(text: string, confidence?: Confidence): void {
    if (!selectedSessionId) return; // guard: nowhere to put the answer
    sendOrWarn({ type: "session.reply", sessionId: selectedSessionId, text, confidence }, "the answer wasn't sent");
  }

  function resume(): void {
    if (selectedSessionId) sendOrWarn({ type: "session.resume", sessionId: selectedSessionId }, "the session didn't continue");
  }

  function endSession(): void {
    if (selectedSessionId) sendOrWarn({ type: "session.end", sessionId: selectedSessionId }, "the session wasn't ended");
  }

  // ---- Keyboard shortcuts, active anywhere on the page. ----
  useShortcut("k", () => setPaletteOpen((open) => !open));
  useShortcut("\\", () => setMapOpen((open) => !open)); // "\\" is how you write one backslash

  const icon = "size-4";
  const commands: Command[] = [
    { id: "new-goal", group: "Actions", label: "New goal", icon: <PlusIcon className={icon} />, run: openNewGoal },
    ...(selectedGoalId
      ? [
          { id: "start-diagnostic", group: "Actions", label: "Start diagnostic", icon: <TargetIcon className={icon} />, run: () => startSession("diagnostic") },
          { id: "start-tutoring", group: "Actions", label: "Start tutoring session", icon: <ChatIcon className={icon} />, run: () => startSession("tutoring") },
        ]
      : []),
    ...(selectedSession && !selectedSession.endedAt
      ? [{ id: "end-session", group: "Actions", label: "End session", icon: <StopIcon className={icon} />, run: endSession }]
      : []),
    ...(page.kind === "session"
      ? [{ id: "toggle-map", group: "Actions", label: "Toggle concepts panel", icon: <PanelRightIcon className={icon} />, shortcut: "⌘\\", run: () => setMapOpen((open) => !open) }]
      : []),
    ...(selectedGoalId
      ? [
          { id: "open-overview", group: "Go to", label: "Overview", icon: <OverviewIcon className={icon} />, run: () => openOverview(selectedGoalId) },
          { id: "open-map", group: "Go to", label: "Concept map", icon: <GraphIcon className={icon} />, run: () => openMap(selectedGoalId) },
        ]
      : []),
    { id: "settings", group: "Go to", label: "Settings", icon: <SlidersIcon className={icon} />, run: () => setView("settings") },
    ...goals.map((goal) => ({
      id: `jump-${goal.id}`,
      group: "Goals",
      label: goal.title,
      icon: <OverviewIcon className={icon} />,
      run: () => selectGoal(goal.id),
    })),
    // Temporary (Step 6): checks the round trip to the server. The pong shows in the sidebar.
    { id: "ping", group: "Developer", label: "Ping server", run: () => sendOrWarn({ type: "ping", text: "hello from the UI" }, "the ping wasn't sent") },
  ];

  // ---- The top bar: where you are, and this page's actions ----
  const goalCrumb: Crumb | null = selectedGoal ? { label: selectedGoal.title, onClick: () => openOverview(selectedGoal.id) } : null;
  const crumbs: Crumb[] =
    page.kind === "settings"
      ? [{ label: "Settings" }]
      : page.kind === "new-goal"
        ? [{ label: "New goal" }]
        : page.kind === "home"
          ? [{ label: "Goals" }]
          : page.kind === "map"
            ? [goalCrumb!, { label: "Concept map" }]
            : page.kind === "session" && selectedSession
              ? [goalCrumb!, { label: SESSION_KIND_LABEL[selectedSession.kind], detail: dayAndTime(selectedSession.startedAt) }]
              : [goalCrumb!, { label: "Overview" }];

  const inSession = page.kind === "session" && selectedSession !== undefined;
  const showPanel = inSession && mapOpen;

  return (
    <div className="flex h-screen bg-canvas text-fg">
      {/* In the Mac app, the strip along the window's top edge moves the window too. */}
      {desktop && <div aria-hidden="true" className="app-drag fixed inset-x-0 top-0 z-40 h-2" />}
      <Sidebar
        goals={goals}
        sessions={sessions}
        page={page}
        selectedGoalId={selectedGoalId}
        onHome={goHome}
        onSelectGoal={(goalId) => selectGoal(goalId)}
        onOpenOverview={openOverview}
        onOpenMap={openMap}
        onSelectSession={selectSession}
        onNewGoal={openNewGoal}
        onSearch={() => setPaletteOpen(true)}
        onOpenSettings={() => setView("settings")}
      />

      <div className="flex min-w-0 flex-1 py-2 pr-2">
        <main className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar
              crumbs={crumbs}
              badge={
                inSession &&
                (selectedSession.endedAt === undefined ? (
                  <Badge tone="success">
                    <LiveDot pulse className="scale-75" /> Open
                  </Badge>
                ) : (
                  <Badge>Ended</Badge>
                ))
              }
              actions={
                inSession && (
                  <>
                    {selectedSession.endedAt === undefined && !sessionBusy && (
                      <Button size="sm" onClick={endSession} icon={<StopIcon className="size-3.5" />} aria-label="End session" title="End session">
                        <span className="@max-lg/topbar:hidden">End session</span>
                        <span className="hidden @max-lg/topbar:inline">End</span>
                      </Button>
                    )}
                    <IconButton label="Concepts panel (⌘\)" active={mapOpen} onClick={() => setMapOpen((open) => !open)}>
                      <PanelRightIcon />
                    </IconButton>
                  </>
                )
              }
            />

            {status === "reconnecting" && (
              <div role="status" className="flex shrink-0 items-center gap-2 border-b border-warning/20 bg-warning-soft px-4 py-2 text-xs text-fg-muted">
                <Spinner className="size-3.5 text-warning" />
                Can't reach the Helix server. Reconnecting…
              </div>
            )}

            {/* Pages scroll here, except a session, which scrolls its own timeline. */}
            <div className={`min-h-0 flex-1 ${view === "session" && selectedSession ? "overflow-hidden" : "overflow-y-auto"}`}>
              {view === "settings" ? (
                <SettingsPanel settings={settings} onChange={changeSettings} />
              ) : view === "new-goal" ? (
                <NewGoalForm onCreate={createGoal} onCancel={() => setView(beforeNewGoal)} />
              ) : view === "map" && selectedGoal ? (
                <GoalMapView
                  key={selectedGoal.id}
                  map={goalMap}
                  sharedWith={sharedWith[selectedGoal.id] ?? {}}
                  knowledge={knowledge}
                  progress={progress}
                  questions={questions[selectedGoal.id]}
                  editError={editErrors[selectedGoal.id]}
                  serverError={serverError}
                  onAsk={(text, kind) => askQuestions(selectedGoal.id, text, kind)}
                  onBuild={(roundId, answers, effort) => buildMap(selectedGoal.id, roundId, answers, effort)}
                  onEdit={(edits) => editMap(selectedGoal.id, edits)}
                  onDismissError={() => useAppStore.getState().setEditError(selectedGoal.id, null)}
                />
              ) : selectedSession ? (
                <SessionView
                  key={selectedSession.id}
                  session={selectedSession}
                  items={timelines[selectedSession.id]}
                  status={sessionStatus[selectedSession.id]}
                  conceptName={conceptName}
                  onReply={reply}
                  onResume={resume}
                  onNewSession={newSession}
                />
              ) : selectedGoal ? (
                <GoalHome
                  key={selectedGoal.id}
                  goal={selectedGoal}
                  map={goalMap}
                  knowledge={knowledge}
                  sessions={sessions.filter((s) => s.goalId === selectedGoal.id)}
                  error={serverError}
                  onStart={startSession}
                  onOpenSession={selectSession}
                  onOpenMap={() => openMap(selectedGoal.id)}
                />
              ) : (
                <Welcome goals={goals} sessions={sessions} onSelectGoal={(goalId) => selectGoal(goalId)} onNewGoal={openNewGoal} />
              )}
            </div>
          </div>

          {showPanel && <MapPanel map={goalMap} knowledge={knowledge} progress={progress} onClose={() => setMapOpen(false)} />}
        </main>
      </div>

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
