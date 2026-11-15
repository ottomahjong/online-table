import { CardDefinition, CardPattern } from './types';

export function parseTokenStr(s: string): { t: string; c: string }[] {
  return s.trim().split(/\s+/).map(part => {
    const idx = part.lastIndexOf(':');
    return { t: part.slice(0, idx), c: part.slice(idx + 1) };
  });
}

/** Shift every digit 1–9 by delta (0 = White Dragon is never shifted). */
export function shiftTokenStr(tokenStr: string, delta: number): string {
  if (delta === 0) return tokenStr;
  return tokenStr.split(' ').map(token => {
    const idx = token.lastIndexOf(':');
    const text = token.slice(0, idx).replace(/[1-9]/g, ch => {
      const v = parseInt(ch) + delta;
      if (v < 1 || v > 9) throw new Error(`Shift of "${tokenStr}" by ${delta} leaves 1–9`);
      return String(v);
    });
    return text + token.slice(idx);
  }).join(' ');
}

/** Every shift of `base` from d = from..to (flexible sections: runs, like numbers, quints). */
export function shifts(base: string, from: number, to: number): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d++) out.push(shiftTokenStr(base, d));
  return out;
}

/** Replace the placeholder digit "n" with each value in `values`. */
export function each(values: (string | number)[], template: (n: string) => string): string[] {
  return values.map(v => template(String(v)));
}

const TOKEN_RE = /^(F+|[NEWS]+|D+|[0-9]+)$/;

/**
 * Validate a card. Throws with the hand id on the first problem, so a bad card
 * fails loudly at startup rather than when someone clicks a button.
 */
export function validateCard(card: CardDefinition): void {
  const ids = new Set<string>();
  for (const hand of card.hands) {
    if (ids.has(hand.id)) throw new Error(`Card ${card.id}: duplicate hand id ${hand.id}`);
    ids.add(hand.id);
    if (hand.variants.length === 0) throw new Error(`Card ${card.id}: hand ${hand.id} has no variants`);
    if (!(hand.points > 0)) throw new Error(`Card ${card.id}: hand ${hand.id} has no points`);
    for (const v of hand.variants) {
      let total = 0;
      for (const { t, c } of parseTokenStr(v)) {
        if (c === 'o') continue;
        if (!TOKEN_RE.test(t)) throw new Error(`Card ${card.id}: hand ${hand.id} has a bad token "${t}" in "${v}"`);
        if (!['g', 'r', 'b', 'n'].includes(c)) throw new Error(`Card ${card.id}: hand ${hand.id} has a bad color "${c}" in "${v}"`);
        if (/^[0-9]+$/.test(t) && /[1-9]/.test(t) && c === 'n') {
          throw new Error(`Card ${card.id}: hand ${hand.id} has numbers with no suit in "${v}"`);
        }
        total += t.length;
      }
      if (total !== 14) throw new Error(`Card ${card.id}: hand ${hand.id} variant "${v}" has ${total} tiles, expected 14`);
    }
  }
}

export function expandCard(card: CardDefinition): CardPattern[] {
  validateCard(card);
  const patterns: CardPattern[] = [];
  for (const hand of card.hands) {
    for (const v of hand.variants) {
      patterns.push({
        tokens: parseTokenStr(v),
        concealed: hand.concealed,
        handId: hand.id,
        section: hand.section,
        points: hand.points,
        label: hand.label,
      });
    }
  }
  return patterns;
}
