// Stored-chart compatibility layer.
//
// `profiles.birth_chart` (Supabase JSONB) has been written by several app
// generations:
//
//   v1 (mobile onboarding, 2026-03 →):
//     { sun, moon, rising, planets: { mercury..saturn },
//       coordinates, timezone?, confidence?, chartVersion: 1 }
//
//   v2 (this model):
//     same shape + planets.uranus / planets.neptune / planets.pluto,
//       chartVersion: 2
//
// This module reads ANY of those (plus a directly-serialized NatalChart)
// back into a usable `NatalChart` without ever inventing data:
//
//   - missing outer planets  → null placements (synastry skips them)
//   - missing rising/mc      → null (as with unknown birth time)
//   - missing houses         → null
//   - missing longitude on a placement → reconstructed EXACTLY from
//     sign + degree (longitude = signIndex*30 + degree — a lossless inverse
//     of `longitudeToPlacement`, not an approximation)
//
// Old rows are never migrated in place: enrichment happens naturally the
// next time the chart is recomputed from raw birth fields (onboarding edit,
// server-side recompute), at which point `toStoredBirthChart` writes the v2
// shape. Reads must keep tolerating v1 forever.

import { placementToLongitude } from './chart';
import { ZODIAC_SIGNS } from './chart';
import type {
  Confidence,
  InnerPlanetKey,
  NatalChart,
  OuterPlanetKey,
  Placement,
  ZodiacSign,
} from './types';

/** Version stamped on the JSONB by `toStoredBirthChart`. */
export const STORED_CHART_VERSION = 2 as const;

/** The wire shape persisted in `profiles.birth_chart`. */
export interface StoredBirthChart {
  sun: Placement;
  moon: Placement;
  rising: Placement | null;
  planets: Partial<Record<Exclude<InnerPlanetKey, 'sun' | 'moon'> | OuterPlanetKey, Placement>>;
  /** Null when the birthplace was never given. Persisting a stand-in would
   *  record a fabricated birthplace as if it were a fact. */
  coordinates: { latitude: number | null; longitude: number | null };
  timezone: string;
  confidence: Confidence;
  chartVersion: number;
}

/**
 * Normalize a stored sign string to the canonical capitalized ZodiacSign.
 * Edge-function-written charts persist lowercase signs ('aquarius'); the
 * shared engine and mobile write capitalized ('Aquarius'). Accept both.
 */
function normalizeStoredSign(value: unknown): ZodiacSign | null {
  if (typeof value !== 'string' || !value) return null;
  const canonical = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return (ZODIAC_SIGNS as readonly string[]).includes(canonical)
    ? (canonical as ZodiacSign)
    : null;
}

/**
 * Coerce one stored placement-ish object into a Placement, or null when the
 * data isn't there. Longitude is reconstructed from sign+degree when absent
 * (lossless), never defaulted.
 */
export function parseStoredPlacement(raw: unknown): Placement | null {
  if (typeof raw !== 'object' || raw == null) return null;
  const obj = raw as Record<string, unknown>;
  const sign = normalizeStoredSign(obj.sign);
  if (!sign) return null;
  const degree = typeof obj.degree === 'number' && Number.isFinite(obj.degree)
    ? obj.degree
    : null;
  let longitude = typeof obj.longitude === 'number' && Number.isFinite(obj.longitude)
    ? obj.longitude
    : null;
  // Only wrap when actually out of range: the modulo arithmetic introduces
  // float noise (102.52 → 102.51999999999998) that would break exact
  // round-tripping of already-valid stored values.
  if (longitude != null && (longitude < 0 || longitude >= 360)) {
    longitude = ((longitude % 360) + 360) % 360;
  }
  if (longitude == null) {
    if (degree == null) return null;
    longitude = placementToLongitude({ sign, degree });
  }
  return {
    sign,
    degree: degree ?? longitude % 30,
    longitude,
  };
}

function parseConfidence(raw: unknown): Confidence {
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'high';
}

const INNER_NON_LUMINARY: readonly Exclude<InnerPlanetKey, 'sun' | 'moon'>[] = [
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
];
const OUTER: readonly OuterPlanetKey[] = ['uranus', 'neptune', 'pluto'];

/**
 * Hydrate a stored `birth_chart` JSONB value (any historical shape) into a
 * NatalChart usable by `computeSynastry`. Returns null when the value is not
 * a chart at all (missing Sun or Moon) — callers should then recompute from
 * raw birth fields instead.
 *
 * Inner planets missing from a corrupt/partial row also return null: every
 * generation of the app persisted Mercury–Saturn, so their absence means the
 * row isn't a chart we understand. Outer planets, rising, mc, and houses are
 * genuinely optional (pre-v2 rows / unknown birth time) and hydrate to null.
 */
export function hydrateStoredChart(raw: unknown): NatalChart | null {
  if (typeof raw !== 'object' || raw == null) return null;
  const obj = raw as Record<string, unknown>;
  // Both shapes keep sun/moon/rising at the top level; planets live either
  // under `planets` (stored shape) or at the top level (serialized NatalChart).
  const planets = (typeof obj.planets === 'object' && obj.planets != null
    ? obj.planets
    : obj) as Record<string, unknown>;

  const sun = parseStoredPlacement(obj.sun);
  const moon = parseStoredPlacement(obj.moon);
  if (!sun || !moon) return null;

  const inner: Partial<Record<Exclude<InnerPlanetKey, 'sun' | 'moon'>, Placement>> = {};
  for (const key of INNER_NON_LUMINARY) {
    const p = parseStoredPlacement(planets[key]);
    if (!p) return null;
    inner[key] = p;
  }

  const outer: Record<OuterPlanetKey, Placement | null> = {
    uranus: null,
    neptune: null,
    pluto: null,
  };
  for (const key of OUTER) {
    outer[key] = parseStoredPlacement(planets[key]);
  }

  const rising = parseStoredPlacement(obj.rising);
  const mc = parseStoredPlacement(obj.mc);
  const houses = Array.isArray(obj.houses) &&
    obj.houses.length === 12 &&
    obj.houses.every((h) => typeof h === 'number' && Number.isFinite(h))
    ? (obj.houses as number[])
    : null;

  const coordinates = (typeof obj.coordinates === 'object' && obj.coordinates != null
    ? obj.coordinates
    : {}) as Record<string, unknown>;
  // Null, not 0. Zero is a real coordinate (the Gulf of Guinea) and using it
  // as "unknown" is how a missing birthplace became a computable ascendant.
  const latitude =
    typeof coordinates.latitude === 'number' && Number.isFinite(coordinates.latitude)
      ? coordinates.latitude
      : null;
  const longitude =
    typeof coordinates.longitude === 'number' && Number.isFinite(coordinates.longitude)
      ? coordinates.longitude
      : null;

  return {
    sun,
    moon,
    mercury: inner.mercury!,
    venus: inner.venus!,
    mars: inner.mars!,
    jupiter: inner.jupiter!,
    saturn: inner.saturn!,
    uranus: outer.uranus,
    neptune: outer.neptune,
    pluto: outer.pluto,
    rising,
    mc,
    houses,
    utcInstant: typeof obj.utcInstant === 'string' ? obj.utcInstant : '',
    timezone: typeof obj.timezone === 'string' ? obj.timezone : 'UTC',
    // Legacy rows without a confidence field predate the confidence model;
    // 'high' matches how the mobile facade always treated them.
    confidence: parseConfidence(obj.confidence),
    warnings: [],
    input: {
      date: '',
      time: null,
      timezone: typeof obj.timezone === 'string' ? obj.timezone : null,
      latitude,
      longitude,
    },
  };
}

/**
 * Serialize a freshly computed NatalChart into the canonical v2 JSONB shape
 * for `profiles.birth_chart`. Outer planets are included; a chart hydrated
 * from a pre-v2 row (null outer planets) round-trips without them — we never
 * write fabricated positions.
 */
export function toStoredBirthChart(chart: NatalChart): StoredBirthChart {
  const planets: StoredBirthChart['planets'] = {
    mercury: chart.mercury,
    venus: chart.venus,
    mars: chart.mars,
    jupiter: chart.jupiter,
    saturn: chart.saturn,
  };
  if (chart.uranus) planets.uranus = chart.uranus;
  if (chart.neptune) planets.neptune = chart.neptune;
  if (chart.pluto) planets.pluto = chart.pluto;
  return {
    sun: chart.sun,
    moon: chart.moon,
    rising: chart.rising,
    planets,
    coordinates: {
      latitude: chart.input.latitude,
      longitude: chart.input.longitude,
    },
    timezone: chart.timezone,
    confidence: chart.confidence,
    chartVersion: STORED_CHART_VERSION,
  };
}
