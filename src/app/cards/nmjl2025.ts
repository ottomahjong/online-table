// NMJL 2025 card — the hands this game has always played, now with each line's
// id, section, points and concealed flag attached. Variants are the same token
// strings the engine used before this module existed.
import { CardDefinition, CardHand } from './types';
import { shifts, each } from './expand';

const EVENS = [2, 4, 6, 8];
const ODDS = [1, 3, 5, 7, 9];
const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const WINDS = ['NNNN', 'EEEE', 'WWWW', 'SSSS'];

const hands: CardHand[] = [
  // ── 2025 ────────────────────────────────────────────────────────────
  { id: 'YR-1', section: 'year', line: 1, label: 'FFFF 2025 222 222', points: 25, concealed: false,
    desc: 'Any 3 Suits, Like Pungs 2s or 5s in Opp. Suits',
    variants: ['FFFF:n 2025:g 222:r 222:b', 'FFFF:n 2025:g 555:r 555:b'] },
  { id: 'YR-2', section: 'year', line: 2, label: '222 0000 222 5555', points: 25, concealed: false,
    desc: 'Any 2 Suits', variants: ['222:g 0000:g 222:r 5555:r'] },
  { id: 'YR-3', section: 'year', line: 3, label: '2025 222 555 DDDD', points: 30, concealed: false,
    desc: 'Any 3 Suits', variants: ['2025:r 222:g 555:g DDDD:b'] },
  { id: 'YR-4', section: 'year', line: 4, label: 'FF 222 000 222 555', points: 25, concealed: true,
    desc: 'Any 3 Suits', variants: ['FF:n 222:g 000:b 222:r 555:r'] },

  // ── 2468 ────────────────────────────────────────────────────────────
  { id: '2468-1', section: '2468', line: 1, label: '222 4444 666 8888', points: 25, concealed: false,
    desc: 'Any 1 or 2 Suits', variants: ['222:g 4444:g 666:g 8888:g', '222:g 4444:r 666:g 8888:r'] },
  { id: '2468-2', section: '2468', line: 2, label: 'FF 2222 + 4444 = 6666', points: 25, concealed: false,
    desc: 'Any 3 Suits', variants: ['FF:n 2222:g 4444:r 6666:b', 'FF:n 2222:g 6666:r 8888:b'] },
  { id: '2468-3', section: '2468', line: 3, label: '22 444 66 888 DDDD', points: 25, concealed: false,
    desc: 'Any 1 Suit', variants: ['22:b 444:b 66:b 888:b DDDD:b'] },
  { id: '2468-4', section: '2468', line: 4, label: 'FFFF 2468 222 222', points: 25, concealed: false,
    desc: 'Any 3 Suits, Like Pungs Any Even No.', variants: each(EVENS, n => `FFFF:n 2468:g ${n}${n}${n}:r ${n}${n}${n}:b`) },
  { id: '2468-5', section: '2468', line: 5, label: 'FFF 22 44 666 8888', points: 25, concealed: false,
    desc: 'Any 1 Suit', variants: ['FFF:n 22:b 44:b 666:b 8888:b'] },
  { id: '2468-6', section: '2468', line: 6, label: '222 4444 666 88 88', points: 25, concealed: false,
    desc: 'Any 3 Suits, Pairs 8s Only', variants: ['222:g 4444:g 666:r 88:r 88:b'] },
  { id: '2468-7', section: '2468', line: 7, label: 'FF 2222 DDDD 2222', points: 25, concealed: false,
    desc: 'Any 3 Suits, Like Kongs Any Even No.', variants: each(EVENS, n => `FF:n ${n}${n}${n}${n}:g DDDD:r ${n}${n}${n}${n}:b`) },
  { id: '2468-8', section: '2468', line: 8, label: '22 44 66 88 222 222', points: 30, concealed: true,
    desc: 'Any 3 Suits, Like Pungs Any Even No.', variants: each(EVENS, n => `22:g 44:g 66:g 88:g ${n}${n}${n}:r ${n}${n}${n}:b`) },

  // ── Any Like Numbers ───────────────────────────────────────────────
  { id: 'LN-1', section: 'likeNumbers', line: 1, label: 'FF 1111 D 1111 D 11', points: 25, concealed: false,
    desc: 'Any 3 Suits', variants: each(ALL, n => `FF:n ${n}${n}${n}${n}:g D:g ${n}${n}${n}${n}:r D:r ${n}${n}:b`) },
  { id: 'LN-2', section: 'likeNumbers', line: 2, label: 'FFFF 11 111 111 11', points: 30, concealed: false,
    desc: 'Any 3 Suits, Pairs Must Be Same Suit',
    variants: [
      ...each(ALL, n => `FFFF:n ${n}${n}:g ${n}${n}${n}:g ${n}${n}${n}:r ${n}${n}:b`),
      ...each(ALL, n => `FFFF:n ${n}${n}:g ${n}${n}${n}:r ${n}${n}${n}:b ${n}${n}:g`),
    ] },
  { id: 'LN-3', section: 'likeNumbers', line: 3, label: 'FF 111 111 111 DDD', points: 25, concealed: false,
    desc: 'Any 3 Suits, Any Dragon', variants: each(ALL, n => `FF:n ${n}${n}${n}:g ${n}${n}${n}:r ${n}${n}${n}:b DDD:n`) },

  // ── Quints ─────────────────────────────────────────────────────────
  { id: 'QU-1', section: 'quints', line: 1, label: 'FF 111 2222 33333', points: 40, concealed: false,
    desc: 'Any 3 Suits, Any 3 Consec. Nos.', variants: shifts('FF:n 111:g 2222:r 33333:b', 0, 6) },
  { id: 'QU-2', section: 'quints', line: 2, label: '11111 NNNN 22222', points: 45, concealed: false,
    desc: 'Any 1 Suit, Any Consec. Nos., Any Wind',
    variants: WINDS.flatMap(w => shifts(`11111:b ${w}:n 22222:b`, 0, 7)) },
  { id: 'QU-3', section: 'quints', line: 3, label: 'FF 11111 11 11111', points: 45, concealed: false,
    desc: 'Any 2 Suits, Any Like Nos.', variants: each(ALL, n => `FF:n ${n}${n}${n}${n}${n}:g ${n}${n}:b ${n}${n}${n}${n}${n}:r`) },

  // ── Consecutive Run ────────────────────────────────────────────────
  { id: 'CR-1', section: 'consecutiveRun', line: 1, label: '11 222 3333 444 55', points: 25, concealed: false,
    desc: 'Any 1 Suit, These Nos. Only', variants: ['11:b 222:b 3333:b 444:b 55:b', '55:b 666:b 7777:b 888:b 99:b'] },
  { id: 'CR-2', section: 'consecutiveRun', line: 2, label: '111 2222 333 4444', points: 25, concealed: false,
    desc: 'Any 1 or 2 Suits, Any 4 Consec. Nos',
    variants: [...shifts('111:b 2222:b 333:b 4444:b', 0, 5), ...shifts('111:g 2222:r 333:g 4444:r', 0, 5)] },
  { id: 'CR-3', section: 'consecutiveRun', line: 3, label: 'FFFF 1111 22 3333', points: 25, concealed: false,
    desc: 'Any 1 or 3 Suits, Any 3 Consec. Nos',
    variants: [...shifts('FFFF:n 1111:b 22:b 3333:b', 0, 6), ...shifts('FFFF:n 1111:g 22:r 3333:b', 0, 6)] },
  { id: 'CR-4', section: 'consecutiveRun', line: 4, label: 'FFF 123 4444 5555', points: 25, concealed: false,
    desc: 'Any 3 Suits, Any 5 Consec. Nos', variants: shifts('FFF:n 123:g 4444:r 5555:b', 0, 4) },
  { id: 'CR-5', section: 'consecutiveRun', line: 5, label: 'FF 11 222 3333 DDD', points: 25, concealed: false,
    desc: 'Any 1 Suit, Any 3 Consec. Nos', variants: shifts('FF:n 11:b 222:b 3333:b DDD:n', 0, 6) },
  { id: 'CR-6', section: 'consecutiveRun', line: 6, label: '111 222 3333 DD DD', points: 25, concealed: false,
    desc: 'Any 3 Suits, Any 3 Consec. Nos w Opp. Dragons', variants: shifts('111:g 222:g 3333:r DD:g DD:r', 0, 6) },
  // The pair may sit at any of the five run positions; kongs match the pair,
  // in the run's suit or the two other suits.
  { id: 'CR-7', section: 'consecutiveRun', line: 7, label: '112345 1111 1111', points: 30, concealed: false,
    desc: 'Any 5 Consec. Nos, Pair Any Nos, In Pung, Kongs Match Pair',
    variants: ['112345:b 1111:b 1111:b', '112345:b 1111:g 1111:r',
               '122345:b 2222:b 2222:b', '122345:b 2222:g 2222:r',
               '123345:b 3333:b 3333:b', '123345:b 3333:g 3333:r',
               '123445:b 4444:b 4444:b', '123445:b 4444:g 4444:r',
               '123455:b 5555:b 5555:b', '123455:b 5555:g 5555:r'].flatMap(v => shifts(v, 0, 4)) },
  { id: 'CR-8', section: 'consecutiveRun', line: 8, label: 'FF 1 22 333 1 22 333', points: 30, concealed: true,
    desc: 'Any 2 Suits, Any Same 3 Consec. Nos', variants: shifts('FF:n 1:g 22:g 333:g 1:r 22:r 333:r', 0, 6) },

  // ── 13579 ──────────────────────────────────────────────────────────
  { id: 'OD-1', section: '13579', line: 1, label: '11 333 5555 777 99', points: 25, concealed: false,
    desc: 'Any 1 or 3 Suits', variants: ['11:b 333:b 5555:b 777:b 99:b', '11:g 333:g 5555:r 777:r 99:b'] },
  { id: 'OD-2', section: '13579', line: 2, label: '111 3333 333 5555', points: 25, concealed: false,
    desc: 'Any 2 Suits', variants: ['111:g 3333:g 333:r 5555:r', '555:g 7777:g 777:r 9999:r'] },
  { id: 'OD-3', section: '13579', line: 3, label: '1111 333 5555 DDD', points: 25, concealed: false,
    desc: 'Any 1 Suit', variants: ['1111:b 333:b 5555:b DDD:n', '5555:b 777:b 9999:b DDD:n'] },
  { id: 'OD-4', section: '13579', line: 4, label: 'FFFF 1111 + 9999 = 10', points: 25, concealed: false,
    desc: 'Any 2 Suits, These Nos. Only', variants: ['FFFF:n 1111:g 9999:r 10:b'] },
  { id: 'OD-5', section: '13579', line: 5, label: 'FFF 135 7777 9999', points: 25, concealed: false,
    desc: 'Any 1 or 3 Suits', variants: ['FFF:n 135:b 7777:b 9999:b', 'FFF:n 135:g 7777:r 9999:b'] },
  { id: 'OD-6', section: '13579', line: 6, label: '111 333 5555 DD DD', points: 25, concealed: false,
    desc: 'Any 3 Suits w Opp. Dragons', variants: ['111:g 333:g 5555:r DD:g DD:r', '555:g 777:g 9999:r DD:g DD:r'] },
  { id: 'OD-7', section: '13579', line: 7, label: '11 333 NEWS 333 55', points: 30, concealed: false,
    desc: 'Any 2 Suits', variants: ['11:g 333:g NEWS:n 333:r 55:r', '55:g 777:g NEWS:n 777:r 99:r'] },
  { id: 'OD-8', section: '13579', line: 8, label: '1111 33 55 77 9999', points: 30, concealed: false,
    desc: 'Any 2 Suits', variants: ['1111:g 33:r 55:r 77:r 9999:g'] },
  { id: 'OD-9', section: '13579', line: 9, label: 'FF 11 33 111 333 55', points: 30, concealed: false,
    desc: 'Any 3 Suits', variants: ['FF:n 11:g 33:g 111:r 333:r 55:b', 'FF:n 55:g 77:g 555:r 777:r 99:b'] },

  // ── Winds & Dragons ────────────────────────────────────────────────
  { id: 'WD-1', section: 'windsDragons', line: 1, label: 'NNNN EEE WWW SSSS', points: 25, concealed: false,
    desc: '', variants: ['NNNN:n EEE:n WWW:n SSSS:n', 'NNN:n EEEE:n WWWW:n SSS:n'] },
  { id: 'WD-2', section: 'windsDragons', line: 2, label: 'FF 123 DD DDD DDDD', points: 25, concealed: false,
    desc: 'Any 3 Consec. Nos. in Any 1 Suit, Any 3 Dragons', variants: shifts('FF:n 123:g DD:g DDD:r DDDD:b', 0, 6) },
  { id: 'WD-3', section: 'windsDragons', line: 3, label: 'FFF NN EE WWWW SSS', points: 25, concealed: false,
    desc: '', variants: ['FFF:n NN:n EE:n WWWW:n SSS:n'] },
  { id: 'WD-4', section: 'windsDragons', line: 4, label: 'FFFF DDD NEWS DDD', points: 25, concealed: false,
    desc: 'Dragons Any 2 Suits', variants: ['FFFF:n DDD:g NEWS:n DDD:r'] },
  { id: 'WD-5', section: 'windsDragons', line: 5, label: 'NNNN 1 11 111 SSSS', points: 25, concealed: false,
    desc: 'Any Like Odd Nos. in 3 Suits', variants: each(ODDS, n => `NNNN:n ${n}:g ${n}${n}:r ${n}${n}${n}:b SSSS:n`) },
  { id: 'WD-6', section: 'windsDragons', line: 6, label: 'EEEE 2 22 222 WWWW', points: 25, concealed: false,
    desc: 'Any Like Even Nos. in 3 Suits', variants: each(EVENS, n => `EEEE:n ${n}:g ${n}${n}:r ${n}${n}${n}:b WWWW:n`) },
  { id: 'WD-7', section: 'windsDragons', line: 7, label: 'NNN EE WWW SS 2025', points: 30, concealed: false,
    desc: '2025 Any 1 Suit', variants: ['NNN:n EE:n WWW:n SS:n 2025:g', 'NNN:n EE:n WW:n SSS:n 2025:g'] },
  { id: 'WD-8', section: 'windsDragons', line: 8, label: 'NN EE WWW SSS DDDD', points: 30, concealed: true,
    desc: 'Kong Any Dragon', variants: ['NN:n EE:n WWW:n SSS:n DDDD:n'] },

  // ── 369 ────────────────────────────────────────────────────────────
  { id: '369-1', section: '369', line: 1, label: '333 6666 666 9999', points: 25, concealed: false,
    desc: 'Any 2 or 3 Suits', variants: ['333:g 6666:g 666:r 9999:r', '333:g 6666:r 666:b 9999:r'] },
  { id: '369-2', section: '369', line: 2, label: 'FF 3333 + 6666 = 9999', points: 25, concealed: false,
    desc: 'Any 1 or 3 Suits', variants: ['FF:n 3333:b 6666:b 9999:b', 'FF:n 3333:g 6666:r 9999:b'] },
  { id: '369-3', section: '369', line: 3, label: '3333 DDD 3333 DDD', points: 25, concealed: false,
    desc: 'Any 2 Suits, Like Kongs 3, 6 or 9 w Matching Dragons',
    variants: each([3, 6, 9], n => `${n}${n}${n}${n}:g DDD:g ${n}${n}${n}${n}:r DDD:r`) },
  { id: '369-4', section: '369', line: 4, label: 'FFF 3333 369 9999', points: 25, concealed: false,
    desc: 'Any 2 Suits', variants: ['FFF:n 3333:g 369:r 9999:r'] },
  { id: '369-5', section: '369', line: 5, label: '33 66 99 3333 3333', points: 25, concealed: false,
    desc: 'Any 3 Suits, Like Kongs 3, 6, or 9', variants: each([3, 6, 9], n => `33:g 66:g 99:g ${n}${n}${n}${n}:r ${n}${n}${n}${n}:b`) },
  { id: '369-6', section: '369', line: 6, label: 'FF 333 D 666 D 999 D', points: 30, concealed: true,
    desc: 'Any 3 Suits w Matching Dragons', variants: ['FF:n 333:g D:g 666:r D:r 999:b D:b'] },

  // ── Singles & Pairs ────────────────────────────────────────────────
  { id: 'SP-1', section: 'singlesPairs', line: 1, label: 'NN EW SS 11 22 33 44', points: 50, concealed: true,
    desc: 'Any 1 Suit, Any 4 Consec. Nos.', variants: shifts('NN:n EW:n SS:n 11:b 22:b 33:b 44:b', 0, 5) },
  { id: 'SP-2', section: 'singlesPairs', line: 2, label: 'FF 2468 DD 2468 DD', points: 50, concealed: true,
    desc: 'Any 2 Suits w Matching Dragons', variants: ['FF:n 2468:g DD:g 2468:r DD:r'] },
  { id: 'SP-3', section: 'singlesPairs', line: 3, label: '336699 336699 33', points: 50, concealed: true,
    desc: 'Any 3 Suits, Pair 3, 6, or 9 In Third Suit', variants: each([3, 6, 9], n => `336699:g 336699:r ${n}${n}:b`) },
  { id: 'SP-4', section: 'singlesPairs', line: 4, label: 'FF 11 22 11 22 11 22', points: 50, concealed: true,
    desc: 'Any 3 Suits, Any 2 Consec. Nos.', variants: shifts('FF:n 11:g 22:g 11:r 22:r 11:b 22:b', 0, 7) },
  { id: 'SP-5', section: 'singlesPairs', line: 5, label: '11 33 55 77 99 11 11', points: 50, concealed: true,
    desc: 'Any 3 Suits, Pairs Any Like Odd Nos. in Opp. Suits', variants: each(ODDS, n => `11:g 33:g 55:g 77:g 99:g ${n}${n}:r ${n}${n}:b`) },
  { id: 'SP-6', section: 'singlesPairs', line: 6, label: 'FF 2025 2025 2025', points: 75, concealed: true,
    desc: 'Any 3 Suits', variants: ['FF:n 2025:g 2025:r 2025:b'] },
];

export const NMJL_2025: CardDefinition = {
  id: 'nmjl-2025',
  name: 'NMJL 2025',
  year: 2025,
  sectionNames: {
    year: '2025', '2468': '2468', likeNumbers: 'Any Like Numbers', quints: 'Quints',
    consecutiveRun: 'Consecutive Run', '13579': '13579', windsDragons: 'Winds & Dragons',
    '369': '369', singlesPairs: 'Singles & Pairs',
  },
  hands,
};
