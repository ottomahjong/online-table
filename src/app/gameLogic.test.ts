/**
 * Tests for NMJL hand-validation logic in gameLogic.ts
 *
 * Coverage:
 *  - Consecutive Run line 7 (CR/7): flexible pair position, multi-suit kongs
 *  - 2025 card clarifications for other hands
 */

import { describe, it, expect } from 'vitest';
import { canClaimMahJonggOnDiscard, checkSimpleWin, claimMahJonggOnDiscard, getCallOptions } from './gameLogic';
import type { GameState, Player, Tile, Suit } from './types';

// ---------------------------------------------------------------------------
// Tile-builder helpers
// ---------------------------------------------------------------------------

let _id = 0;
function uid() { return `t${++_id}`; }

function suited(suit: Suit, value: number): Tile {
  return { type: 'suited', suit, value, id: uid() };
}
function joker(): Tile {
  return { type: 'special', specialType: 'joker', number: 0, id: uid() };
}
function flower(): Tile {
  return { type: 'special', specialType: 'flower', number: 1, id: uid() };
}
function dragon(color: 'red' | 'green' | 'soap'): Tile {
  return { type: 'dragon', color, id: uid() };
}
function wind(direction: 'north' | 'east' | 'west' | 'south'): Tile {
  return { type: 'wind', direction, id: uid() };
}

/**
 * Build a Player stub with hand + exposures and no second rack.
 * hand + exposures must total exactly 14 tiles.
 */
function makePlayer(hand: Tile[], exposures: Tile[][] = []): Player {
  return {
    id: 0,
    name: 'test',
    isHuman: true,
    seatWind: 'east',
    hand,
    exposures,
    hand2: [],
    exposures2: [],
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    config: {
      playerCount: 4,
      jokerCount: 8,
      flowerCount: 8,
      totalTiles: 152,
      botSkillLevel: 3,
      tipsEnabled: true,
    },
    players: [
      makePlayer([]),
      { ...makePlayer([]), id: 1, name: 'Player 2', isHuman: false, seatWind: 'south' },
      { ...makePlayer([]), id: 2, name: 'Player 3', isHuman: false, seatWind: 'west' },
      { ...makePlayer([]), id: 3, name: 'Player 4', isHuman: false, seatWind: 'north' },
    ],
    wall: [],
    discardPool: [],
    currentPlayerIndex: 1,
    phase: 'playing',
    turnPhase: 'calling',
    lastDiscarded: null,
    lastDiscardedBy: 1,
    message: '',
    winner: null,
    selectedTileIndex: null,
    activeRack: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Consecutive Run — Line 7 (CR/7)
// Pattern: 112345 1111 1111
// "Any 5 Consec. Nos, Pair Any Nos, In Pung, Kongs Match Pair"
// 2025 clarification: pair may be at ANY position in the run.
//   kongs must match the paired number but can be in any suits.
// ---------------------------------------------------------------------------
describe('Consecutive Run line 7 (CR/7)', () => {

  // ── A: Primary bug case ─────────────────────────────────────────────────
  it('A – valid: pair at END of run (5 6 7 8 9 9), two 9999 kongs in other suits', () => {
    // Run 5-6-7-8-9-9 in dot; kongs in bam and crak
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9), suited('dot', 9),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 9), suited('bam', 9), suited('bam', 9), suited('bam', 9)],
      [suited('crak', 9), suited('crak', 9), suited('crak', 9), suited('crak', 9)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(true);
  });

  it('A – valid: same hand fully in hand (no exposures)', () => {
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9), suited('dot', 9),
      suited('bam', 9), suited('bam', 9), suited('bam', 9), suited('bam', 9),
      suited('crak', 9), suited('crak', 9), suited('crak', 9), suited('crak', 9),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('A – valid: one joker in a kong', () => {
    // dot run 5-6-7-8-9-9, bam kong 9999 (one joker), crak kong 9999
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9), suited('dot', 9),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 9), suited('bam', 9), suited('bam', 9), joker()],
      [suited('crak', 9), suited('crak', 9), suited('crak', 9), suited('crak', 9)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(true);
  });

  // ── B: Pair at different positions within the run ────────────────────────
  it('B – valid: pair at position 0 — 1,1,2,3,4,5 + two 1111 kongs (1-suit)', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1), suited('bam', 2),
      suited('bam', 3), suited('bam', 4), suited('bam', 5),
      suited('bam', 1), suited('bam', 1), suited('bam', 1), suited('bam', 1),
      suited('bam', 1), suited('bam', 1), suited('bam', 1), suited('bam', 1),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('B – valid: pair at position 1 — 1,2,2,3,4,5 + two 2222 kongs (3-suit)', () => {
    const hand: Tile[] = [
      suited('dot', 1), suited('dot', 2), suited('dot', 2),
      suited('dot', 3), suited('dot', 4), suited('dot', 5),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 2), suited('bam', 2), suited('bam', 2), suited('bam', 2)],
      [suited('crak', 2), suited('crak', 2), suited('crak', 2), suited('crak', 2)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(true);
  });

  it('B – valid: pair in middle — 3,4,5,5,6,7 + two 5555 kongs (3-suit)', () => {
    const hand: Tile[] = [
      suited('dot', 3), suited('dot', 4), suited('dot', 5),
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 5), suited('bam', 5), suited('bam', 5), suited('bam', 5)],
      [suited('crak', 5), suited('crak', 5), suited('crak', 5), suited('crak', 5)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(true);
  });

  it('B – valid: classic shifted case — 3,4,5,5,6,7 from base 1-suit single run', () => {
    // 3,3,4,5,6,7 pair at pos 0 in 3-4-5-6-7, all bam
    const hand: Tile[] = [
      suited('bam', 3), suited('bam', 3), suited('bam', 4),
      suited('bam', 5), suited('bam', 6), suited('bam', 7),
      suited('bam', 3), suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('bam', 3), suited('bam', 3), suited('bam', 3), suited('bam', 3),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  // ── C: Negative — kongs don't match paired number ─────────────────────
  it('C – invalid: run 5,6,7,8,9,9 but kongs are 8888 (wrong number)', () => {
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9), suited('dot', 9),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 8), suited('bam', 8), suited('bam', 8), suited('bam', 8)],
      [suited('crak', 8), suited('crak', 8), suited('crak', 8), suited('crak', 8)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(false);
  });

  it('C – invalid: run has no duplicate (5 6 7 8 9) + 9999 + 9999 = only 13 tiles', () => {
    // Actually 5 unique + 4 + 4 = 13 — not 14, so validation rejects it outright
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9),
    ];
    const exposures: Tile[][] = [
      [suited('bam', 9), suited('bam', 9), suited('bam', 9), suited('bam', 9)],
      [suited('crak', 9), suited('crak', 9), suited('crak', 9), suited('crak', 9)],
    ];
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(false);
  });

  // ── D: Joker in a pair position must be rejected ──────────────────────
  it('D – invalid: joker substituting the second tile of the pair in the run', () => {
    // Pattern 567899 requires both 9s to be real tiles (pair is not joker-eligible).
    // Replace one 9 in the run with a joker → should fail because the run group
    // (567899) is not joker-eligible and cannot be satisfied.
    const hand: Tile[] = [
      suited('dot', 5), suited('dot', 6), suited('dot', 7),
      suited('dot', 8), suited('dot', 9), joker(),          // joker in place of dot-9
    ];
    const exposures: Tile[][] = [
      [suited('bam', 9), suited('bam', 9), suited('bam', 9), suited('bam', 9)],
      [suited('crak', 9), suited('crak', 9), suited('crak', 9), suited('crak', 9)],
    ];
    // The 14-tile sum is met, but the run group needs two real dot-9 tiles.
    expect(checkSimpleWin(makePlayer(hand, exposures))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2025 card clarifications — other hands
// ---------------------------------------------------------------------------

describe('2025 card clarifications', () => {

  // ── E1: 2025 line 1 — two pungs must both be 2s OR both be 5s (not mixed) ──
  it('E1 – valid: FFFF 2025:g + pung 222:r + pung 222:b', () => {
    // FFFF:n 2025:g 222:r 222:b
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), suited('bam', 0 as never), suited('bam', 2), suited('bam', 5), // 2025 run in bam
      suited('crak', 2), suited('crak', 2), suited('crak', 2),
      suited('dot', 2), suited('dot', 2), suited('dot', 2),
    ];
    // The "0" in 2025 is soap dragon; build correctly:
    const hand2: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), dragon('green'), suited('bam', 2), suited('bam', 5),
      suited('crak', 2), suited('crak', 2), suited('crak', 2),
      suited('dot', 2), suited('dot', 2), suited('dot', 2),
    ];
    expect(checkSimpleWin(makePlayer(hand2))).toBe(true);
  });

  it('E1 – valid: FFFF 2025:g + pung 555:r + pung 555:b', () => {
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), dragon('green'), suited('bam', 2), suited('bam', 5),
      suited('crak', 5), suited('crak', 5), suited('crak', 5),
      suited('dot', 5), suited('dot', 5), suited('dot', 5),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('E1 – invalid: FFFF 2025:g + pung 222:r + pung 555:b (mixed pungs)', () => {
    // Mixed 2s and 5s pungs should NOT match line 1
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), dragon('green'), suited('bam', 2), suited('bam', 5),
      suited('crak', 2), suited('crak', 2), suited('crak', 2),
      suited('dot', 5), suited('dot', 5), suited('dot', 5),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(false);
  });

  // ── E2: Any Like Numbers line 2 — joker cannot be used in the pairs ──────
  it('E2 – valid: FFFF + NN:g + NNN:g + NNN:r + NN:b (no jokers)', () => {
    // FFFF:n 33:g 333:g 333:r 33:b  (n=3)
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 3), suited('bam', 3),
      suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('crak', 3), suited('crak', 3), suited('crak', 3),
      suited('dot', 3), suited('dot', 3),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('E2 – invalid: joker replacing one tile of a pair in Any Like Numbers line 2', () => {
    // Replace one dot-3 pair tile with a joker — pairs are not joker-eligible
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 3), suited('bam', 3),
      suited('bam', 3), suited('bam', 3), suited('bam', 3),
      suited('crak', 3), suited('crak', 3), suited('crak', 3),
      suited('dot', 3), joker(),           // joker in pair position
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(false);
  });

  // ── E3: 2025 line 3 — three-suit hand: 2025 in one suit, 22+55 in second, DDDD in third ──
  it('E3 – valid: 2025:r 222:g 555:g DDDD:b — three distinct suits', () => {
    // Pattern: 2025:r 222:g 555:g DDDD:b
    // r=crak, g=bam, b=dot → dragon for dot = soap
    const hand: Tile[] = [
      suited('crak', 2), dragon('red'), suited('crak', 2), suited('crak', 5),
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 5), suited('bam', 5), suited('bam', 5),
      dragon('soap'), dragon('soap'), dragon('soap'), dragon('soap'),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  // ── E4: 2468 line 4 — both pungs must be the same even number ────────────
  it('E4 – valid: FFFF 2468:g + pung 444:r + pung 444:b (both pungs = 4)', () => {
    // FFFF:n 2468:g 444:r 444:b
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), suited('bam', 4), suited('bam', 6), suited('bam', 8),
      suited('crak', 4), suited('crak', 4), suited('crak', 4),
      suited('dot', 4), suited('dot', 4), suited('dot', 4),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('E4 – invalid: FFFF 2468:g + pung 444:r + pung 666:b (different even numbers)', () => {
    const hand: Tile[] = [
      flower(), flower(), flower(), flower(),
      suited('bam', 2), suited('bam', 4), suited('bam', 6), suited('bam', 8),
      suited('crak', 4), suited('crak', 4), suited('crak', 4),
      suited('dot', 6), suited('dot', 6), suited('dot', 6),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(false);
  });

  // ── E5: Winds & Dragons line 2 — dragon kong suit independent of 123 run ─
  it('E5 – valid: FF + 123:g + DD:g + DDD:r + DDDD:b — dragon kong in third suit', () => {
    // FF:n 123:g DD:g DDD:r DDDD:b  (d=0)
    // g=bam, r=crak, b=dot → DD:g = green-dragon pair, DDD:r = red-dragon pung, DDDD:b = soap-dragon kong
    const hand: Tile[] = [
      flower(), flower(),
      suited('bam', 1), suited('bam', 2), suited('bam', 3),
      dragon('green'), dragon('green'),
      dragon('red'), dragon('red'), dragon('red'),
      dragon('soap'), dragon('soap'), dragon('soap'), dragon('soap'),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('E5 – valid: same hand but dragons in a different suit arrangement', () => {
    // Try g=crak, r=dot, b=bam: run in crak, DD=red, DDD=soap, DDDD=green
    const hand: Tile[] = [
      flower(), flower(),
      suited('crak', 1), suited('crak', 2), suited('crak', 3),
      dragon('red'), dragon('red'),
      dragon('soap'), dragon('soap'), dragon('soap'),
      dragon('green'), dragon('green'), dragon('green'), dragon('green'),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });
});

describe('discard claim rules', () => {
  it('allows claiming Mah Jongg on a discard for a concealed singles-and-pairs hand', () => {
    const playerHand: Tile[] = [
      flower(), flower(),
      suited('bam', 2), dragon('green'), suited('bam', 2),
      suited('bam', 5),
      suited('crak', 2), dragon('red'), suited('crak', 2),
      suited('crak', 5),
      suited('dot', 2), dragon('soap'), suited('dot', 2),
    ];
    const winningDiscard = suited('dot', 5);

    const state = makeState({
      players: [
        makePlayer(playerHand),
        { ...makePlayer([]), id: 1, name: 'Player 2', isHuman: false, seatWind: 'south' },
        { ...makePlayer([]), id: 2, name: 'Player 3', isHuman: false, seatWind: 'west' },
        { ...makePlayer([]), id: 3, name: 'Player 4', isHuman: false, seatWind: 'north' },
      ],
      discardPool: [winningDiscard],
      lastDiscarded: winningDiscard,
      lastDiscardedBy: 1,
    });

    expect(getCallOptions(state, 0)).toEqual([]);
    expect(canClaimMahJonggOnDiscard(state, 0)).toBe(true);

    const resolved = claimMahJonggOnDiscard(state, 0);
    expect(resolved.phase).toBe('gameOver');
    expect(resolved.winner).toBe(0);
    expect(resolved.discardPool).toHaveLength(0);
    expect(resolved.players[0].hand).toHaveLength(14);
    expect(checkSimpleWin(resolved.players[0])).toBe(true);
  });

  it('never allows calling a discarded joker', () => {
    const discardedJoker = joker();
    const state = makeState({
      players: [
        makePlayer([joker(), joker(), joker()]),
        { ...makePlayer([]), id: 1, name: 'Player 2', isHuman: false, seatWind: 'south' },
        { ...makePlayer([]), id: 2, name: 'Player 3', isHuman: false, seatWind: 'west' },
        { ...makePlayer([]), id: 3, name: 'Player 4', isHuman: false, seatWind: 'north' },
      ],
      discardPool: [discardedJoker],
      lastDiscarded: discardedJoker,
      lastDiscardedBy: 1,
    });

    expect(getCallOptions(state, 0)).toEqual([]);
    expect(canClaimMahJonggOnDiscard(state, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regression — existing valid hands still pass after the patch
// ---------------------------------------------------------------------------
describe('Regression: existing patterns still validate', () => {

  it('2468 line 1 single-suit: 222:g 4444:g 666:g 8888:g', () => {
    const hand: Tile[] = [
      suited('bam', 2), suited('bam', 2), suited('bam', 2),
      suited('bam', 4), suited('bam', 4), suited('bam', 4), suited('bam', 4),
      suited('bam', 6), suited('bam', 6), suited('bam', 6),
      suited('bam', 8), suited('bam', 8), suited('bam', 8), suited('bam', 8),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('CR line 1: 11:b 222:b 3333:b 444:b 55:b (fixed numbers)', () => {
    const hand: Tile[] = [
      suited('dot', 1), suited('dot', 1),
      suited('dot', 2), suited('dot', 2), suited('dot', 2),
      suited('dot', 3), suited('dot', 3), suited('dot', 3), suited('dot', 3),
      suited('dot', 4), suited('dot', 4), suited('dot', 4),
      suited('dot', 5), suited('dot', 5),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('CR/7 original position 0 still works: 1,1,2,3,4,5 bam + 1111 bam + 1111 bam', () => {
    const hand: Tile[] = [
      suited('bam', 1), suited('bam', 1), suited('bam', 2),
      suited('bam', 3), suited('bam', 4), suited('bam', 5),
      suited('bam', 1), suited('bam', 1), suited('bam', 1), suited('bam', 1),
      suited('bam', 1), suited('bam', 1), suited('bam', 1), suited('bam', 1),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });

  it('Any Like Numbers: FF + 1111:g D:g 1111:r D:r 11:b', () => {
    const hand: Tile[] = [
      flower(), flower(),
      suited('bam', 1), suited('bam', 1), suited('bam', 1), suited('bam', 1),
      dragon('green'),
      suited('crak', 1), suited('crak', 1), suited('crak', 1), suited('crak', 1),
      dragon('red'),
      suited('dot', 1), suited('dot', 1),
    ];
    expect(checkSimpleWin(makePlayer(hand))).toBe(true);
  });
});
