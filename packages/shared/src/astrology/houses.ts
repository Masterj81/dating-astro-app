// Houses: what may be shown, and what must be withheld.
//
// THE BUG THIS ANSWERS
// --------------------
// Both natal chart screens rendered a house number and a degree for every
// planet, and neither came from the sky.
//
//   mobile  natal-chart.tsx:134-158   { degree: 15, house: 1 }  — literals,
//                                     identical for every user on earth.
//   web     NatalChartOverview.tsx    house: ((baseSeed + index * 2) % 12) + 1
//                                     — a hash of string lengths.
//
// Each fabricated number then keyed a real interpretation:
// `natalPlanetInHouse_{planet}_{n}`, of which 96 exist, translated into 8
// locales. 768 carefully written paragraphs served against a coin flip, in the
// same typography as the Sun sign, which is true.
// (docs/twelve-houses-audit-2026-08.md §1.)
//
// WHY A HOUSE IS HARDER TO EARN THAN A RISING SIGN
// ------------------------------------------------
// `isRisingTrustworthy` proves a birth TIME existed. Houses need more than
// that, for two reasons:
//
//   1. THE PLACE. The ascendant depends on the birthplace as strongly as on
//      the clock: in `computeAscendant` the birth longitude enters local
//      sidereal time degree for degree, so an unknown birthplace displaces
//      every cusp by as much as the location is wrong. Three code paths used
//      to invent one — Greenwich in the edge functions, Montréal in the mobile
//      facade — which produced plausible, varied, entirely fictional angles.
//
//   2. THE DEGREE. `profiles.rising_sign` is a sign, and a sign is 30° wide.
//      Equal-house cusps sit at ASC + 30i, so a cusp derived from a bare sign
//      is wrong by up to a whole house. Cusps therefore require
//      `birth_chart.rising` WITH its degree — never the column alone.
//
// WHY NOTHING NEEDS TO BE MIGRATED
// --------------------------------
// `toStoredBirthChart` persists neither `houses` nor `mc`, so
// `birth_chart.houses` is null on essentially every row. It does not matter:
// the house system is equal-house, so the twelve cusps are exactly
// ASC + 30i and derive losslessly from the rising placement that IS stored.
// `resolveHouseCusps` calls the very same `computeEqualHouses` the engine
// uses, so the two can never drift.
//
// ⚠️ THIS DERIVATION ASSUMES EQUAL HOUSES. When Placidus or Koch arrives
// (Phase 2 / Swiss Ephemeris, announced at the top of chart.ts), cusps stop
// being equidistant and must be persisted for real. The round-trip test in
// __tests__/houses.test.ts fails loudly if `computeEqualHouses` stops being
// 30° apart.

import { computeEqualHouses, placementToLongitude } from './chart';
import { hasUsableBirthPlace, isRisingTrustworthy, type RisingTrustInput } from './rising';
import type { NatalChart, PlanetKey, Placement } from './types';

/**
 * How complete a reader's birth data is, from the point of view of the angles.
 *
 * Three states, and the middle one is the one implementations forget. A reader
 * who gave their birth time but not their city believes they gave everything —
 * they are the exact population that used to receive a Greenwich ascendant
 * with no way of knowing.
 */
export type BirthDataState =
  /** No usable birth time. Angles and houses are not computable at all. */
  | 'missing_birth_time'
  /** Birth time known, birthplace not — or the timezone had to be guessed. */
  | 'missing_birth_place'
  /** Time and place both known. Angles and houses may be shown. */
  | 'complete';

/**
 * The coordinates now live on `RisingTrustInput` itself, because the ascendant
 * needs the birthplace just as much as the houses do — this type is kept as an
 * alias so the call sites that read as "house trust" still say so.
 */
export type HouseTrustInput = RisingTrustInput;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function isUsableCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * True when a birth time is present and non-empty.
 *
 * `undefined` means "this caller cannot see the column" and is NOT treated as
 * proof of absence — the same load-bearing distinction `RisingTrustInput`
 * documents. Callers that cannot read `birth_time` cannot show houses either,
 * which `resolveBirthDataState` enforces below.
 */
function hasBirthTime(birthTime: string | null | undefined): boolean {
  return typeof birthTime === 'string' && birthTime.trim().length > 0;
}

/**
 * Which of the three states this reader is in.
 *
 * Ordered by what blocks first: without a time nothing is computable, so that
 * verdict wins even when the place is also missing — telling someone to add
 * their birth city when the clock is the blocker sends them to fix the wrong
 * field.
 */
export function resolveBirthDataState(input: HouseTrustInput): BirthDataState {
  if (!hasBirthTime(input.birthTime)) return 'missing_birth_time';

  // Shared with `isRisingTrustworthy` on purpose: two definitions of "we know
  // where they were born" is one too many, and the divergence is exactly how
  // the ascendant kept a Greenwich fallback the houses had already rejected.
  if (!hasUsableBirthPlace(input)) {
    return 'missing_birth_place';
  }

  // A 'low' confidence chart with a birth time means the timezone was guessed
  // — on web, from the device, because no birth city was given. One hour of
  // timezone error is roughly 15° of ascendant, half a house. The honest label
  // is still "the place is missing", because the city is what would fix it.
  const chart = asRecord(input.birthChart);
  if (chart?.confidence === 'low') return 'missing_birth_place';

  return 'complete';
}

/**
 * True only when this reader's houses may be computed and displayed.
 *
 * Strictly stronger than `isRisingTrustworthy`: the ascendant needs the clock,
 * the houses need the clock AND the place. Anything unproven is false.
 */
export function areHousesTrustworthy(input: HouseTrustInput): boolean {
  if (resolveBirthDataState(input) !== 'complete') return false;
  // The rising gate still applies: it is what protects rows the old Aries
  // fallback poisoned, and it can be contradicted by chart warnings that the
  // state check above does not read.
  return isRisingTrustworthy(input);
}

/**
 * The ascendant's ecliptic longitude, or null.
 *
 * Only ever read from the stored/computed CHART, never from
 * `profiles.rising_sign`: a bare sign carries no degree, and a cusp built on
 * a sign is wrong by up to 30° — a whole house.
 */
export function resolveRisingLongitude(birthChart: unknown): number | null {
  const chart = asRecord(birthChart);
  const rising = chart ? asRecord(chart.rising) : null;
  if (!rising) return null;

  if (isUsableCoordinate(rising.longitude)) {
    return ((rising.longitude % 360) + 360) % 360;
  }

  // Reconstruct from sign + degree. Lossless — the exact inverse of
  // `longitudeToPlacement`, same as `parseStoredPlacement` does.
  const sign = rising.sign;
  const degree = rising.degree;
  if (typeof sign !== 'string' || !isUsableCoordinate(degree)) return null;

  const longitude = placementToLongitude({ sign, degree });
  // placementToLongitude returns 0 for an unknown sign, which is a real
  // longitude (0° Aries) and would be indistinguishable from a failure. Guard.
  if (longitude === 0 && !(sign === 'Aries' && degree === 0)) return null;
  return longitude;
}

/**
 * The twelve equal-house cusps for this reader, or null when they must not be
 * shown.
 *
 * Delegates to the engine's own `computeEqualHouses`, so a derived cusp array
 * is bit-identical to the one `computeNatalChart` would have produced.
 */
export function resolveHouseCusps(input: HouseTrustInput): number[] | null {
  if (!areHousesTrustworthy(input)) return null;

  // A chart that carries real cusps wins — that is the engine's own output,
  // and it stays correct if the house system ever stops being equal.
  const chart = asRecord(input.birthChart);
  const stored = chart?.houses;
  if (
    Array.isArray(stored) &&
    stored.length === 12 &&
    stored.every((cusp) => isUsableCoordinate(cusp))
  ) {
    return stored as number[];
  }

  const ascendant = resolveRisingLongitude(input.birthChart);
  if (ascendant == null) return null;
  return computeEqualHouses(ascendant);
}

/**
 * Which house (1–12) a given ecliptic longitude falls in.
 *
 * Written for a general cusp array rather than assuming ASC + 30i, so it keeps
 * working the day cusps stop being equidistant. Returns null for a cusp array
 * that is not twelve finite longitudes, rather than guessing.
 */
export function houseOfLongitude(cusps: number[], longitude: number): number | null {
  if (!Array.isArray(cusps) || cusps.length !== 12) return null;
  if (!isUsableCoordinate(longitude)) return null;
  if (!cusps.every((cusp) => isUsableCoordinate(cusp))) return null;

  const lon = ((longitude % 360) + 360) % 360;

  for (let i = 0; i < 12; i++) {
    const start = ((cusps[i] % 360) + 360) % 360;
    const end = ((cusps[(i + 1) % 12] % 360) + 360) % 360;
    // Each house is the half-open arc [start, end). The last one wraps past
    // 360°, which is why this compares against the wrap rather than assuming
    // start < end.
    const span = start <= end ? lon >= start && lon < end : lon >= start || lon < end;
    if (span) return i + 1;
  }

  // Unreachable for a valid cusp array: the twelve arcs tile the circle.
  return null;
}

/** Every placement key a chart can carry a longitude for, in display order. */
export const HOUSE_PLACEMENT_KEYS: readonly PlanetKey[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const;

/**
 * Group a chart's planets by the house they occupy.
 *
 * Returns an empty map when the cusps are not trustworthy — a caller that
 * forgets to check gets nothing, not a plausible arrangement.
 */
export function planetsByHouse(
  chart: Pick<NatalChart, PlanetKey>,
  cusps: number[] | null,
): Map<number, PlanetKey[]> {
  const byHouse = new Map<number, PlanetKey[]>();
  if (!cusps) return byHouse;

  for (const key of HOUSE_PLACEMENT_KEYS) {
    const placement = chart[key] as Placement | null | undefined;
    if (!placement || !isUsableCoordinate(placement.longitude)) continue;
    const house = houseOfLongitude(cusps, placement.longitude);
    if (house == null) continue;
    const bucket = byHouse.get(house);
    if (bucket) bucket.push(key);
    else byHouse.set(house, [key]);
  }

  return byHouse;
}

/**
 * The sign sitting on each house cusp, 1-indexed by house number.
 *
 * Null when the cusps are not trustworthy. Never partially filled: a chart
 * either earns all twelve or none.
 */
export function signsOnCusps(cusps: number[] | null): string[] | null {
  if (!cusps || cusps.length !== 12) return null;
  // Imported lazily through longitudeToPlacement to keep one zodiac table.
  return cusps.map((cusp) => {
    const lon = ((cusp % 360) + 360) % 360;
    return ZODIAC_ORDER[Math.floor(lon / 30)];
  });
}

// Kept local rather than re-exported from chart.ts so `signsOnCusps` has no
// reason to import the astronomy engine. Order is the canonical one and the
// test asserts it matches ZODIAC_SIGNS exactly.
const ZODIAC_ORDER = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;
