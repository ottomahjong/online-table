// Strategy trainer for American Mahjong (NMJL). Pure functions, no UI.
//
// Built on the same matcher the engine uses (handMatcher), so its advice
// follows the real rules: exposures must be whole card groups, jokers only in
// pungs/kongs/quints, 0 = White Dragon, concealed hands allow no exposures.
//
// Public entry: analyze(game, playerIndex) -> AnalysisResult.

import type { Tile, GameState } from './types';
import { ACTIVE_CARD, type CardSection, type CardPattern } from './cards';
import {
  ALL_PATTERNS, rankPlans, bestPlanPerHand, computeAvailability, countTiles,
  evaluateVariant, progressCost, tileKey, isJoker, isJokerEligibleToken,
  type RankedPlan, type Availability, type TileCounts,
} from './handMatcher';
import { getCallOptions, type CallGroupSize } from './gameLogic';
import { simulateCall } from './aiStrategy';

// ════════════════════════════════════════════════════════════════════════
//   Card structure (one template per concrete pattern)
// ════════════════════════════════════════════════════════════════════════

export type BlockType = 'single' | 'pair' | 'pung' | 'kong' | 'quint' | 'sextet' | 'run';

export interface Block {
  id: string;
  type: BlockType;
  size: number;
  jokerable: boolean;
  rawText: string;
  rawColor: string;
}

export type SectionTag =
  | '2025' | '2468' | 'LikeNumbers' | 'Quints' | 'ConsecutiveRun'
  | '13579' | 'WindsDragons' | '369' | 'SinglesAndPairs' | 'Other';

const SECTION_TAG: Record<CardSection, SectionTag> = {
  year: '2025', '2468': '2468', likeNumbers: 'LikeNumbers', quints: 'Quints',
  consecutiveRun: 'ConsecutiveRun', '13579': '13579', windsDragons: 'WindsDragons',
  '369': '369', singlesPairs: 'SinglesAndPairs',
};

export interface HandTemplate {
  id: string;
  index: number;
  handId: string;
  blocks: Block[];
  concealed: boolean;
  sectionTag: SectionTag;
  sectionName: string;
  points: number;
  label: string;
}

function blockType(text: string): BlockType {
  const same = text.split('').every(ch => ch === text[0]);
  if (text.length === 1) return 'single';
  if (!same) return 'run';
  return (['single', 'pair', 'pung', 'kong', 'quint', 'sextet'] as BlockType[])[Math.min(text.length, 6) - 1];
}

let templateCache: HandTemplate[] | null = null;
export function getHandTemplates(): HandTemplate[] {
  if (templateCache) return templateCache;
  templateCache = ALL_PATTERNS.map((pat, index) => ({
    id: `h${index}`,
    index,
    handId: pat.handId,
    concealed: pat.concealed,
    sectionTag: SECTION_TAG[pat.section],
    sectionName: ACTIVE_CARD.sectionNames[pat.section],
    points: pat.points,
    label: pat.label,
    blocks: pat.tokens.filter(t => t.c !== 'o').map((t, i) => ({
      id: `b${i}`, type: blockType(t.t), size: t.t.length,
      jokerable: isJokerEligibleToken(t.t), rawText: t.t, rawColor: t.c,
    })),
  }));
  return templateCache;
}

// ════════════════════════════════════════════════════════════════════════
//   Phase
// ════════════════════════════════════════════════════════════════════════

export type PhaseLabel = 'charleston' | 'early' | 'mid' | 'end';

export function detectPhase(game: GameState): PhaseLabel {
  if (game.phase === 'charleston') return 'charleston';
  const wallRemaining = game.wall.length;
  const wallFraction = wallRemaining / Math.max(1, game.config.totalTiles);
  const avgDiscards = game.discardPool.length / Math.max(1, game.config.playerCount);
  const anyExposures = game.players.some(p => p.exposures.length > 0);
  const someoneClose = game.players.some(p => p.exposures.length >= 2);
  if (wallRemaining < 20 || someoneClose) return 'end';
  if (anyExposures || wallFraction < 0.5) return 'mid';
  if (avgDiscards <= 5) return 'early';
  return 'mid';
}

// ════════════════════════════════════════════════════════════════════════
//   Labels
// ════════════════════════════════════════════════════════════════════════

export function tileKeyToLabel(k: string): string {
  if (k === 'flower') return 'Flower';
  if (k === 'joker') return 'Joker';
  if (k.startsWith('s_')) {
    const [, suit, val] = k.split('_');
    return `${val} ${suit === 'bam' ? 'Bam' : suit === 'crak' ? 'Crak' : 'Dot'}`;
  }
  if (k.startsWith('w_')) return `${k[2].toUpperCase()}${k.slice(3)} Wind`;
  if (k === 'd_red') return 'Red Dragon';
  if (k === 'd_green') return 'Green Dragon';
  if (k === 'd_soap') return 'White Dragon';
  return k;
}

/** The plan's groups with suits filled in, e.g. "FF 444 5555 66666". */
function concreteLabel(plan: RankedPlan): string {
  return plan.progress.variant.groups.map(g => g.text).join(' ');
}

// ════════════════════════════════════════════════════════════════════════
//   Candidates
// ════════════════════════════════════════════════════════════════════════

export interface CandidateHand {
  handName: string;          // this plan's groups, e.g. "FF 444 5555 66666"
  handId: string;            // card line id, e.g. "QU-1"
  cardLine: string;          // the line as printed, e.g. "FF 111 2222 33333"
  section: SectionTag;
  sectionName: string;
  points: number;
  feasibility: number;       // 0–100
  missing: number;           // tiles still to collect
  tilesYouHave: string[];
  tilesYouNeed: string[];
  pairsNeeded: number;
  pairsHeld: number;
  concealed: boolean;
  jokersUsable: number;
  reasoning: string;
  fading: boolean;
  plan: RankedPlan;
}

function pairFills(plan: RankedPlan) {
  return plan.progress.fills.filter(f => !f.jokerable && f.size === 2 && f.needs.size === 1);
}

function feasibilityOf(plan: RankedPlan): number {
  if (plan.progress.missing === 0) return 100;
  return Math.max(0, Math.min(99, Math.round(((14 - plan.cost) / 14) * 100)));
}

function rankCandidates(cands: CandidateHand[]): CandidateHand[] {
  return [...cands].sort((a, b) => {
    const df = b.feasibility - a.feasibility;
    if (Math.abs(df) > 10) return df;
    if (a.pairsNeeded !== b.pairsNeeded) return a.pairsNeeded - b.pairsNeeded;   // fewer pairs to build
    if (a.concealed !== b.concealed) return a.concealed ? 1 : -1;                // exposable is easier
    if (a.missing !== b.missing) return a.missing - b.missing;
    return b.points - a.points;
  });
}

function buildCandidate(plan: RankedPlan, avail: Availability, racingKeys: Set<string>): CandidateHand {
  const p = plan.progress;
  const have: string[] = [];
  for (const [k, n] of p.naturalUse) for (let i = 0; i < n; i++) have.push(tileKeyToLabel(k));
  for (const f of p.fills) if (f.exposed) for (let i = 0; i < f.size; i++) have.push(`${tileKeyToLabel(f.key!)} (exposed)`);
  if (p.jokersUsed > 0) have.push(`${p.jokersUsed}× Joker`);

  const need: string[] = [];
  for (const [k, n] of p.nonJokerShort) need.push(`${n}× ${tileKeyToLabel(k)}`);
  for (const f of p.fills) {
    if (f.jokerable && !f.exposed && f.missing > 0) need.push(`${f.missing}× ${tileKeyToLabel(f.key!)} (or Joker)`);
  }

  const pairs = pairFills(plan);
  const pairsHeld = pairs.filter(f => f.missing === 0).length;
  const pairsNeeded = pairs.length - pairsHeld;

  let fading = false;
  for (const [k, short] of p.nonJokerShort) if ((avail.unseen.get(k) ?? 0) <= short) fading = true;
  for (const f of p.fills) {
    if (f.exposed) continue;
    for (const k of f.needs.keys()) if (racingKeys.has(k) && f.missing > 0) fading = true;
  }

  const c: CandidateHand = {
    handName: concreteLabel(plan),
    handId: plan.pattern.handId,
    cardLine: plan.pattern.label,
    section: SECTION_TAG[plan.pattern.section],
    sectionName: ACTIVE_CARD.sectionNames[plan.pattern.section],
    points: plan.pattern.points,
    feasibility: feasibilityOf(plan),
    missing: p.missing,
    tilesYouHave: have,
    tilesYouNeed: need,
    pairsNeeded,
    pairsHeld,
    concealed: plan.pattern.concealed,
    jokersUsable: p.jokersUsed,
    reasoning: '',
    fading,
    plan,
  };
  c.reasoning = composeReasoning(c);
  return c;
}

function composeReasoning(c: CandidateHand): string {
  const parts: string[] = [];
  if (c.missing === 0) parts.push('This hand is complete — declare Mahjong!');
  else parts.push(`${c.missing} tile${c.missing === 1 ? '' : 's'} away (${c.sectionName}, ${c.points} points).`);
  if (c.jokersUsable > 0) parts.push(`${c.jokersUsable} of your Jokers already have a home in it.`);
  if (c.pairsNeeded === 0 && c.pairsHeld > 0) {
    parts.push(`Your pair${c.pairsHeld === 1 ? ' is' : 's are'} already in place — pairs can't use Jokers, so that's the hard part done.`);
  } else if (c.pairsNeeded > 0) {
    parts.push(`It still needs ${c.pairsNeeded} pair${c.pairsNeeded === 1 ? '' : 's'}, and a Joker can't fill a pair.`);
  }
  parts.push(c.concealed
    ? 'Concealed (C): you must draw every tile yourself — you can only call a discard for Mahjong.'
    : 'Exposed (X): you can call discards to complete its pungs and kongs.');
  if (c.fading) parts.push('Fading: a tile it needs is nearly gone, or an opponent is collecting the same tiles.');
  return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════════════
//   Reading opponents' exposures
// ════════════════════════════════════════════════════════════════════════

interface OpponentRead {
  playerIndex: number;
  name: string;
  exposures: number;
  likelyHands: string[];         // card lines their exposures still fit
  neededKeys: Set<string>;       // tiles those hands still need
  dead: boolean;                 // no line on the card fits their exposures
}

/**
 * What each opponent with exposures is probably building. Only lines on the
 * card that their exposures fit can still win for them.
 */
function readOpponents(game: GameState, me: number, avail: Availability): OpponentRead[] {
  const out: OpponentRead[] = [];
  game.players.forEach((p, i) => {
    if (i === me || p.exposures.length === 0) return;
    const plans = rankPlans([], p.exposures, avail);
    const perHand = bestPlanPerHand(plans);
    const neededKeys = new Set<string>();
    for (const plan of plans.slice(0, 24)) {
      for (const f of plan.progress.fills) if (!f.exposed) for (const k of f.needs.keys()) neededKeys.add(k);
    }
    out.push({
      playerIndex: i, name: p.name, exposures: p.exposures.length,
      likelyHands: perHand.slice(0, 3).map(pl => pl.pattern.label),
      neededKeys, dead: plans.length === 0,
    });
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//   Charleston clusters — groupings that signal your hand if passed
// ════════════════════════════════════════════════════════════════════════

export type CharlestonCluster =
  | 'sameNumberDifferentSuits' | 'consecutiveOrNear' | 'allOneSuit' | 'allWinds' | 'allDragons';

export function detectCharlestonClusters(tiles: Tile[]): { cluster: CharlestonCluster; tileIds: string[] }[] {
  const out: { cluster: CharlestonCluster; tileIds: string[] }[] = [];
  if (tiles.length === 0) return out;
  const suited = tiles.filter((t): t is Extract<Tile, { type: 'suited' }> => t.type === 'suited');

  const byValue = new Map<number, typeof suited>();
  for (const t of suited) byValue.set(t.value, [...(byValue.get(t.value) || []), t]);
  for (const arr of byValue.values()) {
    if (arr.length >= 3 && new Set(arr.map(t => t.suit)).size >= 2) {
      out.push({ cluster: 'sameNumberDifferentSuits', tileIds: arr.map(t => t.id) });
    }
  }

  const bySuit = new Map<string, typeof suited>();
  for (const t of suited) bySuit.set(t.suit, [...(bySuit.get(t.suit) || []), t]);
  for (const arr of bySuit.values()) {
    if (arr.length >= 3 && arr.length === suited.length) {
      out.push({ cluster: 'allOneSuit', tileIds: arr.map(t => t.id) });
      break;
    }
  }
  for (const arr of bySuit.values()) {
    if (arr.length < 3) continue;
    const values = [...new Set(arr.map(t => t.value))].sort((a, b) => a - b);
    let runLen = 1, runStart = 0, bestLen = 1, bestStart = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] - values[i - 1] <= 2) {
        runLen++;
        if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; }
      } else { runLen = 1; runStart = i; }
    }
    if (bestLen >= 3) {
      const run = values.slice(bestStart, bestStart + bestLen);
      out.push({ cluster: 'consecutiveOrNear', tileIds: arr.filter(t => run.includes(t.value)).map(t => t.id) });
    }
  }

  const winds = tiles.filter(t => t.type === 'wind');
  if (winds.length >= 3 && new Set(winds.map(t => (t as any).direction)).size >= 2) {
    out.push({ cluster: 'allWinds', tileIds: winds.map(t => t.id) });
  }
  const dragons = tiles.filter(t => t.type === 'dragon');
  if (dragons.length >= 3 && new Set(dragons.map(t => (t as any).color)).size >= 2) {
    out.push({ cluster: 'allDragons', tileIds: dragons.map(t => t.id) });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//   Per-tile advice
// ════════════════════════════════════════════════════════════════════════

export type TileAction = 'KEEP' | 'DISCARD' | 'PASS' | 'WATCH';

export interface TileAdvice {
  tileId: string;
  tile: Tile;
  action: TileAction;
  reason: string;
  rationaleKey: string;
  contributesTo: number[];   // indices into topCandidates
  danger?: boolean;
}

/** How much worse the top candidates get without one copy of `key`. */
function contributionOf(key: string, hand: TileCounts, top: CandidateHand[], exposures: Tile[][], avail: Availability): number {
  const reduced: TileCounts = { counts: new Map(hand.counts), jokers: hand.jokers };
  if (key === 'joker') reduced.jokers = Math.max(0, reduced.jokers - 1);
  else reduced.counts.set(key, Math.max(0, (reduced.counts.get(key) || 0) - 1));
  let drop = 0;
  for (const c of top) {
    const after = evaluateVariant(c.plan.progress.variant, reduced, exposures);
    const cost = after ? progressCost(after, avail) : Infinity;
    drop += (cost === Infinity ? 5 : cost) - c.plan.cost;
  }
  return drop;
}

function adviseTile(
  tile: Tile, top: CandidateHand[], phase: PhaseLabel,
  danger: Map<string, OpponentRead>, contribution: (k: string) => number,
): TileAdvice {
  if (isJoker(tile)) {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: phase === 'charleston'
        ? 'Jokers may never be passed in the Charleston — and you would not want to: they fill any pung, kong or quint.'
        : 'Keep your Jokers. They stand in for any tile in a pung, kong or quint, which makes them the most flexible tiles in your rack.',
      rationaleKey: 'joker-never-discard',
      contributesTo: top.map((_, i) => i),
    };
  }
  if (tile.type === 'special' && tile.specialType === 'blank') {
    return {
      tileId: tile.id, tile, action: 'DISCARD',
      reason: 'A blank never fits a hand. Use the Blank Trade to swap it for a tile from the discards.',
      rationaleKey: 'blank-trade', contributesTo: [],
    };
  }

  const key = tileKey(tile);
  const contributesTo = top.map((c, i) => (c.plan.progress.naturalUse.has(key) ? i : -1)).filter(i => i >= 0);
  const inHeldPair = top.some(c => pairFills(c.plan).some(f => f.missing === 0 && f.key === key));
  const threat = phase === 'mid' || phase === 'end' ? danger.get(key) : undefined;

  if (inHeldPair) {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: 'Hold this pair — pairs are the hardest piece to build, and a Joker can\'t complete one.',
      rationaleKey: 'pair-preservation', contributesTo,
    };
  }

  if (tile.type === 'special' && tile.specialType === 'flower') {
    return contributesTo.length > 0
      ? { tileId: tile.id, tile, action: 'KEEP', reason: 'Flowers appear in many lines on the card, and this one fits your top hands.', rationaleKey: 'flowers', contributesTo }
      : { tileId: tile.id, tile, action: 'WATCH', reason: 'Your top hands don\'t use Flowers right now, but many lines do. Hold one or two in case you switch.', rationaleKey: 'flowers', contributesTo };
  }

  if (contributesTo.length === 0) {
    if (phase === 'charleston') {
      return {
        tileId: tile.id, tile, action: 'PASS',
        reason: 'It doesn\'t fit any of your top hands. The Charleston is the time to move tiles like this on.',
        rationaleKey: 'charleston-aggressive', contributesTo,
      };
    }
    if (threat) {
      return {
        tileId: tile.id, tile, action: 'WATCH', danger: true,
        reason: `${threat.name}'s exposures fit ${threat.likelyHands[0] ?? 'a hand'} — which can use this tile. Discard something safer if you can.`,
        rationaleKey: 'defensive-discard', contributesTo,
      };
    }
    return {
      tileId: tile.id, tile, action: 'DISCARD',
      reason: phase === 'early'
        ? 'It doesn\'t fit any of your top hands. Safe to let go early.'
        : 'It doesn\'t fit your top hands — letting it go makes room for tiles that do.',
      rationaleKey: 'discard-no-fit', contributesTo,
    };
  }

  const drop = contribution(key);
  if (drop >= 0.9) {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: `Your plan needs it — it fits ${contributesTo.length === 1 ? 'your top hand' : `${contributesTo.length} of your top hands`}.`,
      rationaleKey: 'tile-fits', contributesTo,
    };
  }
  if (threat) {
    return {
      tileId: tile.id, tile, action: 'WATCH', danger: true,
      reason: `It only helps a little, and ${threat.name} may want it (${threat.likelyHands[0] ?? 'their exposures'}). Hold it for now.`,
      rationaleKey: 'defensive-discard', contributesTo,
    };
  }
  return {
    tileId: tile.id, tile, action: phase === 'charleston' ? 'KEEP' : 'WATCH',
    reason: 'A spare: it fits, but you already have enough of it for your top hands. A fair discard if you need room.',
    rationaleKey: 'tile-marginal', contributesTo,
  };
}

// ════════════════════════════════════════════════════════════════════════
//   Main entry
// ════════════════════════════════════════════════════════════════════════

export interface AnalysisResult {
  phase: PhaseLabel;
  topCandidates: CandidateHand[];
  tileAdvice: TileAdvice[];
  teachingNote: string;
  warnings: string[];
  handDead: boolean;
}

export interface AnalyzeOptions {
  topN?: number;
  rack?: 1 | 2;
  forcePhase?: PhaseLabel;
}

export function analyze(game: GameState, playerIndex: number, options: AnalyzeOptions = {}): AnalysisResult {
  const player = game.players[playerIndex];
  const rack = options.rack ?? 1;
  const hand = rack === 2 ? player.hand2 : player.hand;
  const exposures = rack === 2 ? player.exposures2 : player.exposures;
  const phase = options.forcePhase ?? detectPhase(game);
  const avail = computeAvailability(game, playerIndex);

  const opponents = readOpponents(game, playerIndex, avail);
  const racingKeys = new Set<string>();
  for (const o of opponents) for (const k of o.neededKeys) racingKeys.add(k);

  const plans = rankPlans(hand, exposures, avail);
  const perHand = bestPlanPerHand(plans).slice(0, 12).map(pl => buildCandidate(pl, avail, racingKeys));
  const topCandidates = rankCandidates(perHand).slice(0, options.topN ?? 3);
  const handDead = plans.length === 0;

  // Danger: tiles opponents' likely hands still need (only those close enough to matter).
  const danger = new Map<string, OpponentRead>();
  for (const o of opponents) {
    if (o.dead) continue;
    for (const k of o.neededKeys) if (!danger.has(k)) danger.set(k, o);
  }

  const counts = countTiles(hand);
  const cache = new Map<string, number>();
  const contribution = (k: string) => {
    if (!cache.has(k)) cache.set(k, contributionOf(k, counts, topCandidates, exposures, avail));
    return cache.get(k)!;
  };
  const tileAdvice = hand.map(t => adviseTile(t, topCandidates, phase, danger, contribution));

  // Quints pivot: with 2+ jokers, point to the best Quints line if it isn't already on top.
  let quintPivot: CandidateHand | null = null;
  if (counts.jokers >= 2 && !topCandidates.some(c => c.section === 'Quints')) {
    const q = bestPlanPerHand(plans).find(pl => pl.pattern.section === 'quints');
    if (q) quintPivot = buildCandidate(q, avail, racingKeys);
  }

  return {
    phase,
    topCandidates,
    tileAdvice,
    teachingNote: composeTeachingNote(topCandidates, counts.jokers, phase, quintPivot, tileAdvice, handDead),
    warnings: composeWarnings(topCandidates, avail, opponents, phase, handDead),
    handDead,
  };
}

function composeTeachingNote(
  top: CandidateHand[], jokers: number, phase: PhaseLabel, quintPivot: CandidateHand | null,
  advice: TileAdvice[], handDead: boolean,
): string {
  if (handDead) {
    return 'No line on the card fits your exposures with the tiles still out — your hand is dead. Switch to defense: discard tiles your opponents are unlikely to need.';
  }
  if (top.length === 0) return 'No clear hand yet — keep your options open and let go of tiles that fit nothing.';
  if (top[0].missing === 0) return `Your hand is complete: ${top[0].cardLine} (${top[0].points} points). Declare Mahjong!`;

  const noFit = advice.filter(a => a.contributesTo.length === 0 && !isJoker(a.tile)).length;
  if (phase === 'charleston' && noFit >= 3) {
    return `${noFit} of your tiles fit none of your top hands. Pass those, and don't commit to one hand yet — the Charleston will show you what's coming.`;
  }
  if (quintPivot) {
    return `You hold ${jokers} Jokers — enough to make a Quints hand realistic. Keep "${quintPivot.cardLine}" (${quintPivot.points} points) in mind as a switch.`;
  }
  if (top.length >= 2 && Math.abs(top[0].feasibility - top[1].feasibility) < 10) {
    const [a, b] = top;
    return `Two hands are close: "${a.cardLine}" is ${a.missing} away${a.concealed ? ' and concealed' : ''}; "${b.cardLine}" is ${b.missing} away${b.concealed ? ' and concealed' : ''}. Keep tiles that serve both until one pulls ahead.`;
  }
  const lead = top[0];
  if (lead.pairsHeld > 0 && lead.pairsNeeded === 0) {
    return `Your pairs for "${lead.cardLine}" are in place. Pairs can't use Jokers, so protect them — the rest can be filled with Jokers or called discards.`;
  }
  return `Your strongest line is "${lead.cardLine}" (${lead.sectionName}, ${lead.points} points), ${lead.missing} tiles away. Discard tiles it doesn't use.`;
}

function composeWarnings(
  top: CandidateHand[], avail: Availability, opponents: OpponentRead[], phase: PhaseLabel, handDead: boolean,
): string[] {
  const warnings: string[] = [];
  if (handDead) warnings.push('Your hand is dead: no hand on the card fits your exposures with the tiles still available.');
  const lead = top[0];
  if (lead) {
    for (const [k, short] of lead.plan.progress.nonJokerShort) {
      const left = avail.unseen.get(k) ?? 0;
      if (left <= short + 1) {
        warnings.push(`You need ${short} more ${tileKeyToLabel(k)} for ${lead.cardLine}, and only ${left} ${left === 1 ? 'is' : 'are'} still out — a Joker can't stand in.`);
      }
    }
  }
  for (const o of opponents) {
    if (o.dead) continue;
    if (o.exposures >= 2) {
      warnings.push(`${o.name} has ${o.exposures} exposures that fit ${o.likelyHands.join(' or ')}. Be careful what you discard.`);
    }
  }
  if (phase === 'end' && warnings.length === 0) {
    warnings.push('Late in the game — check each discard against what your opponents have exposed.');
  }
  return warnings;
}

// ════════════════════════════════════════════════════════════════════════
//   Call coaching — what an exposure would do to your hand
// ════════════════════════════════════════════════════════════════════════

export interface CallAssessment {
  size: CallGroupSize;
  fits: boolean;          // at least one hand on the card still works after this call
  improves: boolean;      // it brings your best hand closer
  message: string;
}

export function assessCall(game: GameState, playerIndex: number, size: CallGroupSize): CallAssessment | null {
  const option = getCallOptions(game, playerIndex).find(o => o.size === size);
  if (!option || !game.lastDiscarded) return null;
  const player = game.players[playerIndex];
  const avail = computeAvailability(game, playerIndex);
  const before = rankPlans(player.hand, player.exposures, avail);
  const sim = simulateCall(player.hand, game.lastDiscarded, option);
  const after = rankPlans(sim.hand, [...player.exposures, sim.exposure], avail);
  const label = option.label;
  if (after.length === 0) {
    return { size, fits: false, improves: false, message: `No hand on the card uses this ${label} with your tiles — calling it would leave your hand dead.` };
  }
  const best = after[0];
  const improves = before.length === 0 || best.cost < before[0].cost - 0.5;
  const gaveUp = before.length > 0 && before[0].pattern.concealed ? ` It gives up concealed hands like "${before[0].pattern.label}".` : '';
  const missing = best.progress.missing;
  return {
    size, fits: true, improves,
    message: `Fits "${best.pattern.label}" (${best.pattern.points} pts) — ${missing === 0 ? 'Mahjong!' : `${missing} tile${missing === 1 ? '' : 's'} away after the call`}.${improves ? '' : ' It doesn\'t bring you closer than you are now.'}${gaveUp}`,
  };
}

// ════════════════════════════════════════════════════════════════════════
//   Glossary for the "Why?" links
// ════════════════════════════════════════════════════════════════════════

export const GLOSSARY: Record<string, { title: string; body: string }> = {
  'pair-preservation': {
    title: 'Pair Preservation',
    body: 'A pair is two identical tiles. Jokers can never be used in a pair (or a single, or a run like NEWS or 2025), and you can\'t call a discard to make one — except for Mahjong. So the second tile of a pair is often the hardest tile to get. Protect the pairs your hand needs.',
  },
  'joker-never-discard': {
    title: 'Jokers',
    body: 'A Joker can stand in for any tile, but only in a pung, kong or quint (3, 4 or 5 identical tiles) — flowers and winds included. Never in a pair or single. Jokers may not be passed in the Charleston. On your turn you can trade a matching real tile for a Joker sitting in anyone\'s exposure.',
  },
  'flowers': {
    title: 'Flowers',
    body: 'All flowers and seasons count as the same tile, "F". Many lines on the card start with FF, FFF or FFFF, so a couple of Flowers keep many hands open. A pung or kong of Flowers can use Jokers like any other.',
  },
  'white-dragon': {
    title: 'White Dragon (Soap)',
    body: 'A 0 on the card is a White Dragon — for example the 0 in 2025. Used as a 0 it has no suit. As a dragon, White goes with Dots, Green with Bams and Red with Craks.',
  },
  'charleston-aggressive': {
    title: 'The Charleston',
    body: 'Everyone passes three tiles at once — right, across, left, then (if all agree) left, across, right — and finally an optional courtesy pass of 0–3 tiles with the player across. On the last pass of each Charleston you may "blind pass": pass along tiles coming to you without looking. Use the Charleston to clear tiles that fit nothing. Jokers may never be passed.',
  },
  'defensive-discard': {
    title: 'Reading Exposures',
    body: 'An exposure tells you which lines on the card a player can still be making — exposures must match whole groups on one line. Late in the game, avoid discarding tiles those lines still need, even if it costs your own hand a little.',
  },
  'discard-no-fit': {
    title: 'Discard What Doesn\'t Fit',
    body: 'If a tile fits none of your top hands, let it go. Rank tiles by how much your plan needs them, not by how nice they look.',
  },
  'tile-fits': {
    title: 'This Tile Helps',
    body: 'Keep tiles your top hands use. A tile that fits more than one of them keeps more options open.',
  },
  'tile-marginal': {
    title: 'A Spare',
    body: 'It fits a hand, but you already hold enough of it. It\'s one of the better tiles to give up when you need room.',
  },
  'blank-trade': {
    title: 'Blank Tiles',
    body: 'Blanks never fit a hand. On your turn you can trade a blank for any tile in the discard pool.',
  },
  'cluster-rule': {
    title: 'Don\'t Telegraph Your Hand',
    body: 'In the Charleston, avoid passing groups that show what you are not collecting in ways that help others: same number in different suits, runs in one suit, all one suit, or all winds/dragons. If you must break a pair, send the two tiles to different players.',
  },
  'concealed-vs-exposed': {
    title: 'Concealed vs. Exposed',
    body: 'Lines marked C must be concealed: you can call a discard only for Mahjong. Lines marked X let you call discards for pungs, kongs and quints, which is faster but shows your plan.',
  },
  'dead-hand': {
    title: 'Dead Hand',
    body: 'A hand is dead when no line on the card can be completed — usually because an exposure doesn\'t fit any remaining line, or the tiles you need are all gone. A dead hand can\'t win, so play to stop others instead.',
  },
};

export type { CardPattern };
