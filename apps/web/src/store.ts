// App-wide state, shared by components and by code outside React (the connection module).
import { create } from "zustand";
import type {
  ClarifyQuestion,
  ConceptKnowledge,
  Connection,
  ExtractionStage,
  Goal,
  GoalMap,
  ProviderStatus,
  Session,
  Settings,
  SharedWith,
  TimelineItem,
} from "@helix/contracts";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type Pong = { text: string; receivedAt: string };
// The latest step of a map build. `startedAt`: when it started, by this window's clock.
export type BuildProgress = { stage: ExtractionStage; detail: string; startedAt?: number };
export type PendingQuestions = { roundId: string; questions: ClarifyQuestion[] };
export type SessionStatus = { busy: boolean; detail: string };
// A sign-in running from the settings tab: what the tool printed, and how it ended.
export type SignIn = { output: string; done: { ok: boolean; detail: string } | null };

type AppState = {
  // ---- Data ----
  status: ConnectionStatus;
  goals: Goal[]; // real goals, loaded from the server on connect
  sessions: Session[]; // every session, from the server
  timelines: Record<string, TimelineItem[]>; // per session, loaded when it's opened
  sessionStatus: Record<string, SessionStatus>; // per session: is the server working on it, and what failed
  startedSessionId: string | null; // the session this window just started, to open it once it arrives
  knowledge: Record<string, ConceptKnowledge>; // per concept: what the learner model says they know
  lastPong: Pong | null;
  maps: Record<string, GoalMap>; // each goal's slice of the global graph, from the server
  extraction: Record<string, BuildProgress>; // the latest extraction update per goal
  settings: Settings | null; // null until the server sends them
  providers: ProviderStatus[] | null; // each connection's state, asked for when settings open
  signIns: Partial<Record<Connection, SignIn>>;
  sharedWith: Record<string, SharedWith>; // per goal: which other goals use each of its concepts
  questions: Record<string, PendingQuestions>; // per goal: clarifying questions waiting for answers
  editErrors: Record<string, string>; // per goal: why the last map edit was rejected
  nextUndo: Record<string, string | null>; // per goal: what Undo would take back, in words
  undone: Record<string, { undid: string; n: number }>; // per goal: the latest undo (n counts them, so a repeat still shows)
  serverError: string | null; // the latest error the server reported (e.g. a failed model call)
  createdGoalId: string | null; // the goal this window just created, to open it once it arrives

  // ---- Actions: the only ways to change the data above ----
  setStatus: (status: ConnectionStatus) => void;
  setGoals: (goals: Goal[]) => void;
  addGoal: (goal: Goal) => void;
  setSessions: (sessions: Session[]) => void;
  upsertSession: (session: Session) => void;
  setStartedSessionId: (sessionId: string | null) => void;
  setTimeline: (sessionId: string, items: TimelineItem[]) => void;
  putItem: (sessionId: string, item: TimelineItem) => void;
  setSessionStatus: (sessionId: string, status: SessionStatus) => void;
  setKnowledge: (knowledge: ConceptKnowledge[]) => void;
  setLastPong: (pong: Pong) => void;
  setMap: (map: GoalMap, sharedWith: SharedWith, nextUndo: string | null) => void;
  setUndone: (goalId: string, undid: string) => void;
  setQuestions: (goalId: string, pending: PendingQuestions | null) => void;
  setEditError: (goalId: string, reason: string | null) => void;
  setServerError: (message: string | null) => void;
  setCreatedGoalId: (goalId: string | null) => void;
  setProgress: (goalId: string, progress: BuildProgress) => void;
  setSettings: (settings: Settings) => void;
  setProviders: (providers: ProviderStatus[]) => void;
  startSignIn: (connection: Connection) => void;
  addSignInOutput: (connection: Connection, text: string) => void;
  finishSignIn: (connection: Connection, ok: boolean, detail: string) => void;
};

// `create` builds the store. `set` merges the object you give it into the current state,
// then tells every subscribed component to redraw if the part it reads changed.
export const useAppStore = create<AppState>()((set) => ({
  status: "connecting",
  goals: [],
  sessions: [],
  timelines: {},
  sessionStatus: {},
  startedSessionId: null,
  knowledge: {},
  lastPong: null,
  maps: {},
  extraction: {},
  settings: null,
  providers: null,
  signIns: {},
  sharedWith: {},
  questions: {},
  editErrors: {},
  nextUndo: {},
  undone: {},
  serverError: null,
  createdGoalId: null,

  setStatus: (status) => set({ status }),
  setGoals: (goals) => set({ goals }),
  addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
  setSessions: (sessions) => set({ sessions }),
  // A new session is added; a known one (e.g. just ended) is replaced.
  upsertSession: (session) =>
    set((state) => ({
      sessions: state.sessions.some((s) => s.id === session.id)
        ? state.sessions.map((s) => (s.id === session.id ? session : s))
        : [...state.sessions, session],
    })),
  setStartedSessionId: (sessionId) => set({ startedSessionId: sessionId }),
  setTimeline: (sessionId, items) => set((state) => ({ timelines: { ...state.timelines, [sessionId]: items } })),
  // Appends a new item; an item with a known id (the tutor's text as it streams) replaces the old one.
  putItem: (sessionId, item) =>
    set((state) => {
      const items = state.timelines[sessionId] ?? [];
      const next = items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
      return { timelines: { ...state.timelines, [sessionId]: next } };
    }),
  setSessionStatus: (sessionId, status) => set((state) => ({ sessionStatus: { ...state.sessionStatus, [sessionId]: status } })),
  setKnowledge: (knowledge) => set({ knowledge: Object.fromEntries(knowledge.map((k) => [k.conceptId, k])) }),
  setLastPong: (pong) => set({ lastPong: pong }),
  // A fresh map from the server also clears that goal's last edit error.
  setMap: (map, sharedWith, nextUndo) =>
    set((state) => ({
      maps: { ...state.maps, [map.goalId]: map },
      sharedWith: { ...state.sharedWith, [map.goalId]: sharedWith },
      nextUndo: { ...state.nextUndo, [map.goalId]: nextUndo },
      editErrors: withoutKey(state.editErrors, map.goalId),
    })),
  setUndone: (goalId, undid) =>
    set((state) => ({ undone: { ...state.undone, [goalId]: { undid, n: (state.undone[goalId]?.n ?? 0) + 1 } } })),
  setQuestions: (goalId, pending) =>
    set((state) => ({ questions: pending ? { ...state.questions, [goalId]: pending } : withoutKey(state.questions, goalId) })),
  setEditError: (goalId, reason) =>
    set((state) => ({ editErrors: reason ? { ...state.editErrors, [goalId]: reason } : withoutKey(state.editErrors, goalId) })),
  setServerError: (message) => set({ serverError: message }),
  setCreatedGoalId: (goalId) => set({ createdGoalId: goalId }),
  setProgress: (goalId, progress) => set((state) => ({ extraction: { ...state.extraction, [goalId]: progress } })),
  setSettings: (settings) => set({ settings }),
  setProviders: (providers) => set({ providers }),
  startSignIn: (connection) => set((state) => ({ signIns: { ...state.signIns, [connection]: { output: "", done: null } } })),
  addSignInOutput: (connection, text) =>
    set((state) => {
      const current = state.signIns[connection] ?? { output: "", done: null };
      return { signIns: { ...state.signIns, [connection]: { ...current, output: current.output + text } } };
    }),
  finishSignIn: (connection, ok, detail) =>
    set((state) => {
      const current = state.signIns[connection] ?? { output: "", done: null };
      return { signIns: { ...state.signIns, [connection]: { ...current, done: { ok, detail } } } };
    }),
}));

// A copy of `record` without `key`.
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
