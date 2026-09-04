// Conversation Guide — signs and situations.
//
// The free/locked split lives HERE and nowhere else. The screen reads it, the
// selector reads it, and `scripts/validate-coach-content.mjs` reads it, so the
// three can never disagree about which situation is the free one.

import type { CoachSign, CoachSituation, CoachSituationKey } from './types';

export const COACH_SIGNS: readonly CoachSign[] = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;

/**
 * Situations, in render order.
 *
 * `start` is free and unlimited by product decision, not by accident: it is
 * the only surface in the app whose value does not run out, and gating it
 * would put the paywall in front of the Aha moment. See §4.5 of
 * `docs/conversation-coach-feature-plan-2026-08.md`.
 */
export const COACH_SITUATIONS: readonly CoachSituation[] = [
  { key: 'start', access: 'free', order: 1, labelKey: 'conversationGuideSituationStart' },
  { key: 'clarity', access: 'locked', order: 2, labelKey: 'conversationGuideSituationClarity' },
  { key: 'repair', access: 'locked', order: 3, labelKey: 'conversationGuideSituationRepair' },
  { key: 'boundary', access: 'locked', order: 4, labelKey: 'conversationGuideSituationBoundary' },
  { key: 'feelings', access: 'locked', order: 5, labelKey: 'conversationGuideSituationFeelings' },
  { key: 'plan', access: 'locked', order: 6, labelKey: 'conversationGuideSituationPlan' },
  { key: 'flirt', access: 'locked', order: 7, labelKey: 'conversationGuideSituationFlirt' },
  { key: 'slow', access: 'locked', order: 8, labelKey: 'conversationGuideSituationSlow' },
] as const;

/** The single free situation. Throws at module load if the table ever loses it. */
export const COACH_FREE_SITUATION: CoachSituationKey = (() => {
  const free = COACH_SITUATIONS.filter((s) => s.access === 'free');
  if (free.length !== 1) {
    throw new Error(
      `Conversation Guide must expose exactly one free situation, found ${free.length}. ` +
        'A free account needs one surface that never runs out.',
    );
  }
  return free[0].key;
})();

export const COACH_SITUATION_KEYS: readonly CoachSituationKey[] = COACH_SITUATIONS.map(
  (s) => s.key,
);

/**
 * Validate an untrusted sign string (deep link, push payload, or a
 * `profiles.sun_sign` value which may be capitalised or absent).
 * Returns null rather than guessing — a guessed sign renders someone else's
 * advice under a name the reader trusts.
 */
export function resolveCoachSign(value: string | null | undefined): CoachSign | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (COACH_SIGNS as readonly string[]).includes(normalized)
    ? (normalized as CoachSign)
    : null;
}

/** Validate an untrusted situation string. Returns null on anything unknown. */
export function resolveCoachSituation(
  value: string | null | undefined,
): CoachSituationKey | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return (COACH_SITUATION_KEYS as readonly string[]).includes(normalized)
    ? (normalized as CoachSituationKey)
    : null;
}

export function getCoachSituation(key: CoachSituationKey): CoachSituation {
  const found = COACH_SITUATIONS.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown Conversation Guide situation: ${key}`);
  return found;
}

export function isCoachSituationLocked(key: CoachSituationKey): boolean {
  return getCoachSituation(key).access === 'locked';
}
