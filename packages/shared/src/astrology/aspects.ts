// Aspect detection.
//
// We use a fixed orb table per major aspect. This matches the legacy mobile +
// edge orbs (kept identical so Phase 1 doesn't change displayed scores beyond
// the timezone bug fix). Phase 2 (Swiss Ephemeris) can move to moiety-based
// orbs derived from each body's orb table — leaving the door open here.

import type { Aspect, AspectKind, AspectName, PlacementKey } from './types';

interface AspectDefinition {
  name: AspectName;
  angle: number;
  orb: number;
  kind: AspectKind;
}

export const ASPECT_DEFINITIONS: readonly AspectDefinition[] = [
  { name: 'conjunction', angle: 0, orb: 8, kind: 'intense' },
  { name: 'sextile', angle: 60, orb: 6, kind: 'harmonious' },
  { name: 'square', angle: 90, orb: 7, kind: 'challenging' },
  { name: 'trine', angle: 120, orb: 8, kind: 'harmonious' },
  { name: 'opposition', angle: 180, orb: 8, kind: 'challenging' },
] as const;

/**
 * Shortest angular separation between two ecliptic longitudes, in [0, 180].
 */
export function angularSeparation(long1: number, long2: number): number {
  return Math.abs(((long1 - long2 + 180) % 360 + 360) % 360 - 180);
}

/**
 * Detect the tightest in-orb aspect between two longitudes.
 * Returns null when no aspect is within its orb.
 */
export function detectAspect(long1: number, long2: number): Aspect | null {
  const sep = angularSeparation(long1, long2);
  let best: Aspect | null = null;
  for (const def of ASPECT_DEFINITIONS) {
    const orb = Math.abs(sep - def.angle);
    if (orb <= def.orb && (best == null || orb < best.orb)) {
      best = {
        name: def.name,
        angle: def.angle,
        orb: Math.round(orb * 100) / 100,
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
