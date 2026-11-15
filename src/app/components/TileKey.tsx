import React from 'react';
import type { Tile, Suit, WindDirection, DragonColor } from '../types';
import { TileComponent } from './Tile';

// A visual key to the tile set: one row per kind of tile, drawn with the
// real tile faces so players can match what they see on their rack.

const suited = (suit: Suit): Tile[] =>
  [1, 2, 3, 4, 5, 6, 7, 8, 9].map(value => ({ type: 'suited', suit, value, id: `key_${suit}_${value}` }));
const winds: Tile[] = (['north', 'east', 'west', 'south'] as WindDirection[])
  .map(direction => ({ type: 'wind', direction, id: `key_wind_${direction}` }));
const dragons: Tile[] = (['red', 'green', 'soap'] as DragonColor[])
  .map(color => ({ type: 'dragon', color, id: `key_dragon_${color}` }));
const flowers: Tile[] = [1, 2, 3, 4].map(number => ({ type: 'special', specialType: 'flower', number, id: `key_flower_${number}` }));
const jokers: Tile[] = [1, 2].map(number => ({ type: 'special', specialType: 'joker', number, id: `key_joker_${number}` }));
const blank: Tile[] = [{ type: 'special', specialType: 'blank', number: 1, id: 'key_blank' }];

interface KeyRow {
  name: string;
  note: string;
  tiles: Tile[];
  captions?: string[];
}

const ROWS: KeyRow[] = [
  { name: 'Bams', note: 'Numbered 1–9, drawn as sticks. The 1 Bam is the bird.', tiles: suited('bam') },
  { name: 'Craks', note: 'Numbered 1–9, drawn as half-moon shapes.', tiles: suited('crak') },
  { name: 'Dots', note: 'Numbered 1–9, drawn as four-point stars.', tiles: suited('dot') },
  { name: 'Winds', note: 'North, East, West, South — N E W S on the card.', tiles: winds, captions: ['North', 'East', 'West', 'South'] },
  {
    name: 'Dragons', note: 'D on the card. Each dragon belongs to a suit. The White Dragon (Soap) is also the 0, as in 2025.',
    tiles: dragons, captions: ['Red · Craks', 'Green · Bams', 'White · Dots'],
  },
  { name: 'Flowers', note: 'F on the card. Every flower counts as the same tile, whatever its picture.', tiles: flowers },
  { name: 'Jokers', note: 'Wild in a pung, kong or quint (3, 4 or 5 alike). Never in a pair or a single.', tiles: jokers },
];

const BLANK_ROW: KeyRow = {
  name: 'Blanks', note: 'Optional. On your turn, trade one for any discarded tile except a Joker, or discard it.', tiles: blank,
};

export function TileKey({ showBlanks = false, dark = false }: { showBlanks?: boolean; dark?: boolean }) {
  const rows = showBlanks ? [...ROWS, BLANK_ROW] : ROWS;
  const heading = dark ? '#FFFDF7' : '#1B2A4A';
  const body = dark ? 'rgba(255,253,247,0.65)' : '#6B5E4F';
  return (
    <div className="flex flex-col gap-3" style={{ fontFamily: "'Jost', sans-serif" }}>
      {rows.map(row => (
        <div key={row.name}>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="uppercase tracking-[0.1em] shrink-0" style={{ color: heading, fontWeight: 700, fontSize: '0.7rem' }}>
              {row.name}
            </span>
            <span style={{ color: body, fontSize: '0.65rem', lineHeight: 1.35 }}>{row.note}</span>
          </div>
          <div className="flex flex-wrap gap-px">
            {row.tiles.map((tile, i) => (
              <div key={tile.id} className="flex flex-col items-start" style={{ width: row.captions ? 72 : undefined }}>
                <TileComponent tile={tile} size="sm" />
                {row.captions && (
                  <span className="mt-0.5" style={{ color: body, fontSize: '0.55rem', lineHeight: 1.2 }}>
                    {row.captions[i]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
