// Card data model. A card is a list of hands (one per printed line). Each hand
// lists every concrete variant it allows, in the compact token form
// "FFFF:n 2025:g 222:r 222:b":
//   text  F… flowers · N/E/W/S winds · D… dragons · digits 1–9 · 0 = White Dragon
//   color g / r / b = three different suits (any assignment) · n = no suit
//         (on a D token, n means "any one dragon") · o = decoration (+, =), ignored
// Groups of 3+ identical tiles (pung, kong, quint, sextet) may use Jokers;
// singles, pairs and runs such as NEWS, 2025 or 123 may not.

export type CardSection =
  | 'year' | '2468' | 'likeNumbers' | 'quints' | 'consecutiveRun'
  | '13579' | 'windsDragons' | '369' | 'singlesPairs';

export interface CardHand {
  id: string;           // stable id, e.g. "CR-7"
  section: CardSection;
  line: number;         // line number within its section, 1-based
  label: string;        // how the line reads on the card
  desc: string;         // the card's small print
  points: number;
  concealed: boolean;   // "C" on the card — no exposures except the winning tile
  variants: string[];   // every concrete token string this line allows
}

export interface CardDefinition {
  id: string;
  name: string;
  year: number;
  sectionNames: Record<CardSection, string>;
  hands: CardHand[];
}

/** One concrete, playable variant of a hand (what the matcher works with). */
export interface CardPattern {
  tokens: { t: string; c: string }[];
  concealed: boolean;
  handId: string;
  section: CardSection;
  points: number;
  label: string;
}
