import { useEffect, useState } from "react";
import type { ClarifyAnswer, Confidence, Connection, Effort, GoalInput, MapEdit, Session, SessionKind, Settings, SourceKind } from "@helix/contracts";
import { send } from "./connection.ts";
import { useAppStore } from "./store.ts";
import { useShortcut } from "./hooks/useShortcut.ts";
import { CommandPalette, type Command } from "./components/CommandPalette.tsx";
import { NewGoalForm } from "./components/goal/NewGoalForm.tsx";
import { GoalMapView } from "./components/map/GoalMapView.tsx";
import { MapPanel } from "./components/MapPanel.tsx";
import { SettingsPanel } from "./components/SettingsPanel.tsx";
import { SessionView } from "./components/session/SessionView.tsx";
import { StartSession } from "./components/session/StartSession.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

// What the main column shows.
type View = "session" | "map" | "settings" | "new-goal";

export function App() {
  // ---- App-wide state from the store (shared with the connection module). ----
  const goals = useAppStore((state) => state.goals);
  const sessions = useAppStore((state) => state.sessions);
  const timelines = useAppStore((state) => state.timelines);
  const sessionStatus = useAppStore((state) => state.sessionStatus);
  const startedSessionId = useAppStore((state) => state.startedSessionId);
  const knowledge = useAppStore((state) => state.knowledge);
  const maps = useAppStore((state) => state.maps);
  const extraction = useAppStore((state) => state.extraction);
  const settings = useAppStore((state) => state.settings);
  const providers = useAppStore((state) => state.providers);
  const signIns = useAppStore((state) => state.signIns);
  const sharedWith = useAppStore((state) => state.sharedWith);
  const questions = useAppStore((state) => state.questions);
  const editErrors = useAppStore((state) => state.editErrors);
  const serverError = useAppStore((state) => state.serverError);
  const createdGoalId = useAppStore((state) => state.createdGoalId);

  // ---- State only this screen uses. ----
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [view, setView] = useState<View>("session");
  const [mapOpen, setMapOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ---- Values worked out from state (not stored separately, so they can't go stale). ----
  const selectedGoal = goals.find((g) => g.id === selectedGoalId);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const goalMap = selectedGoalId ? maps[selectedGoalId] : undefined;
  const conceptName = (conceptId: string) => goalMap?.concepts.find((c) => c.id === conceptId)?.name ?? conceptId;
  const progress = selectedGoalId ? extraction[selectedGoalId] : undefined;

  // ---- Actions: the only places state changes. ----
  function selectGoal(goalId: string, openMap = false): void {
    setSelectedGoalId(goalId);
    send({ type: "map.get", goalId }); // the map fills in when the server replies
    // Open the goal's most recent session; with none yet, open its map.
    const latest = sessions.findLast((s) => s.goalId === goalId);
    if (latest) send({ type: "session.open", sessionId: latest.id });
    setSelectedSessionId(latest?.id ?? null);
    setView(openMap || !latest ? "map" : "session");
  }

  function selectSession(session: Session): void {
    if (session.goalId !== selectedGoalId) send({ type: "map.get", goalId: session.goalId }); // for concept names
    send({ type: "session.open", sessionId: session.id }); // the timeline fills in when the server replies
    setSelectedGoalId(session.goalId);
    setSelectedSessionId(session.id);
    setView("session");
  }

  // A goal this window created opens on its map page once the server confirms it.
  useEffect(() => {
    if (!createdGoalId || !goals.some((g) => g.id === createdGoalId)) return;
    useAppStore.getState().setCreatedGoalId(null);
    selectGoal(createdGoalId, true);
  }, [createdGoalId, goals]);

  // A session this window started opens as soon as the server confirms it.
  useEffect(() => {
    if (!startedSessionId) return;
    useAppStore.getState().setStartedSessionId(null);
    setSelectedSessionId(startedSessionId);
    setView("session");
  }, [startedSessionId]);

  function sendOrWarn(msg: Parameters<typeof send>[0], what: string): void {
    if (!send(msg)) console.warn(`Not connected, so ${what}.`);
  }

  // Saved on the server; the tab shows the server's reply, so it never shows an unsaved choice.
  function changeSettings(next: Settings): void {
    sendOrWarn({ type: "settings.set", settings: next }, "the settings weren't saved");
  }

  // Each connection's state (keys, signed-in tools) is checked whenever the settings tab opens.
  function refreshProviders(): void {
    sendOrWarn({ type: "providers.get" }, "the connections weren't checked");
  }
  useEffect(() => {
    if (view === "settings") refreshProviders();
  }, [view]);

  function signIn(connection: Connection): void {
    useAppStore.getState().startSignIn(connection);
    sendOrWarn({ type: "provider.signIn", connection }, "the sign-in didn't start");
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
  function startSession(kind: SessionKind): void {
    if (!selectedGoalId) return; // guard: a session needs a goal to belong to
    useAppStore.getState().setServerError(null);
    sendOrWarn({ type: "session.start", goalId: selectedGoalId, kind }, "the session wasn't started");
  }

  function newSession(): void {
    setSelectedSessionId(null); // the Sessions tab then offers the kinds to start
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

  const commands: Command[] = [
    { id: "new-goal", label: "New goal", run: () => setView("new-goal") },
    ...(selectedGoalId
      ? [
          { id: "new-session", label: "New session", run: newSession },
          { id: "start-diagnostic", label: "Start diagnostic", run: () => startSession("diagnostic") },
          { id: "start-tutoring", label: "Start tutoring session", run: () => startSession("tutoring") },
        ]
      : []),
    ...(selectedSession && !selectedSession.endedAt ? [{ id: "end-session", label: "End session", run: endSession }] : []),
    ...(selectedGoalId ? [{ id: "open-map", label: "Open map", run: () => setView("map") }] : []),
    { id: "toggle-map", label: "Toggle map panel", run: () => setMapOpen((open) => !open) },
    { id: "settings", label: "Open settings", run: () => setView("settings") },
    // Temporary (Step 6): checks the round trip to the server. The pong shows in the sidebar.
    { id: "ping", label: "Ping server", run: () => sendOrWarn({ type: "ping", text: "hello from the UI" }, "the ping wasn't sent") },
    ...goals.map((goal) => ({
      id: `jump-${goal.id}`,
      label: `Jump to goal: ${goal.title}`,
      run: () => selectGoal(goal.id),
    })),
  ];

  const title =
    view === "settings" ? "Settings" : view === "new-goal" ? "New goal" : (selectedGoal?.title ?? "No goal selected");

  // ---- Layout: sidebar | main column (header, page) | map panel ----
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        goals={goals}
        sessions={sessions}
        selectedGoalId={selectedGoalId}
        selectedSessionId={view === "session" ? selectedSessionId : null}
        onSelectGoal={(goalId) => selectGoal(goalId)}
        onSelectSession={selectSession}
        onNewGoal={() => setView("new-goal")}
        settingsOpen={view === "settings"}
        onOpenSettings={() => setView("settings")}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="text-sm font-medium">{title}</div>
            {selectedGoal && (view === "session" || view === "map") && (
              <div className="flex gap-1 text-xs">
                {(["map", "session"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setView(tab)}
                    className={`rounded px-2 py-0.5 ${view === tab ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    {tab === "map" ? "Map" : "Sessions"}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-zinc-500">⌘K commands · ⌘\ map panel</div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "settings" ? (
            <SettingsPanel
              settings={settings}
              providers={providers}
              signIns={signIns}
              onChange={changeSettings}
              onRefreshProviders={refreshProviders}
              onSignIn={signIn}
            />
          ) : view === "new-goal" ? (
            <NewGoalForm onCreate={createGoal} />
          ) : view === "map" && selectedGoal ? (
            <GoalMapView
              key={selectedGoal.id}
              goal={selectedGoal}
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
              onEnd={endSession}
            />
          ) : selectedGoal ? (
            <StartSession hasMap={(goalMap?.view.length ?? 0) > 0} error={serverError} onStart={startSession} />
          ) : (
            <div className="p-8 text-sm text-zinc-500">Pick a goal on the left, or make a new one.</div>
          )}
        </div>
      </main>

      {mapOpen && view !== "map" && <MapPanel map={goalMap} knowledge={knowledge} progress={progress} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
