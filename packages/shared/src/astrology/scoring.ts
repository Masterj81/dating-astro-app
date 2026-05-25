// Synastry score → band mapping and confidence capping.

import type { Confidence, SynastryBand } from './types';

export interface ScoreBandSpec {
  band: SynastryBand;
  min: number;
}

// Public-facing six-band model. These labels are stable across mobile / web /
// edge — UI layers may localize them but must not redefine the thresholds.
export const SCORE_BANDS: readonly ScoreBandSpec[] = [
  { band: 'resonant', min: 88 },
  { band: 'strong-themes', min: 76 },
  { band: 'promising-mix', min: 64 },
  { band: 'mixed', min: 52 },
  { band: 'different-rhythms', min: 40 },
  { band: 'likely-friction', min: 0 },
] as const;

export function bandForScore(score: number): SynastryBand {
  for (const spec of SCORE_BANDS) {
    if (score >= spec.min) return spec.band;
  }
  return 'likely-friction';
}

/**
 * Cap the score by the confidence of the underlying charts. Low-confidence
 * inputs (missing birth time or fallback timezone) should never appear as
 * "Resonant" — we don't have the data to claim that.
 */
export function applyConfidenceCap(rawScore: number, confidence: Confidence): number {
  const cap = confidence === 'high' ? 100 : confidence === 'medium' ? 92 : 80;
  return Math.max(0, Math.min(cap, rawScore));
}

/**
 * Combine the weakest of two confidences. The pair is only as confident as
 * its less-known chart.
 */
export function weakestConfidence(a: Confidence, b: Confidence): Confidence {
  const rank = { high: 2, medium: 1, low: 0 } as const;
  return rank[a] <= rank[b] ? a : b;
}
