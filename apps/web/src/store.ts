// App-wide state, shared by components and by code outside React (the connection module).
import { create } from "zustand";
import type { ExtractionStage, Goal, GoalMap, Session } from "@helix/contracts";
import * as fixtures from "./fixtures.ts";

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

type Pong = { text: string; receivedAt: string };
type Progress = { stage: ExtractionStage; detail: string };

type AppState = {
  // ---- Data ----
  status: ConnectionStatus;
  goals: Goal[]; // real goals, loaded from the server on connect
  sessions: Session[]; // still fake data
  lastPong: Pong | null;
  maps: Record<string, GoalMap>; // each goal's slice of the global graph, from the server
  extraction: Record<string, Progress>; // the latest extraction update per goal

  // ---- Actions: the only ways to change the data above ----
  setStatus: (status: ConnectionStatus) => void;
  setGoals: (goals: Goal[]) => void;
  addGoal: (goal: Goal) => void;
  addSession: (session: Session) => void;
  setLastPong: (pong: Pong) => void;
  setMap: (map: GoalMap) => void;
  setProgress: (goalId: string, progress: Progress) => void;
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

  setStatus: (status) => set({ status }),
  setGoals: (goals) => set({ goals }),
  addGoal: (goal) => set((state) => ({ goals: [...state.goals, goal] })),
  addSession: (session) => set((state) => ({ sessions: [...state.sessions, session] })),
  setLastPong: (pong) => set({ lastPong: pong }),
  setMap: (map) => set((state) => ({ maps: { ...state.maps, [map.goalId]: map } })),
  setProgress: (goalId, progress) => set((state) => ({ extraction: { ...state.extraction, [goalId]: progress } })),
}));
