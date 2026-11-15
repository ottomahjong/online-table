import {
  Tile, Suit, WindDirection, DragonColor, GameConfig, Player, GameState, WinInfo,
  getTileSortKey, tilesMatch, getTileRankSortKey, getTileName
} from './types';
import { ACTIVE_CARD, CARD_MAX_GROUP_SIZE, type CardPattern, type CardSection } from './cards';
import { parseTokenStr } from './cards/expand';
import {
  ALL_PATTERNS, tileKey, isJoker, isJokerEligibleToken, suitDragon, SUIT_PERMS,
  findBestWin, computeAvailability, isBlank, type WinMatch,
} from './handMatcher';
import {
  chooseDiscard, chooseCall, chooseCharlestonPass, chooseCourtesyCount, bestPlanCost, chooseBlankTrade,
} from './aiStrategy';

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
  // Blanks are opt-in. (Older configs implied them from a 160-tile set.)
  const blanksNeeded = config.blankCount ?? Math.max(0, config.totalTiles - 136 - config.jokerCount - config.flowerCount);
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
      rack1Locked: false,
      rack2Locked: false,
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
  // Solo practice starts with 13 tiles so the player can Charleston into a line.
  if (config.playerCount !== 1) {
    // East (player 0) picks one extra = 14 tiles, discards first
    const extraEastTile = wall.shift();
    if (extraEastTile) players[0].hand.push(extraEastTile);
  }

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
    message: config.playerCount === 1
      ? 'Solo Charleston — select 3 tiles to pass out and draw 3 new tiles'
      : 'Charleston — select 3 tiles to pass',
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

export function isRackLocked(player: Player, rack: 1 | 2): boolean {
  return rack === 1 ? player.rack1Locked : player.rack2Locked;
}

function lockRack(player: Player, rack: 1 | 2): Player {
  return rack === 1
    ? { ...player, rack1Locked: true }
    : { ...player, rack2Locked: true };
}

function getPlayableRack(player: Player, preferredRack: 1 | 2 = 1): 1 | 2 {
  if (!isRackLocked(player, preferredRack)) return preferredRack;
  return preferredRack === 1 ? 2 : 1;
}

function checkRackWin(player: Player, rack: 1 | 2): boolean {
  return checkSimpleWin({
    ...player,
    hand: rack === 1 ? player.hand : player.hand2,
    exposures: rack === 1 ? player.exposures : player.exposures2,
    hand2: [],
    exposures2: [],
  });
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
  const toRack: 1 | 2 = fromRack === 1 ? 2 : 1;
  if (isRackLocked(player, fromRack) || isRackLocked(player, toRack)) return state;
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
      const drawRack = getPlayableRack(p, state.activeRack);
      // In Siamese, draw to the active rack
      if (drawRack === 2) {
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
        winInfo: buildWinInfo(state, newPlayers, state.currentPlayerIndex, true, null),
        message: isHuman
          ? 'Mahjong! Both hands complete — You win!'
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
      winInfo: buildWinInfo(state, newPlayers, state.currentPlayerIndex, true, null),
      message: isHuman
        ? 'Mahjong! You win!'
        : `${currentPlayer.name} wins with Mahjong!`,
    };
  }

  return {
    ...state,
    players: newPlayers,
    wall: newWall,
    turnPhase: 'discarding',
    turnSource: 'draw',
    lastCallFrom: null,
    lastActionWasJokerExchange: false,
    selectedTileIndex: null,
    activeRack: siamese ? getPlayableRack(currentPlayer, state.activeRack) : state.activeRack,
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
  const effectiveRack = siamese ? getPlayableRack(player, rack ?? state.activeRack) : 1;
  if (siamese && isRackLocked(player, effectiveRack)) return state;
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
    lastActionWasJokerExchange: false,
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
    activeRack: isSiameseMode(state) ? getPlayableRack(nextPlayer, state.activeRack) : state.activeRack,
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

function getDiscardMahjongRack(state: GameState, playerIndex: number): 1 | 2 | null {
  if (state.phase !== 'playing') return null;
  if (state.turnPhase !== 'calling') return null;
  if (state.lastDiscarded === null) return null;
  if (state.lastDiscardedBy === null || state.lastDiscardedBy === playerIndex) return null;

  const discard = state.lastDiscarded;
  if (isJoker(discard) || isBlank(discard)) return null;

  const player = state.players[playerIndex];
  if (isSiameseMode(state)) {
    const preferredRack = getPlayableRack(player, state.activeRack);
    const rackOrder: (1 | 2)[] = preferredRack === 1 ? [1, 2] : [2, 1];
    for (const rack of rackOrder) {
      if (isRackLocked(player, rack)) continue;
      const candidatePlayer: Player = rack === 1
        ? { ...player, hand: [...player.hand, discard] }
        : { ...player, hand2: [...player.hand2, discard] };
      if (checkRackWin(candidatePlayer, rack)) {
        return rack;
      }
    }
    return null;
  }

  const candidatePlayer: Player = { ...player, hand: [...player.hand, discard] };
  return checkSimpleWin(candidatePlayer) ? 1 : null;
}

export function canClaimMahjongOnDiscard(state: GameState, playerIndex: number): boolean {
  return getDiscardMahjongRack(state, playerIndex) !== null;
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

  // Discarded jokers and blanks are dead: nobody may call them.
  if (isJoker(discard) || isBlank(discard)) {
    return [];
  }

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
    if (size > CARD_MAX_GROUP_SIZE) continue; // e.g. no sextets unless the card has them
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
    } else if (isJoker(player.hand[i])) {
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
      winInfo: buildWinInfo(state, newPlayers, playerIndex, false, state.lastDiscardedBy),
      currentPlayerIndex: playerIndex,
      lastDiscarded: null,
      lastDiscardedBy: null,
      selectedTileIndex: null,
      message: updatedPlayer.isHuman
        ? 'Mahjong! You win!'
        : `${updatedPlayer.name} wins with Mahjong!`,
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
    turnSource: 'call',
    lastCallFrom: state.lastDiscardedBy,
    lastActionWasJokerExchange: false,
    lastDiscarded: null,
    lastDiscardedBy: null,
    selectedTileIndex: null,
    message: updatedPlayer.isHuman
      ? `You called for a ${sizeLabel}! Now discard a tile.`
      : `${updatedPlayer.name} called for a ${sizeLabel}!`,
  };
}

export function claimMahjongOnDiscard(state: GameState, playerIndex: number): GameState {
  const winningRack = getDiscardMahjongRack(state, playerIndex);
  if (winningRack === null) {
    return state;
  }

  const discard = state.lastDiscarded!;
  const player = state.players[playerIndex];
  const updatedPlayer = winningRack === 1
    ? lockRack({ ...player, hand: [...player.hand, discard] }, 1)
    : lockRack({ ...player, hand2: [...player.hand2, discard] }, 2);
  const newPlayers = state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p));

  if (!isSiameseMode(state) || checkSiameseWin(updatedPlayer)) {
    return {
      ...state,
      players: newPlayers,
      discardPool: state.discardPool.slice(0, -1),
      currentPlayerIndex: playerIndex,
      phase: 'gameOver',
      turnPhase: 'waiting',
      winner: playerIndex,
      winInfo: buildWinInfo(state, newPlayers, playerIndex, false, state.lastDiscardedBy),
      lastDiscarded: null,
      lastDiscardedBy: null,
      selectedTileIndex: null,
      message: player.isHuman
        ? 'Mahjong! You claimed the discard and win!'
        : `${player.name} called Mahjong on the discard!`,
    };
  }

  const nextIndex = (playerIndex + 1) % state.config.playerCount;
  return {
    ...state,
    players: newPlayers,
    discardPool: state.discardPool.slice(0, -1),
    currentPlayerIndex: nextIndex,
    turnPhase: 'drawing',
    lastDiscarded: null,
    lastDiscardedBy: null,
    selectedTileIndex: null,
    activeRack: getPlayableRack(updatedPlayer, winningRack === 1 ? 2 : 1),
    message: player.isHuman
      ? `Rack ${winningRack} is locked with Mahjong. Continue building the other rack.`
      : `${player.name} locked rack ${winningRack} with Mahjong.`,
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

export type NMJLConcretePattern = CardPattern;

export interface WinningHandMatch {
  groups: Tile[][];
  pattern: string;
  colorPattern: string;
  concealed: boolean;
  handId: string;
  handLabel: string;
  section: CardSection;
  sectionName: string;
  points: number;
  jokerless: boolean;
  value: number;
}

// Card data and tile keys live in ./cards and ./handMatcher; re-exported here
// so existing imports keep working.
export { parseTokenStr };
export { isJokerEligibleToken, suitDragon, SUIT_PERMS };
export const ALL_NMJL_PATTERNS: NMJLConcretePattern[] = ALL_PATTERNS;
export const nmjlTileKey = tileKey;

function rackTiles(player: Player, rack: 1 | 2): { concealed: Tile[]; exposures: Tile[][] } {
  return rack === 2
    ? { concealed: player.hand2, exposures: player.exposures2 }
    : { concealed: player.hand, exposures: player.exposures };
}

function toWinningHandMatch(m: WinMatch): WinningHandMatch {
  return {
    groups: m.groups,
    pattern: m.variant.groups.map(g => g.text).join(' '),
    colorPattern: m.variant.groups.map(g => `${g.text}:${g.color}`).join(' '),
    concealed: m.pattern.concealed,
    handId: m.pattern.handId,
    handLabel: m.pattern.label,
    section: m.pattern.section,
    sectionName: ACTIVE_CARD.sectionNames[m.pattern.section],
    points: m.pattern.points,
    jokerless: m.jokerless,
    value: m.value,
  };
}

/** The highest-scoring card hand this rack forms (exactly 14 tiles), or null. */
export function findWinningHandMatch(player: Player, rack: 1 | 2 = 1): WinningHandMatch | null {
  const { concealed, exposures } = rackTiles(player, rack);
  const m = findBestWin(concealed, exposures);
  return m ? toWinningHandMatch(m) : null;
}

export function checkSimpleWin(player: Player): boolean {
  const { concealed, exposures } = rackTiles(player, 1);
  const total = concealed.length + exposures.reduce((s, e) => s + e.length, 0);
  if (total === 14) return findBestWin(concealed, exposures) !== null;
  if (total === 15) {
    for (let i = 0; i < concealed.length; i++) {
      const reduced = [...concealed.slice(0, i), ...concealed.slice(i + 1)];
      if (findBestWin(reduced, exposures)) return true;
    }
  }
  return false;
}

/**
 * Score a win. A hand scores its highest line on the card, doubled when
 * jokerless (except Singles & Pairs). Self-drawn: everyone pays double.
 * Won on a discard: the discarder pays double, everyone else pays single.
 */
export function buildWinInfo(
  state: GameState, players: Player[], winnerIndex: number,
  selfDrawn: boolean, discarderIndex: number | null,
): WinInfo | null {
  const winner = players[winnerIndex];
  const racks: (1 | 2)[] = isSiameseMode(state) ? [1, 2] : [1];
  const matches = racks.map(r => findWinningHandMatch(winner, r));
  if (matches.some(m => m === null)) return null;
  const ms = matches as WinningHandMatch[];
  const value = ms.reduce((sum, m) => sum + m.value, 0);
  const payments = players
    .map((_, i) => i)
    .filter(i => i !== winnerIndex)
    .map(i => ({
      playerIndex: i,
      amount: selfDrawn || i === discarderIndex ? value * 2 : value,
    }));
  return {
    winnerIndex,
    handId: ms.map(m => m.handId).join(' + '),
    handLabel: ms.map(m => m.handLabel).join(' + '),
    sectionName: ms.map(m => m.sectionName).join(' + '),
    basePoints: ms.reduce((sum, m) => sum + m.points, 0),
    jokerless: ms.every(m => m.jokerless),
    value,
    selfDrawn,
    discarderIndex: selfDrawn ? null : discarderIndex,
    payments,
    total: payments.reduce((sum, p) => sum + p.amount, 0),
  };
}

function checkSiameseWin(player: Player): boolean {
  return checkSimpleWin(player) && checkSimpleWin({ ...player, hand: player.hand2, exposures: player.exposures2 });
}

export function declareMahjong(state: GameState, playerIndex: number): GameState {
  if (state.phase !== 'playing') return state;
  // Human must be in the discarding phase (i.e., they have a full hand after drawing)
  if (state.currentPlayerIndex !== playerIndex) return { ...state, message: "It's not your turn." };
  if (state.turnPhase !== 'discarding') return { ...state, message: 'You can only declare Mahjong when it is your turn to discard.' };

  const player = state.players[playerIndex];
  const siamese = isSiameseMode(state);
  // A turn that began by calling a discard is a win on that discard, unless the
  // last move was a joker exchange — then it counts as self-drawn.
  const selfDrawn = state.turnSource !== 'call' || !!state.lastActionWasJokerExchange;
  const discarder = selfDrawn ? null : (state.lastCallFrom ?? null);

  if (siamese) {
    const activeRack = getPlayableRack(player, state.activeRack);
    const otherRack: 1 | 2 = activeRack === 1 ? 2 : 1;

    if (checkSiameseWin(player)) {
      return {
        ...state,
        phase: 'gameOver',
        turnPhase: 'waiting',
        winner: playerIndex,
        winInfo: buildWinInfo(state, state.players, playerIndex, selfDrawn, discarder),
        selectedTileIndex: null,
        message: player.isHuman
          ? 'Mahjong! Both hands complete — You win!'
          : `${player.name} wins with both hands complete!`,
      };
    }

    const rackToLock = checkRackWin(player, activeRack)
      ? activeRack
      : (!isRackLocked(player, otherRack) && checkRackWin(player, otherRack) ? otherRack : null);

    if (rackToLock === null) {
      return { ...state, message: 'Neither rack forms a winning combination yet.' };
    }

    const updatedPlayer = lockRack(player, rackToLock);
    const nextIndex = (playerIndex + 1) % state.config.playerCount;
    return {
      ...state,
      players: state.players.map((p, i) => (i === playerIndex ? updatedPlayer : p)),
      currentPlayerIndex: nextIndex,
      turnPhase: 'drawing',
      selectedTileIndex: null,
      activeRack: getPlayableRack(updatedPlayer, otherRack),
      message: player.isHuman
        ? `Rack ${rackToLock} is locked with Mahjong. Build the other rack to win both hands.`
        : `${player.name} locked rack ${rackToLock} with Mahjong.`,
    };
  }

  if (checkSimpleWin(player)) {
    return {
      ...state,
      phase: 'gameOver',
      turnPhase: 'waiting',
      winner: playerIndex,
      winInfo: buildWinInfo(state, state.players, playerIndex, selfDrawn, discarder),
      selectedTileIndex: null,
      message: player.isHuman
        ? 'Mahjong! You win!'
        : `${player.name} wins with Mahjong!`,
    };
  }

  return { ...state, message: 'Your hand does not form a winning combination yet.' };
}

// ─── AI Turn ────────────────────────────────────────────────────────
// Bots plan against the card (see aiStrategy): exchange jokers when that
// doesn't hurt their best plans, declare Mahjong when complete, otherwise
// discard the tile their plans need least.

/** Swap naturals for exposed jokers while that keeps or improves the bot's best plan. */
function aiExchangeJokers(state: GameState, playerIndex: number): GameState {
  let current = state;
  for (let guard = 0; guard < 6; guard++) {
    const player = current.players[playerIndex];
    const avail = computeAvailability(current, playerIndex);
    const before = bestPlanCost(player.hand, player.exposures, avail);
    const options = findValidJokerExchanges(current, playerIndex);
    let applied = false;
    for (const opt of options) {
      for (const hi of opt.matchingHandIndices) {
        const next = executeJokerExchange(current, opt.targetPlayerIndex, opt.exposureIndex, opt.jokerIndexInExposure, hi, playerIndex);
        if (next === current) continue;
        const np = next.players[playerIndex];
        const after = bestPlanCost(np.hand, np.exposures, computeAvailability(next, playerIndex));
        if (after <= before) { current = next; applied = true; break; }
      }
      if (applied) break;
    }
    if (!applied) break;
  }
  return current;
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

  let current = aiExchangeJokers(state, state.currentPlayerIndex);
  current = aiTradeBlanks(current, current.currentPlayerIndex);
  if (current !== state && checkSimpleWin(current.players[current.currentPlayerIndex])) {
    const won = declareMahjong(current, current.currentPlayerIndex);
    if (won.phase === 'gameOver') return won;
  }

  const me = current.players[current.currentPlayerIndex];
  if (me.hand.length === 0) return current;
  const choice = chooseDiscard(me.hand, me.exposures, computeAvailability(current, current.currentPlayerIndex), skill);
  if (!choice) return current;
  return discardTile(current, choice.index);
}

/** Siamese: discard from whichever unlocked rack gives up the least. */
function siameseAiDiscard(state: GameState, player: Player, skill: number): GameState {
  const avail = computeAvailability(state, state.currentPlayerIndex);
  const picks: { rack: 1 | 2; index: number; delta: number }[] = [];
  for (const rack of [1, 2] as const) {
    if (isRackLocked(player, rack)) continue;
    const hand = rack === 1 ? player.hand : player.hand2;
    const exps = rack === 1 ? player.exposures : player.exposures2;
    const c = chooseDiscard(hand, exps, avail, skill);
    if (c) picks.push({ rack, index: c.index, delta: c.delta });
  }
  if (picks.length === 0) return state;
  picks.sort((a, b) => a.delta - b.delta);
  return discardTile(state, picks[0].index, picks[0].rack);
}

/**
 * For Siamese AI: choose which rack to draw to.
 * Prefers the rack with fewer tiles; on tie, picks randomly.
 */
export function siamesePickDrawRack(player: Player): 1 | 2 {
  if (player.rack1Locked) return 2;
  if (player.rack2Locked) return 1;
  if (player.hand.length <= player.hand2.length) return 1;
  if (player.hand2.length < player.hand.length) return 2;
  return Math.random() < 0.5 ? 1 : 2;
}

/**
 * Should a bot call the current discard for an exposure? Returns the group
 * size, or null. Bots call only when the exposure fits a live, exposable plan
 * on the card and brings it at least a tile closer.
 */
export function aiShouldCall(state: GameState, playerIndex: number): CallGroupSize | null {
  const options = getCallOptions(state, playerIndex);
  if (options.length === 0 || !state.lastDiscarded) return null;
  const player = state.players[playerIndex];
  const size = chooseCall(
    player.hand, player.exposures, state.lastDiscarded, options,
    computeAvailability(state, playerIndex), state.config.botSkillLevel ?? 3,
  );
  return size as CallGroupSize | null;
}

export type HumanClaim =
  | null
  | { kind: 'mahjong' }
  | { kind: 'expose'; size: CallGroupSize };

/**
 * Resolve everyone's claims on the current discard. Mahjong beats any
 * exposure; between equal claims, whoever is next in turn after the
 * discarder wins. The human (player 0) is never claimed for automatically —
 * their choice is `humanClaim` (null = pass).
 */
export function resolveDiscardClaims(state: GameState, humanClaim: HumanClaim = null): GameState {
  if (state.phase !== 'playing' || state.turnPhase !== 'calling') return state;
  if (state.lastDiscardedBy === null) return passTurn(state);

  const n = state.config.playerCount;
  const order: number[] = [];
  for (let offset = 1; offset < n; offset++) order.push((state.lastDiscardedBy + offset) % n);

  const outranked = (next: GameState, who: number): GameState => {
    if (!humanClaim || who === 0) return next;
    const name = state.players[who].name;
    const why = next.phase === 'gameOver'
      ? `${name} claimed it for Mahjong, which beats any other call.`
      : `${name} is ahead of you in turn order, so their call came first.`;
    return { ...next, message: `${next.message} ${why}` };
  };

  for (const i of order) {
    const p = state.players[i];
    if (p.isHuman) {
      if (humanClaim?.kind === 'mahjong' && canClaimMahjongOnDiscard(state, i)) return claimMahjongOnDiscard(state, i);
      continue;
    }
    if (canClaimMahjongOnDiscard(state, i)) return outranked(claimMahjongOnDiscard(state, i), i);
  }

  for (const i of order) {
    const p = state.players[i];
    if (p.isHuman) {
      if (humanClaim?.kind === 'expose' && getCallOptions(state, i).some(o => o.size === humanClaim.size)) {
        return callTile(state, i, humanClaim.size);
      }
      continue;
    }
    const size = aiShouldCall(state, i);
    if (size !== null) return outranked(callTile(state, i, size), i);
  }

  return passTurn(state);
}

// ─── Blank Tile Trade ───────────────────────────────────────────────

/** Can this discarded tile be taken with a blank? Any natural tile — never a joker or another blank. */
export function canTakeWithBlank(tile: Tile): boolean {
  return !isJoker(tile) && !isBlank(tile);
}

/**
 * Trade a blank from a player's hand for a tile in the discard pool. Only on
 * that player's own turn (after drawing or calling). The blank takes the
 * tile's place in the pool. Jokers and blanks in the pool cannot be taken.
 */
export function blankTrade(
  state: GameState, blankHandIndex: number, discardPoolIndex: number, rack?: 1 | 2, playerIndex = 0,
): GameState {
  if (state.phase !== 'playing') return state;
  if (state.currentPlayerIndex !== playerIndex || state.turnPhase !== 'discarding') return state;

  const player = state.players[playerIndex];
  const siamese = isSiameseMode(state);
  const effectiveRack = siamese ? (rack ?? state.activeRack) : 1;
  if (siamese && isRackLocked(player, effectiveRack)) return state;
  const hand = effectiveRack === 2 ? player.hand2 : player.hand;
  const blankTile = hand[blankHandIndex];
  if (!blankTile || !isBlank(blankTile)) return state;

  if (discardPoolIndex < 0 || discardPoolIndex >= state.discardPool.length) return state;
  const selectedTile = state.discardPool[discardPoolIndex];
  if (!canTakeWithBlank(selectedTile)) {
    return player.isHuman
      ? { ...state, message: isJoker(selectedTile) ? 'A blank cannot pick up a discarded Joker.' : 'A blank cannot be traded for another blank.' }
      : state;
  }

  const newHand = [...hand];
  newHand[blankHandIndex] = selectedTile;
  const newDiscardPool = [...state.discardPool];
  newDiscardPool[discardPoolIndex] = blankTile;

  const handField = effectiveRack === 2 ? 'hand2' : 'hand';
  const newPlayers = state.players.map((p, i) =>
    i === playerIndex ? { ...p, [handField]: newHand } : p
  );

  return {
    ...state,
    players: newPlayers,
    discardPool: newDiscardPool,
    selectedTileIndex: null,
    lastActionWasJokerExchange: false,
    message: player.isHuman
      ? `Traded your blank for ${getTileName(selectedTile)}. Now discard a tile.`
      : `${player.name} traded a blank for ${getTileName(selectedTile)}.`,
  };
}

/** Bots: trade blanks for discards that bring their best hand closer. */
function aiTradeBlanks(state: GameState, playerIndex: number): GameState {
  let current = state;
  for (let guard = 0; guard < 8; guard++) {
    const p = current.players[playerIndex];
    const choice = chooseBlankTrade(p.hand, p.exposures, current.discardPool, computeAvailability(current, playerIndex));
    if (!choice) break;
    const next = blankTrade(current, choice.handIndex, choice.poolIndex, undefined, playerIndex);
    if (next === current) break;
    current = next;
  }
  return current;
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
 * Joker exchanges open to a player. Only on their own turn, after drawing or
 * calling (turnPhase 'discarding'); they swap a natural from hand for a joker
 * in any player's exposure made of that natural.
 */
export function findValidJokerExchanges(state: GameState, playerIndex = 0): JokerExchangeOption[] {
  if (state.phase !== 'playing') return [];
  if (state.currentPlayerIndex !== playerIndex || state.turnPhase !== 'discarding') return [];

  const hand = state.players[playerIndex].hand;
  const exchanges: JokerExchangeOption[] = [];

  for (let pi = 0; pi < state.players.length; pi++) {
    const owner = state.players[pi];
    for (let ei = 0; ei < owner.exposures.length; ei++) {
      const exposure = owner.exposures[ei];
      const jokerEntries = exposure
        .map((t, idx) => ({ tile: t, idx }))
        .filter(({ tile }) => isJoker(tile));
      if (jokerEntries.length === 0) continue;

      const nonJokerTile = exposure.find(t => !isJoker(t));
      if (!nonJokerTile) continue;

      const matchingHandIndices: number[] = [];
      for (let hi = 0; hi < hand.length; hi++) {
        if (tilesMatch(hand[hi], nonJokerTile)) matchingHandIndices.push(hi);
      }
      if (matchingHandIndices.length === 0) continue;

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

/** Swap a natural from `playerIndex`'s hand for a joker in an exposure. */
export function executeJokerExchange(
  state: GameState,
  targetPlayerIndex: number,
  exposureIndex: number,
  jokerIndexInExposure: number,
  handTileIndex: number,
  playerIndex = 0,
): GameState {
  if (state.phase !== 'playing') return state;
  if (state.currentPlayerIndex !== playerIndex || state.turnPhase !== 'discarding') return state;

  const actor = state.players[playerIndex];
  const target = state.players[targetPlayerIndex];
  if (handTileIndex < 0 || handTileIndex >= actor.hand.length) return state;
  if (exposureIndex < 0 || exposureIndex >= target.exposures.length) return state;

  const exposure = target.exposures[exposureIndex];
  if (jokerIndexInExposure < 0 || jokerIndexInExposure >= exposure.length) return state;
  const jokerTile = exposure[jokerIndexInExposure];
  if (!isJoker(jokerTile)) return state;

  const handTile = actor.hand[handTileIndex];
  const nonJokerTile = exposure.find(t => !isJoker(t));
  if (!nonJokerTile || !tilesMatch(handTile, nonJokerTile)) return state;

  const newHand = [...actor.hand];
  newHand[handTileIndex] = jokerTile;
  const newExposure = [...exposure];
  newExposure[jokerIndexInExposure] = handTile;
  const newExposures = [...target.exposures];
  newExposures[exposureIndex] = newExposure;

  const newPlayers = state.players.map((p, i) => {
    if (i === playerIndex && i === targetPlayerIndex) return { ...p, hand: newHand, exposures: newExposures };
    if (i === playerIndex) return { ...p, hand: newHand };
    if (i === targetPlayerIndex) return { ...p, exposures: newExposures };
    return p;
  });

  return {
    ...state,
    players: newPlayers,
    lastActionWasJokerExchange: true,
    message: actor.isHuman
      ? `Exchanged ${getTileName(handTile)} for a Joker from ${target.name}!`
      : `${actor.name} exchanged ${getTileName(handTile)} for a Joker from ${target.name}.`,
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
 * AI selects tiles to pass during the Charleston: the ones its plans on the
 * card need least. Jokers may never be passed.
 */
export function aiSelectCharlestonTiles(hand: Tile[], count = 3, skill = 3): number[] {
  return chooseCharlestonPass(hand, count, undefined, skill);
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

// ─── Simultaneous Charleston ────────────────────────────────────────

export interface CharlestonRoundResult {
  players: Player[];
  wall?: Tile[];
  /** Tiles the human kept from what was passed to them. */
  humanReceived: Tile[];
  /** Tiles the human blind-passed on without seeing them. */
  blindForwarded: number;
}

/**
 * One Charleston pass, as at a real table: every player passes three tiles in
 * the same direction at once, so the human receives from the player on the
 * other side (passing right, you receive from your left).
 *
 * On the last pass of each Charleston (`blindAllowed`) the human may choose
 * fewer than three: the rest are taken unseen from the tiles being passed to
 * them and sent on ("blind pass"). Jokers may never be passed.
 */
export function executeCharlestonRound(
  players: Player[],
  humanIndices: number[],
  direction: CharlestonDirection,
  playerCount: number,
  wall?: Tile[],
  opts: { blindAllowed?: boolean; skill?: number; rng?: () => number } = {},
): CharlestonRoundResult {
  const human = players[0];
  const unchanged: CharlestonRoundResult = { players, wall, humanReceived: [], blindForwarded: 0 };
  if (humanIndices.some(i => !human.hand[i] || isJoker(human.hand[i]) || isBlank(human.hand[i]))) return unchanged;
  if (humanIndices.length > 3) return unchanged;
  if (humanIndices.length < 3 && !(opts.blindAllowed && playerCount >= 3)) return unchanged;

  if (playerCount <= 2) {
    const toIndex = getPassTarget(0, direction, playerCount);
    const before = new Set(human.hand.map(t => t.id));
    const r = executeCharlestonPass(players, 0, toIndex, humanIndices, direction, playerCount, wall);
    return { players: r.players, wall: r.wall, humanReceived: r.players[0].hand.filter(t => !before.has(t.id)), blindForwarded: 0 };
  }

  const rng = opts.rng ?? Math.random;
  const skill = opts.skill ?? 3;
  const outgoing: Tile[][] = players.map((p, i) => {
    if (i === 0) return humanIndices.map(idx => p.hand[idx]);
    return aiSelectCharlestonTiles(p.hand, 3, skill).map(idx => p.hand[idx]);
  });

  const source = (i: number) => players.findIndex((_, j) => getPassTarget(j, direction, playerCount) === i);
  let humanIncoming = [...outgoing[source(0)]];
  let blindForwarded = 0;
  if (outgoing[0].length < 3) {
    const need = 3 - outgoing[0].length;
    const forwarded: Tile[] = [];
    for (let k = 0; k < need && humanIncoming.length > 0; k++) {
      const pick = Math.floor(rng() * humanIncoming.length);
      forwarded.push(humanIncoming[pick]);
      humanIncoming = humanIncoming.filter((_, idx) => idx !== pick);
    }
    outgoing[0] = [...outgoing[0], ...forwarded];
    blindForwarded = forwarded.length;
  }

  const newPlayers = players.map((p, i) => {
    const sentIds = new Set(i === 0 ? humanIndices.map(idx => p.hand[idx].id) : outgoing[i].map(t => t.id));
    const kept = p.hand.filter(t => !sentIds.has(t.id));
    const incoming = i === 0 ? humanIncoming : outgoing[source(i)];
    return { ...p, hand: [...kept, ...incoming] };
  });

  return { players: newPlayers, wall, humanReceived: humanIncoming, blindForwarded };
}

export interface CourtesyResult {
  players: Player[];
  wall?: Tile[];
  /** How many tiles the human actually exchanged (the smaller of the two offers). */
  exchanged: number;
  partnerIndex: number;
}

/**
 * Courtesy pass: each player names 0–3 tiles to trade with the player across;
 * each pair trades the smaller of their two numbers. The human's selection is
 * their offer; bots offer only their true deadweight.
 */
export function executeCourtesyPass(
  players: Player[],
  humanIndices: number[],
  playerCount: number,
  wall?: Tile[],
  skill = 3,
): CourtesyResult {
  const partner = getPassTarget(0, 'across', playerCount);
  if (humanIndices.some(i => !players[0].hand[i] || isJoker(players[0].hand[i]) || isBlank(players[0].hand[i])) || humanIndices.length > 3) {
    return { players, wall, exchanged: 0, partnerIndex: partner };
  }
  if (partner < 0) {
    if (humanIndices.length === 0) return { players, wall, exchanged: 0, partnerIndex: partner };
    const r = executeCharlestonPass(players, 0, partner, humanIndices, 'across', playerCount, wall);
    return { players: r.players, wall: r.wall, exchanged: humanIndices.length, partnerIndex: partner };
  }

  const offer = (i: number) => chooseCourtesyCount(players[i].hand, undefined, skill);
  const pairs: [number, number][] = [[0, partner]];
  if (playerCount === 4) pairs.push([1, 3]);

  let next = players.map(p => ({ ...p, hand: [...p.hand] }));
  let exchanged = 0;
  for (const [a, b] of pairs) {
    const countA = a === 0 ? humanIndices.length : offer(a);
    const count = Math.min(countA, offer(b));
    if (a === 0) exchanged = count;
    if (count === 0) continue;
    const pick = (i: number) => (i === 0
      ? humanIndices.slice(0, count).map(idx => next[0].hand[idx])
      : aiSelectCharlestonTiles(next[i].hand, count, skill).map(idx => next[i].hand[idx]));
    const fromA = pick(a), fromB = pick(b);
    const idsA = new Set(fromA.map(t => t.id)), idsB = new Set(fromB.map(t => t.id));
    next = next.map((p, i) => {
      if (i === a) return { ...p, hand: [...p.hand.filter(t => !idsA.has(t.id)), ...fromB] };
      if (i === b) return { ...p, hand: [...p.hand.filter(t => !idsB.has(t.id)), ...fromA] };
      return p;
    });
  }
  return { players: next, wall, exchanged, partnerIndex: partner };
}
