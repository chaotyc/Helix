// The session planner (Step 13): code decides what a tutoring session covers (rule 6).
//   1. Up to 2 reviews of concepts learned earlier, interleaving ones easily confused.
//   2. Then the next depth of the frontier concept that matters most for the goal.
//
// Review order (K3–K5):
//   0. an active misconception, with the review aimed at it
//   1. a right answer given unsure (confidence 1–2): it may have been a guess (K4)
//   2. everything else learned, oldest answer first (no forgetting curve yet, K5)
import type { Edge, GoalMap } from "@helix/contracts";
import { frontier, isHeld, type MasteryMap } from "./knowledge.ts";
import type { LearnerState, PairState } from "./mastery.ts";
import { dependents, goalPairs, pairKey } from "./pairs.ts";

export const REVIEW_ITEMS = 2;
const UNSURE_AT_MOST = 2; // confidence 1–2 counts as unsure

export type ActiveMisconception = { id: string; conceptId: string; depth: number; description: string };

export type PlannedTask = {
  kind: "review" | "focus";
  conceptId: string;
  depth: number;
  aimedAt: string | null; // the misconception this task targets, if any
  reason: string; // why it was picked, for the tutor and the record
};

export type PlanInput = {
  map: GoalMap;
  state: LearnerState;
  mastery: MasteryMap;
  misconceptions: ActiveMisconception[]; // active ones only
};

export function planSession({ map, state, mastery, misconceptions }: PlanInput): PlannedTask[] {
  const focus = pickFocus(map, mastery);
  const reviews = pickReviews(map, state, mastery, misconceptions, focus?.conceptId ?? null);
  return focus ? [...reviews, focus] : reviews;
}

// The frontier pair that the most of this goal's concept-depths depend on.
function pickFocus(map: GoalMap, mastery: MasteryMap): PlannedTask | null {
  const inGoal = new Set(goalPairs(map).map((p) => pairKey(p.conceptId, p.depth)));
  let best: { task: PlannedTask; unlocks: number } | null = null;
  for (const pair of frontier(map, mastery)) {
    const unlocks = dependents(map.edges, pair).filter((d) => inGoal.has(pairKey(d.conceptId, d.depth))).length;
    if (!best || unlocks > best.unlocks) {
      const reason = `next depth on the frontier; ${unlocks} of this goal's concept-depths build on it`;
      best = { task: { kind: "focus", conceptId: pair.conceptId, depth: pair.depth, aimedAt: null, reason }, unlocks };
    }
  }
  return best?.task ?? null;
}

type Candidate = { task: PlannedTask; rank: number; lastTs: string };

function pickReviews(
  map: GoalMap,
  state: LearnerState,
  mastery: MasteryMap,
  misconceptions: ActiveMisconception[],
  focusConceptId: string | null,
): PlannedTask[] {
  const candidates: Candidate[] = [];
  for (const entry of map.view) {
    const conceptId = entry.conceptId;
    if (conceptId === focusConceptId) continue;

    const mis = misconceptions.find((m) => m.conceptId === conceptId);
    if (mis) {
      const lastTs = state.get(pairKey(conceptId, mis.depth))?.lastTs ?? "";
      const reason = `active misconception: ${mis.description}`;
      candidates.push({ task: { kind: "review", conceptId, depth: mis.depth, aimedAt: mis.id, reason }, rank: 0, lastTs });
      continue;
    }

    // The deepest depth answered directly that was learned: held, or last answered right.
    const learned = goalPairs(map)
      .filter((p) => p.conceptId === conceptId)
      .map((p) => state.get(pairKey(conceptId, p.depth)))
      .filter((s): s is PairState => s !== undefined && s.answers > 0)
      .filter((s) => isHeld(mastery, s) || s.lastCorrect)
      .at(-1);
    if (!learned) continue;

    const unsure = learned.lastCorrect && learned.lastConfidence !== null && learned.lastConfidence <= UNSURE_AT_MOST;
    const reason = unsure ? `last right answer was given unsure (confidence ${learned.lastConfidence})` : "learned earlier; tested longest ago";
    candidates.push({
      task: { kind: "review", conceptId, depth: learned.depth, aimedAt: null, reason },
      rank: unsure ? 1 : 2,
      lastTs: learned.lastTs,
    });
  }

  candidates.sort((a, b) => a.rank - b.rank || a.lastTs.localeCompare(b.lastTs));
  const [first, normalNext] = candidates;
  if (!first) return [];
  if (!normalNext || REVIEW_ITEMS < 2) return [first.task];

  // Interleaving: from candidates at least as urgent as the normal next one, prefer one easily
  // confused with the first.
  const confusable = candidates
    .slice(1)
    .find((c) => c.rank <= normalNext.rank && easilyConfused(map.edges, first.task.conceptId, c.task.conceptId));
  return [first.task, (confusable ?? normalNext).task];
}

// Two concepts are easily confused when they're parts of the same whole, or both needed by
// the same concept.
function easilyConfused(edges: Edge[], a: string, b: string): boolean {
  const wholes = (id: string) => new Set(edges.filter((e) => e.type === "part_of" && e.src === id).map((e) => e.dst));
  const neededBy = (id: string) => new Set(edges.filter((e) => e.type === "prereq" && e.src === id).map((e) => e.dst));
  const shares = (x: Set<string>, y: Set<string>) => [...x].some((v) => y.has(v));
  return shares(wholes(a), wholes(b)) || shares(neededBy(a), neededBy(b));
}
