/**
 * American Mahjong (NMJL-style) rules, one test per rule the engine enforces.
 * Rule wording follows the American ruleset document used for this game.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkSimpleWin, findWinningHandMatch, getCallOptions, resolveDiscardClaims,
  findValidJokerExchanges, executeJokerExchange, declareMahjong, buildWinInfo,
  executeCharlestonRound, executeCourtesyPass, createGame, drawTile, aiTurn,
  blankTrade, discardTile, canClaimMahjongOnDiscard,
} from './gameLogic';
import { chooseDiscard, chooseCall, chooseBlankTrade } from './aiStrategy';
import { assessCall, analyze } from './analyzer';
import { validateCard } from './cards/expand';
import type { CardDefinition } from './cards/types';
import type { GameState, Player, Tile, Suit } from './types';

let _id = 0;
const uid = () => `r${++_id}`;
const s = (suit: Suit, value: number): Tile => ({ type: 'suited', suit, value, id: uid() });
const J = (): Tile => ({ type: 'special', specialType: 'joker', number: 0, id: uid() });
const F = (): Tile => ({ type: 'special', specialType: 'flower', number: 1, id: uid() });
const D = (color: 'red' | 'green' | 'soap'): Tile => ({ type: 'dragon', color, id: uid() });
const W = (direction: 'north' | 'east' | 'west' | 'south'): Tile => ({ type: 'wind', direction, id: uid() });
const B = (): Tile => ({ type: 'special', specialType: 'blank', number: 1, id: uid() });
const many = (n: number, make: () => Tile) => Array.from({ length: n }, make);

function player(hand: Tile[], exposures: Tile[][] = [], extra: Partial<Player> = {}): Player {
  return {
    id: 0, name: 'You', isHuman: true, seatWind: 'east', hand, exposures,
    hand2: [], exposures2: [], rack1Locked: false, rack2Locked: false, ...extra,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    config: { playerCount: 4, jokerCount: 8, flowerCount: 8, totalTiles: 152, botSkillLevel: 5, tipsEnabled: true },
    players: [
      player([]),
      player([], [], { id: 1, name: 'Player 2', isHuman: false, seatWind: 'south' }),
      player([], [], { id: 2, name: 'Player 3', isHuman: false, seatWind: 'west' }),
      player([], [], { id: 3, name: 'Player 4', isHuman: false, seatWind: 'north' }),
    ],
    wall: many(60, () => s('dot', 9)),
    discardPool: [],
    currentPlayerIndex: 0,
    phase: 'playing',
    turnPhase: 'discarding',
    lastDiscarded: null,
    lastDiscardedBy: null,
    message: '',
    winner: null,
    selectedTileIndex: null,
    activeRack: 1,
    ...overrides,
  };
}

function withPlayer(g: GameState, i: number, p: Partial<Player>): GameState {
  return { ...g, players: g.players.map((pl, k) => (k === i ? { ...pl, ...p } : pl)) };
}

/** 222 4444 666 8888 in bams (2468 line 1). */
const evenBams = () => [...many(3, () => s('bam', 2)), ...many(4, () => s('bam', 4)), ...many(3, () => s('bam', 6)), ...many(4, () => s('bam', 8))];

afterEach(() => { vi.restoreAllMocks(); });

// ─── The card ──────────────────────────────────────────────────────────

describe('Reading the card', () => {
  it('a 0 is a White Dragon with no suit — FFFF 1111 + 9999 = 10 uses one', () => {
    const hand = [...many(4, F), ...many(4, () => s('crak', 1)), ...many(4, () => s('bam', 9)), s('dot', 1), D('soap')];
    expect(checkSimpleWin(player(hand))).toBe(true);
    const withRed = [...hand.slice(0, 13), D('red')];
    expect(checkSimpleWin(player(withRed))).toBe(false);
  });

  it('a bad card fails loudly when it is loaded', () => {
    const bad: CardDefinition = {
      id: 'bad', name: 'Bad', year: 2099,
      sectionNames: { year: '', '2468': '', likeNumbers: '', quints: '', consecutiveRun: '', '13579': '', windsDragons: '', '369': '', singlesPairs: '' },
      hands: [{ id: 'X-1', section: '2468', line: 1, label: '222 4444 666 888', desc: '', points: 25, concealed: false, variants: ['222:g 4444:g 666:g 888:g'] }],
    };
    expect(() => validateCard(bad)).toThrow(/13 tiles, expected 14/);
  });

  it('the 2025 card has no sextets, so you cannot call for one', () => {
    const discard = s('bam', 4);
    const g = state({
      currentPlayerIndex: 1, turnPhase: 'calling', lastDiscarded: discard, lastDiscardedBy: 1, discardPool: [discard],
      players: state().players.map((p, i) => (i === 0 ? { ...p, hand: [...many(4, () => s('bam', 4)), J(), ...many(8, () => s('dot', 1))] } : p)),
    });
    expect(getCallOptions(g, 0).map(o => o.label)).toEqual(['Pung', 'Kong', 'Quint']);
  });
});

// ─── Jokers and exposures ──────────────────────────────────────────────

describe('Jokers and exposures', () => {
  it('jokers may fill a kong of flowers', () => {
    // 2468 line 4: FFFF 2468 222 222 — two flowers + two jokers make the kong.
    const hand = [F(), F(), J(), J(), s('bam', 2), s('bam', 4), s('bam', 6), s('bam', 8), ...many(3, () => s('crak', 2)), ...many(3, () => s('dot', 2))];
    expect(checkSimpleWin(player(hand))).toBe(true);
  });

  it('jokers may fill a kong of winds, but never a single like NEWS', () => {
    // Winds line 1: NNNN EEE WWW SSSS
    const kongWithJoker = [W('north'), W('north'), W('north'), J(), ...many(3, () => W('east')), ...many(3, () => W('west')), ...many(4, () => W('south'))];
    expect(checkSimpleWin(player(kongWithJoker))).toBe(true);
    // 13579 line 7: 11 333 NEWS 333 55 — a joker can't be the W of NEWS.
    const news = [s('bam', 1), s('bam', 1), ...many(3, () => s('bam', 3)), W('north'), W('east'), J(), W('south'), ...many(3, () => s('crak', 3)), s('crak', 5), s('crak', 5)];
    expect(checkSimpleWin(player(news))).toBe(false);
  });

  it('an exposure must be a whole group: a pung of flowers plus a flower in hand is not FFFF', () => {
    const rest = [s('bam', 2), s('bam', 4), s('bam', 6), s('bam', 8), ...many(3, () => s('crak', 2)), ...many(3, () => s('dot', 2))];
    expect(checkSimpleWin(player([F(), ...rest], [many(3, F)]))).toBe(false);
    expect(checkSimpleWin(player(rest, [many(4, F)]))).toBe(true);
  });

  it('a concealed hand allows no exposures', () => {
    // Winds line 8 (C): NN EE WWW SSS DDDD
    const tiles = [W('north'), W('north'), W('east'), W('east'), ...many(3, () => W('west')), ...many(3, () => W('south'))];
    expect(checkSimpleWin(player([...tiles, ...many(4, () => D('red'))]))).toBe(true);
    expect(checkSimpleWin(player(tiles, [many(4, () => D('red'))]))).toBe(false);
  });
});

// ─── Scoring ───────────────────────────────────────────────────────────

describe('Scoring', () => {
  it('a jokerless hand scores double; with a joker it scores the card value', () => {
    expect(findWinningHandMatch(player(evenBams()))!.value).toBe(50);
    const withJoker = [...evenBams().slice(0, 13), J()];
    const m = findWinningHandMatch(player(withJoker))!;
    expect(m.points).toBe(25);
    expect(m.value).toBe(25);
  });

  it('Singles & Pairs hands are not doubled for being jokerless', () => {
    // FF 2025 2025 2025 (75)
    const hand = [F(), F(), ...(['bam', 'crak', 'dot'] as Suit[]).flatMap(su => [s(su, 2), D('soap'), s(su, 2), s(su, 5)])];
    const m = findWinningHandMatch(player(hand))!;
    expect(m.section).toBe('singlesPairs');
    expect(m.value).toBe(75);
  });

  it('won on a discard: the discarder pays double, others single; self-drawn: everyone pays double', () => {
    const g = withPlayer(state(), 0, { hand: evenBams() });
    const onDiscard = buildWinInfo(g, g.players, 0, false, 2)!;
    expect(onDiscard.payments).toEqual([
      { playerIndex: 1, amount: 50 }, { playerIndex: 2, amount: 100 }, { playerIndex: 3, amount: 50 },
    ]);
    const selfDrawn = buildWinInfo(g, g.players, 0, true, null)!;
    expect(selfDrawn.payments.every(p => p.amount === 100)).toBe(true);
    expect(selfDrawn.total).toBe(300);
  });
});

// ─── Calling discards ──────────────────────────────────────────────────

describe('Claims on a discard', () => {
  /** Player 1 discards a 2 Bam; player 0 (human) holds two 2 Bams; player 3 can Mahjong on it. */
  function contested(): GameState {
    const discard = s('bam', 2);
    const g = state({ currentPlayerIndex: 1, turnPhase: 'calling', lastDiscarded: discard, lastDiscardedBy: 1, discardPool: [discard] });
    const human = [s('bam', 2), s('bam', 2), ...many(11, () => s('dot', 9))];
    const p3 = evenBams().filter((t, i) => !(t.type === 'suited' && t.value === 2 && i === 0)); // 13 tiles, missing one 2 Bam
    return withPlayer(withPlayer(g, 0, { hand: human }), 3, { hand: p3 });
  }

  it('Mahjong beats an exposure call, even from a player later in turn', () => {
    const r = resolveDiscardClaims(contested(), { kind: 'expose', size: 3 });
    expect(r.phase).toBe('gameOver');
    expect(r.winner).toBe(3);
    expect(r.winInfo?.discarderIndex).toBe(1);
    expect(r.message).toMatch(/Mahjong, which beats any other call/);
  });

  it('never claims for the human: passing on a discard you could win with is your choice', () => {
    const discard = s('bam', 8);
    let g = state({ currentPlayerIndex: 1, turnPhase: 'calling', lastDiscarded: discard, lastDiscardedBy: 1, discardPool: [discard] });
    g = withPlayer(g, 0, { hand: evenBams().slice(0, 13) });
    expect(resolveDiscardClaims(g, null).winner).toBeNull();
    expect(resolveDiscardClaims(g, { kind: 'mahjong' }).winner).toBe(0);
  });
});

// ─── Joker exchange ────────────────────────────────────────────────────

describe('Joker exchange', () => {
  function exchangeState(currentPlayerIndex: number, turnPhase: GameState['turnPhase']): GameState {
    let g = state({ currentPlayerIndex, turnPhase });
    g = withPlayer(g, 0, { hand: [s('crak', 5), ...many(10, () => s('dot', 1))] });
    return withPlayer(g, 2, { exposures: [[s('crak', 5), s('crak', 5), J()]] });
  }

  it('only on your own turn, after drawing or calling', () => {
    expect(findValidJokerExchanges(exchangeState(1, 'discarding'))).toEqual([]);
    expect(findValidJokerExchanges(exchangeState(0, 'calling'))).toEqual([]);
    const opts = findValidJokerExchanges(exchangeState(0, 'discarding'));
    expect(opts).toHaveLength(1);
    const off = exchangeState(1, 'discarding');
    expect(executeJokerExchange(off, 2, 0, 2, 0)).toBe(off);
  });

  it('Mahjong right after a joker exchange counts as self-drawn', () => {
    // Called a discard this turn, then exchanged for the joker that completes the hand.
    const hand = [...evenBams().slice(0, 13), s('crak', 5)];   // needs one more 8 Bam; holds a 5 Crak
    let g = state({ currentPlayerIndex: 0, turnPhase: 'discarding', turnSource: 'call', lastCallFrom: 3 });
    g = withPlayer(g, 0, { hand });
    g = withPlayer(g, 2, { exposures: [[s('crak', 5), s('crak', 5), J()]] });
    const ex = executeJokerExchange(g, 2, 0, 2, 13);
    expect(ex.lastActionWasJokerExchange).toBe(true);
    const won = declareMahjong(ex, 0);
    expect(won.phase).toBe('gameOver');
    expect(won.winInfo?.selfDrawn).toBe(true);
  });
});

// ─── Charleston ────────────────────────────────────────────────────────

describe('Charleston', () => {
  function dealt(): Player[] {
    vi.spyOn(Math, 'random').mockImplementation(seeded(7));
    const g = createGame({ playerCount: 4, jokerCount: 8, flowerCount: 8, totalTiles: 152, botSkillLevel: 3, tipsEnabled: false });
    return g.players;
  }

  it('everyone passes at once: passing right, you receive from the player on your left', () => {
    const players = dealt();
    const humanPicks = players[0].hand.map((t, i) => ({ t, i })).filter(x => x.t.type !== 'special' || x.t.specialType !== 'joker').slice(0, 3).map(x => x.i);
    const left = players[3].hand.map(t => t.id);
    const r = executeCharlestonRound(players, humanPicks, 'right', 4);
    expect(r.humanReceived).toHaveLength(3);
    expect(r.humanReceived.every(t => left.includes(t.id))).toBe(true);
    r.players.forEach((p, i) => expect(p.hand).toHaveLength(players[i].hand.length));
    // Nobody passes a joker.
    const passed = r.players.flatMap((p, i) => p.hand.filter(t => !players[i].hand.some(o => o.id === t.id)));
    expect(passed.some(t => t.type === 'special' && t.specialType === 'joker')).toBe(false);
  });

  it('jokers may not be passed', () => {
    const players = dealt();
    const withJoker = { ...players[0], hand: [J(), ...players[0].hand.slice(1)] };
    const r = executeCharlestonRound([withJoker, ...players.slice(1)], [0, 1, 2], 'right', 4);
    expect(r.players[0]).toBe(withJoker);
  });

  it('blind pass: on the last pass you may send on unseen tiles coming to you', () => {
    const players = dealt();
    const r = executeCharlestonRound(players, [0], 'left', 4, undefined, { blindAllowed: true });
    expect(r.blindForwarded).toBe(2);
    expect(r.humanReceived).toHaveLength(1);
    // You sent 1 of yours + 2 unseen, and kept 1 of the 3 coming in: same rack size.
    expect(r.players[0].hand).toHaveLength(players[0].hand.length);
    // Without blind allowed, fewer than three is refused.
    expect(executeCharlestonRound(players, [0], 'left', 4).players).toBe(players);
  });

  it('courtesy pass: the pair trades the smaller of their two offers', () => {
    const players = dealt();
    const r = executeCourtesyPass(players, [0, 1, 2], 4);
    expect(r.exchanged).toBeLessThanOrEqual(3);
    expect(r.players[0].hand).toHaveLength(players[0].hand.length);
    const changed = r.players[0].hand.filter(t => !players[0].hand.some(o => o.id === t.id)).length;
    expect(changed).toBe(r.exchanged);
  });
});

// ─── Computer players ──────────────────────────────────────────────────

function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Computer players', () => {
  it('never throw away a joker while they hold a natural', () => {
    const hand = [J(), J(), ...evenBams().slice(0, 12)];
    const c = chooseDiscard(hand, [], undefined, 5)!;
    expect(hand[c.index].type === 'special').toBe(false);
  });

  it('keep the tiles their best hand needs and discard the stray', () => {
    const stray = W('west');
    const hand = [...evenBams().slice(0, 13), stray];
    const c = chooseDiscard(hand, [], undefined, 5)!;
    expect(hand[c.index].id).toBe(stray.id);
  });

  it('call a discard only when the exposure brings a real hand closer', () => {
    const hand = evenBams().slice(0, 13); // 222 4444 666 888 — one 8 Bam from Mahjong
    expect(chooseCall(hand, [], s('bam', 8), [{ size: 4, matchUsed: 3, jokersUsed: 0 }], undefined, 5)).toBe(4);
    const nine = s('dot', 9);
    const withNines = [...hand.slice(0, 11), s('dot', 9), s('dot', 9)];
    expect(chooseCall(withNines, [], nine, [{ size: 3, matchUsed: 2, jokersUsed: 0 }], undefined, 5)).toBeNull();
  });

  it('build and complete real card hands in full games', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(2025));
    let wins = 0;
    for (let k = 0; k < 6; k++) {
      let g = createGame({ playerCount: 4, jokerCount: 8, flowerCount: 8, totalTiles: 152, botSkillLevel: 5, tipsEnabled: false });
      g = { ...g, phase: 'playing', turnPhase: 'discarding', players: g.players.map(p => ({ ...p, isHuman: false })) };
      for (let step = 0; g.phase === 'playing' && step < 1500; step++) {
        if (g.turnPhase === 'drawing') g = drawTile(g);
        else if (g.turnPhase === 'discarding') g = aiTurn(g);
        else g = resolveDiscardClaims(g, null);
      }
      if (g.winner !== null) {
        wins++;
        expect(findWinningHandMatch(g.players[g.winner])).not.toBeNull();
        expect(g.winInfo?.value).toBeGreaterThan(0);
      }
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  }, 120000);
});

// ─── Trainer ───────────────────────────────────────────────────────────

describe('Call coaching', () => {
  it('warns when an exposure would leave your hand dead', () => {
    // Three kongs of different winds are already exposed. A pung of 7 Dots fits no line with them.
    const discard = s('dot', 7);
    let g = state({ currentPlayerIndex: 1, turnPhase: 'calling', lastDiscarded: discard, lastDiscardedBy: 1, discardPool: [discard] });
    g = withPlayer(g, 0, {
      hand: [s('dot', 7), s('dot', 7)],
      exposures: [many(4, () => W('north')), many(4, () => W('east')), many(3, () => W('south'))],
    });
    const a = assessCall(g, 0, 3)!;
    expect(a.fits).toBe(false);
    expect(a.message).toMatch(/dead/);
  });
});

// ─── Blanks ────────────────────────────────────────────────────────────

describe('Blanks', () => {
  const cfg = (blankCount: 0 | 2 | 4 | 6 | 8) => ({
    playerCount: 4 as const, jokerCount: 8 as const, flowerCount: 8 as const, blankCount,
    totalTiles: 152 + blankCount, botSkillLevel: 3 as const, tipsEnabled: false,
  });
  const countBlanks = (g: GameState) =>
    [...g.wall, ...g.players.flatMap(p => p.hand)].filter(t => t.type === 'special' && t.specialType === 'blank').length;

  /** Human to discard, holding a blank; pool holds an 8 Bam, a Joker and a blank. */
  function blankTurn(): { g: GameState; eight: Tile; jokerInPool: Tile } {
    const eight = s('bam', 8), jokerInPool = J();
    const hand = [...evenBams().slice(0, 13), B()]; // 222 4444 666 888 + blank: one 8 Bam from Mahjong
    const g = withPlayer(state({ discardPool: [s('dot', 1), eight, jokerInPool, B()] }), 0, { hand });
    return { g, eight, jokerInPool };
  }

  it('are opt-in: none by default, the chosen number when added', () => {
    expect(countBlanks(createGame(cfg(0)))).toBe(0);
    const g = createGame(cfg(6));
    expect(countBlanks(g)).toBe(6);
    expect(g.wall.length + g.players.reduce((n, p) => n + p.hand.length, 0)).toBe(158);
  });

  it('trade for any natural discard on your turn; the blank takes its place in the pool', () => {
    const { g, eight } = blankTurn();
    const r = blankTrade(g, 13, 1);
    expect(r.players[0].hand[13].id).toBe(eight.id);
    expect(r.discardPool[1].type === 'special' && r.discardPool[1].specialType === 'blank').toBe(true);
    expect(r.discardPool).toHaveLength(4);
    expect(r.turnPhase).toBe('discarding');
    // …and the tile it fetched can complete the hand.
    expect(declareMahjong(r, 0).phase).toBe('gameOver');
  });

  it('cannot pick up a discarded Joker or another blank', () => {
    const { g } = blankTurn();
    expect(blankTrade(g, 13, 2).players).toBe(g.players);
    expect(blankTrade(g, 13, 2).message).toMatch(/cannot pick up a discarded Joker/);
    expect(blankTrade(g, 13, 3).players).toBe(g.players);
  });

  it('only on your own turn', () => {
    const { g } = blankTurn();
    const notMyTurn = { ...g, currentPlayerIndex: 1 };
    expect(blankTrade(notMyTurn, 13, 1)).toBe(notMyTurn);
    const calling = { ...g, turnPhase: 'calling' as const };
    expect(blankTrade(calling, 13, 1)).toBe(calling);
  });

  it('may be discarded instead, and a discarded blank cannot be called', () => {
    const { g } = blankTurn();
    let r = discardTile(g, 13);
    expect(r.lastDiscarded?.type === 'special' && r.lastDiscarded.specialType === 'blank').toBe(true);
    r = withPlayer(r, 1, { hand: [B(), B(), J(), J(), ...many(9, () => s('dot', 3))] });
    expect(getCallOptions(r, 1)).toEqual([]);
    expect(canClaimMahjongOnDiscard(r, 1)).toBe(false);
  });

  it('are not Jokers: no Mahjong while holding one, and they cannot stand in when calling', () => {
    const { g } = blankTurn();
    expect(checkSimpleWin(g.players[0])).toBe(false);
    expect(declareMahjong(g, 0).phase).toBe('playing');
    // Two blanks + one natural cannot call a kong the way two jokers could.
    const discard = s('crak', 5);
    let c = state({ currentPlayerIndex: 1, turnPhase: 'calling', lastDiscarded: discard, lastDiscardedBy: 1, discardPool: [discard] });
    c = withPlayer(c, 0, { hand: [s('crak', 5), B(), B(), ...many(10, () => s('dot', 1))] });
    expect(getCallOptions(c, 0)).toEqual([]);
  });

  it('cannot be passed in the Charleston', () => {
    const g = createGame(cfg(0));
    const withBlank = { ...g.players[0], hand: [B(), ...g.players[0].hand.slice(1)] };
    const players = [withBlank, ...g.players.slice(1)];
    expect(executeCharlestonRound(players, [0, 1, 2], 'right', 4).players).toBe(players);
    expect(executeCourtesyPass(players, [0], 4).exchanged).toBe(0);
  });

  it('bots trade a blank for the discard that helps most, and the trainer points to it', () => {
    const { g, eight } = blankTurn();
    const choice = chooseBlankTrade(g.players[0].hand, [], g.discardPool)!;
    expect(g.discardPool[choice.poolIndex].id).toBe(eight.id);
    const advice = analyze(g, 0).tileAdvice.find(a => a.tile.type === 'special' && a.tile.specialType === 'blank')!;
    expect(advice.action).toBe('KEEP');
    expect(advice.reason).toMatch(/8 Bam/);
    // A bot in the same spot trades and wins.
    const bot = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, isHuman: false } : p)) };
    const after = aiTurn(bot);
    expect(after.phase).toBe('gameOver');
    expect(after.winner).toBe(0);
  });
});
