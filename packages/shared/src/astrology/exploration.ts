// Exploration questions — a deterministic, pure picker that turns a
// synastry read into ten questions two people can sit with together.
//
// Design intent (Juno-core, NOT a new vertical):
//   - The section sits inside the existing Synastry surface, after "How to
//     talk to this person" and before "Watch for".
//   - It is a *conversation map*, never a verdict. No scoring is rendered.
//     No prediction is implied. The questions stay sober, intimate, mature.
//   - Output is purely a list of i18n keys + light metadata. All wording
//     lives in apps/*/locales|messages so the same shared logic feeds both
//     mobile and web with zero copy duplication.
//   - The picker is fully deterministic: same input → same ordered output.
//     This is enforced by the unit test in ./__tests__/exploration.test.ts.
//
// Shape:
//   - 4 zone-keyed questions (one per dimension: emotional, communication,
//     attraction, stability) chosen by the zone's score level (high/mid/low)
//   - 6 overall questions chosen by the total-score bucket (high/mid/low)
//   - Total: exactly 10 questions, in a stable order
//
// Why one pool for all reading-frames (love / friendship / business)?
// The questions are written in a frame-agnostic register ("between you",
// "each of you", "the two of you") that reads honest in every frame. The
// frame is still captured in each question's metadata so a future iteration
// can specialize without changing the picker contract.

export type ExplorationZoneKey =
  | 'emotional'
  | 'communication'
  | 'attraction'
  | 'stability';

export type ExplorationScoreLevel = 'high' | 'mid' | 'low';

export type ExplorationReadingFrame = 'love' | 'friendship' | 'business';

export type ExplorationQuestionTone = 'supportive' | 'watch' | 'deepening';

export type ExplorationQuestionScope = ExplorationZoneKey | 'overall';

export interface ExplorationZoneScore {
  key: ExplorationZoneKey;
  /** Integer 0..100, clamped on read. */
  score: number;
}

export interface ExplorationInput {
  /**
   * Zone scores for the four dimensions. Order is irrelevant; missing
   * zones fall through to the "mid" bucket so the surface always renders
   * 10 stable questions even on partial data.
   */
  zoneScores?: ExplorationZoneScore[] | null;
  /** Synastry total score, 0..100. */
  totalScore?: number | null;
  /**
   * Optional reading-frame. Currently does not change the picker output
   * but is recorded on each question's metadata for future use.
   */
  readingFrame?: ExplorationReadingFrame | null;
}

export interface ExplorationQuestion {
  /** Stable id == translationKey. */
  id: string;
  translationKey: string;
  scope: ExplorationQuestionScope;
  level: ExplorationScoreLevel;
  tone: ExplorationQuestionTone;
  /** Echo of the input frame; null when not provided. */
  frame: ExplorationReadingFrame | null;
  /** 1-based order in the rendered list (1..10). */
  order: number;
}

const TOTAL_QUESTIONS = 10;
const OVERALL_PER_LEVEL = 6;

/**
 * The four zones, in the order the questions render.
 * The order is intentional: emotional first (most universal entry point),
 * then communication, attraction, stability — matches the existing
 * Compatibility Dimensions card order on both surfaces.
 */
export const EXPLORATION_ZONE_ORDER: readonly ExplorationZoneKey[] = [
  'emotional',
  'communication',
  'attraction',
  'stability',
] as const;

const TONE_BY_LEVEL: Record<ExplorationScoreLevel, ExplorationQuestionTone> = {
  high: 'deepening',
  mid: 'supportive',
  low: 'watch',
};

/**
 * Threshold mapping. Hand-picked to match the existing band shape:
 *   - exceptional / strong → high  (≥ 70)
 *   - promising / mixed    → mid   (45..69)
 *   - growth / different   → low   (< 45)
 * The threshold is on the score itself rather than the band so the picker
 * does not depend on either app's band enum (mobile and web each define
 * their own — the shared package's SynastryBand enum is a different shape).
 */
function levelForScore(score: number | null | undefined): ExplorationScoreLevel {
  if (score == null || Number.isNaN(score)) return 'mid';
  const clamped = Math.max(0, Math.min(100, score));
  if (clamped >= 70) return 'high';
  if (clamped >= 45) return 'mid';
  return 'low';
}

/** Build the translation key for a single zone question. */
function zoneKey(zone: ExplorationZoneKey, level: ExplorationScoreLevel): string {
  return `exploration_${zone}_${level}`;
}

/** Build the translation key for an overall question slot. */
function overallKey(level: ExplorationScoreLevel, slot: number): string {
  return `exploration_overall_${level}_${slot}`;
}

/**
 * The full pool of question keys exposed for the guard script + tests.
 * The picker only ever returns keys from this set, in a subset of size 10.
 */
export function allExplorationKeys(): string[] {
  const keys: string[] = [];
  for (const zone of EXPLORATION_ZONE_ORDER) {
    for (const level of ['high', 'mid', 'low'] as const) {
      keys.push(zoneKey(zone, level));
    }
  }
  for (const level of ['high', 'mid', 'low'] as const) {
    for (let i = 1; i <= OVERALL_PER_LEVEL; i++) {
      keys.push(overallKey(level, i));
    }
  }
  return keys;
}

function zoneScoreLookup(
  zoneScores: ExplorationZoneScore[] | null | undefined,
): Map<ExplorationZoneKey, number> {
  const map = new Map<ExplorationZoneKey, number>();
  if (!zoneScores) return map;
  for (const entry of zoneScores) {
    if (!entry || typeof entry.score !== 'number') continue;
    map.set(entry.key, entry.score);
  }
  return map;
}

/**
 * Pick the ten exploration questions for a synastry read.
 *
 * Determinism guarantee:
 *   - Same `(zoneScores, totalScore)` always yields the same ordered list.
 *   - The order is: 4 zone questions in EXPLORATION_ZONE_ORDER, then 6
 *     overall questions in slot order 1..6 for the overall level bucket.
 *   - Missing zones / missing total are bucketed to 'mid' rather than
 *     omitted, so the surface always renders exactly TOTAL_QUESTIONS items.
 */
export function buildExplorationQuestions(
  input: ExplorationInput = {},
): ExplorationQuestion[] {
  const frame = input.readingFrame ?? null;
  const lookup = zoneScoreLookup(input.zoneScores);

  const out: ExplorationQuestion[] = [];

  // 1. One question per zone, level chosen by the zone's score.
  for (const zone of EXPLORATION_ZONE_ORDER) {
    const level = levelForScore(lookup.get(zone));
    const key = zoneKey(zone, level);
    out.push({
      id: key,
      translationKey: key,
      scope: zone,
      level,
      tone: TONE_BY_LEVEL[level],
      frame,
      order: out.length + 1,
    });
  }

  // 2. Six overall questions, level chosen by the total score bucket.
  const overallLevel = levelForScore(input.totalScore);
  for (let slot = 1; slot <= OVERALL_PER_LEVEL; slot++) {
    const key = overallKey(overallLevel, slot);
    out.push({
      id: key,
      translationKey: key,
      scope: 'overall',
      level: overallLevel,
      tone: TONE_BY_LEVEL[overallLevel],
      frame,
      order: out.length + 1,
    });
  }

  return out;
}
