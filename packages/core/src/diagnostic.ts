// The diagnostic's question picker: which concept-depth to ask about next.
//
// Because right answers pass down the arrows, one question high in the map can settle a lot
// of it. Each candidate gets a score:
//   uncertainty × coverage
//   uncertainty = p(1 − p), largest at p = 0.5: how unsure we are about it (the variance of a
//                 coin with bias p)
//   coverage    = 1 + how many not-yet-held concept-depths of this goal a right answer would imply
// So a new learner is first asked about the deepest concept-depth with the most below it. A
// miss passes nothing down, so the next pick moves down the arrows; anything that needs a
// known gap is skipped, since it can't be held either.
import type { GoalMap } from "@helix/contracts";
import { isHeld, type MasteryMap } from "./knowledge.ts";
import type { LearnerState } from "./mastery.ts";
import { closure, goalPairs, pairKey, type Pair } from "./pairs.ts";

// A concept-depth answered directly whose estimate is below this counts as a known gap
// (one wrong answer from the prior lands at about 0.13).
export const LIKELY_GAP = 0.15;

export function nextProbe(map: GoalMap, state: LearnerState, mastery: MasteryMap, asked: Set<string>): Pair | null {
  const pairs = goalPairs(map);
  const inGoal = new Set(pairs.map((p) => pairKey(p.conceptId, p.depth)));
  const isGap = (p: Pair) => {
    const own = state.get(pairKey(p.conceptId, p.depth));
    return own !== undefined && own.answers > 0 && own.p < LIKELY_GAP;
  };

  let best: { pair: Pair; score: number } | null = null;
  for (const pair of pairs) {
    if (asked.has(pairKey(pair.conceptId, pair.depth)) || isHeld(mastery, pair)) continue;
    const below = closure(map.edges, pair);
    if (below.some(isGap)) continue; // needs a known gap: can't be held yet

    const p = mastery.get(pairKey(pair.conceptId, pair.depth)) ?? 0;
    const coverage = 1 + below.filter((b) => inGoal.has(pairKey(b.conceptId, b.depth)) && !isHeld(mastery, b)).length;
    const score = p * (1 - p) * coverage;
    if (!best || score > best.score) best = { pair, score }; // ties keep the earlier one: course order
  }
  return best?.pair ?? null;
}
