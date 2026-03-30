export type Suit = 'bam' | 'crak' | 'dot';
export type WindDirection = 'north' | 'east' | 'west' | 'south';
export type DragonColor = 'red' | 'green' | 'soap';
export type SpecialType = 'flower' | 'joker' | 'blank';

export interface SuitedTile {
  type: 'suited';
  suit: Suit;
  value: number; // 1-9
  id: string;
}

export interface WindTile {
  type: 'wind';
  direction: WindDirection;
  id: string;
}

export interface DragonTile {
  type: 'dragon';
  color: DragonColor;
  id: string;
}

export interface SpecialTile {
  type: 'special';
  specialType: SpecialType;
  number: number;
  id: string;
}

export type Tile = SuitedTile | WindTile | DragonTile | SpecialTile;

export interface Player {
  id: number;
  name: string;
  hand: Tile[];
  exposures: Tile[][];
  hand2: Tile[];        // Second rack (Siamese/2-player only; empty otherwise)
  exposures2: Tile[][];  // Second rack exposures (Siamese/2-player only)
  rack1Locked: boolean;
  rack2Locked: boolean;
  isHuman: boolean;
  seatWind: WindDirection;
}

export interface GameConfig {
  playerCount: 1 | 2 | 3 | 4;
  jokerCount: 8 | 10 | 12;
  flowerCount: 8 | 10 | 12;
  totalTiles: 152 | 160;
  botSkillLevel: 1 | 2 | 3 | 4 | 5;
  tipsEnabled: boolean;
}

export type GamePhase = 'setup' | 'dealing' | 'playing' | 'charleston' | 'gameOver';
export type TurnPhase = 'drawing' | 'discarding' | 'calling' | 'waiting';

export interface GameState {
  config: GameConfig;
  players: Player[];
  wall: Tile[];
  discardPool: Tile[];
  currentPlayerIndex: number;
  phase: GamePhase;
  turnPhase: TurnPhase;
  lastDiscarded: Tile | null;
  lastDiscardedBy: number | null;
  message: string;
  winner: number | null;
  selectedTileIndex: number | null;
  activeRack: 1 | 2; // Which rack is active (Siamese 2-player mode)
}

export function getTileName(tile: Tile): string {
  switch (tile.type) {
    case 'suited':
      return `${tile.value} ${tile.suit.charAt(0).toUpperCase() + tile.suit.slice(1)}`;
    case 'wind':
      return `${tile.direction.charAt(0).toUpperCase() + tile.direction.slice(1)} Wind`;
    case 'dragon':
      return `${tile.color.charAt(0).toUpperCase() + tile.color.slice(1)} Dragon`;
    case 'special':
      return `${tile.specialType.charAt(0).toUpperCase() + tile.specialType.slice(1)} ${tile.number}`;
  }
}

export function tilesMatch(a: Tile, b: Tile): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'suited' && b.type === 'suited') {
    return a.suit === b.suit && a.value === b.value;
  }
  if (a.type === 'wind' && b.type === 'wind') {
    return a.direction === b.direction;
  }
  if (a.type === 'dragon' && b.type === 'dragon') {
    return a.color === b.color;
  }
  if (a.type === 'special' && b.type === 'special') {
    return a.specialType === b.specialType;
  }
  return false;
}

export function getTileSortKey(tile: Tile): string {
  switch (tile.type) {
    case 'suited':
      return `1_${tile.suit}_${tile.value.toString().padStart(2, '0')}`;
    case 'wind':
      const windOrder = { east: 1, south: 2, west: 3, north: 4 };
      return `2_wind_${windOrder[tile.direction]}`;
    case 'dragon':
      const dragonOrder = { red: 1, green: 2, soap: 3 };
      return `3_dragon_${dragonOrder[tile.color]}`;
    case 'special':
      const specialOrder = { flower: 1, joker: 2, blank: 3 };
      return `4_${specialOrder[tile.specialType]}_${tile.number.toString().padStart(2, '0')}`;
  }
}

export function getTileRankSortKey(tile: Tile): string {
  switch (tile.type) {
    case 'suited':
      const suitOrder = { bam: 1, crak: 2, dot: 3 };
      return `${tile.value.toString().padStart(2, '0')}_${suitOrder[tile.suit]}`;
    case 'wind':
      const windOrder = { east: 1, south: 2, west: 3, north: 4 };
      return `10_${windOrder[tile.direction]}`;
    case 'dragon':
      const dragonOrder = { red: 1, green: 2, soap: 3 };
      return `11_${dragonOrder[tile.color]}`;
    case 'special':
      const specialOrder = { flower: 1, joker: 2, blank: 3 };
      return `12_${specialOrder[tile.specialType]}_${tile.number.toString().padStart(2, '0')}`;
  }
}
