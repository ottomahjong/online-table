import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Player, Tile as TileType } from '../types';
import { TileComponent } from './Tile';
import { PlanHand, PatternDisplayCompact } from './NMJLCard';
import { findWinningHandMatch } from '../gameLogic';

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  velocityX: number;
  velocityY: number;
  opacity: number;
  shape: 'rect' | 'circle' | 'diamond';
}

const CONFETTI_COLORS = [
  '#B5704F', // terracotta
  '#2D6A4F', // forest green
  '#1B2A4A', // navy
  '#D4A76A', // gold
  '#C0392B', // red
  '#E8C547', // bright gold
  '#FFFDF7', // cream
  '#7FB3A8', // sage
];

function useConfetti(active: boolean) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const frameRef = useRef<number>();
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const initial: ConfettiParticle[] = [];
    for (let i = 0; i < 120; i++) {
      initial.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 30,
        y: 30 + Math.random() * 10,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        velocityX: (Math.random() - 0.5) * 6,
        velocityY: -3 + Math.random() * -4,
        opacity: 1,
        shape: (['rect', 'circle', 'diamond'] as const)[Math.floor(Math.random() * 3)],
      });
    }
    setParticles(initial);
    startTimeRef.current = Date.now();

    const animate = () => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.velocityX * 0.3,
            y: p.y + p.velocityY * 0.3 + elapsed * 0.8,
            rotation: p.rotation + p.rotationSpeed,
            velocityX: p.velocityX * 0.995,
            velocityY: p.velocityY + 0.08,
            opacity: Math.max(0, p.opacity - 0.003),
          }))
          .filter(p => p.opacity > 0 && p.y < 120)
      );
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    const secondBurst = setTimeout(() => {
      setParticles(prev => {
        const burst: ConfettiParticle[] = [];
        for (let i = 0; i < 60; i++) {
          burst.push({
            id: 1000 + i,
            x: 50 + (Math.random() - 0.5) * 50,
            y: 20 + Math.random() * 20,
            color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
            size: 3 + Math.random() * 5,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 12,
            velocityX: (Math.random() - 0.5) * 5,
            velocityY: -2 + Math.random() * -3,
            opacity: 1,
            shape: (['rect', 'circle', 'diamond'] as const)[Math.floor(Math.random() * 3)],
          });
        }
        return [...prev, ...burst];
      });
    }, 600);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimeout(secondBurst);
    };
  }, [active]);

  return particles;
}

// ─── Quips ──────────────────────────────────────────────────────────

const WIN_QUIPS = [
  'Magnificent!',
  'Absolutely stunning!',
  'The table bows to you!',
  'A true tile master!',
  'What a hand!',
  'Flawless victory!',
  'East would be proud!',
  'The tiles have spoken!',
];

const LOSS_QUIPS = [
  'A worthy opponent prevailed.',
  'The tiles had other plans.',
  'There\'s always the next hand!',
  'So close, yet so far...',
  'Regroup and try again!',
];

const DRAW_QUIPS = [
  'The wall stands strong.',
  'Nobody could crack it this time.',
  'A hard-fought stalemate!',
  'The tiles keep their secrets.',
];

// ─── Winning Hand Display ───────────────────────────────────────────

function WinningHandDisplay({ player, humanWon, planHand, isSiamese }: { player: Player; humanWon: boolean; planHand?: PlanHand | null; isSiamese?: boolean }) {
  const winningMatch1 = findWinningHandMatch(player, 1);
  const allGroups1 = winningMatch1?.groups ?? [...player.exposures, player.hand];
  const totalTiles1 = allGroups1.reduce((s, g) => s + g.length, 0);

  const hasRack2 = isSiamese && (player.hand2.length > 0 || player.exposures2.length > 0);
  const winningMatch2 = hasRack2 ? findWinningHandMatch(player, 2) : null;
  const allGroups2 = hasRack2 ? (winningMatch2?.groups ?? [...player.exposures2, player.hand2]) : [];
  const totalTiles2 = allGroups2.reduce((s, g) => s + g.length, 0);
  const planMatchesWinningHand = !!planHand && !!winningMatch1 && (
    planHand.colorPattern.split(' | ').includes(winningMatch1.colorPattern)
    || planHand.pattern.split(' -or- ').includes(winningMatch1.pattern)
  );
  const displayPlan = planMatchesWinningHand ? planHand : null;

  const renderRack = (groups: TileType[][], totalTiles: number, rackLabel?: string) => (
    <div>
      {rackLabel && (
        <div className="text-center mb-1">
          <span className="text-[0.5rem] uppercase tracking-[0.12em] px-2 py-0.5 rounded" style={{
            background: rackLabel === 'Rack 2' ? 'rgba(181,112,79,0.08)' : 'rgba(45,106,79,0.06)',
            color: rackLabel === 'Rack 2' ? '#B5704F' : '#8B9D83',
            fontWeight: 700,
          }}>{rackLabel}</span>
        </div>
      )}
      <div
        className="rounded-lg p-3 overflow-x-auto"
        style={{
          background: humanWon
            ? 'linear-gradient(135deg, rgba(45,106,79,0.08) 0%, rgba(45,106,79,0.04) 100%)'
            : 'rgba(27,42,74,0.04)',
          border: `1px solid ${humanWon ? 'rgba(45,106,79,0.15)' : 'rgba(27,42,74,0.1)'}`,
        }}
      >
        <div className="flex flex-nowrap justify-center items-end gap-2.5" style={{ minWidth: 'min-content' }}>
          {groups.map((group, gi) => (
            <div
              key={gi}
              className="flex gap-px shrink-0"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))' }}
            >
              {group.map((tile) => (
                <TileComponent key={tile.id} tile={tile} size="sm" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="text-center mt-1">
        <span style={{ color: '#8B9D83', fontSize: '0.6rem' }}>
          {totalTiles} tiles &middot; {groups.length} group{groups.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );

  return (
    <div>
      {/* NMJL hand pattern being completed */}
      {(displayPlan || winningMatch1) && (
        <div
          className="flex flex-col items-center gap-1 mb-3 px-3 py-2 rounded-lg mx-auto"
          style={{
            background: humanWon ? 'rgba(45,106,79,0.06)' : 'rgba(27,42,74,0.04)',
            border: `1px solid ${humanWon ? 'rgba(45,106,79,0.12)' : 'rgba(27,42,74,0.08)'}`,
            width: 'fit-content',
            maxWidth: '100%',
          }}
        >
          <span
            className="uppercase tracking-[0.1em]"
            style={{
              color: '#8B9D83',
              fontSize: '0.5rem',
              fontWeight: 600,
            }}
          >
            {displayPlan
              ? `${displayPlan.category} \u00b7 ${displayPlan.value}pt${displayPlan.concealed ? ' \u00b7 Concealed' : ''}`
              : `${winningMatch1?.concealed ? 'Concealed' : 'Exposed'} Winning Hand`}
          </span>
          <div className="flex justify-center">
            <PatternDisplayCompact
              pattern={displayPlan?.pattern ?? winningMatch1?.pattern ?? ''}
              colorPattern={displayPlan?.colorPattern ?? winningMatch1?.colorPattern}
            />
          </div>
        </div>
      )}

      {/* Rack(s) display */}
      <div className={hasRack2 ? 'space-y-2' : ''}>
        {renderRack(allGroups1, totalTiles1, hasRack2 ? 'Rack 1' : undefined)}
        {hasRack2 && renderRack(allGroups2, totalTiles2, 'Rack 2')}
      </div>
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────

interface GameOverModalProps {
  winner: number | null;
  players: Player[];
  isDraw: boolean;
  onPlayAgain: () => void;
  onSettings: () => void;
  planHands?: (PlanHand | null)[];
  isSiamese?: boolean;
}

export function GameOverModal({ winner, players, isDraw, onPlayAgain, onSettings, planHands, isSiamese }: GameOverModalProps) {
  const humanWon = winner === 0;
  const confetti = useConfetti(humanWon);
  const [showTiles, setShowTiles] = useState(false);
  const [scaleIn, setScaleIn] = useState(false);

  const quip = useMemo(() => {
    if (isDraw) return DRAW_QUIPS[Math.floor(Math.random() * DRAW_QUIPS.length)];
    if (humanWon) return WIN_QUIPS[Math.floor(Math.random() * WIN_QUIPS.length)];
    return LOSS_QUIPS[Math.floor(Math.random() * LOSS_QUIPS.length)];
  }, [isDraw, humanWon]);

  useEffect(() => {
    const t1 = setTimeout(() => setScaleIn(true), 50);
    const t2 = setTimeout(() => setShowTiles(true), humanWon ? 600 : 300);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [humanWon]);

  const winnerPlayer = winner !== null ? players[winner] : null;

  // Determine which NMJL hand to display above the winning tiles
  // For now, use the player's Plan A if the human won (future: auto-detect from hand)
  const displayedPlanHand = humanWon && planHands
    ? planHands.find(p => p !== null) ?? null
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: humanWon
          ? 'radial-gradient(ellipse at center, rgba(45,106,79,0.85) 0%, rgba(27,42,74,0.92) 100%)'
          : 'rgba(27,42,74,0.85)',
        fontFamily: "'Jost', sans-serif",
      }}
    >
      {/* Confetti */}
      {humanWon && confetti.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-60" style={{ overflow: 'hidden' }}>
          {confetti.map(p => (
            <div
              key={p.id}
              style={{
                position: 'absolute',
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: p.shape === 'circle' ? p.size : p.size * 0.7,
                height: p.size,
                background: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'diamond' ? '2px' : '1px',
                transform: `rotate(${p.rotation}deg)${p.shape === 'diamond' ? ' scale(0.7)' : ''}`,
                opacity: p.opacity,
                boxShadow: `0 0 3px ${p.color}40`,
              }}
            />
          ))}
        </div>
      )}

      {/* Modal card */}
      <div
        className="rounded-xl max-w-2xl w-full relative overflow-hidden"
        style={{
          background: '#FFFDF7',
          boxShadow: humanWon
            ? '0 0 60px rgba(45,106,79,0.4), 0 8px 32px rgba(0,0,0,0.3)'
            : '0 8px 32px rgba(0,0,0,0.3)',
          transform: scaleIn ? 'scale(1)' : 'scale(0.85)',
          opacity: scaleIn ? 1 : 0,
          transition: 'transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Decorative top strip */}
        <div style={{
          height: 4,
          background: humanWon
            ? 'linear-gradient(90deg, #2D6A4F, #B5704F, #D4A76A, #B5704F, #2D6A4F)'
            : isDraw
              ? 'linear-gradient(90deg, #8B9D83, #B5704F, #8B9D83)'
              : 'linear-gradient(90deg, #1B2A4A, #B5704F, #1B2A4A)',
        }} />

        <div className="p-6 pb-5">
          {/* Header */}
          <div className="text-center mb-4">
            {humanWon && (
              <div className="flex justify-center gap-2 mb-2">
                <RotatingStarburst delay={0} />
                <RotatingStarburst delay={200} size={20} />
                <RotatingStarburst delay={100} />
              </div>
            )}

            <h2
              className="uppercase tracking-[0.15em] mb-1"
              style={{
                color: humanWon ? '#2D6A4F' : isDraw ? '#6B5E4F' : '#1B2A4A',
                fontSize: humanWon ? '1.6rem' : '1.3rem',
                fontWeight: 700,
                textShadow: humanWon ? '0 1px 2px rgba(45,106,79,0.15)' : 'none',
              }}
            >
              {isDraw
                ? 'Draw Game'
                : humanWon
                  ? (isSiamese ? 'Double Mah Jongg!' : 'Mah Jongg!')
                  : `${winnerPlayer?.name} Wins`}
            </h2>

            <p style={{ color: '#6B5E4F', fontSize: '0.85rem', fontStyle: 'italic' }}>
              {quip}
            </p>
          </div>

          {/* Winning Hand — laid out like on the table */}
          {winnerPlayer && showTiles && (
            <div
              className="mb-4"
              style={{
                opacity: showTiles ? 1 : 0,
                transform: showTiles ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.5s ease, transform 0.5s ease',
              }}
            >
              <WinningHandDisplay player={winnerPlayer} humanWon={humanWon} planHand={displayedPlanHand} isSiamese={isSiamese} />
            </div>
          )}

          {/* Draw game */}
          {isDraw && showTiles && (
            <div className="text-center mb-4 py-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg" style={{
                background: 'rgba(27,42,74,0.04)',
                border: '1px solid rgba(27,42,74,0.08)',
              }}>
                <svg width="20" height="20" viewBox="0 0 28 28" fill="none" className="opacity-40">
                  <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill="#6B5E4F" />
                </svg>
                <span style={{ color: '#6B5E4F', fontSize: '0.8rem' }}>
                  {isSiamese ? 'The pool has been exhausted' : 'The wall has been exhausted'}
                </span>
                <svg width="20" height="20" viewBox="0 0 28 28" fill="none" className="opacity-40">
                  <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill="#6B5E4F" />
                </svg>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-center mt-2">
            <button
              onClick={onPlayAgain}
              className="px-6 py-2.5 rounded-lg uppercase tracking-[0.15em] transition-all hover:brightness-110 active:scale-95"
              style={{
                background: humanWon
                  ? 'linear-gradient(135deg, #2D6A4F, #3D8A6A)'
                  : '#B5704F',
                color: '#FFFDF7',
                fontSize: '0.8rem',
                fontWeight: 600,
                boxShadow: humanWon
                  ? '0 4px 16px rgba(45,106,79,0.35)'
                  : '0 2px 8px rgba(181,112,79,0.3)',
              }}
            >
              Play Again
            </button>
            <button
              onClick={onSettings}
              className="px-6 py-2.5 rounded-lg uppercase tracking-[0.15em] transition-all hover:bg-[#F5F0E6] active:scale-95"
              style={{
                background: 'transparent',
                color: '#1B2A4A',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid rgba(27,42,74,0.2)',
              }}
            >
              Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────

function RotatingStarburst({ delay = 0, size = 28 }: { delay?: number; size?: number }) {
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const start = Date.now() + delay;
    let frame: number;
    const animate = () => {
      const elapsed = Math.max(0, Date.now() - start) / 1000;
      setRotation(elapsed * 30);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [delay]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      style={{ transform: `rotate(${rotation}deg)`, transition: 'none' }}
    >
      <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill="#B5704F" />
    </svg>
  );
}
