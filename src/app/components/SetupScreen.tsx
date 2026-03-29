import React, { useState, useMemo } from 'react';
import { GameConfig } from '../types';
import { TileComponent, TileBack } from './Tile';
import type { Tile as TileType } from '../types';

interface SetupScreenProps {
  onStartGame: (config: GameConfig) => void;
}

const sampleTiles: TileType[] = [
  { type: 'suited', suit: 'bam', value: 1, id: 'sample_bam1' },
  { type: 'suited', suit: 'crak', value: 5, id: 'sample_crak5' },
  { type: 'suited', suit: 'dot', value: 9, id: 'sample_dot9' },
  { type: 'wind', direction: 'north', id: 'sample_north' },
  { type: 'dragon', color: 'red', id: 'sample_red' },
  { type: 'special', specialType: 'joker', number: 1, id: 'sample_joker' },
  { type: 'special', specialType: 'flower', number: 1, id: 'sample_flower' },
];

export function SetupScreen({ onStartGame }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState<1 | 2 | 3 | 4>(4);
  const [jokerCount, setJokerCount] = useState<8 | 10 | 12>(8);
  const [flowerCount, setFlowerCount] = useState<8 | 10 | 12>(8);
  const [totalTiles, setTotalTiles] = useState<152 | 160>(152);
  const [botSkillLevel, setBotSkillLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [tipsEnabled, setTipsEnabled] = useState(false);

  const blanksNeeded = useMemo(() => {
    const base = 136;
    return Math.max(0, totalTiles - base - jokerCount - flowerCount);
  }, [totalTiles, jokerCount, flowerCount]);

  const isValid = useMemo(() => {
    return (136 + jokerCount + flowerCount) <= totalTiles;
  }, [totalTiles, jokerCount, flowerCount]);

  const handleStart = () => {
    if (!isValid) return;
    onStartGame({ playerCount, jokerCount, flowerCount, totalTiles, botSkillLevel, tipsEnabled });
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F0E6', fontFamily: "'Jost', sans-serif" }}>
      {/* Header */}
      <header className="py-8 text-center" style={{ background: 'linear-gradient(180deg, #FFFDF7 0%, #F5F0E6 100%)' }}>
        <div className="flex items-center justify-center gap-4 mb-3">
          <Starburst />
          <span style={{
            color: '#1B2A4A',
            fontFamily: "'Futura', 'Trebuchet MS', sans-serif",
            fontSize: '1.85rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}>
            Otto Online
          </span>
          <Starburst />
        </div>
        <p className="tracking-[0.3em] uppercase" style={{ color: '#B5704F', fontSize: '0.75rem', fontWeight: 600 }}>
          Online American Mahjong Practice
        </p>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 py-8 max-w-3xl mx-auto w-full">
        {/* Tile Preview */}
        <div className="flex items-center gap-2 mb-8 flex-wrap justify-center">
          {sampleTiles.map((tile) => (
            <TileComponent key={tile.id} tile={tile} size="lg" />
          ))}
          <TileBack size="lg" />
        </div>

        {/* Setup Card */}
        <div className="w-full rounded-lg border p-6 md:p-8" style={{
          background: '#FFFDF7',
          borderColor: 'rgba(27, 42, 74, 0.1)',
          boxShadow: '0 4px 24px rgba(27, 42, 74, 0.08)',
        }}>
          <h2 className="text-center mb-6 tracking-[0.1em] uppercase" style={{
            fontFamily: "'Jost', sans-serif",
            color: '#1B2A4A',
            fontSize: '1.25rem',
            fontWeight: 600,
          }}>
            Game Settings
          </h2>

          {/* Player Count */}
          <SettingRow label="Players">
            <OptionGroup
              options={[1, 2, 3, 4]}
              value={playerCount}
              onChange={(v) => setPlayerCount(v as 1 | 2 | 3 | 4)}
              labels={['Solo', '2 Players', '3 Players', '4 Players']}
            />
          </SettingRow>

          {/* Total Tiles */}
          <SettingRow label="Tile Set">
            <OptionGroup
              options={[152, 160]}
              value={totalTiles}
              onChange={(v) => setTotalTiles(v as 152 | 160)}
              labels={['152 Tiles', '160 Tiles']}
            />
          </SettingRow>

          {/* Joker Count */}
          <SettingRow label="Jokers">
            <OptionGroup
              options={[8, 10, 12]}
              value={jokerCount}
              onChange={(v) => setJokerCount(v as 8 | 10 | 12)}
              labels={['8 Jokers', '10 Jokers', '12 Jokers']}
            />
          </SettingRow>

          {/* Flower Count */}
          <SettingRow label="Flowers">
            <OptionGroup
              options={[8, 10, 12]}
              value={flowerCount}
              onChange={(v) => setFlowerCount(v as 8 | 10 | 12)}
              labels={['8 Flowers', '10 Flowers', '12 Flowers']}
            />
          </SettingRow>

          {/* Bot Skill Level */}
          <SettingRow label="Bot Skill Level">
            <OptionGroup
              options={[1, 2, 3, 4, 5]}
              value={botSkillLevel}
              onChange={(v) => setBotSkillLevel(v as 1 | 2 | 3 | 4 | 5)}
              labels={['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master']}
            />
            <p className="mt-1.5" style={{ color: '#8B9D83', fontSize: '0.7rem', lineHeight: 1.4 }}>
              {{
                1: 'Bots play loosely — they may miss calls and sometimes discard valuable tiles, even Jokers.',
                2: 'Bots play casually — they make decent decisions but occasionally miss opportunities.',
                3: 'Bots play solidly — they protect pairs, keep Jokers, and call reliably.',
                4: 'Bots play sharply — they value Joker economy and make precise discard decisions.',
                5: 'Bots play masterfully — near-optimal tile evaluation with minimal randomness.',
              }[botSkillLevel]}
            </p>
          </SettingRow>

          {/* New Player Tips */}
          <SettingRow label="New Player Tips">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setTipsEnabled(!tipsEnabled)}
                className="relative rounded-full transition-all"
                style={{
                  width: 48,
                  height: 26,
                  background: tipsEnabled ? '#2D6A4F' : 'rgba(27, 42, 74, 0.15)',
                  cursor: 'pointer',
                  border: 'none',
                  padding: 0,
                }}
              >
                <div
                  className="absolute top-0.5 rounded-full transition-all"
                  style={{
                    width: 22,
                    height: 22,
                    background: '#FFFDF7',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    left: tipsEnabled ? 24 : 2,
                    transition: 'left 0.2s ease',
                  }}
                />
              </button>
              <span style={{
                color: tipsEnabled ? '#2D6A4F' : '#6B5E4F',
                fontSize: '0.8rem',
                fontWeight: tipsEnabled ? 600 : 400,
                fontFamily: "'Jost', sans-serif",
              }}>
                {tipsEnabled ? 'Tips On' : 'Tips Off'}
              </span>
            </div>
            <p className="mt-1.5" style={{ color: '#8B9D83', fontSize: '0.7rem', lineHeight: 1.4 }}>
              {tipsEnabled
                ? 'Helpful hints are active! The call timer is extended to 20 seconds, and action buttons will glow when key plays are available — like Joker Exchanges you might miss.'
                : 'Turn on tips for guided hints during gameplay. Great for learning American Mahjong!'}
            </p>
          </SettingRow>

          {/* Summary */}
          <div className="mt-6 p-4 rounded-md" style={{ background: '#F5F0E6' }}>
            <div className="flex flex-wrap justify-between gap-2" style={{ fontSize: '0.85rem' }}>
              <span style={{ color: '#6B5E4F' }}>
                Suited & Honor Tiles: <strong style={{ color: '#1B2A4A' }}>136</strong>
              </span>
              <span style={{ color: '#6B5E4F' }}>
                Jokers: <strong style={{ color: '#1B2A4A' }}>{jokerCount}</strong>
              </span>
              <span style={{ color: '#6B5E4F' }}>
                Flowers: <strong style={{ color: '#1B2A4A' }}>{flowerCount}</strong>
              </span>
              <span style={{ color: '#6B5E4F' }}>
                Blanks: <strong style={{ color: '#1B2A4A' }}>{blanksNeeded}</strong>
              </span>
              <span style={{ color: '#6B5E4F' }}>
                Total: <strong style={{ color: isValid ? '#2D6A4F' : '#C4453E' }}>
                  {136 + jokerCount + flowerCount + blanksNeeded} / {totalTiles}
                </strong>
              </span>
            </div>
            {!isValid && (
              <p className="mt-2" style={{ color: '#C4453E', fontSize: '0.8rem' }}>
                Too many special tiles for the selected set size. Please reduce jokers or flowers, or increase the tile set.
              </p>
            )}
          </div>

          {/* Start Button */}
          <div className="flex justify-center mt-8">
            <button
              onClick={handleStart}
              disabled={!isValid}
              className="px-8 py-3 rounded-md transition-all uppercase tracking-[0.2em]"
              style={{
                background: isValid ? '#B5704F' : '#ccc',
                color: '#FFFDF7',
                fontFamily: "'Jost', sans-serif",
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: isValid ? 'pointer' : 'not-allowed',
                boxShadow: isValid ? '0 4px 12px rgba(181, 112, 79, 0.3)' : 'none',
              }}
            >
              Start Game
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="w-full mt-8 p-6 rounded-lg" style={{ background: 'rgba(27, 42, 74, 0.04)', border: '1px solid rgba(27, 42, 74, 0.08)' }}>
          <h3 className="mb-3 tracking-[0.1em] uppercase" style={{
            fontFamily: "'Jost', sans-serif",
            color: '#1B2A4A',
            fontSize: '1rem',
            fontWeight: 600,
          }}>
            How to Play
          </h3>
          <div className="space-y-2" style={{ color: '#6B5E4F', fontSize: '0.85rem', lineHeight: 1.6 }}>
            <p><strong style={{ color: '#1B2A4A' }}>Goal:</strong> Be the first to complete a winning hand of matched sets (Pungs, Kongs, Quints) and pairs.</p>
            <p><strong style={{ color: '#1B2A4A' }}>Drawing:</strong> On your turn, draw a tile from the wall and discard one you don't need.</p>
            <p><strong style={{ color: '#1B2A4A' }}>Calling:</strong> When an opponent discards, you can "Call" to claim the tile if you have matching tiles to make an exposure.</p>
            <p><strong style={{ color: '#1B2A4A' }}>Jokers:</strong> Jokers are wild and can substitute for any tile in a group of 3 or more.</p>
            <p><strong style={{ color: '#1B2A4A' }}>Practice:</strong> AI opponents will play alongside you. Perfect for learning!</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center" style={{ color: '#8B9D83', fontSize: '0.75rem' }}>
        <p>Otto Online &middot; American Mahjong Practice</p>
      </footer>
    </div>
  );
}

function Starburst() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill="#B5704F" />
    </svg>
  );
}

interface SettingRowProps {
  label: string;
  children: React.ReactNode;
}

function SettingRow({ label, children }: SettingRowProps) {
  return (
    <div className="mb-5">
      <label className="block mb-2 tracking-[0.1em] uppercase" style={{
        color: '#1B2A4A',
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: "'Jost', sans-serif",
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

interface OptionGroupProps {
  options: number[];
  value: number;
  onChange: (value: number) => void;
  labels: string[];
}

function OptionGroup({ options, value, onChange, labels }: OptionGroupProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt, i) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="px-4 py-2 rounded-md transition-all"
          style={{
            background: value === opt ? '#1B2A4A' : 'transparent',
            color: value === opt ? '#FFFDF7' : '#1B2A4A',
            border: value === opt ? '1px solid #1B2A4A' : '1px solid rgba(27, 42, 74, 0.2)',
            fontFamily: "'Jost', sans-serif",
            fontSize: '0.8rem',
            fontWeight: value === opt ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}
