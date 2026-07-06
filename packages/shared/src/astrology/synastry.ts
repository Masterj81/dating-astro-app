// Synastry scoring across the Three Intentions (love / friendship / business).
//
// The math is shared: for each frame we evaluate the same set of inter-aspects
// between the two charts, but we apply a frame-specific weight table that
// emphasizes different planet pairs:
//   - love:       Venus×Mars, Moon×Moon, Sun×Moon dominate
//   - friendship: Moon×Moon, Mercury×Mercury, Jupiter×Jupiter dominate
//   - business:   Sun×Saturn, Mercury×Mercury, Mars×Saturn dominate
//
// Why one math + three weight tables (not three independent algos)? Because
// the underlying interpretation — "harmonious aspects help, hard aspects
// challenge, tight orbs matter most" — is the same. The lens changes which
// planet conversations we care about, not the physics.
//
// Phase 1 keeps this deterministic and free of any premium-only modifiers.

import { aspectCoefficient, detectAspect } from './aspects';
import {
  applyConfidenceCap,
  bandForScore,
  weakestConfidence,
} from './scoring';
import { SCORING_MODEL_VERSION } from './version';
import type {
  ChartWarning,
  FrameKey,
  FrameScore,
  NatalChart,
  PlacementKey,
  SynastryAspect,
  SynastryResult,
} from './types';

interface WeightedPair {
  bodyA: PlacementKey;
  bodyB: PlacementKey;
  weight: number;
}

/**
 * Frame-specific weight tables. Pairs not listed are scored at weight 0 in
 * that frame — they neither help nor hurt. Order doesn't matter.
 *
 * Pairs are *directional* (bodyA on chart 1, bodyB on chart 2). Symmetrical
 * relationships (e.g. Sun×Moon) appear twice in both directions so the
 * scorer is order-invariant.
 */
export const FRAME_WEIGHTS: Record<FrameKey, readonly WeightedPair[]> = {
  love: [
    { bodyA: 'sun', bodyB: 'sun', weight: 1.0 },
    { bodyA: 'moon', bodyB: 'moon', weight: 1.1 },
    { bodyA: 'sun', bodyB: 'moon', weight: 1.0 },
    { bodyA: 'moon', bodyB: 'sun', weight: 1.0 },
    { bodyA: 'venus', bodyB: 'mars', weight: 1.1 },
    { bodyA: 'mars', bodyB: 'venus', weight: 1.1 },
    { bodyA: 'venus', bodyB: 'venus', weight: 0.8 },
    { bodyA: 'mercury', bodyB: 'mercury', weight: 0.7 },
    { bodyA: 'sun', bodyB: 'rising', weight: 0.7 },
    { bodyA: 'rising', bodyB: 'sun', weight: 0.7 },
    { bodyA: 'jupiter', bodyB: 'jupiter', weight: 0.4 },
    { bodyA: 'saturn', bodyB: 'saturn', weight: 0.4 },
  ],
  friendship: [
    { bodyA: 'sun', bodyB: 'sun', weight: 1.0 },
    { bodyA: 'moon', bodyB: 'moon', weight: 1.0 },
    { bodyA: 'sun', bodyB: 'moon', weight: 0.7 },
    { bodyA: 'moon', bodyB: 'sun', weight: 0.7 },
    { bodyA: 'mercury', bodyB: 'mercury', weight: 1.1 },
    { bodyA: 'jupiter', bodyB: 'jupiter', weight: 1.0 },
    { bodyA: 'venus', bodyB: 'venus', weight: 0.7 },
    { bodyA: 'mars', bodyB: 'mars', weight: 0.5 },
    { bodyA: 'sun', bodyB: 'jupiter', weight: 0.7 },
    { bodyA: 'jupiter', bodyB: 'sun', weight: 0.7 },
  ],
  business: [
    { bodyA: 'sun', bodyB: 'sun', weight: 0.8 },
    { bodyA: 'mercury', bodyB: 'mercury', weight: 1.1 },
    { bodyA: 'mars', bodyB: 'saturn', weight: 1.0 },
    { bodyA: 'saturn', bodyB: 'mars', weight: 1.0 },
    { bodyA: 'sun', bodyB: 'saturn', weight: 1.0 },
    { bodyA: 'saturn', bodyB: 'sun', weight: 1.0 },
    { bodyA: 'jupiter', bodyB: 'saturn', weight: 0.8 },
    { bodyA: 'saturn', bodyB: 'jupiter', weight: 0.8 },
    { bodyA: 'mercury', bodyB: 'jupiter', weight: 0.6 },
    { bodyA: 'jupiter', bodyB: 'mercury', weight: 0.6 },
    { bodyA: 'mars', bodyB: 'mars', weight: 0.5 },
  ],
} as const;

function getLongitude(chart: NatalChart, key: PlacementKey): number | null {
  // Angles are null without a birth time; outer planets are null on charts
  // hydrated from legacy stored JSON (pre-v2). Both cases: skip, never fake.
  const placement = chart[key];
  return placement?.longitude ?? null;
}

interface FrameComputation {
  rawScore: number;
  aspects: SynastryAspect[];
}

function computeFrame(
  frame: FrameKey,
  chart1: NatalChart,
  chart2: NatalChart,
): FrameComputation {
  const pairs = FRAME_WEIGHTS[frame];
  let weightedSum = 0;
  let totalWeight = 0;
  const aspects: SynastryAspect[] = [];

  for (const pair of pairs) {
    const long1 = getLongitude(chart1, pair.bodyA);
    const long2 = getLongitude(chart2, pair.bodyB);
    // Missing angle longitude → skip the pair entirely AND skip its weight
    // (we don't want a missing Ascendant to drag the score toward 50).
    if (long1 == null || long2 == null) continue;

    totalWeight += pair.weight;
    const aspect = detectAspect(long1, long2, pair.bodyA, pair.bodyB);
    if (!aspect) continue;

    const coef = aspectCoefficient(aspect);
    weightedSum += pair.weight * coef;
    aspects.push({
      ...aspect,
      bodyA: pair.bodyA,
      bodyB: pair.bodyB,
      contribution: Math.round(pair.weight * coef * 1000) / 1000,
    });
  }

  // 50 = neutral; scaled by ±40 so a perfectly harmonious chart pair lands
  // near 90 (then bandForScore tips it into "resonant"). Same shape as the
  // legacy mobile/edge formula — kept identical for visual continuity.
  const ratio = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const rawScore = Math.round(50 + ratio * 40);
  aspects.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return { rawScore, aspects };
}

/**
 * Outer planet (Uranus/Neptune/Pluto) contacts are interpretive-only: they
 * are exposed on the result for narration but carry `contribution: 0` and
 * never touch the frame scores. Adding them to FRAME_WEIGHTS would shift
 * every historical score for generational placements users can't act on —
 * if we ever want them weighted, that's an explicit, tested, versioned
 * change (bump SCORING_MODEL_VERSION).
 *
 * We pair each outer planet against the other person's personal planets and
 * angles. Outer×outer and outer×Jupiter/Saturn contacts are excluded: people
 * born within a few years of each other all share them, so they say nothing
 * about *this* pair.
 */
const OUTER_PLANETS: readonly PlacementKey[] = ['uranus', 'neptune', 'pluto'];
const INTERPRETIVE_TARGETS: readonly PlacementKey[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'rising',
  'mc',
];

function computeInterpretiveAspects(
  chart1: NatalChart,
  chart2: NatalChart,
): SynastryAspect[] {
  const out: SynastryAspect[] = [];
  // Convention matches the frames: bodyA lives on chart1, bodyB on chart2.
  const directions: Array<[NatalChart, NatalChart, boolean]> = [
    [chart1, chart2, false],
    [chart2, chart1, true],
  ];
  for (const [outerChart, targetChart, swapped] of directions) {
    for (const outer of OUTER_PLANETS) {
      const outerLong = getLongitude(outerChart, outer);
      if (outerLong == null) continue;
      for (const target of INTERPRETIVE_TARGETS) {
        const targetLong = getLongitude(targetChart, target);
        if (targetLong == null) continue;
        const aspect = detectAspect(outerLong, targetLong, outer, target);
        if (!aspect) continue;
        out.push({
          ...aspect,
          bodyA: swapped ? target : outer,
          bodyB: swapped ? outer : target,
          contribution: 0,
        });
      }
    }
  }
  // Tightest first; name tie-breaks keep the order fully deterministic.
  out.sort(
    (a, b) =>
      a.orb - b.orb ||
      a.bodyA.localeCompare(b.bodyA) ||
      a.bodyB.localeCompare(b.bodyB),
  );
  return out;
}

/**
 * Compute synastry across all Three Intentions in one pass. The output is
 * confidence-capped so low-confidence inputs can never display as
 * "Resonant".
 */
export function computeSynastry(
  chart1: NatalChart,
  chart2: NatalChart,
): SynastryResult {
  const confidence = weakestConfidence(chart1.confidence, chart2.confidence);
  const warningSet = new Set<ChartWarning>();
  chart1.warnings.forEach((w) => warningSet.add(w));
  chart2.warnings.forEach((w) => warningSet.add(w));

  const frames: Record<FrameKey, FrameScore> = {} as Record<FrameKey, FrameScore>;
  (Object.keys(FRAME_WEIGHTS) as FrameKey[]).forEach((frame) => {
    const { rawScore, aspects } = computeFrame(frame, chart1, chart2);
    const capped = applyConfidenceCap(rawScore, confidence);
    frames[frame] = {
      frame,
      score: capped,
      band: bandForScore(capped),
      topAspects: aspects.slice(0, 8),
    };
  });

  return {
    confidence,
    warnings: Array.from(warningSet),
    frames,
    interpretiveAspects: computeInterpretiveAspects(chart1, chart2),
    modelVersion: SCORING_MODEL_VERSION,
  };
}
