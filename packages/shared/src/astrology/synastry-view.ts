// The one place the app asks "what can I show about these two charts?".
//
// WHY THIS EXISTS
// ---------------
// JUNO shipped a complete aspect-based synastry engine — three weighted
// frames, a centralised orb policy, interpretive outer-planet contacts,
// confidence caps, six score bands, a versioned model, eleven tests — and
// nothing called it. `computeSynastry`'s only callers were its own tests.
//
// What readers actually saw was `calculateSunCompatibility(sun_sign, sun_sign)`
// in `apps/*/lib/synastry.ts`: an element comparison between two Sun SIGNS.
// Two people whose Venus placements are 1° apart and two people whose Venus
// placements are 29° apart in the same sign received the identical score,
// because degrees never entered the calculation.
// (docs/astrology-calculation-audit-2026-09.md §5.11.)
//
// This module makes the real engine the canonical source and the sign-based
// reading an explicitly labelled fallback. It is deliberately the ONLY entry
// point the screens use, so mobile and web cannot drift.
//
// THE SHAPE IS A DISCRIMINATED UNION, ON PURPOSE
// ----------------------------------------------
// `SynastryView` is either `{ source: 'aspects', ... }` with the frames, or
// `{ source: 'sign-rhythm', reason }` with no scores at all. A screen cannot
// render an aspect score it does not have, because in the fallback branch the
// field does not exist — the type system refuses it rather than a code review.
//
// WHAT IS NOT DONE HERE
// ---------------------
// No interpretation text, no localisation, no premium gating. This returns
// numbers and structure; the screens decide what to say about them.

import {
  hydrateStoredChart,
} from './stored';
import { computeSynastry } from './synastry';
import type {
  Confidence,
  ChartWarning,
  FrameKey,
  NatalChart,
  SynastryAspect,
} from './types';

/**
 * The six bands the UI already has copy for, in eight locales, on both
 * platforms (`synastryScoreTitle_*` / `synastryScoreBody_*`).
 *
 * The shared engine names its bands differently (`resonant`,
 * `strong-themes`, …). Mapping onto the existing vocabulary rather than
 * renaming 192 translated strings keeps this change about the MATH, which is
 * the part that was wrong. The order is identical, so the mapping is 1:1 and
 * carries no judgement of its own.
 */
export type SynastryUiBand =
  | 'exceptional'
  | 'strong'
  | 'promising'
  | 'mixed'
  | 'growth'
  | 'different';

const BAND_TO_UI: Readonly<Record<string, SynastryUiBand>> = {
  resonant: 'exceptional',
  'strong-themes': 'strong',
  'promising-mix': 'promising',
  mixed: 'mixed',
  'different-rhythms': 'growth',
  'likely-friction': 'different',
};

/** Why the real engine could not run. Never "we scored it anyway". */
export type SynastryFallbackReason =
  /** The reader's own stored chart is missing or too partial to hydrate. */
  | 'missing_own_chart'
  /** The other person's chart could not be loaded or hydrated. */
  | 'missing_other_chart'
  /** Neither side has a usable chart. */
  | 'missing_both_charts';

export interface SynastryFrameView {
  frame: FrameKey;
  /** Integer 0–100, already confidence-capped by the engine. */
  score: number;
  /** The engine's own band name, kept for telemetry and debugging. */
  engineBand: string;
  /** The band name the UI has copy for. */
  band: SynastryUiBand;
  /** Contributing aspects, strongest first, as the engine ordered them. */
  topAspects: SynastryAspect[];
}

export interface SynastryAspectsView {
  source: 'aspects';
  /** love / friendship / business, always all three, always in this order. */
  frames: SynastryFrameView[];
  /** The frame the headline number comes from. */
  headline: SynastryFrameView;
  /**
   * Outer-planet contacts that narrate generational themes. They carry
   * `contribution: 0` and never move a score — showing them is interpretation,
   * not measurement.
   */
  interpretiveAspects: SynastryAspect[];
  /** The weaker of the two charts' confidences. */
  confidence: Confidence;
  /** True when the reader should be told the reading is limited. */
  isLimited: boolean;
  warnings: ChartWarning[];
  /** `SCORING_MODEL_VERSION` — bump it and old scores are not comparable. */
  modelVersion: number;
  /** True when neither chart could contribute an ascendant. */
  missingAscendant: boolean;
}

export interface SynastrySignRhythmView {
  source: 'sign-rhythm';
  reason: SynastryFallbackReason;
}

export type SynastryView = SynastryAspectsView | SynastrySignRhythmView;

/** Frames in display order. Love leads because it is the headline. */
export const SYNASTRY_FRAME_ORDER: readonly FrameKey[] = [
  'love',
  'friendship',
  'business',
] as const;

function toUiBand(engineBand: string): SynastryUiBand {
  // A band the map does not know is a model change nobody wired up. Falling
  // back to the middle is the least wrong thing, and it never flatters.
  return BAND_TO_UI[engineBand] ?? 'mixed';
}

/**
 * Hydrate one side, returning null when the value is not a usable chart.
 *
 * Accepts a raw `profiles.birth_chart` JSONB, the object `get-profile-chart`
 * returns (same shape), or an already-computed `NatalChart`. Never guesses:
 * `hydrateStoredChart` returns null rather than filling gaps.
 */
export function hydrateSynastrySide(raw: unknown): NatalChart | null {
  if (!raw || typeof raw !== 'object') return null;
  return hydrateStoredChart(raw);
}

/**
 * Everything the synastry screens need, or an explicit reason why not.
 *
 * @param ownChart   the reader's `profiles.birth_chart`
 * @param otherChart the other person's chart, from `get-profile-chart`
 */
export function buildSynastryView(
  ownChart: unknown,
  otherChart: unknown,
): SynastryView {
  const mine = hydrateSynastrySide(ownChart);
  const theirs = hydrateSynastrySide(otherChart);

  if (!mine && !theirs) return { source: 'sign-rhythm', reason: 'missing_both_charts' };
  if (!mine) return { source: 'sign-rhythm', reason: 'missing_own_chart' };
  if (!theirs) return { source: 'sign-rhythm', reason: 'missing_other_chart' };

  const result = computeSynastry(mine, theirs);

  const frames: SynastryFrameView[] = SYNASTRY_FRAME_ORDER.map((frame) => {
    const score = result.frames[frame];
    return {
      frame,
      score: score.score,
      engineBand: score.band,
      band: toUiBand(score.band),
      topAspects: score.topAspects,
    };
  });

  return {
    source: 'aspects',
    frames,
    // `love` is first in SYNASTRY_FRAME_ORDER; asserting rather than indexing
    // blindly so a reordering cannot silently change the headline.
    headline: frames.find((f) => f.frame === 'love') ?? frames[0],
    interpretiveAspects: result.interpretiveAspects,
    confidence: result.confidence,
    // Anything below `high` means one of the two charts could not pin its
    // timezone, or is a legacy row hydrated as `medium` (see parseConfidence).
    // The reader is told, rather than shown a number that looks certain.
    isLimited: result.confidence !== 'high',
    warnings: result.warnings,
    modelVersion: result.modelVersion,
    // The "first impressions" pairs need an ascendant on at least one side.
    missingAscendant: mine.rising === null || theirs.rising === null,
  };
}

/**
 * Format an orb for display: "2.4°".
 *
 * One decimal because the underlying positions are good to about an
 * arc-minute (0.017°) and two decimals would imply a precision the birth time
 * usually cannot support.
 */
export function formatOrb(orb: number): string {
  return `${(Math.round(orb * 10) / 10).toFixed(1)}°`;
}

/**
 * Is this value a synastry view the server computed for us?
 *
 * Structural, not a cast: the payload crosses the network, and a `as
 * SynastryView` on an untrusted object is how a missing `frames` array becomes
 * a crash inside a render. Every field the aspect branch renders is checked.
 */
export function isSynastryView(value: unknown): value is SynastryView {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.source === 'sign-rhythm') return typeof v.reason === 'string';
  if (v.source !== 'aspects') return false;
  if (!Array.isArray(v.frames) || v.frames.length === 0) return false;
  if (!v.headline || typeof v.headline !== 'object') return false;
  const headline = v.headline as Record<string, unknown>;
  if (typeof headline.score !== 'number' || !Number.isFinite(headline.score)) return false;
  if (typeof headline.band !== 'string') return false;
  if (!Array.isArray(headline.topAspects)) return false;
  if (!Array.isArray(v.interpretiveAspects)) return false;
  if (typeof v.confidence !== 'string') return false;
  return true;
}

/**
 * The view to render: the server's if it sent one, otherwise computed here.
 *
 * WHY THIS EXISTS
 * ---------------
 * Since 2026-09-07 `get-profile-chart` computes the synastry itself and returns
 * it, because computing it in the client required the response to carry the
 * other person's ecliptic longitudes — and those longitudes inverted back to
 * their exact birth instant and birth coordinates
 * (docs/security-audit-2026-09-07.md, JUNO-01).
 *
 * The local branch is not dead code and is not a fallback for convenience. It
 * covers two real states:
 *
 *   1. A response from a deployment that predates the change, or one where the
 *      viewer's own `birth_chart` could not be read (the server treats that as
 *      non-fatal and sends `synastry: null` rather than failing the request).
 *   2. Any future caller that has both charts in hand already.
 *
 * Both platforms call this one function, for the reason the two `buildSynastryView`
 * call sites carried in their own comments: two implementations of the headline
 * number is how the platforms drift.
 */
export function resolveSynastryView(
  serverView: unknown,
  ownChart: unknown,
  otherChart: unknown,
): SynastryView {
  if (isSynastryView(serverView)) return serverView;
  return buildSynastryView(ownChart, otherChart);
}
