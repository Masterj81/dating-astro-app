// Mobile-side facade over @astro/shared/astrology.
//
// The actual chart math + tz correctness lives in packages/shared. This file
// preserves the legacy signature (Date + time string + lat/lng) used by the
// existing screens (onboarding/birth-info, welcome/preview) and delegates to
// the shared engine.
//
// Phase 1 bug fix: `dateWithTime.setHours()` is GONE. That call interpreted
// the birth time in the *device's* local timezone, so a user born at 14:30
// in New York would see a wildly different chart depending on whether they
// happened to be using the app from London or Tokyo. We now resolve an
// IANA timezone for the birth coordinates via tz-lookup (or accept an
// explicit IANA id when the caller supplies one) and do all date math
// through Luxon. See `packages/shared/src/astrology/time.ts`.

import {
  computeSynastry,
  computeNatalChart as sharedComputeNatalChart,
  detectAspect as sharedDetectAspect,
  type BirthInput,
  type FrameKey,
  type NatalChart as SharedNatalChart,
} from '@astro/shared/astrology';

// Re-exported placement keys for callers that need to declare types.
export type { FrameKey } from '@astro/shared/astrology';

// Legacy public shape — kept identical so existing screens compile unchanged.
type Placement = { sign: string; degree: number; longitude: number };
type NatalChart = {
  sun: Placement;
  moon: Placement;
  rising: Placement;
  mercury: Placement;
  venus: Placement;
  mars: Placement;
  jupiter: Placement;
  saturn: Placement;
  /** Optional metadata, present when the shared engine reports it. */
  confidence?: 'high' | 'medium' | 'low';
  timezone?: string;
  warnings?: string[];
};

function placement(p: { sign: string; degree: number; longitude: number } | null, fallback?: Placement): Placement {
  if (p) return p;
  return fallback ?? { sign: 'Aries', degree: 0, longitude: 0 };
}

function toSharedChart(local: NatalChart): SharedNatalChart {
  // For synastry callers that hand us legacy chart shapes (no UTC instant /
  // confidence), reconstruct a minimal shared chart with high confidence.
  // This is only used by `calculateCompatibility(chart1, chart2)` which the
  // legacy signature exposes; new code should hold on to the SharedNatalChart
  // from `calculateNatalChartV2`.
  return {
    sun: local.sun as SharedNatalChart['sun'],
    moon: local.moon as SharedNatalChart['moon'],
    mercury: local.mercury as SharedNatalChart['mercury'],
    venus: local.venus as SharedNatalChart['venus'],
    mars: local.mars as SharedNatalChart['mars'],
    jupiter: local.jupiter as SharedNatalChart['jupiter'],
    saturn: local.saturn as SharedNatalChart['saturn'],
    rising: local.rising as SharedNatalChart['rising'],
    mc: null,
    houses: null,
    utcInstant: '',
    timezone: local.timezone ?? 'UTC',
    confidence: local.confidence ?? 'high',
    warnings: [],
    input: {
      date: '',
      time: null,
      timezone: local.timezone ?? null,
      latitude: 0,
      longitude: 0,
    },
  } as SharedNatalChart;
}

/**
 * Compute a natal chart. Mirrors the legacy signature.
 *
 * @param birthDate     Local birth date as a `Date` (only the year/month/day
 *                      portion is used — the time-of-day is taken from
 *                      `birthTime`).
 * @param birthTime     `HH:MM` (24h) or `H:MM AM/PM`. Null = birth time unknown.
 * @param latitude      Birth latitude.
 * @param longitude     Birth longitude.
 * @param ianaTimezone  Optional IANA tz (e.g. "America/New_York"). If omitted,
 *                      we resolve the zone from lat/lng using tz-lookup
 *                      polygons. Either way DST is honored automatically.
 */
export function calculateNatalChart(
  birthDate: Date,
  birthTime: string | null,
  latitude: number = 45.5017,
  longitude: number = -73.5673,
  ianaTimezone?: string | null,
): NatalChart {
  const isoDate = toIsoDate(birthDate);
  const input: BirthInput = {
    date: isoDate,
    time: birthTime,
    timezone: ianaTimezone ?? null,
    latitude,
    longitude,
  };
  const chart = sharedComputeNatalChart(input);

  return {
    sun: placement(chart.sun),
    moon: placement(chart.moon),
    rising: placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 }),
    mercury: placement(chart.mercury),
    venus: placement(chart.venus),
    mars: placement(chart.mars),
    jupiter: placement(chart.jupiter),
    saturn: placement(chart.saturn),
    confidence: chart.confidence,
    timezone: chart.timezone,
    warnings: chart.warnings.slice(),
  };
}

/**
 * New v2 entry point that returns the full SharedNatalChart (UTC instant,
 * confidence, warnings, houses). Prefer this in new code.
 */
export function calculateNatalChartV2(input: BirthInput): SharedNatalChart {
  return sharedComputeNatalChart(input);
}

/**
 * Legacy single-number compatibility score, retained for places that still
 * call it. Internally we compute the 'love' frame from the shared synastry
 * engine and surface its score as the headline number. New code should use
 * `calculateSynastry(...)` and present all three frames.
 */
export function calculateCompatibility(chart1: NatalChart, chart2: NatalChart): number {
  const result = computeSynastry(toSharedChart(chart1), toSharedChart(chart2));
  return result.frames.love.score;
}

export function calculateSynastry(chart1: SharedNatalChart, chart2: SharedNatalChart) {
  return computeSynastry(chart1, chart2);
}

/**
 * Headline copy for a synastry score. Phase 1 copy-safety: no
 * outcome-guarantee language — symbolic framing only. Keep these strings in
 * sync with `apps/web/src/lib/synastry.ts` band labels.
 */
export function getCompatibilityDescription(score: number): string {
  if (score >= 85) return 'Resonant signals across multiple themes.';
  if (score >= 75) return 'Strong themes to explore together.';
  if (score >= 65) return 'Promising mix — supportive signals with room to discuss.';
  if (score >= 55) return 'A mixed picture — areas to discuss matter as much as the highlights.';
  return 'Different rhythms — astrology is one lens, your judgment is the other.';
}

/**
 * Resolve a frame-specific descriptor. Phase 1 keeps copy modest and
 * outcome-neutral; richer interpretive layers ship later.
 */
export function getFrameDescription(score: number, frame: FrameKey): string {
  const base = getCompatibilityDescription(score);
  if (frame === 'love') return base;
  if (frame === 'friendship') return base.replace('themes', 'rapport themes');
  return base.replace('themes', 'working-style themes');
}

// Re-export the aspect detector from shared so other mobile code (synastry V2
// screen helpers, etc.) can use the same orb table.
export const detectAspect = sharedDetectAspect;

function toIsoDate(d: Date): string {
  // Use local Y-M-D components — the legacy callers passed a `Date` built from
  // (year, monthIndex, day) so this is the calendar date the user typed.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
