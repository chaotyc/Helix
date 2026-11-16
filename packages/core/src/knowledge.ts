// From the learner state to what the learner holds: per concept-depth mastery, depth held, and
// the frontier (what's ready to learn next). Right answers passing down the arrows happens
// earlier, in deriveState; this module reads its result.
import type { ConceptKnowledge, GoalMap, ViewEntry } from "@helix/contracts";
import { DEFAULT_PARAMS, HELD_AT, type LearnerState, type MasteryParams } from "./mastery.ts";
import { DEPTHS, implies, pairKey, type Pair } from "./pairs.ts";

export type FrontierPair = Pair & { role: ViewEntry["role"] };

// P(mastered) for every concept at every depth, keyed by pairKey: the state's estimate, or the
// prior where there's no evidence yet.
export type MasteryMap = Map<string, number>;

export function masteryMap(conceptIds: string[], state: LearnerState, params: MasteryParams = DEFAULT_PARAMS): MasteryMap {
  const out: MasteryMap = new Map();
  for (const conceptId of conceptIds) {
    for (const depth of DEPTHS) out.set(pairKey(conceptId, depth), state.get(pairKey(conceptId, depth))?.p ?? params.prior);
  }
  return out;
}

export function isHeld(mastery: MasteryMap, pair: Pair): boolean {
  return (mastery.get(pairKey(pair.conceptId, pair.depth)) ?? 0) >= HELD_AT;
}

// Highest depth held along with every depth below it (K1); 0 if none.
export function depthHeld(mastery: MasteryMap, conceptId: string): number {
  let held = 0;
  for (const depth of DEPTHS) {
    if (!isHeld(mastery, { conceptId, depth })) break;
    held = depth;
  }
  return held;
}

// One summary per concept, for the UI. `ownState` is the state from answers on each concept
// alone (no arrows), which tells a tested depth from one inferred through arrows.
export function conceptKnowledge(
  conceptIds: string[],
  state: LearnerState,
  ownState: LearnerState,
  params: MasteryParams = DEFAULT_PARAMS,
): ConceptKnowledge[] {
  const mastery = masteryMap(conceptIds, state, params);
  const own = masteryMap(conceptIds, ownState, params);
  return conceptIds.map((conceptId) => ({
    conceptId,
    depthHeld: depthHeld(mastery, conceptId),
    depthTested: depthHeld(own, conceptId),
    mastery: DEPTHS.map((depth) => mastery.get(pairKey(conceptId, depth)) ?? params.prior),
    answers: DEPTHS.reduce((n, depth) => n + (state.get(pairKey(conceptId, depth))?.answers ?? 0), 0),
  }));
}

// What's ready to learn next, in the course's order: each concept below its target depth whose
// next depth has every prerequisite held.
export function frontier(map: GoalMap, mastery: MasteryMap): FrontierPair[] {
  const out: FrontierPair[] = [];
  for (const entry of map.view) {
    const next = depthHeld(mastery, entry.conceptId) + 1;
    if (next > entry.targetDepth) continue;
    const pair = { conceptId: entry.conceptId, depth: next };
    const ready = implies(map.edges, pair)
      .filter((p) => p.conceptId !== entry.conceptId) // the depth below is held by definition
      .every((p) => isHeld(mastery, p));
    if (ready) out.push({ ...pair, role: entry.role });
  }
  return out;
}
