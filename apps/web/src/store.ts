// App-wide state, shared by components and by code outside React (the connection module).
import { create } from "zustand";
import type { ClarifyQuestion, ExtractionStage, Goal, GoalMap, Session, Settings, SharedWith } from "@helix/contracts";
import * as fixtures from "./fixtures.ts";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type Pong = { text: string; receivedAt: string };
type Progress = { stage: ExtractionStage; detail: string };
export type PendingQuestions = { roundId: string; questions: ClarifyQuestion[] };

type AppState = {
  // ---- Data ----
  status: ConnectionStatus;
  goals: Goal[]; // real goals, loaded from the server on connect
  sessions: Session[]; // still fake data
  lastPong: Pong | null;
  maps: Record<string, GoalMap>; // each goal's slice of the global graph, from the server
  extraction: Record<string, Progress>; // the latest extraction update per goal
  settings: Settings | null; // null until the server sends them
  sharedWith: Record<string, SharedWith>; // per goal: which other goals use each of its concepts
  questions: Record<string, PendingQuestions>; // per goal: clarifying questions waiting for answers
  editErrors: Record<string, string>; // per goal: why the last map edit was rejected
  serverError: string | null; // the latest error the server reported (e.g. a failed Claude call)
  createdGoalId: string | null; // the goal this window just created, to open it once it arrives

  // ---- Actions: the only ways to change the data above ----
  setStatus: (status: ConnectionStatus) => void;
  setGoals: (goals: Goal[]) => void;
  addGoal: (goal: Goal) => void;
  addSession: (session: Session) => void;
  setLastPong: (pong: Pong) => void;
  setMap: (map: GoalMap, sharedWith: SharedWith) => void;
  setQuestions: (goalId: string, pending: PendingQuestions | null) => void;
  setEditError: (goalId: string, reason: string | null) => void;
  setServerError: (message: string | null) => void;
  setCreatedGoalId: (goalId: string | null) => void;
  setProgress: (goalId: string, progress: Progress) => void;
  setSettings: (settings: Settings) => void;
};

// `create` builds the store. `set` merges the object you give it into the current state,
// then tells every subscribed component to redraw if the part it reads changed.
export const useAppStore = create<AppState>()((set) => ({
  status: "connecting",
  goals: [],
  sessions: fixtures.sessions,
  lastPong: null,
  maps: {},
  extraction: {},
  settings: null,
  sharedWith: {},
  questions: {},
  editErrors: {},
  serverError: null,
  createdGoalId: null,

  setStatus: (status) => set({ status }),
  setGoals: (goals) => set({ goals }),
  addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  setLastPong: (pong) => set({ lastPong: pong }),
  // A fresh map from the server also clears that goal's last edit error.
  setMap: (map, sharedWith) =>
    set((state) => ({
      maps: { ...state.maps, [map.goalId]: map },
      sharedWith: { ...state.sharedWith, [map.goalId]: sharedWith },
      editErrors: withoutKey(state.editErrors, map.goalId),
    })),
  setQuestions: (goalId, pending) =>
    set((state) => ({ questions: pending ? { ...state.questions, [goalId]: pending } : withoutKey(state.questions, goalId) })),
  setEditError: (goalId, reason) =>
    set((state) => ({ editErrors: reason ? { ...state.editErrors, [goalId]: reason } : withoutKey(state.editErrors, goalId) })),
  setServerError: (message) => set({ serverError: message }),
  setCreatedGoalId: (goalId) => set({ createdGoalId: goalId }),
  setProgress: (goalId, progress) => set((state) => ({ extraction: { ...state.extraction, [goalId]: progress } })),
  setSettings: (settings) => set({ settings }),
}));

// A copy of `record` without `key`.
function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
