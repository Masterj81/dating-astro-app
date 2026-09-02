/**
 * The draw: seeded, deterministic, and fair.
 *
 * Both legacy engines produced the same reading for the same seed — verified
 * by importing them side by side — so consolidating them changes nothing about
 * WHICH engine is right. But all three moving parts had defects worth fixing
 * while the corpus is being rewritten anyway (every card already says something
 * new, so no reader loses a reading they recognise):
 *
 * 1. THE SHUFFLE WAS BIASED AND ENGINE-DEPENDENT.
 *    `[...deck].sort(() => rng() - 0.5)` is the classic broken shuffle. A
 *    comparator that ignores its arguments violates the ordering contract, so
 *    the result depends on the sort algorithm: V8 (web) and Hermes (React
 *    Native) do not have to agree, which means the two platforms could hand the
 *    same account different cards for the same seed and nothing would notice.
 *    It is also measurably non-uniform — some cards land in position one far
 *    more often than 1/78. For a product whose whole claim is that the draw is
 *    honest, a loaded deck is not a detail. Replaced with Fisher-Yates, which
 *    is uniform and depends on nothing but the generator.
 *
 * 2. THE GENERATOR LOST ITS LOW BITS.
 *    The old LCG computed `hash * 1103515245 + 12345` in double precision.
 *    With `hash` up to 2^31 that product reaches ~2.3e18, past the 2^53 where
 *    doubles stop being exact, so the low bits — the ones the mask keeps —
 *    were rounding noise. It still looked random, which is exactly why nobody
 *    checked. mulberry32 uses `Math.imul` and stays exact in 32 bits.
 *
 * 3. THE WEEK NUMBER WAS AN APPROXIMATION.
 *    `Math.ceil((days + startOfYear.getDay() + 1) / 7)` drifts around new year
 *    and can return week 53 or 54. Any stable key would do for seeding, but a
 *    key that jumps produces two "weekly" readings in one week. ISO 8601 week
 *    numbering is used instead, computed on the local date so that "your week"
 *    means the reader's week, not UTC's.
 *
 * Determinism is what makes this a reading rather than a slot machine: the
 * same person, mode and period gets the same cards every time they open the
 * screen, all week or all month, and it costs no storage.
 */
import { DECK } from './deck';
import type {
  CardMeanings,
  ReadingMode,
  ReadingPeriod,
  SpreadPosition,
  TarotCardShape,
} from './types';

/**
 * Draw order. Weekly readings use all four; monthly readings use the first
 * three. That split is the existing product rule — Cosmic gets the extra
 * advice card — and it lived in two screens as `slice(0, isCosmic ? 4 : 3)`.
 * It belongs here, where both platforms read the same sentence.
 */
export const SPREAD_POSITIONS: readonly SpreadPosition[] = [
  'present',
  'attention',
  'connection',
  'advice',
] as const;

export const CARDS_PER_PERIOD: Record<ReadingPeriod, number> = {
  weekly: 4,
  monthly: 3,
};

/** Share of cards drawn reversed. Unchanged from both legacy engines. */
const REVERSED_PROBABILITY = 0.3;

/** FNV-1a over the seed string: exact in 32 bits, unlike the old `<< 5` hash. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, exact in 32 bits, and uniform enough for a deck. */
export function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Uniform, and identical under any JS engine. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

/**
 * ISO 8601 week number of a local date. Weeks start Monday; week 1 is the one
 * containing the first Thursday of the year.
 */
export function isoWeek(date: Date): { year: number; week: number } {
  // Work on a UTC copy of the LOCAL calendar date, so the arithmetic below is
  // free of DST while still describing the reader's own day.
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // Thursday of the current week decides which year the week belongs to.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

/** The key that holds a reading still for a week or a month. */
export function periodKey(period: ReadingPeriod, now: Date): string {
  if (period === 'weekly') {
    const { year, week } = isoWeek(now);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
  return `${now.getFullYear()}-M${now.getMonth() + 1}`;
}

export type DrawnShape = {
  position: SpreadPosition;
  shape: TarotCardShape;
  reversed: boolean;
};

/**
 * The draw itself — shapes and orientations only, no prose. Localisation
 * happens one layer up so this function has nothing to say about language.
 */
export function drawSpread(options: {
  userId: string;
  mode: ReadingMode;
  period: ReadingPeriod;
  now?: Date;
}): { cards: DrawnShape[]; seed: string } {
  const now = options.now ?? new Date();
  const seedKey = periodKey(options.period, now);
  const rng = seededRandom(
    `${options.userId}-${options.mode}-${options.period}-${seedKey}`,
  );

  const shuffled = shuffle(DECK, rng);
  const count = CARDS_PER_PERIOD[options.period];

  const cards = SPREAD_POSITIONS.slice(0, count).map((position, index) => ({
    position,
    shape: shuffled[index]!,
    reversed: rng() < REVERSED_PROBABILITY,
  }));

  return { cards, seed: seedKey };
}

/** The orientation-aware meaning, in one place rather than four call sites. */
export function pickMeaning(
  meanings: CardMeanings,
  mode: ReadingMode,
  reversed: boolean,
): string {
  return meanings[mode][reversed ? 'reversed' : 'upright'];
}
