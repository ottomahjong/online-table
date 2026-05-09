import { describe, it, expect } from 'vitest';
import {
  analyze,
  detectPhase,
  detectCharlestonClusters,
  getHandTemplates,
  type AnalysisResult,
} from './analyzer';
import type {
  Tile, Suit, WindDirection, DragonColor, Player, GameState, GameConfig,
} from './types';

// ════════════════════════════════════════════════════════════════════════
//   Test fixtures — minimal helpers to build tiles + game states
// ════════════════════════════════════════════════════════════════════════

let _id = 0;
function nid() { return `t${_id++}`; }
function suited(suit: Suit, value: number): Tile {
  return { type: 'suited', suit, value, id: nid() };
}
function joker(): Tile {
  return { type: 'special', specialType: 'joker', number: 1, id: nid() };
}
function flower(): Tile {
  return { type: 'special', specialType: 'flower', number: 1, id: nid() };
}
function dragon(color: DragonColor): Tile {
  return { type: 'dragon', color, id: nid() };
}
function wind(direction: WindDirection): Tile {
  return { type: 'wind', direction, id: nid() };
}

const DEFAULT_CONFIG: GameConfig = {
  playerCount: 4,
  jokerCount: 8,
  flowerCount: 8,
  totalTiles: 152,
  botSkillLevel: 3,
  tipsEnabled: false,
};

function makePlayer(overrides: Partial<Player> & { id: number; name: string; seatWind: WindDirection }): Player {
  return {
    id: overrides.id,
    name: overrides.name,
    seatWind: overrides.seatWind,
    isHuman: overrides.isHuman ?? overrides.id === 0,
    hand: overrides.hand ?? [],
    hand2: overrides.hand2 ?? [],
    exposures: overrides.exposures ?? [],
    exposures2: overrides.exposures2 ?? [],
  };
}

function makeGame(opts: {
  hand?: Tile[];
  exposures?: Tile[][];
  discardPool?: Tile[];
  opponents?: Partial<Player>[];
  phase?: GameState['phase'];
  wallSize?: number;
  config?: Partial<GameConfig>;
}): GameState {
  const config = { ...DEFAULT_CONFIG, ...(opts.config || {}) };
  const seatWinds: WindDirection[] = ['east', 'south', 'west', 'north'];
  const players: Player[] = [];
  players.push(makePlayer({
    id: 0, name: 'You', seatWind: 'east',
    hand: opts.hand ?? [], exposures: opts.exposures ?? [],
  }));
  for (let i = 1; i < config.playerCount; i++) {
    const o = (opts.opponents || [])[i - 1] || {};
    players.push(makePlayer({
      id: i, name: o.name ?? `P${i + 1}`, seatWind: seatWinds[i],
      hand: o.hand ?? [], exposures: o.exposures ?? [],
    }));
  }
  return {
    config,
    players,
    wall: new Array(opts.wallSize ?? 80).fill(null) as any[],
    discardPool: opts.discardPool ?? [],
    currentPlayerIndex: 0,
    phase: opts.phase ?? 'playing',
    turnPhase: 'discarding',
    lastDiscarded: null,
    lastDiscardedBy: null,
    message: '',
    winner: null,
    selectedTileIndex: null,
    activeRack: 1,
  };
}

// Find advice for a specific tile id
function adviceFor(result: AnalysisResult, id: string) {
  return result.tileAdvice.find(a => a.tileId === id);
}

// ════════════════════════════════════════════════════════════════════════
//   Adapter / template tests
// ════════════════════════════════════════════════════════════════════════

describe('Card adapter', () => {
  it('produces a non-empty list of templates from the existing pattern data', () => {
    const tpls = getHandTemplates();
    expect(tpls.length).toBeGreaterThan(50);
  });

  it('classifies blocks correctly: pairs and singles are not jokerable', () => {
    const tpls = getHandTemplates();
    for (const tpl of tpls) {
      for (const block of tpl.blocks) {
        if (block.type === 'pair') expect(block.jokerable).toBe(false);
        if (block.type === 'single') expect(block.jokerable).toBe(false);
        if (block.type === 'pung') expect(block.jokerable).toBe(true);
        if (block.type === 'kong') expect(block.jokerable).toBe(true);
        if (block.type === 'quint') expect(block.jokerable).toBe(true);
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Phase detection tests
// ════════════════════════════════════════════════════════════════════════

describe('Phase detection', () => {
  it('returns "charleston" when game.phase is charleston', () => {
    const g = makeGame({ phase: 'charleston' });
    expect(detectPhase(g)).toBe('charleston');
  });

  it('returns "early" when no exposures and few discards', () => {
    const g = makeGame({ wallSize: 100, discardPool: [suited('bam', 3), suited('crak', 2)] });
    expect(detectPhase(g)).toBe('early');
  });

  it('returns "mid" when an opponent has exposures', () => {
    const g = makeGame({
      wallSize: 100,
      opponents: [{ exposures: [[suited('bam', 5), suited('bam', 5), suited('bam', 5)]] }],
    });
    expect(detectPhase(g)).toBe('mid');
  });

  it('returns "end" when wall is < 20 tiles', () => {
    const g = makeGame({ wallSize: 15 });
    expect(detectPhase(g)).toBe('end');
  });

  it('returns "end" when any opponent has 2+ exposures', () => {
    const g = makeGame({
      wallSize: 60,
      opponents: [{ exposures: [
        [suited('bam', 5), suited('bam', 5), suited('bam', 5)],
        [suited('crak', 6), suited('crak', 6), suited('crak', 6)],
      ] }],
    });
    expect(detectPhase(g)).toBe('end');
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Pair preservation
// ════════════════════════════════════════════════════════════════════════

describe('Pair preservation', () => {
  it('never recommends discarding a pair when the pair fits a top candidate', () => {
    // Build a hand strongly fitting Consecutive Run with a held pair.
    // Pattern target: 11:b 222:b 3333:b 444:b 55:b (a 1-suit 5-consecutive run)
    // The 3-bam pair (and other pairs) shouldn't be discarded.
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1),
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 3), suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('bam', 4), suited('bam', 4), suited('bam', 4),
      suited('bam', 5),
    ];
    const result = analyze(makeGame({ hand }), 0);
    // The pair tiles in the hand should never be recommended DISCARD if they
    // contribute to a top candidate.
    const pair1Tiles = hand.filter(t => t.type === 'suited' && t.suit === 'bam' && t.value === 1);
    for (const t of pair1Tiles) {
      const adv = adviceFor(result, t.id);
      expect(adv).toBeDefined();
      expect(adv!.action).not.toBe('DISCARD');
      expect(adv!.action).not.toBe('PASS');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Joker math
// ════════════════════════════════════════════════════════════════════════

describe('Joker math', () => {
  it('jokers are never marked DISCARD/PASS', () => {
    const hand: Tile[] = [
      joker(), joker(),
      suited('bam', 2), suited('bam', 2),
      suited('crak', 4), suited('crak', 4), suited('crak', 4),
      suited('dot', 6), suited('dot', 6), suited('dot', 6), suited('dot', 6),
      suited('bam', 8), suited('bam', 8), suited('bam', 8),
    ];
    const result = analyze(makeGame({ hand }), 0);
    const jokerAdv = result.tileAdvice.filter(a => a.tile.type === 'special' && a.tile.specialType === 'joker');
    expect(jokerAdv).toHaveLength(2);
    for (const a of jokerAdv) {
      expect(a.action).toBe('KEEP');
    }
  });

  it('two-jokers heuristic surfaces Quints as a pivot in the teaching note', () => {
    // Hand mostly composed of 5-consecutive-run material BUT with 2 jokers and
    // a quint-friendly cluster (5 of a kind possible with jokers).
    const hand: Tile[] = [
      joker(), joker(),
      suited('bam', 1), suited('bam', 1), suited('bam', 1),
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 3), suited('bam', 3),
      suited('crak', 1), suited('crak', 1), suited('crak', 1),
      flower(),
    ];
    const result = analyze(makeGame({ hand }), 0);
    const note = result.teachingNote.toLowerCase();
    // With 2 jokers, we expect Quints to be in either the top candidates OR
    // the teaching note suggests a Quints pivot.
    const quintsInTop = result.topCandidates.some(c => c.section === 'Quints');
    const quintsInNote = note.includes('quint');
    expect(quintsInTop || quintsInNote).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Charleston cluster rules
// ════════════════════════════════════════════════════════════════════════

describe('Charleston cluster rules', () => {
  it('detects same-number-different-suits cluster', () => {
    const tiles: Tile[] = [
      suited('bam', 5), suited('crak', 5), suited('dot', 5),
      suited('bam', 1), suited('bam', 9),
    ];
    const clusters = detectCharlestonClusters(tiles);
    expect(clusters.some(c => c.cluster === 'sameNumberDifferentSuits')).toBe(true);
  });

  it('detects all-one-suit cluster', () => {
    const tiles: Tile[] = [
      suited('bam', 1), suited('bam', 3), suited('bam', 5), suited('bam', 7),
    ];
    const clusters = detectCharlestonClusters(tiles);
    expect(clusters.some(c => c.cluster === 'allOneSuit')).toBe(true);
  });

  it('detects consecutive-or-near cluster', () => {
    const tiles: Tile[] = [
      suited('crak', 3), suited('crak', 4), suited('crak', 5),
      suited('bam', 9),
    ];
    const clusters = detectCharlestonClusters(tiles);
    expect(clusters.some(c => c.cluster === 'consecutiveOrNear')).toBe(true);
  });

  it('detects all-winds cluster', () => {
    const tiles: Tile[] = [
      wind('north'), wind('east'), wind('west'),
    ];
    const clusters = detectCharlestonClusters(tiles);
    expect(clusters.some(c => c.cluster === 'allWinds')).toBe(true);
  });

  it('detects all-dragons cluster', () => {
    const tiles: Tile[] = [
      dragon('red'), dragon('green'), dragon('soap'),
    ];
    const clusters = detectCharlestonClusters(tiles);
    expect(clusters.some(c => c.cluster === 'allDragons')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Phase-aware advice
// ════════════════════════════════════════════════════════════════════════

describe('Phase-aware advice', () => {
  it('Charleston: tiles that fit no candidate get PASS, not DISCARD', () => {
    // Hand with one obvious "doesn't fit anything" tile in a Charleston phase.
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1),
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 3), suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('bam', 4), suited('bam', 4), suited('bam', 4),
      suited('bam', 5),
    ];
    // Charleston phase
    const result = analyze(makeGame({ hand, phase: 'charleston' }), 0, { forcePhase: 'charleston' });
    // No tile should be marked DISCARD in Charleston
    for (const a of result.tileAdvice) {
      expect(a.action).not.toBe('DISCARD');
    }
  });

  it('Mid game: defensive flag on tile that completes an opponent exposure', () => {
    // Opponent exposed three 5-Crak. If we hold a 5-Crak, it should be flagged.
    const hand: Tile[] = [
      suited('crak', 5),                         // dangerous to discard
      suited('bam', 1), suited('bam', 2), suited('bam', 3),
      suited('dot', 7), suited('dot', 8), suited('dot', 9),
      suited('crak', 1), suited('crak', 2), suited('crak', 3),
      flower(), flower(),
      suited('bam', 9), suited('bam', 9),
    ];
    const result = analyze(makeGame({
      hand,
      wallSize: 50,
      opponents: [{
        exposures: [[suited('crak', 5), suited('crak', 5), suited('crak', 5)]],
      }],
    }), 0);
    expect(result.phase === 'mid' || result.phase === 'end').toBe(true);
    // 5-Crak in our hand should not be marked DISCARD; should be WATCH (danger)
    const crak5 = hand.find(t => t.type === 'suited' && t.suit === 'crak' && t.value === 5)!;
    const adv = adviceFor(result, crak5.id);
    expect(adv!.action).not.toBe('DISCARD');
    // either WATCH+danger or KEEP (if it contributes), but not DISCARD
    if (adv!.action === 'WATCH') expect(adv!.danger).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
//   Top candidates
// ════════════════════════════════════════════════════════════════════════

describe('Top candidates', () => {
  it('returns up to 3 candidates by default', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 2), suited('bam', 3),
      suited('crak', 1), suited('crak', 2), suited('crak', 3),
      suited('dot', 1), suited('dot', 2), suited('dot', 3),
      flower(), flower(),
      suited('bam', 5), suited('bam', 5), suited('bam', 5),
    ];
    const result = analyze(makeGame({ hand }), 0);
    expect(result.topCandidates.length).toBeGreaterThan(0);
    expect(result.topCandidates.length).toBeLessThanOrEqual(3);
  });

  it('topN option respected', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1),
      suited('crak', 1), suited('crak', 1),
      suited('dot', 1), suited('dot', 1),
      flower(), flower(),
      dragon('red'), dragon('green'),
      wind('north'), wind('east'), wind('west'), wind('south'),
    ];
    const result = analyze(makeGame({ hand }), 0, { topN: 5 });
    expect(result.topCandidates.length).toBeLessThanOrEqual(5);
  });

  it('feasibility values are in [0, 100]', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1),
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 3), suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('bam', 4), suited('bam', 4), suited('bam', 4),
      suited('bam', 5),
    ];
    const result = analyze(makeGame({ hand }), 0);
    for (const c of result.topCandidates) {
      expect(c.feasibility).toBeGreaterThanOrEqual(0);
      expect(c.feasibility).toBeLessThanOrEqual(100);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
//   General invariants
// ════════════════════════════════════════════════════════════════════════

describe('Invariants', () => {
  it('never returns advice for tiles not in the hand', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 2), suited('bam', 3),
      flower(), joker(),
    ];
    const result = analyze(makeGame({ hand }), 0);
    const handIds = new Set(hand.map(t => t.id));
    for (const a of result.tileAdvice) expect(handIds.has(a.tileId)).toBe(true);
  });

  it('produces a non-empty teachingNote', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 2), suited('bam', 3), suited('bam', 4), suited('bam', 5),
      suited('crak', 1), suited('crak', 2), suited('crak', 3),
      suited('dot', 7), suited('dot', 8), suited('dot', 9),
      flower(), joker(), wind('east'),
    ];
    const result = analyze(makeGame({ hand }), 0);
    expect(result.teachingNote.length).toBeGreaterThan(10);
  });
});
