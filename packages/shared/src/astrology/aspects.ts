// Aspect detection.
//
// Detection works on the exact angular separation between two ecliptic
// longitudes. Orb widths come from the centralized policy in ./orbs.ts
// (base table + luminary bonus + outer-outer tightening) — never hardcode
// orb numbers here or anywhere else.
//
// Applying/separating is intentionally NOT reported: natal-to-natal synastry
// has no shared instant at which to evaluate the bodies' relative velocity,
// so the flag cannot be computed honestly from two static charts. See the
// note on the `Aspect` type in ./types.ts.

import { resolveMaxOrb } from './orbs';
import type { Aspect, AspectKind, AspectName, PlacementKey } from './types';

interface AspectDefinition {
  name: AspectName;
  angle: number;
  kind: AspectKind;
}

/**
 * The five major (Ptolemaic) aspects. Orbs are resolved per body pair via
 * ./orbs.ts, so this table only carries the geometry + interpretive kind.
 */
export const ASPECT_DEFINITIONS: readonly AspectDefinition[] = [
  { name: 'conjunction', angle: 0, kind: 'intense' },
  { name: 'sextile', angle: 60, kind: 'harmonious' },
  { name: 'square', angle: 90, kind: 'challenging' },
  { name: 'trine', angle: 120, kind: 'harmonious' },
  { name: 'opposition', angle: 180, kind: 'challenging' },
] as const;

/**
 * Shortest angular separation between two ecliptic longitudes, in [0, 180].
 * Symmetric: angularSeparation(a, b) === angularSeparation(b, a).
 */
export function angularSeparation(long1: number, long2: number): number {
  return Math.abs(((long1 - long2 + 180) % 360 + 360) % 360 - 180);
}

/**
 * Detect the tightest in-orb major aspect between two longitudes.
 * Returns null when no aspect is within its allowed orb.
 *
 * `bodyA` / `bodyB` are optional body identities used ONLY to resolve the
 * orb policy (luminary bonus, outer-outer tightening). Omitting them applies
 * the base orbs — identical to the legacy longitude-only behavior.
 *
 * Guarantees:
 *   - Deterministic and pure (no clock, no randomness, no network).
 *   - Symmetric: detectAspect(l1, l2, a, b) === detectAspect(l2, l1, b, a).
 */
export function detectAspect(
  long1: number,
  long2: number,
  bodyA?: PlacementKey,
  bodyB?: PlacementKey,
): Aspect | null {
  const sep = angularSeparation(long1, long2);
  let best: Aspect | null = null;
  for (const def of ASPECT_DEFINITIONS) {
    const orb = Math.abs(sep - def.angle);
    const maxOrb = resolveMaxOrb(def.name, bodyA, bodyB);
    if (orb <= maxOrb && (best == null || orb < best.orb)) {
      best = {
        name: def.name,
        angle: def.angle,
        separation: Math.round(sep * 100) / 100,
        orb: Math.round(orb * 100) / 100,
        maxOrb,
        kind: def.kind,
      };
    }
  }
  return best;
}

/**
 * Sign-based aspect contribution coefficient, used by the synastry scorer.
 *   - Harmonious (sextile/trine): +1
 *   - Intense (conjunction): +0.6 (powerful but mixed)
 *   - Challenging (square/opposition): -0.5
 * Tighter orbs scale toward 1.0; wider toward 0.
 */
export function aspectCoefficient(aspect: Aspect): number {
  const orbTightness = Math.max(0, 1 - aspect.orb / 10);
  if (aspect.kind === 'harmonious') return orbTightness * 1.0;
  if (aspect.kind === 'intense') return orbTightness * 0.6;
  return -orbTightness * 0.5;
}

export interface PlacementPair {
  bodyA: PlacementKey;
  bodyB: PlacementKey;
  weight: number;
}
