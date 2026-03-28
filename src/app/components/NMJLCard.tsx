import React, { useState } from 'react';

// ─── Theme Colors ──────────────────────────────────────────
const C = {
  navy: '#1B2A4A',
  terracotta: '#B5704F',
  green: '#2D6A4F',
  cream: '#FFFDF7',
  warmGray: '#6B5E4F',
  lightCream: '#F5F0E6',
  sage: '#8B9D83',
};

// Suit display colors (matching NMJL card convention)
const SUIT_COLORS = {
  g: '#2D6A4F',   // green suit
  r: '#C0392B',   // red suit
  b: '#2E5090',   // blue suit
  n: '#1B2A4A',   // neutral (flowers, winds, dragons, default)
  o: '#8B9D83',   // operator (+, =)
};

// ─── Data Types ────────────────────────────────────────────
type TC = 'g' | 'r' | 'b' | 'n' | 'o';

// Suit background tints for token chips
const SUIT_BG: Record<TC, { bg: string; border: string }> = {
  g: { bg: '#E8F0EC', border: 'rgba(45,106,79,0.2)' },
  r: { bg: '#F5E8E6', border: 'rgba(192,57,43,0.2)' },
  b: { bg: '#E8EDF5', border: 'rgba(46,80,144,0.2)' },
  n: { bg: '#F5F0E6', border: 'rgba(27,42,74,0.12)' },
  o: { bg: 'transparent', border: 'transparent' },
};

interface Tok { t: string; c: TC }

interface HandPattern { tokens: Tok[] }

interface HandDef {
  patterns: HandPattern[];
  desc: string;
  concealed: boolean;
  points: number;
}

interface Section {
  name: string;
  hands: HandDef[];
}

// Helper: parse compact token encoding "FFFF:n 2025:g 222:r 222:b"
function p(s: string): Tok[] {
  return s.split(' ').map(part => {
    const idx = part.lastIndexOf(':');
    return { t: part.slice(0, idx), c: part.slice(idx + 1) as TC };
  });
}

// Get pattern string (for plan matching)
function patternStr(patterns: HandPattern[]): string {
  return patterns.map(pat =>
    pat.tokens.filter(tk => tk.c !== 'o').map(tk => tk.t).join(' ')
  ).join(' -or- ');
}

// Get color-encoded string (for compact display)
function colorStr(patterns: HandPattern[]): string {
  return patterns.map(pat =>
    pat.tokens.map(tk => `${tk.t}:${tk.c}`).join(' ')
  ).join(' | ');
}

// ─── Complete Hand Data (55 hands from spreadsheet) ────────

const SECTIONS: Section[] = [
  {
    name: '2025',
    hands: [
      // Row 2: FFFF 2025 222 222
      { patterns: [{ tokens: p('FFFF:n 2025:g 222:r 222:b') }],
        desc: 'Any 3 Suits, Like Pungs 2s or 5s in Opp. Suits', concealed: false, points: 25 },
      // Row 3: 222 0000 222 5555
      { patterns: [{ tokens: p('222:g 0000:g 222:r 5555:r') }],
        desc: 'Any 2 Suits', concealed: false, points: 25 },
      // Row 4: 2025 222 555 DDDD
      { patterns: [{ tokens: p('2025:r 222:g 555:g DDDD:b') }],
        desc: 'Any 3 Suits', concealed: false, points: 30 },
      // Row 5: FF 222 000 222 555
      { patterns: [{ tokens: p('FF:n 222:g 000:b 222:r 555:r') }],
        desc: 'Any 3 Suits', concealed: true, points: 25 },
    ],
  },
  {
    name: '2468',
    hands: [
      // Row 6
      { patterns: [
          { tokens: p('222:g 4444:g 666:g 8888:g') },
          { tokens: p('222:g 4444:r 666:g 8888:r') },
        ], desc: 'Any 1 or 2 Suits', concealed: false, points: 25 },
      // Row 7
      { patterns: [
          { tokens: p('FF:n 2222:g +:o 4444:r =:o 6666:b') },
          { tokens: p('FF:n 2222:g +:o 6666:r =:o 8888:b') },
        ], desc: 'Any 3 Suits', concealed: false, points: 25 },
      // Row 8
      { patterns: [{ tokens: p('22:b 444:b 66:b 888:b DDDD:b') }],
        desc: 'Any 1 Suit', concealed: false, points: 25 },
      // Row 9
      { patterns: [{ tokens: p('FFFF:n 2468:g 222:r 222:b') }],
        desc: 'Any 3 Suits, Like Pungs Any Even No.', concealed: false, points: 25 },
      // Row 10
      { patterns: [{ tokens: p('FFF:n 22:b 44:b 666:b 8888:b') }],
        desc: 'Any 1 Suit', concealed: false, points: 25 },
      // Row 11
      { patterns: [{ tokens: p('222:g 4444:g 666:r 88:r 88:b') }],
        desc: 'Any 3 Suits, Pairs 8s Only', concealed: false, points: 25 },
      // Row 12
      { patterns: [{ tokens: p('FF:n 2222:g DDDD:r 2222:b') }],
        desc: 'Any 3 Suits, Like Kongs Any Even No.', concealed: false, points: 25 },
      // Row 13
      { patterns: [{ tokens: p('22:g 44:g 66:g 88:g 222:r 222:b') }],
        desc: 'Any 3 Suits, Like Pungs Any Even No.', concealed: true, points: 30 },
    ],
  },
  {
    name: 'Any Like Numbers',
    hands: [
      // Row 14
      { patterns: [{ tokens: p('FF:n 1111:g D:n 1111:r D:n 11:b') }],
        desc: 'Any 3 Suits', concealed: false, points: 25 },
      // Row 15
      { patterns: [{ tokens: p('FFFF:n 11:g 111:g 111:r 11:b') }],
        desc: 'Any 3 Suits, Pairs Must Be Same Suit', concealed: false, points: 30 },
      // Row 16
      { patterns: [{ tokens: p('FF:n 111:g 111:r 111:b DDD:n') }],
        desc: 'Any 3 Suits, Any Dragon', concealed: false, points: 25 },
    ],
  },
  {
    name: 'Quints',
    hands: [
      // Row 17
      { patterns: [{ tokens: p('FF:n 111:g 2222:r 33333:b') }],
        desc: 'Any 3 Suits, Any 3 Consec. Nos.', concealed: false, points: 40 },
      // Row 18
      { patterns: [{ tokens: p('11111:b NNNN:n 22222:b') }],
        desc: 'Any 1 Suit, Any Consec. Nos., Any Wind', concealed: false, points: 45 },
      // Row 19
      { patterns: [{ tokens: p('FF:n 11111:g 11:b 11111:r') }],
        desc: 'Any 2 Suits, Any Like Nos.', concealed: false, points: 45 },
    ],
  },
  {
    name: 'Consecutive Run',
    hands: [
      // Row 20
      { patterns: [
          { tokens: p('11:b 222:b 3333:b 444:b 55:b') },
          { tokens: p('55:b 666:b 7777:b 888:b 99:b') },
        ], desc: 'Any 1 Suit, These Nos. Only', concealed: false, points: 25 },
      // Row 21
      { patterns: [
          { tokens: p('111:b 2222:b 333:b 4444:b') },
          { tokens: p('111:g 2222:r 333:g 4444:r') },
        ], desc: 'Any 1 or 2 Suits, Any 4 Consec. Nos', concealed: false, points: 25 },
      // Row 22
      { patterns: [
          { tokens: p('FFFF:n 1111:b 22:b 3333:b') },
          { tokens: p('FFFF:n 1111:g 22:r 3333:b') },
        ], desc: 'Any 1 or 3 Suits, Any 3 Consec. Nos', concealed: false, points: 25 },
      // Row 23
      { patterns: [{ tokens: p('FFF:n 123:g 4444:r 5555:b') }],
        desc: 'Any 3 Suits, Any 5 Consec. Nos', concealed: false, points: 25 },
      // Row 24
      { patterns: [{ tokens: p('FF:n 11:b 222:b 3333:b DDD:n') }],
        desc: 'Any 1 Suit, Any 3 Consec. Nos', concealed: false, points: 25 },
      // Row 25
      { patterns: [{ tokens: p('111:g 222:g 3333:r DD:b DD:b') }],
        desc: 'Any 3 Suits, Any 3 Consec. Nos w Opp. Dragons', concealed: false, points: 25 },
      // Row 26
      { patterns: [{ tokens: p('112345:b 1111:b 1111:b') }],
        desc: 'Any 5 Consec. Nos, Pair Any Nos, In Pung, Kongs Match Pair', concealed: false, points: 30 },
      // Row 27
      { patterns: [{ tokens: p('FF:n 1:g 22:g 333:g 1:r 22:r 333:r') }],
        desc: 'Any 2 Suits, Any Same 3 Consec. Nos', concealed: true, points: 30 },
    ],
  },
  {
    name: '13579',
    hands: [
      // Row 28
      { patterns: [
          { tokens: p('11:b 333:b 5555:b 777:b 99:b') },
          { tokens: p('11:g 333:g 5555:r 777:r 99:b') },
        ], desc: 'Any 1 or 3 Suits', concealed: false, points: 25 },
      // Row 29
      { patterns: [
          { tokens: p('111:g 3333:g 333:r 5555:r') },
          { tokens: p('555:g 7777:g 777:r 9999:r') },
        ], desc: 'Any 2 Suits', concealed: false, points: 25 },
      // Row 30
      { patterns: [
          { tokens: p('1111:b 333:b 5555:b DDD:n') },
          { tokens: p('5555:b 777:b 9999:b DDD:n') },
        ], desc: 'Any 1 Suit', concealed: false, points: 25 },
      // Row 31
      { patterns: [{ tokens: p('FFFF:n 1111:g +:o 9999:r =:o 10:b') }],
        desc: 'Any 2 Suits, These Nos. Only', concealed: false, points: 25 },
      // Row 32
      { patterns: [
          { tokens: p('FFF:n 135:b 7777:b 9999:b') },
          { tokens: p('FFF:n 135:g 7777:r 9999:b') },
        ], desc: 'Any 1 or 3 Suits', concealed: false, points: 25 },
      // Row 33
      { patterns: [
          { tokens: p('111:g 333:g 5555:r DD:b DD:b') },
          { tokens: p('555:g 777:g 9999:r DD:b DD:b') },
        ], desc: 'Any 3 Suits w Opp. Dragons', concealed: false, points: 25 },
      // Row 34
      { patterns: [
          { tokens: p('11:g 333:g NEWS:n 333:r 55:r') },
          { tokens: p('55:g 777:g NEWS:n 777:r 99:r') },
        ], desc: 'Any 2 Suits', concealed: false, points: 30 },
      // Row 35
      { patterns: [{ tokens: p('1111:g 33:r 55:r 77:r 9999:g') }],
        desc: 'Any 2 Suits', concealed: false, points: 30 },
      // Row 36
      { patterns: [
          { tokens: p('FF:n 11:g 33:g 111:r 333:r 55:b') },
          { tokens: p('FF:n 55:g 77:g 555:r 777:r 99:b') },
        ], desc: 'Any 3 Suits', concealed: false, points: 30 },
    ],
  },
  {
    name: 'Winds & Dragons',
    hands: [
      // Row 37
      { patterns: [
          { tokens: p('NNNN:n EEE:n WWW:n SSSS:n') },
          { tokens: p('NNN:n EEEE:n WWWW:n SSS:n') },
        ], desc: '', concealed: false, points: 25 },
      // Row 38
      { patterns: [{ tokens: p('FF:n 123:g DD:g DDD:r DDDD:b') }],
        desc: 'Any 3 Consec. Nos. in Any 1 Suit, Any 3 Dragons', concealed: false, points: 25 },
      // Row 39
      { patterns: [{ tokens: p('FFF:n NN:n EE:n WWWW:n SSS:n') }],
        desc: '', concealed: false, points: 25 },
      // Row 40
      { patterns: [{ tokens: p('FFFF:n DDD:g NEWS:n DDD:r') }],
        desc: 'Dragons Any 2 Suits', concealed: false, points: 25 },
      // Row 41
      { patterns: [{ tokens: p('NNNN:n 1:g 11:r 111:b SSSS:n') }],
        desc: 'Any Like Odd Nos. in 3 Suits', concealed: false, points: 25 },
      // Row 42
      { patterns: [{ tokens: p('EEEE:n 2:g 22:r 222:b WWWW:n') }],
        desc: 'Any Like Even Nos. in 3 Suits', concealed: false, points: 25 },
      // Row 43
      { patterns: [
          { tokens: p('NNN:n EE:n WWW:n SS:n 2025:g') },
          { tokens: p('NNN:n EE:n WW:n SSS:n 2025:g') },
        ], desc: '2025 Any 1 Suit', concealed: false, points: 30 },
      // Row 44
      { patterns: [{ tokens: p('NN:n EE:n WWW:n SSS:n DDDD:n') }],
        desc: 'Kong Any Dragon', concealed: true, points: 30 },
    ],
  },
  {
    name: '369',
    hands: [
      // Row 45
      { patterns: [
          { tokens: p('333:g 6666:g 666:r 9999:r') },
          { tokens: p('333:g 6666:r 666:b 9999:r') },
        ], desc: 'Any 2 or 3 Suits', concealed: false, points: 25 },
      // Row 46
      { patterns: [
          { tokens: p('FF:n 3333:b +:o 6666:b =:o 9999:b') },
          { tokens: p('FF:n 3333:g +:o 6666:r =:o 9999:b') },
        ], desc: 'Any 1 or 3 Suits', concealed: false, points: 25 },
      // Row 47
      { patterns: [{ tokens: p('3333:g DDD:g 3333:r DDD:r') }],
        desc: 'Any 2 Suits, Like Kongs 3, 6 or 9 w Matching Dragons', concealed: false, points: 25 },
      // Row 48
      { patterns: [{ tokens: p('FFF:n 3333:g 369:r 9999:r') }],
        desc: 'Any 2 Suits', concealed: false, points: 25 },
      // Row 49
      { patterns: [{ tokens: p('33:g 66:g 99:g 3333:r 3333:b') }],
        desc: 'Any 3 Suits, Like Kongs 3, 6, or 9', concealed: false, points: 25 },
      // Row 50
      { patterns: [{ tokens: p('FF:n 333:g D:g 666:r D:r 999:b D:b') }],
        desc: 'Any 3 Suits w Matching Dragons', concealed: true, points: 30 },
    ],
  },
  {
    name: 'Singles & Pairs',
    hands: [
      // Row 51
      { patterns: [{ tokens: p('NN:n EW:n SS:n 11:b 22:b 33:b 44:b') }],
        desc: 'Any 1 Suit, Any 4 Consec. Nos.', concealed: true, points: 50 },
      // Row 52
      { patterns: [{ tokens: p('FF:n 2468:g DD:g 2468:r DD:r') }],
        desc: 'Any 2 Suits w Matching Dragons', concealed: true, points: 50 },
      // Row 53
      { patterns: [{ tokens: p('336699:g 336699:r 33:b') }],
        desc: 'Any 3 Suits, Pair 3, 6, or 9 In Third Suit', concealed: true, points: 50 },
      // Row 54
      { patterns: [{ tokens: p('FF:n 11:g 22:g 11:r 22:r 11:b 22:b') }],
        desc: 'Any 3 Suits, Any 2 Consec. Nos.', concealed: true, points: 50 },
      // Row 55
      { patterns: [{ tokens: p('11:g 33:g 55:g 77:g 99:g 11:r 11:b') }],
        desc: 'Any 3 Suits, Pairs Any Like Odd Nos. in Opp. Suits', concealed: true, points: 50 },
      // Row 56
      { patterns: [{ tokens: p('FF:n 2025:g 2025:r 2025:b') }],
        desc: 'Any 3 Suits', concealed: true, points: 75 },
    ],
  },
];

// ─── Exports for GameBoard ─────────────────────────────────

export type PlanHand = {
  pattern: string;
  colorPattern: string;
  value: number;
  description: string;
  concealed?: boolean;
  category: string;
  planLabel: 'A' | 'B' | 'C';
};

// ─── Token Display Components ──────────────────────────────

function TokenSpan({ tok, size = 'normal' }: { tok: Tok; size?: 'normal' | 'compact' }) {
  const isOp = tok.c === 'o';
  const color = SUIT_COLORS[tok.c];
  const suitBg = SUIT_BG[tok.c];

  if (isOp) {
    return (
      <span
        style={{
          color: SUIT_COLORS.o,
          fontSize: size === 'compact' ? '0.45rem' : '0.6rem',
          fontWeight: 600,
          fontFamily: "'Jost', sans-serif",
          padding: '0 1px',
        }}
      >
        {tok.t}
      </span>
    );
  }

  // Determine background based on token type
  let bg = suitBg.bg;
  let borderColor = suitBg.border;

  // Flowers get a special warm tint
  if (/^F+$/.test(tok.t)) {
    bg = '#EDE3D4';
    borderColor = 'rgba(181,112,79,0.2)';
  }
  // Winds get a cool blue-gray tint
  else if (/^[NEWS]+$/.test(tok.t)) {
    bg = '#E3EBF5';
    borderColor = 'rgba(27,42,74,0.12)';
  }
  // Dragons: use suit color if colored, otherwise default green tint
  else if (/^D+$/.test(tok.t) && tok.c === 'n') {
    bg = '#E0EDE6';
    borderColor = 'rgba(45,106,79,0.2)';
  }

  const isCompact = size === 'compact';

  return (
    <span
      style={{
        display: 'inline-block',
        padding: isCompact ? '0 3px' : '1px 5px',
        borderRadius: 3,
        background: bg,
        color,
        border: `1px solid ${borderColor}`,
        fontFamily: "'Jost', sans-serif",
        fontWeight: 700,
        fontSize: isCompact ? '0.5rem' : '0.68rem',
        letterSpacing: '0.04em',
        lineHeight: isCompact ? 1.3 : 1.5,
      }}
    >
      {tok.t}
    </span>
  );
}

function PatternDisplay({ patterns }: { patterns: HandPattern[] }) {
  if (patterns.length === 1) {
    return (
      <div className="flex flex-wrap gap-0.5 items-center">
        {patterns[0].tokens.map((tk, i) => (
          <TokenSpan key={i} tok={tk} />
        ))}
      </div>
    );
  }

  // Multiple alternatives
  return (
    <div className="flex flex-col gap-1">
      {patterns.map((pat, pi) => (
        <div key={pi} className="flex flex-wrap gap-0.5 items-center">
          {pi > 0 && (
            <span
              style={{
                color: C.sage,
                fontSize: '0.55rem',
                fontWeight: 600,
                fontStyle: 'italic',
                marginRight: 2,
              }}
            >
              -or-
            </span>
          )}
          {pat.tokens.map((tk, ti) => (
            <TokenSpan key={ti} tok={tk} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Compact version for the plan bar
export function PatternDisplayCompact({ pattern, colorPattern }: { pattern: string; colorPattern?: string }) {
  if (colorPattern) {
    const alternatives = colorPattern.split(' | ');
    if (alternatives.length === 1) {
      // Single pattern
      const tokens = p(alternatives[0]);
      return (
        <div className="flex flex-wrap gap-px items-center">
          {tokens.filter(tk => tk.c !== 'o').map((tk, i) => (
            <TokenSpan key={i} tok={tk} size="compact" />
          ))}
        </div>
      );
    }
    // Multiple alternatives — show all with "-or-" between them
    return (
      <div className="flex flex-col gap-0.5">
        {alternatives.map((alt, ai) => {
          const tokens = p(alt);
          return (
            <div key={ai} className="flex flex-wrap gap-px items-center">
              {ai > 0 && (
                <span
                  style={{
                    color: C.sage,
                    fontSize: '0.4rem',
                    fontWeight: 600,
                    fontStyle: 'italic',
                    marginRight: 2,
                  }}
                >
                  -or-
                </span>
              )}
              {tokens.filter(tk => tk.c !== 'o').map((tk, i) => (
                <TokenSpan key={i} tok={tk} size="compact" />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: plain pattern string
  const parts = pattern.split(' ');
  return (
    <div className="flex flex-wrap gap-px items-center">
      {parts.map((part, i) => (
        <span
          key={i}
          className="px-1 py-px rounded"
          style={{
            background: C.lightCream,
            color: C.navy,
            fontFamily: "'Jost', sans-serif",
            fontWeight: 700,
            fontSize: '0.5rem',
            letterSpacing: '0.03em',
            border: `1px solid ${C.navy}15`,
          }}
        >
          {part}
        </span>
      ))}
    </div>
  );
}

// ─── Section accent colors ─────────────────────────────────
const SECTION_ACCENTS: Record<string, string> = {
  '2025': '#B5704F',
  '2468': '#2E5090',
  'Any Like Numbers': '#7B5EA7',
  'Quints': '#C0392B',
  'Consecutive Run': '#2D6A4F',
  '13579': '#B5704F',
  'Winds & Dragons': '#1B2A4A',
  '369': '#2E5090',
  'Singles & Pairs': '#7B5EA7',
};

// ─── Main Card Component ───────────────────────────────────

interface NMJLCardProps {
  isOpen: boolean;
  onClose: () => void;
  planHands: (PlanHand | null)[];
  onAddPlan: (hand: Omit<PlanHand, 'planLabel'>) => void;
  playerBarHeight?: number;
}

export function NMJLCard({ isOpen, onClose, planHands, onAddPlan, playerBarHeight = 0 }: NMJLCardProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-start justify-center p-4 pt-8"
      style={{
        background: 'rgba(27,42,74,0.8)',
        bottom: `${playerBarHeight}px`,
      }}
      onClick={onClose}
    >
      <div
        className="rounded-lg w-full max-w-2xl flex flex-col"
        style={{
          background: C.cream,
          maxHeight: '100%',
          boxShadow: '0 8px 40px rgba(27,42,74,0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="shrink-0 px-6 py-4 rounded-t-lg"
          style={{
            background: `linear-gradient(135deg, ${C.navy} 0%, #243556 100%)`,
            borderBottom: `3px solid ${C.terracotta}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <path d="M14 0L16.5 10.5L28 14L16.5 17.5L14 28L11.5 17.5L0 14L11.5 10.5Z" fill={C.terracotta} />
              </svg>
              <div>
                <h2
                  className="tracking-[0.12em] uppercase"
                  style={{
                    fontFamily: "'Jost', sans-serif",
                    color: C.cream,
                    fontSize: '1.15rem',
                    fontWeight: 700,
                  }}
                >
                  NMJL Card Reference
                </h2>
                <p
                  style={{
                    color: 'rgba(255,253,247,0.5)',
                    fontSize: '0.65rem',
                    letterSpacing: '0.15em',
                    marginTop: 2,
                  }}
                >
                  NATIONAL MAH JONGG LEAGUE &middot; PRACTICE HANDS
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: C.cream, fontSize: '1.25rem' }}
            >
              &times;
            </button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,253,247,0.1)' }}>
            <LegendSwatch label="Suit 1" color={SUIT_COLORS.g} />
            <LegendSwatch label="Suit 2" color={SUIT_COLORS.r} />
            <LegendSwatch label="Suit 3" color={SUIT_COLORS.b} />
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded"
              style={{
                background: 'rgba(255,253,247,0.08)',
                fontSize: '0.6rem',
                color: 'rgba(255,253,247,0.6)',
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: C.terracotta }}
              />
              C = Concealed Only
            </span>
            <span
              className="flex items-center gap-1 px-2 py-0.5 rounded"
              style={{
                background: 'rgba(255,253,247,0.08)',
                fontSize: '0.6rem',
                color: 'rgba(255,253,247,0.6)',
              }}
            >
              Same color = same suit
            </span>
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {SECTIONS.map((section) => {
            const isExpanded = expandedCategory === section.name;
            const accent = SECTION_ACCENTS[section.name] || C.navy;

            return (
              <div key={section.name} className="mb-2">
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : section.name)}
                  className="w-full flex items-center justify-between px-4 py-2.5 rounded-md transition-colors"
                  style={{
                    background: isExpanded
                      ? `linear-gradient(90deg, ${C.navy}, #2a3d5e)`
                      : C.lightCream,
                    color: isExpanded ? C.cream : C.navy,
                    border: `1px solid ${isExpanded ? C.navy : 'rgba(27,42,74,0.08)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-1 h-5 rounded-full"
                      style={{ background: isExpanded ? C.terracotta : accent, opacity: isExpanded ? 1 : 0.6 }}
                    />
                    <span
                      style={{
                        fontFamily: "'Jost', sans-serif",
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {section.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        fontSize: '0.6rem',
                        color: isExpanded ? 'rgba(255,253,247,0.5)' : C.sage,
                        letterSpacing: '0.1em',
                      }}
                    >
                      {section.hands.length} HANDS
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke={isExpanded ? C.cream : C.navy}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-1 space-y-1.5 px-2 py-2">
                    {section.hands.map((hand, hi) => {
                      const pStr = patternStr(hand.patterns);
                      const cStr = colorStr(hand.patterns);
                      const isAlreadyPlanned = planHands.some(
                        (ph) => ph !== null && ph.pattern === pStr && ph.category === section.name
                      );
                      const planSlotLabel = isAlreadyPlanned
                        ? planHands.find(ph => ph !== null && ph.pattern === pStr && ph.category === section.name)?.planLabel
                        : null;
                      const slotsAvailable = planHands.filter(ph => ph === null).length > 0;

                      return (
                        <div
                          key={hi}
                          className="flex flex-col gap-1.5 p-3 rounded-md"
                          style={{
                            background: isAlreadyPlanned ? '#F0EDE4' : C.cream,
                            border: isAlreadyPlanned
                              ? `1.5px solid ${C.terracotta}40`
                              : '1px solid rgba(27,42,74,0.06)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <PatternDisplay patterns={hand.patterns} />
                            <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                              {hand.concealed && (
                                <span
                                  className="px-1.5 py-0.5 rounded"
                                  style={{
                                    background: 'rgba(181,112,79,0.12)',
                                    color: C.terracotta,
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                  }}
                                >
                                  C
                                </span>
                              )}
                              {!hand.concealed && (
                                <span
                                  className="px-1.5 py-0.5 rounded"
                                  style={{
                                    background: 'rgba(27,42,74,0.06)',
                                    color: C.sage,
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.1em',
                                  }}
                                >
                                  X
                                </span>
                              )}
                              <span
                                className="px-2 py-0.5 rounded"
                                style={{
                                  background: `linear-gradient(135deg, ${C.green}, #3A7D5F)`,
                                  color: C.cream,
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                }}
                              >
                                {hand.points}pt
                              </span>
                              {isAlreadyPlanned ? (
                                <span
                                  className="px-1.5 py-0.5 rounded"
                                  style={{
                                    background: C.terracotta,
                                    color: C.cream,
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.05em',
                                  }}
                                >
                                  Plan {planSlotLabel}
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    if (slotsAvailable) {
                                      onAddPlan({
                                        pattern: pStr,
                                        colorPattern: cStr,
                                        value: hand.points,
                                        description: hand.desc,
                                        concealed: hand.concealed,
                                        category: section.name,
                                      });
                                    }
                                  }}
                                  disabled={!slotsAvailable}
                                  className="px-2 py-0.5 rounded transition-all"
                                  style={{
                                    background: slotsAvailable ? C.navy : 'rgba(27,42,74,0.1)',
                                    color: slotsAvailable ? C.cream : C.sage,
                                    fontSize: '0.55rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.05em',
                                    cursor: slotsAvailable ? 'pointer' : 'default',
                                    opacity: slotsAvailable ? 1 : 0.5,
                                  }}
                                  title={slotsAvailable ? 'Add to your plan bar' : 'All 3 plan slots are full'}
                                >
                                  + Plan
                                </button>
                              )}
                            </div>
                          </div>
                          {hand.desc && (
                            <p
                              style={{
                                color: C.warmGray,
                                fontSize: '0.7rem',
                                lineHeight: 1.4,
                              }}
                            >
                              {hand.desc}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Footer note */}
          <div
            className="mt-4 mb-2 p-3 rounded-md text-center"
            style={{
              background: C.lightCream,
              border: '1px solid rgba(27,42,74,0.06)',
            }}
          >
            <p style={{ color: C.sage, fontSize: '0.65rem', lineHeight: 1.6 }}>
              These are practice reference hands inspired by NMJL patterns.
              <br />
              For official play, refer to the current year's official NMJL card.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small Components ──────────────────────────────────────

function LegendSwatch({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="flex items-center gap-1.5 px-2 py-0.5 rounded"
      style={{
        background: 'rgba(255,253,247,0.08)',
        fontSize: '0.6rem',
        color: 'rgba(255,253,247,0.6)',
      }}
    >
      <span
        className="inline-block w-3 h-2 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}