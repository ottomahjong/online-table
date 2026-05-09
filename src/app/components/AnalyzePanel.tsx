import React, { useState, useMemo } from 'react';
import { X, ChevronDown, ChevronRight, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react';
import { GameState } from '../types';
import { analyze, GLOSSARY, type AnalysisResult, type TileAction, type CandidateHand, type TileAdvice } from '../analyzer';

const C = {
  navy: '#1B2A4A',
  cream: '#FFFDF7',
  lightCream: '#F5F0E6',
  terracotta: '#B5704F',
  green: '#2D6A4F',
  red: '#C4453E',
  gold: '#D4A574',
  warmGray: '#6B5E4F',
  sage: '#8B9D83',
};

const ACTION_STYLES: Record<TileAction, { bg: string; fg: string; label: string }> = {
  KEEP:    { bg: '#2D6A4F', fg: '#FFFDF7', label: 'KEEP' },
  DISCARD: { bg: '#C4453E', fg: '#FFFDF7', label: 'DISCARD' },
  PASS:    { bg: '#B5704F', fg: '#FFFDF7', label: 'PASS' },
  WATCH:   { bg: '#D4A574', fg: '#1B2A4A', label: 'WATCH' },
};

interface AnalyzePanelProps {
  open: boolean;
  game: GameState;
  playerIndex: number;
  rack?: 1 | 2;
  onClose: () => void;
  onTileHover?: (tileId: string | null) => void;
}

export function AnalyzePanel({ open, game, playerIndex, rack = 1, onClose, onTileHover }: AnalyzePanelProps) {
  const [beginnerMode, setBeginnerMode] = useState(true);
  const [openCandidates, setOpenCandidates] = useState(true);
  const [openAdvice, setOpenAdvice] = useState(true);
  const [openWarnings, setOpenWarnings] = useState(true);
  const [glossaryKey, setGlossaryKey] = useState<string | null>(null);

  const result = useMemo<AnalysisResult | null>(() => {
    if (!open) return null;
    try {
      return analyze(game, playerIndex, { rack });
    } catch (e) {
      console.error('Analyzer error:', e);
      return null;
    }
  }, [open, game, playerIndex, rack]);

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col"
      style={{
        width: 'min(420px, 92vw)',
        background: C.cream,
        borderLeft: `3px solid ${C.terracotta}`,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.25)',
        fontFamily: "'Jost', sans-serif",
      }}
      onMouseLeave={() => onTileHover?.(null)}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{ borderBottom: `1px solid rgba(27,42,74,0.1)`, background: C.lightCream }}
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={16} style={{ color: C.terracotta }} />
          <span style={{ color: C.navy, fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.85rem' }}>
            ANALYZE
          </span>
          {result && (
            <span
              className="ml-2 px-2 py-0.5 rounded uppercase tracking-wider"
              style={{
                background: 'rgba(45,106,79,0.12)',
                color: C.green,
                fontSize: '0.55rem',
                fontWeight: 700,
              }}
            >
              {result.phase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBeginnerMode(!beginnerMode)}
            className="px-2 py-0.5 rounded uppercase tracking-wider transition-colors"
            style={{
              background: beginnerMode ? C.green : 'transparent',
              color: beginnerMode ? C.cream : C.warmGray,
              fontSize: '0.55rem',
              fontWeight: 600,
              border: `1px solid ${beginnerMode ? C.green : 'rgba(27,42,74,0.18)'}`,
            }}
            title="Toggle beginner explanations"
          >
            Beginner
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors hover:bg-black/5"
            style={{ color: C.warmGray }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {!result ? (
          <div className="p-4 text-center" style={{ color: C.warmGray, fontSize: '0.75rem' }}>
            No analysis available.
          </div>
        ) : (
          <>
            {/* Teaching note */}
            <Section
              title="Teaching Note"
              accent={C.terracotta}
              defaultOpen={true}
            >
              <p style={{ fontSize: '0.78rem', lineHeight: 1.45, color: C.navy }}>
                {result.teachingNote}
              </p>
            </Section>

            {/* Top candidates */}
            <Section
              title={`Top Candidate Hands (${result.topCandidates.length})`}
              accent={C.green}
              isOpen={openCandidates}
              onToggle={() => setOpenCandidates(!openCandidates)}
            >
              {result.topCandidates.length === 0 ? (
                <p style={{ fontSize: '0.75rem', color: C.warmGray }}>
                  No clear candidates yet. Focus on releasing tiles that fit no section.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {result.topCandidates.map((c, i) => (
                    <CandidateCard
                      key={i}
                      candidate={c}
                      rank={i + 1}
                      beginnerMode={beginnerMode}
                      onWhy={(k) => setGlossaryKey(k)}
                    />
                  ))}
                </div>
              )}
            </Section>

            {/* Tile advice */}
            <Section
              title={`Per-Tile Advice (${result.tileAdvice.length})`}
              accent={C.navy}
              isOpen={openAdvice}
              onToggle={() => setOpenAdvice(!openAdvice)}
            >
              <div className="flex flex-col gap-1">
                {result.tileAdvice.map((a) => (
                  <TileAdviceRow
                    key={a.tileId}
                    advice={a}
                    beginnerMode={beginnerMode}
                    onHover={(id) => onTileHover?.(id)}
                    onWhy={(k) => setGlossaryKey(k)}
                  />
                ))}
              </div>
            </Section>

            {/* Warnings */}
            {result.warnings.length > 0 && (
              <Section
                title={`Warnings (${result.warnings.length})`}
                accent={C.red}
                isOpen={openWarnings}
                onToggle={() => setOpenWarnings(!openWarnings)}
              >
                <ul className="flex flex-col gap-1">
                  {result.warnings.map((w, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 px-2 py-1 rounded"
                      style={{ background: 'rgba(196,69,62,0.08)' }}
                    >
                      <AlertTriangle size={12} style={{ color: C.red, marginTop: 2 }} />
                      <span style={{ fontSize: '0.72rem', color: C.navy, lineHeight: 1.4 }}>{w}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </div>

      {/* Glossary modal */}
      {glossaryKey && GLOSSARY[glossaryKey] && (
        <GlossaryModal
          item={GLOSSARY[glossaryKey]}
          onClose={() => setGlossaryKey(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//   Section (collapsible)
// ════════════════════════════════════════════════════════════════════════

function Section({
  title, accent, children,
  isOpen, onToggle, defaultOpen,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? true);
  const open = isOpen ?? internalOpen;
  const toggle = onToggle ?? (() => setInternalOpen(!internalOpen));
  return (
    <div className="border-b" style={{ borderColor: 'rgba(27,42,74,0.06)' }}>
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-black/3 transition-colors"
        style={{ background: 'transparent' }}
      >
        <div className="flex items-center gap-2">
          <div style={{ width: 3, height: 14, background: accent, borderRadius: 2 }} />
          <span
            className="uppercase tracking-wider"
            style={{ color: C.navy, fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.1em' }}
          >
            {title}
          </span>
        </div>
        {open ? (
          <ChevronDown size={14} style={{ color: C.warmGray }} />
        ) : (
          <ChevronRight size={14} style={{ color: C.warmGray }} />
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
//   Candidate card
// ════════════════════════════════════════════════════════════════════════

function CandidateCard({
  candidate, rank, beginnerMode, onWhy,
}: {
  candidate: CandidateHand;
  rank: number;
  beginnerMode: boolean;
  onWhy: (key: string) => void;
}) {
  const c = candidate;
  return (
    <div
      className="rounded p-2"
      style={{
        background: C.lightCream,
        border: `1px solid ${c.fading ? 'rgba(196,69,62,0.4)' : 'rgba(27,42,74,0.1)'}`,
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span
            className="px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: C.navy, color: C.cream, fontSize: '0.5rem', fontWeight: 700 }}
          >
            #{rank}
          </span>
          <span style={{ color: C.navy, fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.04em' }}>
            {c.handName}
          </span>
        </div>
        <FeasibilityBar value={c.feasibility} />
      </div>
      <div className="flex items-center gap-1 flex-wrap mb-1">
        <Tag label={c.section} color={C.green} />
        <Tag label={c.concealed ? 'Concealed' : 'Exposable'} color={c.concealed ? C.terracotta : C.sage} />
        {c.pairsHeld > 0 && <Tag label={`${c.pairsHeld} pair${c.pairsHeld === 1 ? '' : 's'} held`} color={C.green} />}
        {c.pairsNeeded > 0 && <Tag label={`Needs ${c.pairsNeeded} pair${c.pairsNeeded === 1 ? '' : 's'}`} color={C.warmGray} />}
        {c.fading && <Tag label="Fading" color={C.red} />}
      </div>
      {beginnerMode && (
        <p style={{ fontSize: '0.7rem', color: C.warmGray, lineHeight: 1.4, marginTop: 4 }}>
          {c.reasoning}
        </p>
      )}
      {c.tilesYouNeed.length > 0 && (
        <div className="mt-1.5">
          <span style={{ fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: C.warmGray }}>
            Still need:
          </span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {c.tilesYouNeed.map((label, i) => (
              <span
                key={i}
                className="px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(181,112,79,0.12)', color: C.navy, fontSize: '0.6rem' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end mt-1">
        <button
          onClick={() => onWhy(c.concealed ? 'concealed-vs-exposed' : 'tile-fits')}
          className="text-[0.55rem] uppercase tracking-wider hover:underline"
          style={{ color: C.terracotta }}
        >
          Why?
        </button>
      </div>
    </div>
  );
}

function FeasibilityBar({ value }: { value: number }) {
  const color = value >= 70 ? C.green : value >= 40 ? C.gold : C.red;
  return (
    <div className="flex items-center gap-1.5">
      <div style={{ width: 60, height: 6, background: 'rgba(27,42,74,0.08)', borderRadius: 3 }}>
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            background: color,
            borderRadius: 3,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
      <span style={{ fontSize: '0.65rem', fontWeight: 700, color, minWidth: 24, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded uppercase tracking-wider"
      style={{
        background: `${color}1A`,
        color,
        fontSize: '0.5rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        border: `1px solid ${color}33`,
      }}
    >
      {label}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════════
//   Tile advice row
// ════════════════════════════════════════════════════════════════════════

function TileAdviceRow({
  advice, beginnerMode, onHover, onWhy,
}: {
  advice: TileAdvice;
  beginnerMode: boolean;
  onHover: (id: string | null) => void;
  onWhy: (key: string) => void;
}) {
  const a = advice;
  const t = a.tile;
  const styles = ACTION_STYLES[a.action];
  const tileLabel = describeTile(t);

  return (
    <div
      className="flex items-start gap-2 px-2 py-1 rounded transition-colors hover:bg-black/3"
      onMouseEnter={() => onHover(a.tileId)}
      onMouseLeave={() => onHover(null)}
      style={a.danger ? { background: 'rgba(196,69,62,0.06)' } : {}}
    >
      <span
        className="px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0"
        style={{
          background: styles.bg, color: styles.fg,
          fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.08em',
          minWidth: 56, textAlign: 'center', marginTop: 1,
        }}
      >
        {styles.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span style={{ fontSize: '0.72rem', color: C.navy, fontWeight: 600 }}>
            {tileLabel}
          </span>
          {a.danger && <AlertTriangle size={10} style={{ color: C.red }} />}
        </div>
        {beginnerMode && (
          <p style={{ fontSize: '0.65rem', color: C.warmGray, lineHeight: 1.35, marginTop: 1 }}>
            {a.reason}
          </p>
        )}
      </div>
      <button
        onClick={() => onWhy(a.rationaleKey)}
        className="text-[0.5rem] uppercase tracking-wider hover:underline shrink-0"
        style={{ color: C.terracotta, marginTop: 2 }}
        aria-label="Why?"
      >
        Why?
      </button>
    </div>
  );
}

function describeTile(t: any): string {
  if (t.type === 'suited') {
    const s = t.suit === 'bam' ? 'Bam' : t.suit === 'crak' ? 'Crak' : 'Dot';
    return `${t.value} ${s}`;
  }
  if (t.type === 'wind') {
    return `${t.direction[0].toUpperCase()}${t.direction.slice(1)} Wind`;
  }
  if (t.type === 'dragon') {
    if (t.color === 'red') return 'Red Dragon';
    if (t.color === 'green') return 'Green Dragon';
    return 'White Dragon (Soap)';
  }
  if (t.specialType === 'flower') return 'Flower';
  if (t.specialType === 'joker') return 'Joker';
  return 'Blank';
}

// ════════════════════════════════════════════════════════════════════════
//   Glossary modal
// ════════════════════════════════════════════════════════════════════════

function GlossaryModal({
  item, onClose,
}: {
  item: { title: string; body: string };
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center p-4"
      style={{ background: 'rgba(27,42,74,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded p-4 max-w-sm"
        style={{
          background: C.cream,
          border: `2px solid ${C.terracotta}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <BookOpen size={14} style={{ color: C.terracotta }} />
          <span style={{ color: C.navy, fontWeight: 700, fontSize: '0.85rem' }}>{item.title}</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: C.navy, lineHeight: 1.5 }}>{item.body}</p>
        <div className="flex justify-end mt-3">
          <button
            onClick={onClose}
            className="px-3 py-1 rounded uppercase tracking-wider"
            style={{ background: C.navy, color: C.cream, fontSize: '0.6rem', fontWeight: 600 }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
