// Card-aware decisions for computer players. Each choice compares the live
// plans on the card (see handMatcher.rankPlans) before and after the move, so
// opponents build toward real hands, call only tiles that advance one, and
// never pass or throw away tiles their best plans depend on.
//
// Skill (1–5) sets how many plans a bot keeps in mind and how much noise it
// adds; low-skill bots also miss some calls.

import type { Tile } from './types';
import {
  removalCosts, rankPlans, isJoker, tileKey, type Availability,
} from './handMatcher';

const TOP_K = [3, 6, 10, 14, 18];
const NOISE = [2.5, 1.2, 0.5, 0.15, 0];
const MISS_CALL = [0.4, 0.15, 0, 0, 0];

type Rng = () => number;

function si(skill: number): number {
  return Math.min(5, Math.max(1, Math.round(skill))) - 1;
}

function keyOf(t: Tile): string {
  return isJoker(t) ? 'joker' : tileKey(t);
}

/** Cost of the best live plan (Infinity if the hand is dead). */
export function bestPlanCost(hand: Tile[], exposures: Tile[][], avail?: Availability): number {
  const plans = rankPlans(hand, exposures, avail);
  return plans.length ? plans[0].cost : Infinity;
}

export interface DiscardChoice {
  index: number;
  /** Weighted plan cost after this discard minus before (lower = cheaper to let go). */
  delta: number;
}

/** The tile to discard. Jokers are kept unless nothing else is left. */
export function chooseDiscard(
  hand: Tile[], exposures: Tile[][], avail: Availability | undefined, skill: number, rng: Rng = Math.random,
): DiscardChoice | null {
  if (hand.length === 0) return null;
  const s = si(skill);
  const { baseline, byKey, plans } = removalCosts(hand, exposures, avail, TOP_K[s]);
  const hasNatural = hand.some(t => !isJoker(t));

  // With no live plan, fall back to "keep what matches".
  if (plans.length === 0) {
    let best = -1, bestScore = Infinity;
    hand.forEach((t, i) => {
      if (isJoker(t) && hasNatural) return;
      const dupes = hand.filter(o => keyOf(o) === keyOf(t)).length;
      const score = dupes + NOISE[s] * rng();
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best < 0 ? null : { index: best, delta: 0 };
  }

  // Light tiebreak: tiles fewer plans use are easier to give up.
  const usage = new Map<string, number>();
  for (const p of plans.slice(0, 60)) {
    for (const [k, n] of p.progress.naturalUse) usage.set(k, (usage.get(k) || 0) + n);
  }

  let best = -1, bestScore = Infinity, bestDelta = 0;
  hand.forEach((t, i) => {
    const k = keyOf(t);
    if (k === 'joker' && hasNatural) return;
    const after = byKey.get(k) ?? baseline;
    const score = after + (usage.get(k) || 0) * 0.002 + NOISE[s] * rng();
    if (score < bestScore) { bestScore = score; best = i; bestDelta = after - baseline; }
  });
  return best < 0 ? null : { index: best, delta: bestDelta };
}

export interface CallChoiceOption {
  size: number;
  matchUsed: number;
  jokersUsed: number;
}

/** Build the exposure and remaining hand for calling `discard` with this option. */
export function simulateCall(hand: Tile[], discard: Tile, opt: CallChoiceOption): { hand: Tile[]; exposure: Tile[] } {
  const discardKey = tileKey(discard);
  const exposure: Tile[] = [discard];
  const used = new Set<string>();
  let naturals = 0, jokers = 0;
  for (const t of hand) {
    if (naturals < opt.matchUsed && !isJoker(t) && tileKey(t) === discardKey) {
      exposure.push(t); used.add(t.id); naturals++;
    }
  }
  for (const t of hand) {
    if (jokers < opt.jokersUsed && isJoker(t)) { exposure.push(t); used.add(t.id); jokers++; }
  }
  return { hand: hand.filter(t => !used.has(t.id)), exposure };
}

/**
 * Which group size to call the discard for, or null to pass. A bot calls only
 * when the exposure fits a live, exposable plan and gets it at least a tile closer.
 */
export function chooseCall(
  hand: Tile[], exposures: Tile[][], discard: Tile, options: CallChoiceOption[],
  avail: Availability | undefined, skill: number, rng: Rng = Math.random,
): number | null {
  if (options.length === 0) return null;
  const s = si(skill);
  if (rng() < MISS_CALL[s]) return null;
  const before = bestPlanCost(hand, exposures, avail);
  let bestSize: number | null = null, bestAfter = Infinity, bestJokers = Infinity;
  for (const opt of options) {
    const sim = simulateCall(hand, discard, opt);
    const after = bestPlanCost(sim.hand, [...exposures, sim.exposure], avail);
    if (after < bestAfter - 1e-9 || (Math.abs(after - bestAfter) < 1e-9 && opt.jokersUsed < bestJokers)) {
      bestAfter = after; bestSize = opt.size; bestJokers = opt.jokersUsed;
    }
  }
  if (bestSize === null || bestAfter === Infinity) return null;
  return bestAfter <= before - 0.6 ? bestSize : null;
}

/** Pick `count` tiles to pass in the Charleston. Never jokers (they may not be passed). */
export function chooseCharlestonPass(
  hand: Tile[], count: number, avail: Availability | undefined, skill: number, rng: Rng = Math.random,
): number[] {
  const s = si(skill);
  let remaining = hand.map((t, i) => ({ t, i }));
  const picked: number[] = [];
  for (let r = 0; r < count; r++) {
    const tiles = remaining.map(x => x.t);
    // Early in the hand, keep more plans in mind so options stay open.
    const { byKey, baseline } = removalCosts(tiles, [], avail, Math.max(8, TOP_K[s]));
    let best = -1, bestScore = Infinity;
    remaining.forEach((x, idx) => {
      if (isJoker(x.t)) return;
      const score = (byKey.get(keyOf(x.t)) ?? baseline) + NOISE[s] * rng();
      if (score < bestScore) { bestScore = score; best = idx; }
    });
    if (best < 0) break;
    picked.push(remaining[best].i);
    remaining = remaining.filter((_, idx) => idx !== best);
  }
  return picked;
}

/** How many tiles (0–3) a bot offers in the courtesy pass: its true deadweight. */
export function chooseCourtesyCount(hand: Tile[], avail: Availability | undefined, skill: number): number {
  const { byKey, baseline } = removalCosts(hand, [], avail, Math.max(8, TOP_K[si(skill)]));
  let dead = 0;
  for (const t of hand) {
    if (isJoker(t)) continue;
    if ((byKey.get(keyOf(t)) ?? baseline) - baseline < 0.05) dead++;
  }
  return Math.min(3, dead);
}
