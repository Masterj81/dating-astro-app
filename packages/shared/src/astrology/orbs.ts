// Orb policy — the single, centralized place where "how wide is an aspect
// allowed to be" is decided. Every consumer (natal aspects, synastry frames,
// interpretive outer-planet aspects, edge functions once they de-duplicate)
// must resolve orbs through `resolveMaxOrb` instead of hardcoding numbers.
//
// ── Policy (scoring model v2) ────────────────────────────────────────────
//
// Base orbs per aspect (classic mid-width table, tighter than the v1 table
// which used trine 8 / sextile 6):
//
//   conjunction  8°
//   opposition   8°
//   square       7°
//   trine        7°
//   sextile      5°
//
// Modifiers, applied to the base in this order:
//
//   +1°  if at least one body is a luminary (Sun or Moon). Luminaries are
//        the strongest chart factors; traditional orb tables consistently
//        widen them.
//   −2°  if BOTH bodies are outer planets (Uranus/Neptune/Pluto). Slow
//        movers sit in aspect for years — a wide orb would flag entire
//        generations, so outer-outer contacts must be near-exact to be
//        worth reporting.
//
// The two modifiers are mutually exclusive by construction (a luminary is
// not an outer planet), so ordering never actually matters — but keep the
// order documented in case a future modifier overlaps.
//
// The resulting orb is clamped to ≥ 1° so no combination can zero out.
//
// Guarantees:
//   - Deterministic: pure lookup, no clock, no randomness, no network.
//   - Symmetric: resolveMaxOrb(a, x, y) === resolveMaxOrb(a, y, x).
//   - Backward-tolerant: body arguments are optional; without them the base
//     orb applies (matches how longitude-only callers behaved historically).
//
// Changing ANY number in this file changes detected aspects and therefore
// synastry scores → bump SCORING_MODEL_VERSION in ./version.ts.

import type { AspectName, PlacementKey } from './types';

/** Base orb per aspect, in degrees. Scoring model v2 values. */
export const BASE_ORBS: Readonly<Record<AspectName, number>> = {
  conjunction: 8,
  opposition: 8,
  square: 7,
  trine: 7,
  sextile: 5,
} as const;

/** Extra allowance when a luminary (Sun/Moon) is involved, in degrees. */
export const LUMINARY_ORB_BONUS = 1;

/** Tightening when both bodies are outer planets, in degrees. */
export const OUTER_OUTER_ORB_PENALTY = 2;

/** Hard floor — an orb can never resolve below this, in degrees. */
export const MIN_ORB = 1;

const LUMINARIES: ReadonlySet<PlacementKey> = new Set(['sun', 'moon']);
const OUTER_PLANETS: ReadonlySet<PlacementKey> = new Set([
  'uranus',
  'neptune',
  'pluto',
]);

export function isLuminary(body: PlacementKey): boolean {
  return LUMINARIES.has(body);
}

export function isOuterPlanet(body: PlacementKey): boolean {
  return OUTER_PLANETS.has(body);
}

/**
 * Resolve the maximum allowed orb for an aspect between two bodies.
 *
 * `bodyA` / `bodyB` are optional: longitude-only callers (no body context)
 * get the base orb. Symmetric in (bodyA, bodyB) by construction — both
 * modifiers only ask set-membership questions that don't depend on order.
 */
export function resolveMaxOrb(
  aspect: AspectName,
  bodyA?: PlacementKey,
  bodyB?: PlacementKey,
): number {
  let orb = BASE_ORBS[aspect];
  if ((bodyA && isLuminary(bodyA)) || (bodyB && isLuminary(bodyB))) {
    orb += LUMINARY_ORB_BONUS;
  }
  if (bodyA && bodyB && isOuterPlanet(bodyA) && isOuterPlanet(bodyB)) {
    orb -= OUTER_OUTER_ORB_PENALTY;
  }
  return Math.max(MIN_ORB, orb);
}
