// The card the game plays with. NMJL publishes a new card every April; to play a
// new year, add cards/nmjl<year>.ts (same shape as nmjl2025.ts, hands typed in
// from an authentic card) and point ACTIVE_CARD at it. The card is validated
// when this module loads, so a typo fails at startup.
import { NMJL_2025 } from './nmjl2025';
import { expandCard } from './expand';
import type { CardDefinition, CardPattern } from './types';

export const ACTIVE_CARD: CardDefinition = NMJL_2025;
export const ACTIVE_PATTERNS: CardPattern[] = expandCard(ACTIVE_CARD);

/** Largest identical group on the card (5 = quints). Sextets are callable only if the card has them. */
export const CARD_MAX_GROUP_SIZE: number = ACTIVE_PATTERNS.reduce((max, p) => {
  for (const tok of p.tokens) {
    if (tok.c === 'o' || tok.t.length < 3) continue;
    if (tok.t.split('').every(ch => ch === tok.t[0])) max = Math.max(max, tok.t.length);
  }
  return max;
}, 3);

export type { CardDefinition, CardPattern, CardHand, CardSection } from './types';
