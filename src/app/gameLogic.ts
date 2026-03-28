import {
  Tile, Suit, WindDirection, DragonColor, GameConfig, Player, GameState,
  getTileSortKey, tilesMatch, getTileRankSortKey, getTileName
} from './types';

// ─── Tile Generation ────────────────────────────────────────────────

function generateTileSet(config: GameConfig): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;

  const nextId = () => `tile_${id++}`;

  // Suited tiles: 3 suits × 9 values × 4 copies = 108
  const suits: Suit[] = ['bam', 'crak', 'dot'];
  for (const suit of suits) {
    for (let value = 1; value <= 9; value++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ type: 'suited', suit, value, id: nextId() });
      }
    }
  }

  // Wind tiles: 4 directions × 4 copies = 16
  const winds: WindDirection[] = ['north', 'east', 'south', 'west'];
  for (const direction of winds) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ type: 'wind', direction, id: nextId() });
    }
  }

  // Dragon tiles: 3 colors × 4 copies = 12
  const dragons: DragonColor[] = ['red', 'green', 'soap'];
  for (const color of dragons) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ type: 'dragon', color, id: nextId() });
    }
  }

  // Base = 136 tiles

  // Jokers
  for (let i = 0; i < config.jokerCount; i++) {
    tiles.push({ type: 'special', specialType: 'joker', number: i + 1, id: nextId() });
  }

  // Flowers
  for (let i = 0; i < config.flowerCount; i++) {
    tiles.push({ type: 'special', specialType: 'flower', number: i + 1, id: nextId() });
  }

  // Blanks to fill remaining slots
  const blanksNeeded = Math.max(0, config.totalTiles - 136 - config.jokerCount - config.flowerCount);
  for (let i = 0; i < blanksNeeded; i++) {
    tiles.push({ type: 'special', specialType: 'blank', number: i + 1, id: nextId() });
  }

  return tiles;
}

// ─── Shuffle ────────────────────────────────────────────────────────

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Create Game ────────────────────────────────────────────────────

export function createGame(config: GameConfig): GameState {
  const tiles = shuffle(generateTileSet(config));
  const wall = [...tiles];

  const seatWinds: WindDirection[] = ['east', 'south', 'west', 'north'];
  const playerNames = ['You', 'Player 2', 'Player 3', 'Player 4'];
  const isSiamese = config.playerCount === 2;

  const players: Player[] = [];
  for (let i = 0; i < config.playerCount; i++) {
    players.push({
      id: i,
      name: playerNames[i],
      hand: [],
      exposures: [],
      hand2: [],
      exposures2: [],
      isHuman: i === 0,
      seatWind: seatWinds[i],
    });
  }

  if (isSiamese) {
    // ─── Siamese (2-Player) Dealing ───
    // No walls — tiles form a face-down pool in the center.
    // Dealer (East/P0) draws 28 tiles, other player draws 27.
    // Each player splits into two racks of 14 each (dealer) or 14+13 (other).
    for (let i = 0; i < 14; i++) {
      const t = wall.shift();
      if (t) players[0].hand.push(t);
    }
    for (let i = 0; i < 14; i++) {
      const t = wall.shift();
      if (t) players[0].hand2.push(t);
    }
    // P1 gets 27: 14 in rack1, 13 in rack2
    for (let i = 0; i < 14; i++) {
      const t = wall.shift();
      if (t) players[1].hand.push(t);
    }
    for (let i = 0; i < 13; i++) {
      const t = wall.shift();
      if (t) players[1].hand2.push(t);
    }

    return {
      config,
      players,
      wall,
      discardPool: [],
      currentPlayerIndex: 0,
      phase: 'playing',
      turnPhase: 'discarding', // Dealer discards first (has 28 tiles = 14+14)
      lastDiscarded: null,
      lastDiscardedBy: null,
      message: 'Siamese Mahjong — East discards from either rack',
      winner: null,
      selectedTileIndex: null,
      activeRack: 1,
    };
  }

  // ─── Standard Dealing (1, 3, or 4 players) ───
  // Deal: 3 rounds of 4 tiles each = 12 per player
  for (let round = 0; round < 3; round++) {
    for (let p = 0; p < config.playerCount; p++) {
      for (let t = 0; t < 4; t++) {
        const tile = wall.shift();
        if (tile) players[p].hand.push(tile);
      }
    }
  }
  // Final pick: each player gets 1 more (= 13 each)
  for (let p = 0; p < config.playerCount; p++) {
    const tile = wall.shift();
    if (tile) players[p].hand.push(tile);
  }
  // East (player 0) picks one extra = 14 tiles, discards first
  const extraEastTile = wall.shift();
  if (extraEastTile) players[0].hand.push(extraEastTile);

  // 3-player: no Charleston per NMJL rules — straight to play
  if (config.playerCount === 3) {
    return {
      config,
      players,
      wall,
      discardPool: [],
      currentPlayerIndex: 0,
      phase: 'playing',
      turnPhase: 'discarding', // East discards first
      lastDiscarded: null,
      lastDiscardedBy: null,
      message: '3-player game — East discards first (no Charleston)',
      winner: null,
      selectedTileIndex: null,
      activeRack: 1,
    };
  }

  return {
    config,
    players,
    wall,
    discardPool: [],
    currentPlayerIndex: 0,
    phase: 'charleston',
    turnPhase: 'waiting',
    lastDiscarded: null,
    lastDiscardedBy: null,
    message: 'Charleston — select 3 tiles to pass',
    winner: null,
    selectedTileIndex: null,
    activeRack: 1,
  };
}

// ─── Siamese Helpers ────────────────────────────────────────────────

/** Check if this game is in Siamese (2-player dual-rack) mode */
export function isSiameseMode(state: GameState): boolean {
  return state.config.playerCount === 2;
}

/** Get the active hand for a player in Siamese mode */
export function getActiveHand(player: Player, rack: 1 | 2): Tile[] {
  return rack === 1 ? player.hand : player.hand2;
}

/** Get the active exposures for a player in Siamese mode */
export function getActiveExposures(player: Player, rack: 1 | 2): Tile[][] {
  return rack === 1 ? player.exposures : player.exposures2;
}

/** Move a tile from one rack to another for a player */
export function swapTileBetweenRacks(
  state: GameState,
  playerIndex: number,
  fromRack: 1 | 2,
  tileIndex: number
): GameState {
  const player = state.players[playerIndex];
  const fromHand = fromRack === 1 ? player.hand : player.hand2;
  if (tileIndex < 0 || tileIndex >= fromHand.length) return state;

  const tile = fromHand[tileIndex];
  const newFromHand = fromHand.filter((_, i) => i !== tileIndex);
  const toHand = fromRack === 1 ? [...player.hand2, tile] : [...player.hand, tile];

  const newPlayers = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    if (fromRack === 1) {
      return { ...p, hand: newFromHand, hand2: toHand };
    } else {
      return { ...p, hand: toHand, hand2: newFromHand };
    }
  });

  return { ...state, players: newPlayers };
}

// ─── Draw Tile ──────────────────────────────────────────────────────

export function drawTile(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  if (state.wall.length === 0) {
    return {
      ...state,
      phase: 'gameOver',
      message: isSiameseMode(state) ? 'The pool is empty — draw game!' : 'The wall is empty — draw game!',
    };
  }

  const newWall = [...state.wall];
  const tile = newWall.shift()!;
  const siamese = isSiameseMode(state);

  const newPlayers = state.players.map((p, i) => {
    if (i !== state.currentPlayerIndex) return p;
    if (siamese) {
      // In Siamese, draw to the active rack
      if (state.activeRack === 2) {
        return { ...p, hand2: [...p.hand2, tile] };
      }
    }
    return { ...p, hand: [...p.hand, tile] };
  });

  const currentPlayer = newPlayers[state.currentPlayerIndex];
  const isHuman = currentPlayer.isHuman;

  // Check for win after drawing
  if (siamese) {
    if (checkSiameseWin(currentPlayer)) {
      return {
        ...state,
        players: newPlayers,
        wall: newWall,
        phase: 'gameOver',
        turnPhase: 'waiting',
        winner: state.currentPlayerIndex,
        message: isHuman
          ? 'Mah Jongg! Both hands complete — You win!'
          : `${currentPlayer.name} wins with both hands complete!`,
      };
    }
  } else if (checkSimpleWin(currentPlayer)) {
    return {
      ...state,
      players: newPlayers,
      wall: newWall,
      phase: 'gameOver',
      turnPhase: 'waiting',
      winner: state.currentPlayerIndex,
      message: isHuman
        ? 'Mah Jongg! You win!'
        : `${currentPlayer.name} wins with Mah Jongg!`,
    };
  }

  return {
    ...state,
    players: newPlayers,
    wall: newWall,
    turnPhase: 'discarding',
    selectedTileIndex: null,
    message: isHuman
      ? (siamese ? 'Select a tile to discard from either rack' : 'Select a tile to discard (click once to select, again to discard)')
      : `${currentPlayer.name} is thinking...`,
  };
}

// ─── Discard Tile ───────────────────────────────────────────────────

export function discardTile(state: GameState, tileIndex: number, rack?: 1 | 2): GameState {
  if (state.phase !== 'playing') return state;
  if (state.turnPhase !== 'discarding') return state;

  const player = state.players[state.currentPlayerIndex];
  const siamese = isSiameseMode(state);
  const effectiveRack = siamese ? (rack ?? state.activeRack) : 1;
  const hand = effectiveRack === 2 ? player.hand2 : player.hand;

  if (tileIndex < 0 || tileIndex >= hand.length) return state;

  const discardedTile = hand[tileIndex];
  const newHand = hand.filter((_, i) => i !== tileIndex);

  const newPlayers = state.players.map((p, i) => {
    if (i !== state.currentPlayerIndex) return p;
    if (effectiveRack === 2) {
      return { ...p, hand2: newHand };
    }
    return { ...p, hand: newHand };
  });

  return {
    ...state,
    players: newPlayers,
    discardPool: [...state.discardPool, discardedTile],
    lastDiscarded: discardedTile,
    lastDiscardedBy: state.currentPlayerIndex,
    turnPhase: 'calling',
    selectedTileIndex: null,
    message: `${player.name} discarded a tile`,
  };
}

// ─── Pass Turn ──────────────────────────────────────────────────────

export function passTurn(state: GameState): GameState {
  if (state.phase !== 'playing') return state;

  const nextIndex = (state.currentPlayerIndex + 1) % state.config.playerCount;
  const nextPlayer = state.players[nextIndex];

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    turnPhase: 'drawing',
    lastDiscarded: null,
    lastDiscardedBy: null,
    selectedTileIndex: null,
    message: nextPlayer.isHuman
      ? 'Your turn — drawing a tile...'
      : `${nextPlayer.name}'s turn...`,
  };
}

// ─── Can Call ───────────────────────────────────────────────────────

export type CallGroupSize = 3 | 4 | 5 | 6; // pung, kong, quint, sextet

export interface CallOption {
  size: CallGroupSize;
  label: string;
  matchUsed: number;
  jokersUsed: number;
}

/**
 * Returns the list of valid group sizes the player can call for.
 * The discarded tile counts as 1, so the player needs (size - 1) tiles
 * from their hand (matching tiles + jokers).
 */
export function getCallOptions(state: GameState, playerIndex: number): CallOption[] {
  if (state.phase !== 'playing') return [];
  if (state.turnPhase !== 'calling') return [];
  if (state.lastDiscarded === null) return [];
  if (state.lastDiscardedBy === playerIndex) return [];

  const player = state.players[playerIndex];
  const discard = state.lastDiscarded;

  // Count matching tiles in hand (not jokers)
  const matchCount = player.hand.filter(t => tilesMatch(t, discard)).length;

  // Count jokers in hand
  const jokerCount = player.hand.filter(
    t => t.type === 'special' && t.specialType === 'joker'
  ).length;

  const available = matchCount + jokerCount; // tiles from hand that can go into the group

  const options: CallOption[] = [];
  const sizes: { size: CallGroupSize; label: string }[] = [
    { size: 3, label: 'Pung' },
    { size: 4, label: 'Kong' },
    { size: 5, label: 'Quint' },
    { size: 6, label: 'Sextet' },
  ];

  for (const { size, label } of sizes) {
    const neededFromHand = size - 1; // the discard is one of the group tiles
    if (available >= neededFromHand) {
      // Use real matching tiles first, then fill with jokers
      const matchUsed = Math.min(matchCount, neededFromHand);
      const jokersUsed = neededFromHand - matchUsed;
      options.push({ size, label, matchUsed, jokersUsed });
    }
  }

  return options;
}

export function canCall(state: GameState, playerIndex: number): boolean {
  return getCallOptions(state, playerIndex).length > 0;
}

// ─── Call Tile ──────────────────────────────────────────────────────

/**
 * Call a discarded tile for a specific group size.
 * If no groupSize given, defaults to the smallest valid group (pung).
 */
export function callTile(state: GameState, playerIndex: number, groupSize?: CallGroupSize): GameState {
  const options = getCallOptions(state, playerIndex);
  if (options.length === 0) return state;
  if (state.lastDiscarded === null) return state;

  // Pick the requested group size, or default to smallest available
  const chosenSize = groupSize ?? options[0].size;
  const option = options.find(o => o.size === chosenSize);
  if (!option) return state;

  const discard = state.lastDiscarded;
  const player = state.players[playerIndex];

  // Find matching tiles and jokers in hand
  const matchingIndices: number[] = [];
  const jokerIndices: number[] = [];

  for (let i = 0; i < player.hand.length; i++) {
    if (tilesMatch(player.hand[i], discard)) {
      matchingIndices.push(i);
    } else if (player.hand[i].type === 'special' && player.hand[i].specialType === 'joker') {
      jokerIndices.push(i);
    }
  }

  // Build exposure: the discard + (size - 1) tiles from hand
  const exposureTiles: Tile[] = [discard];
  const indicesToRemove: number[] = [];
  const neededFromHand = option.size - 1;
  let taken = 0;

  // Take matching tiles first
  for (const idx of matchingIndices) {
    if (taken >= neededFromHand) break;
    exposureTiles.push(player.hand[idx]);
    indicesToRemove.push(idx);
    taken++;
  }

  // Fill remaining with jokers
  for (const idx of jokerIndices) {
    if (taken >= neededFromHand) break;
    exposureTiles.push(player.hand[idx]);
    indicesToRemove.push(idx);
    taken++;
  }

  // Remove used tiles from hand
  const newHand = player.hand.filter((_, i) => !indicesToRemove.includes(i));

  const newPlayers = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    return {
      ...p,
      hand: newHand,
      exposures: [...p.exposures, exposureTiles],
    };
  });

  // Remove discard from pool (it was the last one added)
  const newDiscardPool = state.discardPool.slice(0, -1);

  // Check for win after calling
  const updatedPlayer = newPlayers[playerIndex];
  if (checkSimpleWin(updatedPlayer)) {
    return {
      ...state,
      players: newPlayers,
      discardPool: newDiscardPool,
      phase: 'gameOver',
      turnPhase: 'waiting',
      winner: playerIndex,
      currentPlayerIndex: playerIndex,
      lastDiscarded: null,
      lastDiscardedBy: null,
      selectedTileIndex: null,
      message: updatedPlayer.isHuman
        ? 'Mah Jongg! You win!'
        : `${updatedPlayer.name} wins with Mah Jongg!`,
    };
  }

  const sizeLabels: Record<number, string> = { 3: 'Pung', 4: 'Kong', 5: 'Quint', 6: 'Sextet' };
  const sizeLabel = sizeLabels[option.size] || 'group';

  return {
    ...state,
    players: newPlayers,
    discardPool: newDiscardPool,
    currentPlayerIndex: playerIndex,
    turnPhase: 'discarding',
    lastDiscarded: null,
    lastDiscardedBy: null,
    selectedTileIndex: null,
    message: updatedPlayer.isHuman
      ? `You called for a ${sizeLabel}! Now discard a tile.`
      : `${updatedPlayer.name} called for a ${sizeLabel}!`,
  };
}

// ─── Sort Hand ──────────────────────────────────────────────────────

export function sortHand(state: GameState, playerIndex: number, type: 'suit' | 'rank'): GameState {
  const player = state.players[playerIndex];
  const sortFn = type === 'suit' ? getTileSortKey : getTileRankSortKey;

  const sortedHand = [...player.hand].sort((a, b) => {
    return sortFn(a).localeCompare(sortFn(b));
  });

  const newPlayers = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    return { ...p, hand: sortedHand };
  });

  return { ...state, players: newPlayers };
}

/** Sort a specific rack (1 or 2) for Siamese mode */
export function sortHandRack(state: GameState, playerIndex: number, type: 'suit' | 'rank', rack: 1 | 2): GameState {
  const player = state.players[playerIndex];
  const sortFn = type === 'suit' ? getTileSortKey : getTileRankSortKey;
  const hand = rack === 1 ? player.hand : player.hand2;

  const sortedHand = [...hand].sort((a, b) => {
    return sortFn(a).localeCompare(sortFn(b));
  });

  const newPlayers = state.players.map((p, i) => {
    if (i !== playerIndex) return p;
    if (rack === 2) return { ...p, hand2: sortedHand };
    return { ...p, hand: sortedHand };
  });

  return { ...state, players: newPlayers };
}

// ─── NMJL Pattern Matching Engine ──────────────────────────────────
// Proper NMJL card pattern matching replaces the old simplified decomposition.
// Each NMJL hand is encoded as token strings (e.g. "FFF:n 135:b 7777:b 9999:b").
// Colors g/r/b represent suit groups (actual suits determined by permutation).
// Jokers are wildcards that can substitute for any tile in any group.

interface NMJLConcretePattern {
  tokens: { t: string; c: string }[];
  concealed: boolean;
}

/**
 * Check if a token represents a group where jokers may substitute.
 * NMJL rule: jokers can only be used in pungs (3), kongs (4), quints (5),
 * and sextets (6) — groups of 3+ IDENTICAL tiles.
 * Jokers may NOT be used in singles, pairs, or runs/sequences.
 */
function isJokerEligibleToken(text: string): boolean {
  if (text.length < 3) return false;
  const first = text[0];
  for (let i = 1; i < text.length; i++) {
    if (text[i] !== first) return false;
  }
  return true;
}

function parseTokenStr(s: string): { t: string; c: string }[] {
  return s.split(' ').map(part => {
    const idx = part.lastIndexOf(':');
    return { t: part.slice(0, idx), c: part.slice(idx + 1) };
  });
}

function shiftTokenStr(tokenStr: string, delta: number): string {
  if (delta === 0) return tokenStr;
  return tokenStr.split(' ').map(token => {
    const idx = token.lastIndexOf(':');
    const text = token.slice(0, idx);
    const color = token.slice(idx);
    const newText = text.replace(/[1-9]/g, ch => String(parseInt(ch) + delta));
    return newText + color;
  }).join(' ');
}

const ALL_NMJL_PATTERNS: NMJLConcretePattern[] = (() => {
  const patterns: NMJLConcretePattern[] = [];
  function add(concealed: boolean, ...tokenStrs: string[]) {
    for (const ts of tokenStrs) {
      patterns.push({ tokens: parseTokenStr(ts), concealed });
    }
  }

  // 2025
  add(false, 'FFFF:n 2025:g 222:r 222:b', 'FFFF:n 2025:g 555:r 555:b');
  add(false, '222:g 0000:g 222:r 5555:r');
  add(false, '2025:r 222:g 555:g DDDD:b');
  add(true, 'FF:n 222:g 000:b 222:r 555:r');
  // 2468
  add(false, '222:g 4444:g 666:g 8888:g', '222:g 4444:r 666:g 8888:r');
  add(false, 'FF:n 2222:g 4444:r 6666:b', 'FF:n 2222:g 6666:r 8888:b');
  add(false, '22:b 444:b 66:b 888:b DDDD:b');
  for (const n of ['2','4','6','8']) add(false, `FFFF:n 2468:g ${n}${n}${n}:r ${n}${n}${n}:b`);
  add(false, 'FFF:n 22:b 44:b 666:b 8888:b');
  add(false, '222:g 4444:g 666:r 88:r 88:b');
  for (const n of ['2','4','6','8']) add(false, `FF:n ${n}${n}${n}${n}:g DDDD:r ${n}${n}${n}${n}:b`);
  for (const n of ['2','4','6','8']) add(true, `22:g 44:g 66:g 88:g ${n}${n}${n}:r ${n}${n}${n}:b`);
  // Any Like Numbers (try 1-9)
  for (let d = 1; d <= 9; d++) {
    const n = String(d);
    add(false, `FF:n ${n}${n}${n}${n}:g D:g ${n}${n}${n}${n}:r D:r ${n}${n}:b`);
    add(false, `FFFF:n ${n}${n}:g ${n}${n}${n}:g ${n}${n}${n}:r ${n}${n}:b`);
    add(false, `FFFF:n ${n}${n}:g ${n}${n}${n}:r ${n}${n}${n}:b ${n}${n}:g`);
    add(false, `FF:n ${n}${n}${n}:g ${n}${n}${n}:r ${n}${n}${n}:b DDD:n`);
  }
  // Quints
  for (let d = 0; d <= 6; d++) add(false, shiftTokenStr('FF:n 111:g 2222:r 33333:b', d));
  for (let d = 0; d <= 7; d++) {
    for (const w of ['NNNN','EEEE','WWWW','SSSS']) {
      const sh = shiftTokenStr('11111:b 22222:b', d).split(' ');
      add(false, `${sh[0]} ${w}:n ${sh[1]}`);
    }
  }
  for (let d = 1; d <= 9; d++) { const n = String(d); add(false, `FF:n ${n}${n}${n}${n}${n}:g ${n}${n}:b ${n}${n}${n}${n}${n}:r`); }
  // Consecutive Run
  add(false, '11:b 222:b 3333:b 444:b 55:b', '55:b 666:b 7777:b 888:b 99:b');
  for (let d = 0; d <= 5; d++) { add(false, shiftTokenStr('111:b 2222:b 333:b 4444:b', d)); add(false, shiftTokenStr('111:g 2222:r 333:g 4444:r', d)); }
  for (let d = 0; d <= 6; d++) { add(false, shiftTokenStr('FFFF:n 1111:b 22:b 3333:b', d)); add(false, shiftTokenStr('FFFF:n 1111:g 22:r 3333:b', d)); }
  for (let d = 0; d <= 4; d++) add(false, shiftTokenStr('FFF:n 123:g 4444:r 5555:b', d));
  for (let d = 0; d <= 6; d++) add(false, shiftTokenStr('FF:n 11:b 222:b 3333:b DDD:n', d));
  for (let d = 0; d <= 6; d++) add(false, shiftTokenStr('111:g 222:g 3333:r DD:g DD:r', d));
  for (let d = 0; d <= 4; d++) add(false, shiftTokenStr('112345:b 1111:b 1111:b', d));
  for (let d = 0; d <= 6; d++) add(true, shiftTokenStr('FF:n 1:g 22:g 333:g 1:r 22:r 333:r', d));
  // 13579
  add(false, '11:b 333:b 5555:b 777:b 99:b', '11:g 333:g 5555:r 777:r 99:b');
  add(false, '111:g 3333:g 333:r 5555:r', '555:g 7777:g 777:r 9999:r');
  add(false, '1111:b 333:b 5555:b DDD:n', '5555:b 777:b 9999:b DDD:n');
  add(false, 'FFFF:n 1111:g 9999:r 10:b');
  add(false, 'FFF:n 135:b 7777:b 9999:b', 'FFF:n 135:g 7777:r 9999:b');
  add(false, '111:g 333:g 5555:r DD:g DD:r', '555:g 777:g 9999:r DD:g DD:r');
  add(false, '11:g 333:g NEWS:n 333:r 55:r', '55:g 777:g NEWS:n 777:r 99:r');
  add(false, '1111:g 33:r 55:r 77:r 9999:g');
  add(false, 'FF:n 11:g 33:g 111:r 333:r 55:b', 'FF:n 55:g 77:g 555:r 777:r 99:b');
  // Winds & Dragons
  add(false, 'NNNN:n EEE:n WWW:n SSSS:n', 'NNN:n EEEE:n WWWW:n SSS:n');
  for (let d = 0; d <= 6; d++) add(false, shiftTokenStr('FF:n 123:g DD:g DDD:r DDDD:b', d));
  add(false, 'FFF:n NN:n EE:n WWWW:n SSS:n');
  add(false, 'FFFF:n DDD:g NEWS:n DDD:r');
  for (const n of ['1','3','5','7','9']) add(false, `NNNN:n ${n}:g ${n}${n}:r ${n}${n}${n}:b SSSS:n`);
  for (const n of ['2','4','6','8']) add(false, `EEEE:n ${n}:g ${n}${n}:r ${n}${n}${n}:b WWWW:n`);
  add(false, 'NNN:n EE:n WWW:n SS:n 2025:g', 'NNN:n EE:n WW:n SSS:n 2025:g');
  add(true, 'NN:n EE:n WWW:n SSS:n DDDD:n');
  // 369
  add(false, '333:g 6666:g 666:r 9999:r', '333:g 6666:r 666:b 9999:r');
  add(false, 'FF:n 3333:b 6666:b 9999:b', 'FF:n 3333:g 6666:r 9999:b');
  for (const n of ['3','6','9']) add(false, `${n}${n}${n}${n}:g DDD:g ${n}${n}${n}${n}:r DDD:r`);
  add(false, 'FFF:n 3333:g 369:r 9999:r');
  for (const n of ['3','6','9']) add(false, `33:g 66:g 99:g ${n}${n}${n}${n}:r ${n}${n}${n}${n}:b`);
  add(true, 'FF:n 333:g D:g 666:r D:r 999:b D:b');
  // Singles & Pairs
  for (let d = 0; d <= 5; d++) add(true, shiftTokenStr('NN:n EW:n SS:n 11:b 22:b 33:b 44:b', d));
  add(true, 'FF:n 2468:g DD:g 2468:r DD:r');
  for (const n of ['3','6','9']) add(true, `336699:g 336699:r ${n}${n}:b`);
  for (let d = 0; d <= 7; d++) add(true, shiftTokenStr('FF:n 11:g 22:g 11:r 22:r 11:b 22:b', d));
  for (const n of ['1','3','5','7','9']) add(true, `11:g 33:g 55:g 77:g 99:g ${n}${n}:r ${n}${n}:b`);
  add(true, 'FF:n 2025:g 2025:r 2025:b');

  return patterns;
})();

function nmjlTileKey(tile: Tile): string {
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

function suitDragon(suit: Suit): string {
  switch (suit) { case 'bam': return 'green'; case 'crak': return 'red'; case 'dot': return 'soap'; }
}

const SUIT_PERMS: [Suit, Suit, Suit][] = [
  ['bam','crak','dot'],['bam','dot','crak'],['crak','bam','dot'],
  ['crak','dot','bam'],['dot','bam','crak'],['dot','crak','bam'],
];

function matchesPattern(
  tileCounts: Map<string, number>, jokerCount: number,
  pattern: NMJLConcretePattern, hasExposures: boolean
): boolean {
  if (pattern.concealed && hasExposures) return false;

  for (const [gSuit, rSuit, bSuit] of SUIT_PERMS) {
    const suitMap: Record<string, Suit> = { g: gSuit, r: rSuit, b: bSuit };

    // Parse tokens into groups, tracking joker eligibility and neutral dragons
    const groups: {
      tileNeeds: Map<string, number>;
      jokerEligible: boolean;
      size: number;
      isNeutralDragon: boolean;
      neutralDragonCount: number;
    }[] = [];
    let hasNeutralDragons = false;
    let valid = true;

    for (const tok of pattern.tokens) {
      if (tok.c === 'o') continue; // skip operators (+, =)
      const text = tok.t;
      const color = tok.c;
      const jokerEligible = isJokerEligibleToken(text);
      const tileNeeds = new Map<string, number>();

      if (/^F+$/.test(text)) {
        tileNeeds.set('flower', text.length);
        groups.push({ tileNeeds, jokerEligible, size: text.length, isNeutralDragon: false, neutralDragonCount: 0 });
        continue;
      }

      if (/^[NEWS]+$/.test(text)) {
        const wm: Record<string, string> = { N: 'north', E: 'east', W: 'west', S: 'south' };
        for (const ch of text) {
          const k = `w_${wm[ch]}`;
          tileNeeds.set(k, (tileNeeds.get(k) || 0) + 1);
        }
        groups.push({ tileNeeds, jokerEligible, size: text.length, isNeutralDragon: false, neutralDragonCount: 0 });
        continue;
      }

      if (/^D+$/.test(text)) {
        if (color === 'n') {
          // Neutral dragon — resolved later by trying all 3 dragon types
          hasNeutralDragons = true;
          groups.push({ tileNeeds, jokerEligible, size: text.length, isNeutralDragon: true, neutralDragonCount: text.length });
          continue;
        }
        const s = suitMap[color];
        if (s) {
          const k = `d_${suitDragon(s)}`;
          tileNeeds.set(k, text.length);
        }
        groups.push({ tileNeeds, jokerEligible, size: text.length, isNeutralDragon: false, neutralDragonCount: 0 });
        continue;
      }

      // Suited tiles (digits, 0 = matching dragon for the suit)
      const suit = suitMap[color];
      if (!suit) { valid = false; break; }
      for (const ch of text) {
        const digit = parseInt(ch);
        if (digit === 0) {
          // 0 represents the dragon matching this suit (not always soap!)
          const k = `d_${suitDragon(suit)}`;
          tileNeeds.set(k, (tileNeeds.get(k) || 0) + 1);
        } else if (digit >= 1 && digit <= 9) {
          const k = `s_${suit}_${digit}`;
          tileNeeds.set(k, (tileNeeds.get(k) || 0) + 1);
        }
      }
      groups.push({ tileNeeds, jokerEligible, size: text.length, isNeutralDragon: false, neutralDragonCount: 0 });
    }

    if (!valid) continue;

    // Verify total tile count = 14
    let totalSize = 0;
    for (const g of groups) totalSize += g.size;
    if (totalSize !== 14) continue;

    // Try all dragon colors for neutral dragon groups
    const dragonOptions: (string | null)[] = hasNeutralDragons ? ['red', 'green', 'soap'] : [null];

    for (const dragonType of dragonOptions) {
      // Separate tile needs into non-joker-eligible (must use real tiles)
      // and joker-eligible (can use jokers for shortfall) buckets
      const noJokerNeeds = new Map<string, number>();
      const jokerAllowedNeeds = new Map<string, number>();

      for (const group of groups) {
        let needs: Map<string, number>;
        if (group.isNeutralDragon && dragonType) {
          needs = new Map<string, number>();
          needs.set(`d_${dragonType}`, group.neutralDragonCount);
        } else {
          needs = group.tileNeeds;
        }

        const targetMap = group.jokerEligible ? jokerAllowedNeeds : noJokerNeeds;
        for (const [key, count] of needs) {
          targetMap.set(key, (targetMap.get(key) || 0) + count);
        }
      }

      // Phase 1: Non-joker-eligible groups must be fully satisfied by real tiles
      const remaining = new Map(tileCounts);
      let feasible = true;
      for (const [key, needed] of noJokerNeeds) {
        const avail = remaining.get(key) || 0;
        if (avail < needed) { feasible = false; break; }
        remaining.set(key, avail - needed);
      }
      if (!feasible) continue;

      // Phase 2: Joker-eligible groups use remaining real tiles first, then jokers
      let jokersNeeded = 0;
      for (const [key, needed] of jokerAllowedNeeds) {
        const avail = remaining.get(key) || 0;
        const used = Math.min(avail, needed);
        remaining.set(key, avail - used);
        jokersNeeded += needed - used;
      }

      if (jokersNeeded <= jokerCount) return true;
    }
  }
  return false;
}

function buildTileCounts(tiles: Tile[]): { counts: Map<string, number>; jokerCount: number } {
  const counts = new Map<string, number>();
  let jokerCount = 0;
  for (const tile of tiles) {
    if (tile.type === 'special' && tile.specialType === 'joker') { jokerCount++; }
    else { const key = nmjlTileKey(tile); counts.set(key, (counts.get(key) || 0) + 1); }
  }
  return { counts, jokerCount };
}

function checkSimpleWin(player: Player): boolean {
  const allTiles = [...player.hand, ...player.exposures.flat()];
  const totalTiles = allTiles.length;
  const hasExposures = player.exposures.length > 0;

  if (totalTiles === 14) {
    const { counts, jokerCount } = buildTileCounts(allTiles);
    for (const pattern of ALL_NMJL_PATTERNS) {
      if (matchesPattern(counts, jokerCount, pattern, hasExposures)) return true;
    }
    return false;
  }

  if (totalTiles === 15) {
    // Try removing each hand tile to find a 14-tile winning combination
    for (let i = 0; i < player.hand.length; i++) {
      const reducedTiles = [
        ...player.hand.slice(0, i), ...player.hand.slice(i + 1),
        ...player.exposures.flat(),
      ];
      const { counts, jokerCount } = buildTileCounts(reducedTiles);
      for (const pattern of ALL_NMJL_PATTERNS) {
        if (matchesPattern(counts, jokerCount, pattern, hasExposures)) return true;
      }
    }
    return false;
  }

  return false;
}

function getTileKey(tile: Tile): string {
  switch (tile.type) {
    case 'suited': return `${tile.suit}_${tile.value}`;
    case 'wind': return `wind_${tile.direction}`;
    case 'dragon': return `dragon_${tile.color}`;
    case 'special': return `special_${tile.specialType}`;
  }
}

function checkSiameseWin(player: Player): boolean {
  return checkSimpleWin(player) && checkSimpleWin({ ...player, hand: player.hand2, exposures: player.exposures2 });
}

export function declareMahJongg(state: GameState, playerIndex: number): GameState {
  if (state.phase !== 'playing') return state;
  // Human must be in the discarding phase (i.e., they have a full hand after drawing)
  if (state.currentPlayerIndex !== playerIndex) return { ...state, message: "It's not your turn." };
  if (state.turnPhase !== 'discarding') return { ...state, message: 'You can only declare Mah Jongg when it is your turn to discard.' };

  const player = state.players[playerIndex];
  const siamese = isSiameseMode(state);

  if (siamese) {
    if (checkSiameseWin(player)) {
      return {
        ...state,
        phase: 'gameOver',
        turnPhase: 'waiting',
        winner: playerIndex,
        selectedTileIndex: null,
        message: player.isHuman
          ? 'Mah Jongg! Both hands complete — You win!'
          : `${player.name} wins with both hands complete!`,
      };
    }
    return { ...state, message: 'Your hands do not form a winning combination yet.' };
  }

  if (checkSimpleWin(player)) {
    return {
      ...state,
      phase: 'gameOver',
      turnPhase: 'waiting',
      winner: playerIndex,
      selectedTileIndex: null,
      message: player.isHuman
        ? 'Mah Jongg! You win!'
        : `${player.name} wins with Mah Jongg!`,
    };
  }

  return { ...state, message: 'Your hand does not form a winning combination yet.' };
}

// ─── AI Turn ────────────────────────────────────────────────────────

/**
 * Evaluate a hand and return the index of the best tile to discard and its score.
 * Lower score = better to discard (less valuable tile).
 */
function evaluateDiscardIndex(hand: Tile[], skill: number): { bestIndex: number; lowestScore: number } {
  if (hand.length === 0) return { bestIndex: -1, lowestScore: Infinity };

  const randomFactor = [20, 10, 2, 0.5, 0.1][skill - 1];
  const groupWeight = [3, 6, 10, 14, 18][skill - 1];
  const protectJokers = skill >= 2;
  const protectPairs = skill >= 3;

  let bestDiscardIndex = 0;
  let lowestScore = Infinity;

  for (let i = 0; i < hand.length; i++) {
    const tile = hand[i];

    if (tile.type === 'special' && tile.specialType === 'joker') {
      if (protectJokers) continue;
    }

    let matchScore = 0;
    for (let j = 0; j < hand.length; j++) {
      if (i === j) continue;
      if (tilesMatch(hand[i], hand[j])) matchScore += groupWeight;
    }

    if (tile.type === 'special' && tile.specialType === 'joker') {
      matchScore += groupWeight * 2;
    }

    if (protectPairs && matchScore > 0 && matchScore <= groupWeight) {
      matchScore += groupWeight * 0.5;
    }

    if (tile.type === 'special' && tile.specialType === 'blank') matchScore -= 5;
    if (tile.type === 'special' && tile.specialType === 'flower') matchScore -= (skill >= 4 ? 1 : 3);

    matchScore += Math.random() * randomFactor;

    if (matchScore < lowestScore) {
      lowestScore = matchScore;
      bestDiscardIndex = i;
    }
  }

  return { bestIndex: bestDiscardIndex, lowestScore };
}

export function aiTurn(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  if (state.turnPhase !== 'discarding') return state;

  const player = state.players[state.currentPlayerIndex];
  if (player.isHuman) return state;

  const skill = state.config.botSkillLevel ?? 3;

  if (isSiameseMode(state)) {
    return siameseAiDiscard(state, player, skill);
  }

  const hand = player.hand;
  if (hand.length === 0) return state;

  const result = evaluateDiscardIndex(hand, skill);
  return discardTile(state, result.bestIndex);
}

/**
 * Siamese AI discard: evaluate both racks and discard the worst tile from either.
 */
function siameseAiDiscard(state: GameState, player: Player, skill: number): GameState {
  const result1 = evaluateDiscardIndex(player.hand, skill);
  const result2 = evaluateDiscardIndex(player.hand2, skill);

  // Discard from whichever rack has the "least valuable" tile
  if (result2.bestIndex >= 0 && (result1.bestIndex < 0 || result2.lowestScore < result1.lowestScore)) {
    return discardTile(state, result2.bestIndex, 2);
  }
  return discardTile(state, result1.bestIndex, 1);
}

/**
 * For Siamese AI: choose which rack to draw to.
 * Prefers the rack with fewer tiles; on tie, picks randomly.
 */
export function siamesePickDrawRack(player: Player): 1 | 2 {
  if (player.hand.length <= player.hand2.length) return 1;
  if (player.hand2.length < player.hand.length) return 2;
  return Math.random() < 0.5 ? 1 : 2;
}

/**
 * Determine whether an AI player should call a discarded tile.
 * Higher skill levels are more strategic about when to call.
 * Returns the group size to call for, or null if the AI should not call.
 */
export function aiShouldCall(state: GameState, playerIndex: number): CallGroupSize | null {
  const options = getCallOptions(state, playerIndex);
  if (options.length === 0) return null;

  const skill = state.config.botSkillLevel ?? 3;

  // Level 1: 40% chance to miss a valid call entirely
  if (skill === 1 && Math.random() < 0.4) return null;
  // Level 2: 15% chance to miss
  if (skill === 2 && Math.random() < 0.15) return null;

  // Higher skill bots prefer larger groups when they have the tiles
  // Lower skill bots always go for the smallest (pung)
  if (skill <= 2) {
    return options[0].size; // Always pung
  }

  // Skill 3+: prefer the largest group that uses mostly real tiles (fewer jokers)
  // Skill 4-5: consider joker economy — don't waste jokers on small groups
  let bestOption = options[0];

  for (const opt of options) {
    if (skill >= 4) {
      // Expert/Master: prefer groups that maximize real-tile usage
      // Don't call for a large group if it burns too many jokers
      const efficiency = opt.matchUsed / opt.size;
      const bestEfficiency = bestOption.matchUsed / bestOption.size;
      if (efficiency >= bestEfficiency && opt.size >= bestOption.size) {
        bestOption = opt;
      }
    } else {
      // Skill 3: prefer largest available group
      if (opt.matchUsed >= bestOption.matchUsed) {
        bestOption = opt;
      }
    }
  }

  return bestOption.size;
}

// ─── Blank Tile Trade ───────────────────────────────────────────────

/**
 * Trade a blank tile from a player's hand with a tile from the discard pool.
 * The blank goes into the discard pool at the same position.
 */
export function blankTrade(state: GameState, blankHandIndex: number, discardPoolIndex: number, rack?: 1 | 2): GameState {
  if (state.phase !== 'playing') return state;

  const player = state.players[0]; // Human player only
  const siamese = isSiameseMode(state);
  const effectiveRack = siamese ? (rack ?? state.activeRack) : 1;
  const hand = effectiveRack === 2 ? player.hand2 : player.hand;
  const blankTile = hand[blankHandIndex];

  // Validate it's actually a blank
  if (!blankTile || blankTile.type !== 'special' || blankTile.specialType !== 'blank') return state;

  // Validate discard pool index
  if (discardPoolIndex < 0 || discardPoolIndex >= state.discardPool.length) return state;

  const selectedTile = state.discardPool[discardPoolIndex];

  // Swap: blank goes to discard pool, selected tile goes to hand
  const newHand = [...hand];
  newHand[blankHandIndex] = selectedTile;

  const newDiscardPool = [...state.discardPool];
  newDiscardPool[discardPoolIndex] = blankTile;

  const handField = effectiveRack === 2 ? 'hand2' : 'hand';
  const newPlayers = state.players.map((p, i) =>
    i === 0 ? { ...p, [handField]: newHand } : p
  );

  return {
    ...state,
    players: newPlayers,
    discardPool: newDiscardPool,
    message: `Traded blank for ${getTileName(selectedTile)}`,
  };
}

// ─── Joker Exchange ─────────────────────────────────────────────────

export interface JokerExchangeOption {
  targetPlayerIndex: number;
  exposureIndex: number;
  jokerIndexInExposure: number;
  jokerTile: Tile;
  matchingHandIndices: number[]; // indices in human hand that could be swapped
  exposureIdentityTile: Tile; // the non-joker tile that defines the exposure's identity
}

/**
 * Find all valid joker exchange opportunities for the human player.
 * A valid exchange: the human has a tile in hand matching the non-joker tiles
 * in any player's exposed set that contains a joker.
 */
export function findValidJokerExchanges(state: GameState): JokerExchangeOption[] {
  if (state.phase !== 'playing') return [];

  const humanHand = state.players[0].hand;
  const exchanges: JokerExchangeOption[] = [];

  for (let pi = 0; pi < state.players.length; pi++) {
    const player = state.players[pi];
    for (let ei = 0; ei < player.exposures.length; ei++) {
      const exposure = player.exposures[ei];

      // Find joker(s) in this exposure
      const jokerEntries = exposure
        .map((t, idx) => ({ tile: t, idx }))
        .filter(({ tile }) => tile.type === 'special' && tile.specialType === 'joker');

      if (jokerEntries.length === 0) continue;

      // Determine what tile type the exposure represents (from non-joker tiles)
      const nonJokerTile = exposure.find(t => !(t.type === 'special' && t.specialType === 'joker'));
      if (!nonJokerTile) continue; // All jokers — can't determine type to match

      // Find matching tiles in human's hand
      const matchingHandIndices: number[] = [];
      for (let hi = 0; hi < humanHand.length; hi++) {
        if (tilesMatch(humanHand[hi], nonJokerTile)) {
          matchingHandIndices.push(hi);
        }
      }

      if (matchingHandIndices.length === 0) continue;

      // Each joker in this exposure is a separate exchange option
      for (const { tile: jokerTile, idx: jokerIdx } of jokerEntries) {
        exchanges.push({
          targetPlayerIndex: pi,
          exposureIndex: ei,
          jokerIndexInExposure: jokerIdx,
          jokerTile,
          matchingHandIndices,
          exposureIdentityTile: nonJokerTile,
        });
      }
    }
  }

  return exchanges;
}

/**
 * Execute a joker exchange: swap a matching tile from human's hand
 * with a joker in a player's exposed set.
 */
export function executeJokerExchange(
  state: GameState,
  targetPlayerIndex: number,
  exposureIndex: number,
  jokerIndexInExposure: number,
  handTileIndex: number,
): GameState {
  if (state.phase !== 'playing') return state;

  const human = state.players[0];
  const target = state.players[targetPlayerIndex];

  // Validate
  if (handTileIndex < 0 || handTileIndex >= human.hand.length) return state;
  if (exposureIndex < 0 || exposureIndex >= target.exposures.length) return state;

  const exposure = target.exposures[exposureIndex];
  if (jokerIndexInExposure < 0 || jokerIndexInExposure >= exposure.length) return state;

  const jokerTile = exposure[jokerIndexInExposure];
  if (jokerTile.type !== 'special' || jokerTile.specialType !== 'joker') return state;

  const handTile = human.hand[handTileIndex];

  // Verify the hand tile matches the exposure's identity
  const nonJokerTile = exposure.find(t => !(t.type === 'special' && t.specialType === 'joker'));
  if (!nonJokerTile || !tilesMatch(handTile, nonJokerTile)) return state;

  // Perform the swap
  // Hand tile goes into the exposure, joker comes to hand
  const newHand = [...human.hand];
  newHand[handTileIndex] = jokerTile; // joker goes into hand

  const newExposure = [...exposure];
  newExposure[jokerIndexInExposure] = handTile; // matching tile replaces joker

  const newExposures = [...target.exposures];
  newExposures[exposureIndex] = newExposure;

  const newPlayers = state.players.map((p, i) => {
    if (i === 0 && i === targetPlayerIndex) {
      // Human exchanging with own exposure
      return { ...p, hand: newHand, exposures: newExposures };
    }
    if (i === 0) {
      return { ...p, hand: newHand };
    }
    if (i === targetPlayerIndex) {
      return { ...p, exposures: newExposures };
    }
    return p;
  });

  return {
    ...state,
    players: newPlayers,
    message: `Exchanged ${getTileName(handTile)} for a Joker from ${target.name}!`,
  };
}

// ─── Charleston Helpers ─────────────────────────────────────────────

export type CharlestonDirection = 'right' | 'across' | 'left';

/**
 * Get the target player index for a directional pass.
 * In 4-player: right=(i+1)%4, across=(i+2)%4, left=(i+3)%4
 * In fewer players: simplified mapping.
 */
export function getPassTarget(from: number, direction: CharlestonDirection, playerCount: number): number {
  if (playerCount === 1) return -1; // swap with wall
  if (playerCount === 2) return from === 0 ? 1 : 0;
  if (playerCount === 3) {
    if (direction === 'right') return (from + 1) % 3;
    if (direction === 'left') return (from + 2) % 3;
    return (from + 1) % 3; // "across" in 3p goes right
  }
  // 4 players
  if (direction === 'right') return (from + 1) % 4;
  if (direction === 'across') return (from + 2) % 4;
  return (from + 3) % 4; // left
}

/**
 * AI selects 3 tiles to pass during Charleston.
 * Strategy: pass tiles that have the fewest matching tiles in hand.
 * Jokers may NEVER be passed during Charleston.
 */
export function aiSelectCharlestonTiles(hand: Tile[]): number[] {
  const scored = hand.map((tile, index) => {
    // Jokers can never be passed
    if (tile.type === 'special' && tile.specialType === 'joker') {
      return { index, score: Infinity };
    }
    let score = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === index) continue;
      if (tilesMatch(tile, hand[j])) score += 10;
    }
    // Blanks are worthless
    if (tile.type === 'special' && tile.specialType === 'blank') score -= 5;
    // Flowers slightly less useful
    if (tile.type === 'special' && tile.specialType === 'flower') score -= 2;
    // Add tiny random factor
    score += Math.random() * 0.5;
    return { index, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, 3).map(s => s.index);
}

/**
 * Execute a charleston pass between players.
 * Returns updated players array.
 */
export function executeCharlestonPass(
  players: Player[],
  fromIndex: number,
  toIndex: number,
  tileIndices: number[],
  direction: CharlestonDirection,
  playerCount: number,
  wall?: Tile[]
): { players: Player[]; wall?: Tile[] } {
  const fromPlayer = players[fromIndex];
  const tilesToPass = tileIndices.map(i => fromPlayer.hand[i]);
  const newFromHand = fromPlayer.hand.filter((_, i) => !tileIndices.includes(i));

  if (toIndex < 0 && wall) {
    // Solo: swap with wall
    const newWall = [...wall];
    const drawn: Tile[] = [];
    for (let i = 0; i < tilesToPass.length && newWall.length > 0; i++) {
      drawn.push(newWall.shift()!);
    }
    // Put passed tiles at end of wall
    newWall.push(...tilesToPass);
    const newPlayers = players.map((p, i) => {
      if (i !== fromIndex) return p;
      return { ...p, hand: [...newFromHand, ...drawn] };
    });
    return { players: newPlayers, wall: newWall };
  }

  const toPlayer = players[toIndex];
  // AI auto-selects tiles to pass back
  const aiIndices = aiSelectCharlestonTiles(toPlayer.hand);
  const aiTilesToPass = aiIndices.map(i => toPlayer.hand[i]);
  const newToHand = toPlayer.hand.filter((_, i) => !aiIndices.includes(i));

  const newPlayers = players.map((p, i) => {
    if (i === fromIndex) {
      return { ...p, hand: [...newFromHand, ...aiTilesToPass] };
    }
    if (i === toIndex) {
      return { ...p, hand: [...newToHand, ...tilesToPass] };
    }
    return p;
  });

  return { players: newPlayers, wall };
}