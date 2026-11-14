// Rules-correct hand matching for American Mahjong (NMJL-style).
//
// Rules applied here:
//  • A 0 on the card is a White Dragon, and a White Dragon used as 0 has no suit.
//  • Dragons belong to suits: Red = Craks, Green = Bams, White = Dots.
//  • Jokers may stand in for any tile, but only in pungs, kongs, quints and
//    sextets (3+ identical tiles) — flowers and winds included. Never in singles,
//    pairs or runs such as NEWS, 2025 or 123.
//  • Each exposure must be one whole group on the card: same tile, same size.
//    A pung of flowers plus a flower in hand is NOT a kong of flowers.
//  • Concealed ("C") hands allow no exposures (the winning discard goes in hand).
//  • A hand scores for the highest-scoring line it satisfies; jokerless hands
//    score double, except Singles & Pairs.
//
// Pure functions, no UI dependencies.

import type { Tile, Suit, GameState } from './types';
import { ACTIVE_PATTERNS, type CardPattern } from './cards';

export const ALL_PATTERNS: CardPattern[] = ACTIVE_PATTERNS;

// ─── Tile keys ───────────────────────────────────────────────────────

export function tileKey(tile: Tile): string {
  switch (tile.type) {
    case 'suited': return `s_${tile.suit}_${tile.value}`;
    case 'wind': return `w_${tile.direction}`;
    case 'dragon': return `d_${tile.color}`;
    case 'special':
      if (tile.specialType === 'flower') return 'flower';
      if (tile.specialType === 'joker') return 'joker';
      return 'blank';
  }
}

export function isJoker(tile: Tile): boolean {
  return tile.type === 'special' && tile.specialType === 'joker';
}

export function suitDragon(suit: Suit): string {
  switch (suit) { case 'bam': return 'green'; case 'crak': return 'red'; case 'dot': return 'soap'; }
}

export const SUIT_PERMS: [Suit, Suit, Suit][] = [
  ['bam', 'crak', 'dot'], ['bam', 'dot', 'crak'], ['crak', 'bam', 'dot'],
  ['crak', 'dot', 'bam'], ['dot', 'bam', 'crak'], ['dot', 'crak', 'bam'],
];

/** Jokers are allowed only in groups of 3+ identical tiles. */
export function isJokerEligibleToken(text: string): boolean {
  if (text.length < 3) return false;
  for (let i = 1; i < text.length; i++) if (text[i] !== text[0]) return false;
  return true;
}

// ─── Variants: a pattern with suits and dragons fixed ───────────────

export interface GroupSpec {
  text: string;
  color: string;
  size: number;
  jokerable: boolean;
  needs: Map<string, number>;
  key: string | null;   // the single tile this group is made of, if it is one tile repeated
}

export interface Variant {
  patternIndex: number;
  pattern: CardPattern;
  groups: GroupSpec[];
}

const WIND_KEYS: Record<string, string> = { N: 'w_north', E: 'w_east', W: 'w_west', S: 'w_south' };

function resolveToken(text: string, color: string, suitMap: Record<string, Suit>, dragon: string | null): GroupSpec | null {
  const needs = new Map<string, number>();
  const add = (k: string) => needs.set(k, (needs.get(k) || 0) + 1);

  if (/^F+$/.test(text)) {
    needs.set('flower', text.length);
  } else if (/^[NEWS]+$/.test(text)) {
    for (const ch of text) add(WIND_KEYS[ch]);
  } else if (/^D+$/.test(text)) {
    if (color === 'n') {
      if (!dragon) return null;
      needs.set(`d_${dragon}`, text.length);
    } else {
      const s = suitMap[color];
      if (!s) return null;
      needs.set(`d_${suitDragon(s)}`, text.length);
    }
  } else {
    for (const ch of text) {
      if (ch === '0') { add('d_soap'); continue; } // 0 = White Dragon, suitless
      const s = suitMap[color];
      if (!s) return null;
      add(`s_${s}_${ch}`);
    }
  }
  return {
    text, color, size: text.length,
    jokerable: isJokerEligibleToken(text),
    needs,
    key: needs.size === 1 ? needs.keys().next().value! : null,
  };
}

const variantCache: (Variant[] | undefined)[] = [];

export function getVariants(patternIndex: number): Variant[] {
  const cached = variantCache[patternIndex];
  if (cached) return cached;
  const pattern = ALL_PATTERNS[patternIndex];
  const tokens = pattern.tokens.filter(t => t.c !== 'o');
  const hasNeutralDragon = tokens.some(t => /^D+$/.test(t.t) && t.c === 'n');
  const dragons: (string | null)[] = hasNeutralDragon ? ['red', 'green', 'soap'] : [null];
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const [g, r, b] of SUIT_PERMS) {
    const suitMap: Record<string, Suit> = { g, r, b };
    for (const dragon of dragons) {
      const groups: GroupSpec[] = [];
      let ok = true;
      for (const tok of tokens) {
        const spec = resolveToken(tok.t, tok.c, suitMap, dragon);
        if (!spec) { ok = false; break; }
        groups.push(spec);
      }
      if (!ok) continue;
      const sig = groups
        .map(gr => `${gr.size}${gr.jokerable ? 'j' : ''}:${[...gr.needs].sort().map(([k, n]) => `${k}x${n}`).join(',')}`)
        .sort().join(';');
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ patternIndex, pattern, groups });
    }
  }
  variantCache[patternIndex] = out;
  return out;
}

// ─── Exposures ──────────────────────────────────────────────────────

/** The tile an exposure is made of (from its naturals), or null if it is not one tile repeated. */
export function exposureKey(exposure: Tile[]): string | null {
  let key: string | null = null;
  for (const t of exposure) {
    if (isJoker(t)) continue;
    const k = tileKey(t);
    if (key === null) key = k;
    else if (key !== k) return null;
  }
  return key;
}

/** Map each exposure to a whole group of the variant (same tile, same size), or null. */
function assignExposures(variant: Variant, exposures: Tile[][]): number[] | null {
  if (exposures.length === 0) return [];
  if (variant.pattern.concealed) return null;
  const used = new Array(variant.groups.length).fill(false);
  const out: number[] = [];
  for (const exp of exposures) {
    const key = exposureKey(exp);
    if (key === null) return null;
    let found = -1;
    for (let i = 0; i < variant.groups.length; i++) {
      const g = variant.groups[i];
      if (!used[i] && g.jokerable && g.key === key && g.size === exp.length) { found = i; break; }
    }
    if (found < 0) return null;
    used[found] = true;
    out.push(found);
  }
  return out;
}

// ─── Winning hands ──────────────────────────────────────────────────

export interface WinMatch {
  pattern: CardPattern;
  patternIndex: number;
  variant: Variant;
  groups: Tile[][];      // tiles per card group, in card order
  jokerless: boolean;
  value: number;         // points after the jokerless double
}

export function handValue(pattern: CardPattern, jokerless: boolean): number {
  return pattern.points * (jokerless && pattern.section !== 'singlesPairs' ? 2 : 1);
}

/** Fit concealed tiles + exposures to one variant exactly (14 tiles), or null. */
export function matchVariant(variant: Variant, concealed: Tile[], exposures: Tile[][]): Tile[][] | null {
  const expTotal = exposures.reduce((s, e) => s + e.length, 0);
  if (concealed.length + expTotal !== 14) return null;
  const expAssign = assignExposures(variant, exposures);
  if (!expAssign) return null;

  const pools = new Map<string, Tile[]>();
  const jokers: Tile[] = [];
  for (const t of concealed) {
    if (isJoker(t)) { jokers.push(t); continue; }
    const k = tileKey(t);
    const list = pools.get(k);
    if (list) list.push(t); else pools.set(k, [t]);
  }
  const take = (k: string, n: number): Tile[] | null => {
    const list = pools.get(k);
    if (!list || list.length < n) return null;
    return list.splice(0, n);
  };

  const result: (Tile[] | null)[] = variant.groups.map(() => null);
  expAssign.forEach((gi, ei) => { result[gi] = exposures[ei]; });

  // Singles, pairs and runs need real tiles.
  for (let i = 0; i < variant.groups.length; i++) {
    const g = variant.groups[i];
    if (result[i] || g.jokerable) continue;
    const tiles: Tile[] = [];
    for (const [k, n] of g.needs) {
      const got = take(k, n);
      if (!got) return null;
      tiles.push(...got);
    }
    result[i] = tiles;
  }
  // Pungs/kongs/quints: naturals first, then jokers.
  for (let i = 0; i < variant.groups.length; i++) {
    const g = variant.groups[i];
    if (result[i]) continue;
    const list = pools.get(g.key!) || [];
    const real = list.splice(0, Math.min(list.length, g.size));
    const short = g.size - real.length;
    if (short > jokers.length) return null;
    result[i] = [...real, ...jokers.splice(0, short)];
  }
  for (const list of pools.values()) if (list.length > 0) return null;
  if (jokers.length > 0) return null;
  return result as Tile[][];
}

/** The highest-scoring hand on the card these tiles form, or null. */
export function findBestWin(concealed: Tile[], exposures: Tile[][]): WinMatch | null {
  const expTotal = exposures.reduce((s, e) => s + e.length, 0);
  if (concealed.length + expTotal !== 14) return null;
  const jokerless = !concealed.some(isJoker) && !exposures.some(e => e.some(isJoker));
  let best: WinMatch | null = null;
  for (let pi = 0; pi < ALL_PATTERNS.length; pi++) {
    const pattern = ALL_PATTERNS[pi];
    if (pattern.concealed && exposures.length > 0) continue;
    const value = handValue(pattern, jokerless);
    if (best && value <= best.value) continue;
    for (const variant of getVariants(pi)) {
      const groups = matchVariant(variant, concealed, exposures);
      if (groups) { best = { pattern, patternIndex: pi, variant, groups, jokerless, value }; break; }
    }
  }
  return best;
}

// ─── Progress toward a hand (for AI and the trainer) ────────────────

export interface GroupFill {
  index: number;
  size: number;
  jokerable: boolean;
  key: string | null;
  needs: Map<string, number>;
  exposed: boolean;
  natural: number;
  jokers: number;
  missing: number;
}

export interface Progress {
  variant: Variant;
  placed: number;                       // tiles of the 14 already accounted for
  missing: number;                      // tiles still to collect
  fills: GroupFill[];
  naturalUse: Map<string, number>;      // concealed naturals this plan uses, per tile
  nonJokerShort: Map<string, number>;   // tiles still needed where a joker can't help
  jokersUsed: number;
  jokersSpare: number;
}

export interface TileCounts { counts: Map<string, number>; jokers: number }

export function countTiles(tiles: Tile[]): TileCounts {
  const counts = new Map<string, number>();
  let jokers = 0;
  for (const t of tiles) {
    if (isJoker(t)) { jokers++; continue; }
    const k = tileKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return { counts, jokers };
}

export function evaluateVariant(variant: Variant, hand: TileCounts, exposures: Tile[][]): Progress | null {
  const expAssign = assignExposures(variant, exposures);
  if (!expAssign) return null;
  const rem = new Map(hand.counts);
  const naturalUse = new Map<string, number>();
  const nonJokerShort = new Map<string, number>();
  const fills: GroupFill[] = variant.groups.map((g, index) => ({
    index, size: g.size, jokerable: g.jokerable, key: g.key, needs: g.needs,
    exposed: false, natural: 0, jokers: 0, missing: 0,
  }));
  expAssign.forEach((gi, ei) => {
    const f = fills[gi];
    f.exposed = true;
    f.jokers = exposures[ei].filter(isJoker).length;
    f.natural = f.size - f.jokers;
  });
  const use = (k: string, want: number): number => {
    const have = rem.get(k) || 0;
    const n = Math.min(have, want);
    if (n > 0) {
      rem.set(k, have - n);
      naturalUse.set(k, (naturalUse.get(k) || 0) + n);
    }
    return n;
  };

  for (const f of fills) {
    if (f.exposed || f.jokerable) continue;
    for (const [k, n] of f.needs) {
      const got = use(k, n);
      f.natural += got;
      if (got < n) {
        f.missing += n - got;
        nonJokerShort.set(k, (nonJokerShort.get(k) || 0) + (n - got));
      }
    }
  }
  const open: GroupFill[] = [];
  for (const f of fills) {
    if (f.exposed || !f.jokerable) continue;
    f.natural = use(f.key!, f.size);
    f.missing = f.size - f.natural;
    if (f.missing > 0) open.push(f);
  }
  // Jokers go where they finish groups soonest.
  open.sort((a, b) => a.missing - b.missing);
  let jokersLeft = hand.jokers;
  for (const f of open) {
    const j = Math.min(jokersLeft, f.missing);
    f.jokers = j;
    f.missing -= j;
    jokersLeft -= j;
  }
  let placed = 0;
  for (const f of fills) placed += f.natural + f.jokers;
  return {
    variant, placed, missing: 14 - placed, fills, naturalUse, nonJokerShort,
    jokersUsed: hand.jokers - jokersLeft, jokersSpare: jokersLeft,
  };
}

// ─── What's still out there ─────────────────────────────────────────

export interface Availability {
  unseen: Map<string, number>;   // copies not visible to this player
  jokersUnseen: number;
}

/** Copies of each tile this player cannot see (wall + opponents' concealed tiles). */
export function computeAvailability(state: GameState, playerIndex: number): Availability {
  const unseen = new Map<string, number>();
  for (const s of ['bam', 'crak', 'dot']) for (let v = 1; v <= 9; v++) unseen.set(`s_${s}_${v}`, 4);
  for (const w of ['north', 'east', 'south', 'west']) unseen.set(`w_${w}`, 4);
  for (const d of ['red', 'green', 'soap']) unseen.set(`d_${d}`, 4);
  unseen.set('flower', state.config.flowerCount);
  let jokersUnseen = state.config.jokerCount;
  const see = (t: Tile) => {
    if (isJoker(t)) { jokersUnseen--; return; }
    const k = tileKey(t);
    if (unseen.has(k)) unseen.set(k, Math.max(0, unseen.get(k)! - 1));
  };
  state.discardPool.forEach(see);
  state.players.forEach((p, i) => {
    p.exposures.forEach(e => e.forEach(see));
    p.exposures2.forEach(e => e.forEach(see));
    if (i === playerIndex) { p.hand.forEach(see); p.hand2.forEach(see); }
  });
  return { unseen, jokersUnseen: Math.max(0, jokersUnseen) };
}

/**
 * How far a plan is from Mahjong, as a number of tiles plus small penalties.
 * Infinity when the plan can no longer be completed with the tiles still out.
 */
export function progressCost(p: Progress, avail?: Availability): number {
  let cost = p.missing;
  for (const [k, short] of p.nonJokerShort) {
    if (avail) {
      const u = avail.unseen.get(k) ?? 0;
      if (u < short) return Infinity;            // that pair or single can't be finished
      if (u === short) cost += 0.4;               // needs the very last copies
    }
    cost += 0.35 * short;                         // pairs/singles: no joker help, can't be called
  }
  if (avail) {
    const needByKey = new Map<string, number>();
    for (const f of p.fills) if (f.jokerable && f.missing > 0) needByKey.set(f.key!, (needByKey.get(f.key!) || 0) + f.missing);
    for (const [k, need] of needByKey) {
      if ((avail.unseen.get(k) ?? 0) + avail.jokersUnseen < need) return Infinity;
    }
  }
  if (p.variant.pattern.concealed) cost += 0.3;   // can only finish from the wall
  return cost;
}

export interface RankedPlan { progress: Progress; cost: number; pattern: CardPattern }

/** Every live plan for this hand, best first. */
export function rankPlans(concealed: Tile[], exposures: Tile[][], avail?: Availability): RankedPlan[] {
  const hand = countTiles(concealed);
  const out: RankedPlan[] = [];
  for (let pi = 0; pi < ALL_PATTERNS.length; pi++) {
    const pattern = ALL_PATTERNS[pi];
    if (pattern.concealed && exposures.length > 0) continue;
    for (const variant of getVariants(pi)) {
      const progress = evaluateVariant(variant, hand, exposures);
      if (!progress) continue;
      const cost = progressCost(progress, avail);
      if (cost === Infinity) continue;
      out.push({ progress, cost, pattern });
    }
  }
  out.sort((a, b) => a.cost - b.cost || b.pattern.points - a.pattern.points);
  return out;
}

/** Best plan per card line (so the top three aren't three shifts of one line). */
export function bestPlanPerHand(plans: RankedPlan[]): RankedPlan[] {
  const seen = new Set<string>();
  const out: RankedPlan[] = [];
  for (const p of plans) {
    if (seen.has(p.pattern.handId)) continue;
    seen.add(p.pattern.handId);
    out.push(p);
  }
  return out;
}

/** True if no line on the card can still be completed — a dead hand. */
export function isHandDead(concealed: Tile[], exposures: Tile[][], avail: Availability): boolean {
  return rankPlans(concealed, exposures, avail).length === 0;
}

/**
 * Weighted cost of the top plans after removing one copy of each tile.
 * Lower means the tile is cheaper to let go. Key "joker" covers jokers.
 */
export function removalCosts(
  concealed: Tile[], exposures: Tile[][], avail: Availability | undefined, topK: number,
): { baseline: number; byKey: Map<string, number>; plans: RankedPlan[] } {
  const plans = rankPlans(concealed, exposures, avail);
  const top = plans.slice(0, topK);
  const hand = countTiles(concealed);
  const weight = (i: number) => 1 / (i + 1);
  const baseline = top.reduce((s, p, i) => s + weight(i) * p.cost, 0);
  const byKey = new Map<string, number>();
  const keys = new Set<string>(concealed.map(t => (isJoker(t) ? 'joker' : tileKey(t))));
  for (const k of keys) {
    const reduced: TileCounts = { counts: new Map(hand.counts), jokers: hand.jokers };
    if (k === 'joker') reduced.jokers--;
    else reduced.counts.set(k, reduced.counts.get(k)! - 1);
    let total = 0;
    top.forEach((p, i) => {
      const after = evaluateVariant(p.progress.variant, reduced, exposures);
      const c = after ? progressCost(after, avail) : Infinity;
      total += weight(i) * (c === Infinity ? p.cost + 3 : c);
    });
    byKey.set(k, total);
  }
  return { baseline, byKey, plans };
}
