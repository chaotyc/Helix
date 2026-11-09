import { useState } from "react";
import type { Session, TimelineItem } from "@helix/contracts";
import * as fixtures from "./fixtures.ts";
import { send } from "./connection.ts";
import { useAppStore } from "./store.ts";
import { useShortcut } from "./hooks/useShortcut.ts";
import { CommandPalette, type Command } from "./components/CommandPalette.tsx";
import { Composer } from "./components/Composer.tsx";
import { MapPanel } from "./components/MapPanel.tsx";
import { SessionTimeline } from "./components/SessionTimeline.tsx";
import { Sidebar } from "./components/Sidebar.tsx";

export function App() {
  // ---- App-wide state from the store (shared with the connection module). ----
  const goals = useAppStore((state) => state.goals);
  const sessions = useAppStore((state) => state.sessions);
  const addSession = useAppStore((state) => state.addSession);
  const maps = useAppStore((state) => state.maps);
  const extraction = useAppStore((state) => state.extraction);

  // ---- State only this screen uses. ----
  const [timelines, setTimelines] = useState<Record<string, TimelineItem[]>>(fixtures.timelines);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ---- Values worked out from state (not stored separately, so they can't go stale). ----
  const selectedGoal = goals.find((g) => g.id === selectedGoalId);
  const timeline = selectedSessionId ? (timelines[selectedSessionId] ?? []) : [];
  const concepts = selectedGoalId ? (fixtures.conceptMaps[selectedGoalId] ?? []) : []; // fake, for the fake timeline
  const goalMap = selectedGoalId ? maps[selectedGoalId] : undefined;
  const progress = selectedGoalId ? extraction[selectedGoalId] : undefined;

  // ---- Actions: the only places state changes. ----
  function selectGoal(goalId: string): void {
    setSelectedGoalId(goalId);
    send({ type: "map.get", goalId }); // the map panel fills in when the server replies
    // Open the goal's most recent session, or none if it has no sessions yet.
    const latest = sessions.findLast((s) => s.goalId === goalId);
    setSelectedSessionId(latest?.id ?? null);
  }

  function selectSession(session: Session): void {
    setSelectedGoalId(session.goalId);
    setSelectedSessionId(session.id);
  }

  // Asks the server to create a goal. It appears in the sidebar when the server's
  // goal.created reply arrives. The placeholder title stays until Step 10's goal form.
  function newGoal(): void {
    const sent = send({
      type: "goal.create",
      goal: { title: `New goal ${goals.length + 1}`, kind: "course", capstone: "" },
    });
    if (!sent) console.warn("Not connected, so the goal wasn't created.");
  }

  function newSession(): void {
    if (!selectedGoalId) return; // guard: a session needs a goal to belong to
    const session: Session = {
      id: crypto.randomUUID(),
      goalId: selectedGoalId,
      startedAt: new Date().toISOString(),
    };
    addSession(session);
    setSelectedSessionId(session.id);
  }

  function sendAnswer(text: string): void {
    if (!selectedSessionId) return; // guard: nowhere to put the answer
    const item: TimelineItem = { type: "answer", id: crypto.randomUUID(), text };
    setTimelines({
      ...timelines,
      [selectedSessionId]: [...(timelines[selectedSessionId] ?? []), item],
    });
  }

  // ---- Keyboard shortcuts, active anywhere on the page. ----
  useShortcut("k", () => setPaletteOpen((open) => !open));
  useShortcut("\\", () => setMapOpen((open) => !open)); // "\\" is how you write one backslash

  const commands: Command[] = [
    { id: "new-goal", label: "New goal", run: newGoal },
    { id: "new-session", label: "New session", run: newSession },
    { id: "toggle-map", label: "Toggle map", run: () => setMapOpen((open) => !open) },
    // Temporary (Step 6): checks the round trip to the server. The pong shows in the sidebar.
    {
      id: "ping",
      label: "Ping server",
      run: () => {
        const sent = send({ type: "ping", text: "hello from the UI" });
        if (!sent) console.warn("Not connected, so the ping wasn't sent.");
      },
    },
    ...goals.map((goal) => ({
      id: `jump-${goal.id}`,
      label: `Jump to goal: ${goal.title}`,
      run: () => selectGoal(goal.id),
    })),
  ];

  // ---- Layout: sidebar | main column (header, timeline, composer) | map panel ----
  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar
        goals={goals}
        sessions={sessions}
        selectedGoalId={selectedGoalId}
        selectedSessionId={selectedSessionId}
        onSelectGoal={selectGoal}
        onSelectSession={selectSession}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
          <div className="text-sm font-medium">{selectedGoal?.title ?? "No goal selected"}</div>
          <div className="text-xs text-zinc-500">⌘K commands · ⌘\ map</div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {selectedSessionId ? (
            <SessionTimeline items={timeline} concepts={concepts} />
          ) : (
            <div className="p-8 text-sm text-zinc-500">No session selected. Press ⌘K → New session.</div>
          )}
        </div>

        <Composer disabled={!selectedSessionId} onSend={sendAnswer} />
      </main>

      {mapOpen && <MapPanel map={goalMap} progress={progress} />}
      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
