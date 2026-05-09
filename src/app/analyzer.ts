// Pure-function strategy analyzer for American Mahjong (NMJL).
// No UI dependencies — designed to be unit-testable in isolation.
//
// Public entry: analyze(game, playerIndex) -> AnalysisResult.

import { Tile, Suit, Player, GameState } from './types';
import {
  ALL_NMJL_PATTERNS,
  NMJLConcretePattern,
  isJokerEligibleToken,
  nmjlTileKey,
  suitDragon,
  SUIT_PERMS,
} from './gameLogic';

// ════════════════════════════════════════════════════════════════════════
//   Block schema (derived at runtime from existing token strings)
// ════════════════════════════════════════════════════════════════════════

export type BlockType =
  | 'single' | 'pair' | 'pung' | 'kong' | 'quint' | 'sextet' | 'run';

export interface Block {
  id: string;
  type: BlockType;
  size: number;
  jokerable: boolean;
  rawText: string;     // e.g. "FFFF", "112345", "DDD", "NEWS", "2025"
  rawColor: string;    // 'g' | 'r' | 'b' | 'n'
}

export interface HandTemplate {
  id: string;
  index: number;       // index into ALL_NMJL_PATTERNS
  blocks: Block[];
  concealed: boolean;
  // For tagging into the article's heuristic sections:
  sectionTag: SectionTag;
  label: string;       // human-readable, e.g. "FFFF 2025 222 222"
}

export type SectionTag =
  | '2025' | '2468' | 'LikeNumbers' | 'Quints' | 'ConsecutiveRun'
  | '13579' | 'WindsDragons' | '369' | 'SinglesAndPairs' | 'Other';

// ════════════════════════════════════════════════════════════════════════
//   Token → Block adapter
// ════════════════════════════════════════════════════════════════════════

function isAllSame(s: string): boolean {
  if (s.length === 0) return false;
  for (let i = 1; i < s.length; i++) if (s[i] !== s[0]) return false;
  return true;
}

function tokenToBlock(text: string, color: string, idx: number): Block {
  const size = text.length;
  let type: BlockType;
  if (size === 1) type = 'single';
  else if (size === 2 && isAllSame(text)) type = 'pair';
  else if (size === 3 && isAllSame(text)) type = 'pung';
  else if (size === 4 && isAllSame(text)) type = 'kong';
  else if (size === 5 && isAllSame(text)) type = 'quint';
  else if (size === 6 && isAllSame(text)) type = 'sextet';
  else type = 'run';
  return {
    id: `b${idx}`,
    type, size,
    jokerable: isJokerEligibleToken(text),
    rawText: text,
    rawColor: color,
  };
}

function patternToTemplate(pat: NMJLConcretePattern, idx: number): HandTemplate {
  const blocks: Block[] = [];
  let bi = 0;
  for (const tok of pat.tokens) {
    if (tok.c === 'o') continue;
    blocks.push(tokenToBlock(tok.t, tok.c, bi++));
  }
  return {
    id: `h${idx}`,
    index: idx,
    blocks,
    concealed: pat.concealed,
    sectionTag: classifySection(pat),
    label: pat.tokens.filter(t => t.c !== 'o').map(t => t.t).join(' '),
  };
}

function classifySection(pat: NMJLConcretePattern): SectionTag {
  // Lightweight heuristic by content of the tokens.
  const all = pat.tokens.map(t => t.t).join(' ');
  if (all.includes('2025') || all.includes('0000') || all.includes('0:')) return '2025';
  if (/[NEWS]+/.test(all) && (all.includes('NEWS') || /[NEWS]{2,}/.test(all))) {
    if (/[1-9]/.test(all)) {
      // Could be either; weight winds/dragons heavier when winds dominate
      const windCount = (all.match(/[NEWS]/g) || []).length;
      const digitCount = (all.match(/[1-9]/g) || []).length;
      if (windCount >= digitCount) return 'WindsDragons';
    } else {
      return 'WindsDragons';
    }
  }
  if (pat.tokens.some(t => /^[1-9]+$/.test(t.t) && /1.*3.*5.*7.*9/.test(t.t))) return '13579';
  // Has 5-quints?
  if (pat.tokens.some(t => isAllSame(t.t) && t.t.length >= 5)) return 'Quints';
  // Singles/Pairs sections — patterns mostly composed of pairs and singles only
  const allBlocks = pat.tokens.filter(t => t.c !== 'o');
  const onlyPairsSingles = allBlocks.every(t => t.t.length <= 2 || /^[NEWS]+$/.test(t.t));
  if (onlyPairsSingles && pat.concealed) return 'SinglesAndPairs';
  // Like numbers — a single digit dominates
  const digitsOnly = pat.tokens.flatMap(t => t.t.match(/[1-9]/g) || []);
  if (digitsOnly.length >= 6 && new Set(digitsOnly).size === 1) return 'LikeNumbers';
  // 369
  if (digitsOnly.every(d => d === '3' || d === '6' || d === '9') && digitsOnly.length >= 4) return '369';
  // 2468
  if (digitsOnly.every(d => ['2','4','6','8'].includes(d)) && digitsOnly.length >= 4) return '2468';
  // Consecutive Run — runs present
  if (pat.tokens.some(t => !isAllSame(t.t) && /[1-9]/.test(t.t) && t.t.length >= 3)) return 'ConsecutiveRun';
  return 'Other';
}

let _templateCache: HandTemplate[] | null = null;
export function getHandTemplates(): HandTemplate[] {
  if (_templateCache) return _templateCache;
  _templateCache = ALL_NMJL_PATTERNS.map((pat, idx) => patternToTemplate(pat, idx));
  return _templateCache;
}

// ════════════════════════════════════════════════════════════════════════
//   Tile counts
// ════════════════════════════════════════════════════════════════════════

interface TileCounts {
  counts: Map<string, number>;
  jokers: number;
  totalNonJoker: number;
}

function buildCounts(tiles: Tile[]): TileCounts {
  const counts = new Map<string, number>();
  let jokers = 0;
  let totalNonJoker = 0;
  for (const t of tiles) {
    if (t.type === 'special' && t.specialType === 'joker') { jokers++; continue; }
    if (t.type === 'special' && t.specialType === 'blank') continue;
    const k = nmjlTileKey(t);
    counts.set(k, (counts.get(k) || 0) + 1);
    totalNonJoker++;
  }
  return { counts, jokers, totalNonJoker };
}

// ════════════════════════════════════════════════════════════════════════
//   Block → tile-needs resolution (for a chosen suit perm + dragon assignment)
// ════════════════════════════════════════════════════════════════════════

interface ResolvedBlock {
  blockId: string;
  size: number;
  jokerable: boolean;
  needs: Map<string, number>;   // tileKey -> count
  isPair: boolean;
}

function resolveBlock(
  block: Block,
  suitMap: Record<string, Suit>,
  neutralDragonChoice: string | null,
): ResolvedBlock | null {
  const text = block.rawText;
  const color = block.rawColor;
  const needs = new Map<string, number>();
  const isPair = block.type === 'pair';

  // Flowers
  if (/^F+$/.test(text)) {
    needs.set('flower', text.length);
    return { blockId: block.id, size: block.size, jokerable: block.jokerable, needs, isPair };
  }

  // Winds (literal letters)
  if (/^[NEWS]+$/.test(text)) {
    const wm: Record<string, string> = { N: 'north', E: 'east', W: 'west', S: 'south' };
    for (const ch of text) {
      const k = `w_${wm[ch]}`;
      needs.set(k, (needs.get(k) || 0) + 1);
    }
    return { blockId: block.id, size: block.size, jokerable: block.jokerable, needs, isPair };
  }

  // Dragons (D-tokens)
  if (/^D+$/.test(text)) {
    if (color === 'n') {
      if (!neutralDragonChoice) return null;
      needs.set(`d_${neutralDragonChoice}`, text.length);
    } else {
      const s = suitMap[color];
      if (!s) return null;
      needs.set(`d_${suitDragon(s)}`, text.length);
    }
    return { blockId: block.id, size: block.size, jokerable: block.jokerable, needs, isPair };
  }

  // Suited / digit-bearing tokens (including 0 = matching dragon)
  const suit = suitMap[color];
  if (!suit) return null;
  for (const ch of text) {
    const digit = parseInt(ch);
    if (Number.isNaN(digit)) continue;
    if (digit === 0) {
      const k = `d_${suitDragon(suit)}`;
      needs.set(k, (needs.get(k) || 0) + 1);
    } else if (digit >= 1 && digit <= 9) {
      const k = `s_${suit}_${digit}`;
      needs.set(k, (needs.get(k) || 0) + 1);
    }
  }
  return { blockId: block.id, size: block.size, jokerable: block.jokerable, needs, isPair };
}

interface ResolvedPattern {
  blocks: ResolvedBlock[];
  totalSize: number;
}

function resolvePattern(
  template: HandTemplate,
  suitMap: Record<string, Suit>,
  neutralDragonChoice: string | null,
): ResolvedPattern | null {
  const blocks: ResolvedBlock[] = [];
  let totalSize = 0;
  for (const block of template.blocks) {
    const r = resolveBlock(block, suitMap, neutralDragonChoice);
    if (!r) return null;
    blocks.push(r);
    totalSize += r.size;
  }
  return { blocks, totalSize };
}

// ════════════════════════════════════════════════════════════════════════
//   Per-template scoring
// ════════════════════════════════════════════════════════════════════════

export interface BlockFill {
  blockId: string;
  size: number;
  jokerable: boolean;
  isPair: boolean;
  tileKey: string | null;       // primary key (for runs, undefined → null)
  realFilled: number;
  jokersUsed: number;
  remaining: number;
}

export interface ScoreDetails {
  template: HandTemplate;
  blockFills: BlockFill[];
  realTilesUsed: number;
  jokersUsed: number;
  jokersAvailable: number;
  pairsNeeded: number;
  pairsHeld: number;
  gapTiles: { tileKey: string; need: number; visibleRemaining: number }[];
  feasibility: number;            // 0–100
  matchedTileKeys: Set<string>;   // which player-tile keys filled blocks
  pairKeys: Set<string>;          // tile keys held that are filling a pair-block in this score
  feasibleAtAll: boolean;         // false if a non-jokerable shortfall makes it impossible
}

// Score one resolved pattern against player's tile counts.
function scoreResolved(
  template: HandTemplate,
  resolved: ResolvedPattern,
  myCounts: TileCounts,
  visibleTileCounts: Map<string, number>, // copies still unseen
): ScoreDetails {
  const remaining = new Map(myCounts.counts);
  let jokersLeft = myCounts.jokers;
  let realUsed = 0;
  let jokersUsed = 0;
  let pairsNeeded = 0;
  let pairsHeld = 0;
  let nonJokerShortfall = 0;
  const blockFills: BlockFill[] = [];
  const gapTiles: { tileKey: string; need: number; visibleRemaining: number }[] = [];
  const matchedTileKeys = new Set<string>();
  const pairKeys = new Set<string>();

  // Process non-jokerable blocks first (greedy): pairs/singles/runs.
  // This matches the existing matchesPattern approach.
  const ordered = [...resolved.blocks].sort((a, b) => {
    if (a.jokerable === b.jokerable) return 0;
    return a.jokerable ? 1 : -1; // non-jokerable first
  });

  for (const rb of ordered) {
    let blockReal = 0;
    let blockJokers = 0;
    let blockUnmet = 0;
    // Identify primary key for the block (run/pair/etc. may have multiple keys)
    let primaryKey: string | null = null;
    let largestKeyCount = 0;
    for (const [k, n] of rb.needs) if (n > largestKeyCount) { largestKeyCount = n; primaryKey = k; }

    for (const [k, needed] of rb.needs) {
      const have = remaining.get(k) || 0;
      const used = Math.min(have, needed);
      remaining.set(k, have - used);
      blockReal += used;
      const short = needed - used;
      if (short > 0) {
        if (rb.jokerable) {
          const j = Math.min(jokersLeft, short);
          jokersLeft -= j;
          blockJokers += j;
          if (j < short) blockUnmet += short - j;
        } else {
          blockUnmet += short;
          nonJokerShortfall += short;
          gapTiles.push({
            tileKey: k,
            need: short,
            visibleRemaining: visibleTileCounts.get(k) ?? 0,
          });
        }
      }
      if (used > 0) matchedTileKeys.add(k);
    }

    if (rb.isPair) {
      if (blockReal === rb.size) { pairsHeld++; if (primaryKey) pairKeys.add(primaryKey); }
      else pairsNeeded++;
    }

    blockFills.push({
      blockId: rb.blockId,
      size: rb.size,
      jokerable: rb.jokerable,
      isPair: rb.isPair,
      tileKey: primaryKey,
      realFilled: blockReal,
      jokersUsed: blockJokers,
      remaining: blockUnmet,
    });

    realUsed += blockReal;
    jokersUsed += blockJokers;
  }

  const tilesPlaced = realUsed + jokersUsed;
  // Base feasibility: % of the 14 tiles we have a path to.
  let feasibility = (tilesPlaced / 14) * 100;
  // Hard penalty for non-jokerable shortfalls (impossible without external help).
  if (nonJokerShortfall > 0) feasibility -= nonJokerShortfall * 6;
  // Tiebreaker nudge: pairs-held credit (valuable to preserve)
  feasibility += pairsHeld * 0.5;
  if (feasibility < 0) feasibility = 0;
  if (feasibility > 100) feasibility = 100;

  return {
    template,
    blockFills,
    realTilesUsed: realUsed,
    jokersUsed,
    jokersAvailable: jokersLeft,
    pairsNeeded,
    pairsHeld,
    gapTiles,
    feasibility,
    matchedTileKeys,
    pairKeys,
    feasibleAtAll: nonJokerShortfall === 0 || nonJokerShortfall <= 2,
  };
}

function templateNeedsNeutralDragon(template: HandTemplate): boolean {
  return template.blocks.some(b => /^D+$/.test(b.rawText) && b.rawColor === 'n');
}

function scoreTemplateAgainstHand(
  template: HandTemplate,
  myCounts: TileCounts,
  hasExposures: boolean,
  visibleTileCounts: Map<string, number>,
): ScoreDetails {
  if (template.concealed && hasExposures) {
    // Concealed pattern is incompatible with exposures — feasibility 0.
    return makeZeroScore(template);
  }

  let best: ScoreDetails | null = null;
  const dragonOptions: (string | null)[] =
    templateNeedsNeutralDragon(template) ? ['red', 'green', 'soap'] : [null];

  for (const [g, r, b] of SUIT_PERMS) {
    const suitMap: Record<string, Suit> = { g, r, b };
    for (const dragon of dragonOptions) {
      const resolved = resolvePattern(template, suitMap, dragon);
      if (!resolved) continue;
      if (resolved.totalSize !== 14) continue;
      const score = scoreResolved(template, resolved, myCounts, visibleTileCounts);
      if (!best || score.feasibility > best.feasibility) best = score;
    }
  }

  return best ?? makeZeroScore(template);
}

function makeZeroScore(template: HandTemplate): ScoreDetails {
  return {
    template,
    blockFills: [],
    realTilesUsed: 0,
    jokersUsed: 0,
    jokersAvailable: 0,
    pairsNeeded: 0,
    pairsHeld: 0,
    gapTiles: [],
    feasibility: 0,
    matchedTileKeys: new Set(),
    pairKeys: new Set(),
    feasibleAtAll: false,
  };
}

// ════════════════════════════════════════════════════════════════════════
//   Visibility — count of each tile-key still UNSEEN by us
// ════════════════════════════════════════════════════════════════════════

const ALL_BASE_COPIES: { [k: string]: number } = (() => {
  const m: { [k: string]: number } = {};
  // Suited 1-9 × 3 suits × 4 copies each
  for (const s of ['bam', 'crak', 'dot']) for (let v = 1; v <= 9; v++) m[`s_${s}_${v}`] = 4;
  for (const w of ['north', 'east', 'south', 'west']) m[`w_${w}`] = 4;
  for (const d of ['red', 'green', 'soap']) m[`d_${d}`] = 4;
  m['flower'] = 8; // configurable; conservative default
  return m;
})();

function buildVisibilityMap(game: GameState, myIndex: number): Map<string, number> {
  // Start from full copies, subtract everything visible to us (our hand,
  // discard pool, all exposures including ours).
  const remaining = new Map<string, number>();
  for (const k of Object.keys(ALL_BASE_COPIES)) remaining.set(k, ALL_BASE_COPIES[k]);

  const dec = (k: string, n = 1) => {
    if (!remaining.has(k)) return;
    remaining.set(k, Math.max(0, (remaining.get(k) || 0) - n));
  };

  for (const t of game.discardPool) {
    if (t.type === 'special' && (t.specialType === 'joker' || t.specialType === 'blank')) continue;
    dec(nmjlTileKey(t));
  }
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    for (const grp of p.exposures) for (const t of grp) {
      if (t.type === 'special' && (t.specialType === 'joker' || t.specialType === 'blank')) continue;
      dec(nmjlTileKey(t));
    }
    if (i === myIndex) {
      for (const t of p.hand) {
        if (t.type === 'special' && (t.specialType === 'joker' || t.specialType === 'blank')) continue;
        dec(nmjlTileKey(t));
      }
    }
  }
  return remaining;
}

// ════════════════════════════════════════════════════════════════════════
//   Phase detector
// ════════════════════════════════════════════════════════════════════════

export type PhaseLabel = 'charleston' | 'early' | 'mid' | 'end';

export function detectPhase(game: GameState): PhaseLabel {
  if (game.phase === 'charleston') return 'charleston';
  const wallStart = game.config.totalTiles;
  const wallRemaining = game.wall.length;
  const wallFraction = wallRemaining / Math.max(1, wallStart);
  const totalDiscards = game.discardPool.length;
  const avgDiscardsPerPlayer = totalDiscards / Math.max(1, game.config.playerCount);
  const anyExposures = game.players.some(p => p.exposures.length > 0);
  const someoneClose = game.players.some(p => p.exposures.length >= 2);
  if (wallRemaining < 20 || someoneClose) return 'end';
  if (anyExposures || wallFraction < 0.5) return 'mid';
  if (avgDiscardsPerPlayer <= 5 && !anyExposures) return 'early';
  return 'mid';
}

// ════════════════════════════════════════════════════════════════════════
//   Scoring all templates + ranking top candidates
// ════════════════════════════════════════════════════════════════════════

export interface CandidateHand {
  handName: string;
  section: SectionTag;
  feasibility: number;         // rounded 0–100
  rawFeasibility: number;
  tilesYouHave: string[];      // user-friendly labels
  tilesYouNeed: string[];      // user-friendly labels
  pairsNeeded: number;
  pairsHeld: number;
  concealed: boolean;
  jokersUsable: number;        // jokers consumed by this hand's plan
  reasoning: string;
  template: HandTemplate;
  score: ScoreDetails;
  fading: boolean;             // a key tile heavily discarded / opponent racing
}

function rankCandidates(scores: ScoreDetails[]): ScoreDetails[] {
  const sorted = [...scores].sort((a, b) => {
    const df = b.feasibility - a.feasibility;
    if (Math.abs(df) > 10) return df;
    // Within ~10 feasibility points: tiebreakers
    if (a.pairsNeeded !== b.pairsNeeded) return a.pairsNeeded - b.pairsNeeded; // fewer pairs needed wins
    if (a.template.concealed !== b.template.concealed) return a.template.concealed ? 1 : -1; // non-concealed wins
    return (b.realTilesUsed + b.jokersUsed) - (a.realTilesUsed + a.jokersUsed);
  });
  return sorted;
}

function tileKeyToLabel(k: string): string {
  if (k === 'flower') return 'Flower';
  if (k.startsWith('s_')) {
    const [, suit, val] = k.split('_');
    const suitLabel = suit === 'bam' ? 'B' : suit === 'crak' ? 'C' : 'D';
    return `${val}${suitLabel}`;
  }
  if (k.startsWith('w_')) {
    const dir = k.slice(2);
    return dir.charAt(0).toUpperCase() + dir.slice(1) + ' Wind';
  }
  if (k.startsWith('d_')) {
    const c = k.slice(2);
    if (c === 'red') return 'Red Dragon';
    if (c === 'green') return 'Green Dragon';
    if (c === 'soap') return 'White Dragon';
  }
  return k;
}

// ════════════════════════════════════════════════════════════════════════
//   Per-tile advice (KEEP / DISCARD / PASS / WATCH)
// ════════════════════════════════════════════════════════════════════════

export type TileAction = 'KEEP' | 'DISCARD' | 'PASS' | 'WATCH';

export interface TileAdvice {
  tileId: string;
  tile: Tile;
  action: TileAction;
  reason: string;
  rationaleKey: string;        // for "Why?" glossary lookup
  contributesTo: number[];     // indices into topCandidates
  danger?: boolean;            // defensive flag (mid/end phase)
}

// "Leave-one-out" contribution: how much does the best feasibility drop if
// we remove one copy of this tile-key from the hand?
function contributionOfTileKey(
  tileKey: string,
  myCounts: TileCounts,
  topTemplates: HandTemplate[],
  hasExposures: boolean,
  visibleTileCounts: Map<string, number>,
  baselineByTemplate: Map<number, number>,
): number {
  // Reduce count of this key by one
  const reducedCounts: TileCounts = {
    counts: new Map(myCounts.counts),
    jokers: myCounts.jokers,
    totalNonJoker: myCounts.totalNonJoker - 1,
  };
  const have = reducedCounts.counts.get(tileKey) || 0;
  if (have > 0) reducedCounts.counts.set(tileKey, have - 1);

  let drop = 0;
  for (const tpl of topTemplates) {
    const before = baselineByTemplate.get(tpl.index) ?? 0;
    const after = scoreTemplateAgainstHand(tpl, reducedCounts, hasExposures, visibleTileCounts);
    drop += Math.max(0, before - after.feasibility);
  }
  return drop;
}

function contributionOfJoker(
  myCounts: TileCounts,
  topTemplates: HandTemplate[],
  hasExposures: boolean,
  visibleTileCounts: Map<string, number>,
  baselineByTemplate: Map<number, number>,
): number {
  const reducedCounts: TileCounts = {
    counts: new Map(myCounts.counts),
    jokers: Math.max(0, myCounts.jokers - 1),
    totalNonJoker: myCounts.totalNonJoker,
  };
  let drop = 0;
  for (const tpl of topTemplates) {
    const before = baselineByTemplate.get(tpl.index) ?? 0;
    const after = scoreTemplateAgainstHand(tpl, reducedCounts, hasExposures, visibleTileCounts);
    drop += Math.max(0, before - after.feasibility);
  }
  return drop;
}

// ════════════════════════════════════════════════════════════════════════
//   Charleston cluster rules — never pass these groupings
// ════════════════════════════════════════════════════════════════════════

export type CharlestonCluster =
  | 'sameNumberDifferentSuits'
  | 'consecutiveOrNear'
  | 'allOneSuit'
  | 'allWinds'
  | 'allDragons';

export function detectCharlestonClusters(tiles: Tile[]): {
  cluster: CharlestonCluster; tileIds: string[]
}[] {
  const out: { cluster: CharlestonCluster; tileIds: string[] }[] = [];
  if (tiles.length === 0) return out;

  // Same number across different suits
  const byValue = new Map<number, Tile[]>();
  for (const t of tiles) if (t.type === 'suited') {
    if (!byValue.has(t.value)) byValue.set(t.value, []);
    byValue.get(t.value)!.push(t);
  }
  for (const [, arr] of byValue) {
    const suits = new Set(arr.map(t => (t as any).suit));
    if (arr.length >= 3 && suits.size >= 2) {
      out.push({ cluster: 'sameNumberDifferentSuits', tileIds: arr.map(t => t.id) });
    }
  }

  // All one suit
  const suitCounts = new Map<string, Tile[]>();
  for (const t of tiles) if (t.type === 'suited') {
    const s = (t as any).suit;
    if (!suitCounts.has(s)) suitCounts.set(s, []);
    suitCounts.get(s)!.push(t);
  }
  for (const [, arr] of suitCounts) {
    if (arr.length >= Math.min(tiles.length, 3) && arr.length >= 3 && arr.length === tiles.filter(t => t.type === 'suited').length) {
      out.push({ cluster: 'allOneSuit', tileIds: arr.map(t => t.id) });
      break;
    }
  }

  // Consecutive or near-consecutive within a single suit
  for (const [, arr] of suitCounts) {
    if (arr.length < 3) continue;
    const values = [...new Set(arr.map((t: any) => t.value))].sort((a: number, b: number) => a - b) as number[];
    let runLen = 1, runStart = 0, bestRunLen = 1, bestRunStart = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] - values[i - 1] <= 2) {
        runLen++;
        if (runLen > bestRunLen) { bestRunLen = runLen; bestRunStart = runStart; }
      } else {
        runLen = 1; runStart = i;
      }
    }
    if (bestRunLen >= 3) {
      const runValues = values.slice(bestRunStart, bestRunStart + bestRunLen);
      const runIds = arr.filter((t: any) => runValues.includes(t.value)).map(t => t.id);
      out.push({ cluster: 'consecutiveOrNear', tileIds: runIds });
    }
  }

  // All winds
  const winds = tiles.filter(t => t.type === 'wind');
  if (winds.length >= 3) {
    const dirs = new Set(winds.map(t => (t as any).direction));
    if (dirs.size >= 2) out.push({ cluster: 'allWinds', tileIds: winds.map(t => t.id) });
  }

  // All dragons
  const dragons = tiles.filter(t => t.type === 'dragon');
  if (dragons.length >= 3) {
    const colors = new Set(dragons.map(t => (t as any).color));
    if (colors.size >= 2) out.push({ cluster: 'allDragons', tileIds: dragons.map(t => t.id) });
  }

  return out;
}

// ════════════════════════════════════════════════════════════════════════
//   Defensive discard — flag tiles that complete an opponent exposure
// ════════════════════════════════════════════════════════════════════════

interface OpponentExposureSignal {
  playerIndex: number;
  tileKey: string;
  reason: string;       // e.g. "completes their pung of 5C"
}

function detectOpponentDangerKeys(game: GameState, myIndex: number): Map<string, OpponentExposureSignal> {
  const danger = new Map<string, OpponentExposureSignal>();
  for (let i = 0; i < game.players.length; i++) {
    if (i === myIndex) continue;
    const p = game.players[i];
    for (const grp of p.exposures) {
      // For each exposure, compute the underlying tile-key and add it as danger
      const counts = new Map<string, number>();
      for (const t of grp) {
        if (t.type === 'special' && t.specialType === 'joker') continue;
        const k = nmjlTileKey(t);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      // Most-common key in the exposure is the target
      let topKey: string | null = null;
      let topCount = 0;
      for (const [k, c] of counts) if (c > topCount) { topKey = k; topCount = c; }
      if (topKey && topCount >= 1) {
        danger.set(topKey, {
          playerIndex: i,
          tileKey: topKey,
          reason: `${p.name} exposed ${topCount}× ${tileKeyToLabel(topKey)}`,
        });
      }
    }
  }
  return danger;
}

// ════════════════════════════════════════════════════════════════════════
//   Main entry: analyze()
// ════════════════════════════════════════════════════════════════════════

export interface AnalysisResult {
  phase: PhaseLabel;
  topCandidates: CandidateHand[];
  tileAdvice: TileAdvice[];
  teachingNote: string;
  warnings: string[];
}

export interface AnalyzeOptions {
  topN?: number;                 // default 3
  rack?: 1 | 2;                  // for Siamese; defaults to 1
  /** Override: in tests we may want to lock the phase. */
  forcePhase?: PhaseLabel;
}

export function analyze(
  game: GameState,
  playerIndex: number,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const player = game.players[playerIndex];
  const rack = options.rack ?? 1;
  const hand = rack === 2 ? player.hand2 : player.hand;
  const exposures = rack === 2 ? player.exposures2 : player.exposures;
  const hasExposures = exposures.length > 0;

  const myCounts = buildCounts(hand);
  const visibleTileCounts = buildVisibilityMap(game, playerIndex);

  const phase = options.forcePhase ?? detectPhase(game);
  const templates = getHandTemplates();

  // Score every template
  const allScores = templates.map(tpl =>
    scoreTemplateAgainstHand(tpl, myCounts, hasExposures, visibleTileCounts)
  );

  const ranked = rankCandidates(allScores);
  const topN = options.topN ?? 3;
  const top = ranked.slice(0, topN);

  // Build top-candidate baselines (template index -> feasibility)
  const baselineByTemplate = new Map<number, number>();
  for (const s of top) baselineByTemplate.set(s.template.index, s.feasibility);

  // Two-jokers heuristic: if 2+ jokers and no Quints in top 3, surface Quints
  const hasQuintsInTop = top.some(s => s.template.sectionTag === 'Quints');
  let quintPivot: ScoreDetails | null = null;
  if (myCounts.jokers >= 2 && !hasQuintsInTop) {
    const quintsScored = ranked.find(s => s.template.sectionTag === 'Quints');
    if (quintsScored && quintsScored.feasibility > 0) quintPivot = quintsScored;
  }

  // Build CandidateHand summaries
  const topCandidates: CandidateHand[] = top.map(s => buildCandidate(s, hand, visibleTileCounts, game, playerIndex));

  // ── Per-tile advice ────────────────────────────────────────────────
  const tileAdvice: TileAdvice[] = [];
  const dangerKeys = detectOpponentDangerKeys(game, playerIndex);

  // Cache contribution per unique tile-key
  const contributionCache = new Map<string, number>();
  const getContribution = (tile: Tile): number => {
    if (tile.type === 'special' && tile.specialType === 'joker') {
      if (contributionCache.has('__joker')) return contributionCache.get('__joker')!;
      const v = contributionOfJoker(myCounts, top.map(s => s.template), hasExposures, visibleTileCounts, baselineByTemplate);
      contributionCache.set('__joker', v);
      return v;
    }
    const k = nmjlTileKey(tile);
    if (contributionCache.has(k)) return contributionCache.get(k)!;
    const v = contributionOfTileKey(k, myCounts, top.map(s => s.template), hasExposures, visibleTileCounts, baselineByTemplate);
    contributionCache.set(k, v);
    return v;
  };

  for (const tile of hand) {
    const adv = adviseTile(
      tile, hand, top, phase, dangerKeys, visibleTileCounts, getContribution
    );
    tileAdvice.push(adv);
  }

  // ── Teaching note ──────────────────────────────────────────────────
  const teachingNote = composeTeachingNote(top, myCounts, phase, quintPivot, tileAdvice);

  // ── Warnings ───────────────────────────────────────────────────────
  const warnings = composeWarnings(top, visibleTileCounts, dangerKeys, phase, game, playerIndex);

  return { phase, topCandidates, tileAdvice, teachingNote, warnings };
}

function buildCandidate(
  s: ScoreDetails,
  hand: Tile[],
  visibleTileCounts: Map<string, number>,
  game: GameState,
  myIndex: number,
): CandidateHand {
  // tilesYouHave: matched real tile labels for this hand
  const have: string[] = [];
  const handCountsByKey = new Map<string, number>();
  for (const t of hand) {
    if (t.type === 'special' && t.specialType === 'joker') continue;
    if (t.type === 'special' && t.specialType === 'blank') continue;
    const k = nmjlTileKey(t);
    handCountsByKey.set(k, (handCountsByKey.get(k) || 0) + 1);
  }
  for (const k of s.matchedTileKeys) {
    const c = handCountsByKey.get(k) || 0;
    for (let i = 0; i < c; i++) have.push(tileKeyToLabel(k));
  }

  // tilesYouNeed: from blockFills, surface block gaps
  const needLabels: string[] = [];
  for (const bf of s.blockFills) {
    if (bf.remaining <= 0) continue;
    if (bf.jokerable && bf.tileKey) {
      needLabels.push(`${bf.remaining}× ${tileKeyToLabel(bf.tileKey)} (joker OK)`);
    } else if (bf.tileKey) {
      needLabels.push(`${bf.remaining}× ${tileKeyToLabel(bf.tileKey)}`);
    }
  }
  // Faded? a needed pair tile discarded twice OR opponent exposure shares this tile-key
  let fading = false;
  for (const bf of s.blockFills) {
    if (bf.isPair && bf.realFilled < bf.size && bf.tileKey) {
      const visible = visibleTileCounts.get(bf.tileKey) ?? 0;
      if (visible <= 1) { fading = true; break; }
    }
  }
  if (!fading) {
    // opponent exposed same key?
    const oppKeys = detectOpponentDangerKeys(game, myIndex);
    for (const bf of s.blockFills) {
      if (bf.tileKey && oppKeys.has(bf.tileKey)) { fading = true; break; }
    }
  }

  const reasoning = composeReasoning(s, fading);

  return {
    handName: s.template.label,
    section: s.template.sectionTag,
    feasibility: Math.round(s.feasibility),
    rawFeasibility: s.feasibility,
    tilesYouHave: have,
    tilesYouNeed: needLabels,
    pairsNeeded: s.pairsNeeded,
    pairsHeld: s.pairsHeld,
    concealed: s.template.concealed,
    jokersUsable: s.jokersUsed,
    reasoning,
    template: s.template,
    score: s,
    fading,
  };
}

function composeReasoning(s: ScoreDetails, fading: boolean): string {
  const parts: string[] = [];
  parts.push(`${s.realTilesUsed} of your tiles fit this pattern${s.jokersUsed > 0 ? ` (plus ${s.jokersUsed} joker${s.jokersUsed === 1 ? '' : 's'})` : ''}.`);
  if (s.pairsNeeded === 0 && s.pairsHeld > 0) {
    parts.push(`Your pair${s.pairsHeld === 1 ? '' : 's'} ${s.pairsHeld === 1 ? 'is' : 'are'} already in place — pairs can't be jokered, so that's a big head start.`);
  } else if (s.pairsNeeded > 0) {
    parts.push(`You still need ${s.pairsNeeded} pair${s.pairsNeeded === 1 ? '' : 's'} (pairs can't be jokered).`);
  }
  if (s.template.concealed) parts.push('Concealed — must complete from the wall, not from discards.');
  else parts.push('Exposable — you can call discards to complete it.');
  if (fading) parts.push('⚠ Fading — a key tile is heavily discarded or another player may be racing this.');
  return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════════════
//   Per-tile decision logic
// ════════════════════════════════════════════════════════════════════════

function adviseTile(
  tile: Tile,
  hand: Tile[],
  top: ScoreDetails[],
  phase: PhaseLabel,
  dangerKeys: Map<string, OpponentExposureSignal>,
  visibleTileCounts: Map<string, number>,
  getContribution: (t: Tile) => number,
): TileAdvice {
  // Joker: never discard.
  if (tile.type === 'special' && tile.specialType === 'joker') {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: "Never discard a Joker. Jokers are wildcards in pungs/kongs/quints — and you can sometimes redeem them later for the real tile.",
      rationaleKey: 'joker-never-discard',
      contributesTo: top.map((_, i) => i),
    };
  }

  // Blank: usually deadweight; advise DISCARD (or trade).
  if (tile.type === 'special' && tile.specialType === 'blank') {
    return {
      tileId: tile.id, tile, action: 'DISCARD',
      reason: "Blank tile — try the Blank Trade to swap it for any tile in the discard pool.",
      rationaleKey: 'blank-trade',
      contributesTo: [],
    };
  }

  const key = nmjlTileKey(tile);

  // Identify which top candidates this tile contributes to (matched by key).
  const contributesTo: number[] = [];
  for (let i = 0; i < top.length; i++) {
    if (top[i].matchedTileKeys.has(key)) contributesTo.push(i);
  }

  // Pair preservation: is this tile filling a pair-block in any top candidate?
  const filsPairInTop = top.some(s => s.pairKeys.has(key));
  if (filsPairInTop) {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: "Hold this pair — pairs are the hardest piece to build, and a Joker can't complete one.",
      rationaleKey: 'pair-preservation',
      contributesTo,
    };
  }

  // Flowers: KEEP by default.
  if (tile.type === 'special' && tile.specialType === 'flower') {
    if (contributesTo.length > 0) {
      return {
        tileId: tile.id, tile, action: 'KEEP',
        reason: 'Flowers feed several hands on the card. This one fits one of your top candidates — definitely hold.',
        rationaleKey: 'flowers',
        contributesTo,
      };
    }
    // No candidate uses flowers
    if (phase === 'charleston') {
      return {
        tileId: tile.id, tile, action: 'WATCH',
        reason: "None of your top hands need flowers right now, but flowers stay versatile. Don't pass away your only one too early.",
        rationaleKey: 'flowers',
        contributesTo: [],
      };
    }
    return {
      tileId: tile.id, tile, action: 'WATCH',
      reason: 'Flower not used by your current top hands. Hold for now in case you pivot.',
      rationaleKey: 'flowers',
      contributesTo: [],
    };
  }

  // White dragon (soap): versatile.
  if (tile.type === 'dragon' && tile.color === 'soap') {
    if (contributesTo.length > 0) {
      return {
        tileId: tile.id, tile, action: 'KEEP',
        reason: 'White Dragon is a flexible tile and fits one of your top candidates.',
        rationaleKey: 'white-dragon',
        contributesTo,
      };
    }
  }

  const danger = dangerKeys.get(key);
  const dangerFlag = danger !== undefined && (phase === 'mid' || phase === 'end');

  // Charleston phase: recommend PASS for tiles that fit no top candidate.
  if (phase === 'charleston') {
    if (contributesTo.length === 0) {
      return {
        tileId: tile.id, tile, action: 'PASS',
        reason: 'Doesn\'t fit any of your top hands. Charleston is the time to release tiles like this — opponents can\'t call them yet.',
        rationaleKey: 'charleston-aggressive',
        contributesTo: [],
      };
    }
    // Contributes — KEEP
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: 'Useful in your top candidates — keep through Charleston.',
      rationaleKey: 'tile-fits',
      contributesTo,
    };
  }

  // Otherwise (early/mid/end): tiles with no contribution → DISCARD.
  if (contributesTo.length === 0) {
    if (dangerFlag) {
      return {
        tileId: tile.id, tile, action: 'WATCH',
        reason: `${danger!.reason}. Discarding this could feed them — find a less risky tile if possible.`,
        rationaleKey: 'defensive-discard',
        contributesTo: [],
        danger: true,
      };
    }
    return {
      tileId: tile.id, tile, action: 'DISCARD',
      reason: phase === 'early'
        ? 'Doesn\'t fit any of your top candidate hands. Safe to release this early.'
        : 'No fit in your top candidates — releasing this opens room for tiles that do fit.',
      rationaleKey: 'discard-no-fit',
      contributesTo: [],
    };
  }

  // Contributes to candidates. Compute contribution magnitude.
  const contribution = getContribution(tile);
  if (contribution > 5) {
    return {
      tileId: tile.id, tile, action: 'KEEP',
      reason: `Important to your plan — fits ${contributesTo.length === 1 ? 'your top candidate' : `${contributesTo.length} of your top candidates`}.`,
      rationaleKey: 'tile-fits',
      contributesTo,
    };
  }
  // Low contribution — borderline.
  if (dangerFlag) {
    return {
      tileId: tile.id, tile, action: 'WATCH',
      reason: `${danger!.reason}. This tile only modestly helps your plan, but discarding it would risk feeding their exposure.`,
      rationaleKey: 'defensive-discard',
      contributesTo,
      danger: true,
    };
  }
  return {
    tileId: tile.id, tile, action: 'WATCH',
    reason: 'Modest fit — could help, but not central to your plan. Watch how the next few turns evolve.',
    rationaleKey: 'tile-marginal',
    contributesTo,
  };
}

// ════════════════════════════════════════════════════════════════════════
//   Teaching note + warnings
// ════════════════════════════════════════════════════════════════════════

function composeTeachingNote(
  top: ScoreDetails[],
  myCounts: TileCounts,
  phase: PhaseLabel,
  quintPivot: ScoreDetails | null,
  tileAdvice: TileAdvice[],
): string {
  if (top.length === 0) return 'No clear candidate hands yet — keep your options open and discard tiles that fit no section.';

  const noFitCount = tileAdvice.filter(a => a.contributesTo.length === 0 &&
    !(a.tile.type === 'special' && a.tile.specialType === 'joker')).length;

  if (phase === 'charleston' && noFitCount >= 3) {
    return `You have ${noFitCount} tiles that fit none of your top candidates. Pass these and decide your hand later — don't lock in too early.`;
  }

  if (myCounts.jokers >= 2 && quintPivot) {
    return `You have ${myCounts.jokers} Jokers — a Quints hand becomes a strong pivot. Consider \"${quintPivot.template.label}\".`;
  }

  const bestFew = top.slice(0, 2);
  if (bestFew.length === 2 && Math.abs(bestFew[0].feasibility - bestFew[1].feasibility) < 10) {
    const a = bestFew[0], b = bestFew[1];
    return `Two paths are close in strength. Hand A (\"${a.template.label}\") needs ${a.pairsNeeded} pair${a.pairsNeeded === 1 ? '' : 's'} and is ${a.template.concealed ? 'concealed' : 'exposable'}. Hand B (\"${b.template.label}\") needs ${b.pairsNeeded}. Decide based on which gap tiles still look obtainable.`;
  }

  const lead = top[0];
  if (lead.pairsHeld > 0 && lead.pairsNeeded === 0) {
    return `Your pair${lead.pairsHeld === 1 ? '' : 's'} for "${lead.template.label}" ${lead.pairsHeld === 1 ? 'is' : 'are'} already in place. Pairs can't be jokered — protect them.`;
  }
  return `Your strongest target is "${lead.template.label}". Focus your discards on tiles that don't help this hand.`;
}

function composeWarnings(
  top: ScoreDetails[],
  visibleTileCounts: Map<string, number>,
  dangerKeys: Map<string, OpponentExposureSignal>,
  phase: PhaseLabel,
  game: GameState,
  myIndex: number,
): string[] {
  const warnings: string[] = [];

  // Heavily discarded gap tiles for top candidate
  if (top.length > 0) {
    const lead = top[0];
    for (const bf of lead.blockFills) {
      if (bf.remaining > 0 && bf.tileKey) {
        const visible = visibleTileCounts.get(bf.tileKey) ?? 0;
        const totalCopies = ['flower'].includes(bf.tileKey) ? 8 : 4;
        const used = totalCopies - visible;
        if (used >= 2 && bf.remaining > 0) {
          warnings.push(`${used} of the ${tileKeyToLabel(bf.tileKey)} you'd need have already been discarded or exposed. Watch for the rest.`);
        }
      }
    }
  }

  // Opponents getting close
  for (let i = 0; i < game.players.length; i++) {
    if (i === myIndex) continue;
    const p = game.players[i];
    if (p.exposures.length >= 2) {
      warnings.push(`${p.name} has ${p.exposures.length} exposures — they're well underway. Consider defensive discards.`);
    }
  }

  // Late phase
  if (phase === 'end' && warnings.length === 0) {
    warnings.push('Late game — every discard matters. Check each tile against opponents\' exposures before releasing it.');
  }

  return warnings;
}

// ════════════════════════════════════════════════════════════════════════
//   Glossary — referenced by `rationaleKey` in TileAdvice
// ════════════════════════════════════════════════════════════════════════

export const GLOSSARY: Record<string, { title: string; body: string }> = {
  'pair-preservation': {
    title: 'Pair Preservation',
    body: "Pairs are exactly two identical tiles. Unlike pungs and kongs, pairs cannot be filled with a Joker. That makes the matching second tile the hardest single piece to obtain — protect any pair you already have.",
  },
  'joker-never-discard': {
    title: 'Joker — Never Discard',
    body: "Jokers are universal wildcards, but only inside groups of 3+ identical tiles (pungs, kongs, quints, sextets). They can never fill a pair or a single. If you don't have a use today, you may have one tomorrow — and you can sometimes 'redeem' a Joker on another player's exposure by trading the matching real tile.",
  },
  'flowers': {
    title: 'Flowers',
    body: "Many NMJL hands include a Flower group. Holding at least one or two Flowers gives you flexibility across multiple sections. Don't pass your last Flower in Charleston unless you're confident none of your candidate hands need them.",
  },
  'white-dragon': {
    title: 'White Dragon',
    body: "On most NMJL cards, the White Dragon (soap) doubles as the digit 0 in the year-hand and as the Dragon for the dot suit. That dual role makes it one of the most flexible tiles in the wall.",
  },
  'charleston-aggressive': {
    title: 'Charleston — Be Aggressive',
    body: "Discards during Charleston cannot be claimed by opponents, so this is the safest time to release tiles that don't fit your plan. Use it to clear deadweight and give yourself room to draw what you need.",
  },
  'defensive-discard': {
    title: 'Defensive Discarding',
    body: "Late in the game, every discard is a potential gift to an opponent. Look at each opponent's exposed groups, infer what they likely still need, and avoid discarding tiles that would complete those groups — even if it means weakening your own hand slightly.",
  },
  'discard-no-fit': {
    title: 'Discard What Doesn\'t Fit',
    body: "If a tile fits none of your top candidate hands, it's deadweight. Releasing it makes room in your rack for tiles that do fit. Always rank tiles by their contribution to your plan, not their face value.",
  },
  'tile-fits': {
    title: 'This Tile Helps',
    body: "Keep tiles that contribute to one or more of your top candidates. The more candidates a tile feeds, the more flexibility you preserve.",
  },
  'tile-marginal': {
    title: 'Marginal — Watch',
    body: "This tile makes a small contribution. Hold for now, but it's a candidate to release if you draw something better or need to make room.",
  },
  'blank-trade': {
    title: 'Blank Tile',
    body: "Some game configurations include Blank tiles. They're not useful on their own — use the Blank Trade action to swap a blank for any tile in the discard pool.",
  },
  'cluster-rule': {
    title: 'Charleston Cluster Rules',
    body: "During Charleston, never pass away groupings that signal a hand: same number across different suits (Like Numbers), consecutive numbers in a suit (Consecutive Run), all-one-suit, all-winds, or all-dragons. If you must pass a pair, split it across two recipients so neither opponent gets a free joker-bait.",
  },
  'concealed-vs-exposed': {
    title: 'Concealed vs. Exposed',
    body: "Concealed hands must be completed entirely from the wall — you can't call a discard for them. Exposed hands let you claim tiles others throw away, which is usually faster but reveals your plan.",
  },
};
