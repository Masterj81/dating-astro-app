// Natal chart computation using astronomy-engine.
//
// This is the canonical implementation. mobile/services/astrology.ts,
// apps/web's chart code, and the calculate-chart edge function all delegate
// here so there is exactly one formula for Sun/Moon/Rising/Houses.
//
// Accuracy notes:
//   - astronomy-engine gives ~1 arc-minute precision for the bodies we use.
//   - The Ascendant tangent formula assumes a topocentric observer at
//     (lat, lng). Equal houses are computed from the Ascendant — Placidus /
//     Koch / Whole-Sign live in Phase 2 (Swiss Ephemeris).
//   - At |latitude| > 66.5° the Ascendant tangent becomes unstable around
//     the polar circles; we still return a value (Luxon-style "best effort")
//     and surface a warning if the user is over the Arctic/Antarctic circle.

import * as Astronomy from 'astronomy-engine';

import { normalizeBirthInput } from './time';
import type {
  BirthInput,
  ChartWarning,
  NatalChart,
  Placement,
  PlanetKey,
  ZodiacSign,
} from './types';

export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
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

const PLANET_BODIES: Record<Exclude<PlanetKey, 'sun' | 'moon'>, Astronomy.Body> = {
  mercury: Astronomy.Body.Mercury,
  venus: Astronomy.Body.Venus,
  mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter,
  saturn: Astronomy.Body.Saturn,
  // Outer planets (chart model v2). astronomy-engine models Pluto with its
  // own high-accuracy series (valid 1700–2200), same GeoVector call as the
  // rest — no extra dependency, no API.
  uranus: Astronomy.Body.Uranus,
  neptune: Astronomy.Body.Neptune,
  pluto: Astronomy.Body.Pluto,
};

function normalize360(x: number): number {
  return ((x % 360) + 360) % 360;
}

export function longitudeToPlacement(longitude: number): Placement {
  const lon = normalize360(longitude);
  const idx = Math.floor(lon / 30);
  const degree = lon % 30;
  return {
    sign: ZODIAC_SIGNS[idx],
    degree: Math.round(degree * 100) / 100,
    longitude: Math.round(lon * 100) / 100,
  };
}

export function placementToLongitude(p: { sign: string; degree: number }): number {
  const idx = ZODIAC_SIGNS.indexOf(p.sign as ZodiacSign);
  if (idx < 0) return 0;
  return idx * 30 + p.degree;
}

function geocentricLongitude(body: 'Sun' | 'Moon' | Astronomy.Body, time: Astronomy.AstroTime): number {
  if (body === 'Sun') return Astronomy.SunPosition(time).elon;
  if (body === 'Moon') return Astronomy.EclipticGeoMoon(time).lon;
  const geo = Astronomy.GeoVector(body, time, true);
  return Astronomy.Ecliptic(geo).elon;
}

/**
 * Compute the Ascendant (Rising) longitude using the standard tangent formula
 * with GMST from astronomy-engine and IAU obliquity at the given instant.
 */
export function computeAscendant(
  time: Astronomy.AstroTime,
  latitude: number,
  longitude: number,
): number {
  const gmstHours = Astronomy.SiderealTime(time);
  const gmstDeg = gmstHours * 15;
  const lst = normalize360(gmstDeg + longitude);
  const lstRad = (lst * Math.PI) / 180;

  // Julian centuries from J2000 (time.ut is days since J2000.0)
  const T = time.ut / 36525;
  const eps = ((23.439291 - 0.0130042 * T) * Math.PI) / 180;
  const latRad = (latitude * Math.PI) / 180;

  const y = -Math.cos(lstRad);
  const x = Math.sin(eps) * Math.tan(latRad) + Math.cos(eps) * Math.sin(lstRad);
  const asc = (Math.atan2(y, x) * 180) / Math.PI;
  return normalize360(asc);
}

/**
 * Midheaven (MC) longitude: arctan(sin(LST) / (cos(LST) * cos(eps))).
 */
export function computeMidheaven(
  time: Astronomy.AstroTime,
  longitude: number,
): number {
  const gmstHours = Astronomy.SiderealTime(time);
  const gmstDeg = gmstHours * 15;
  const lst = normalize360(gmstDeg + longitude);
  const lstRad = (lst * Math.PI) / 180;
  const T = time.ut / 36525;
  const eps = ((23.439291 - 0.0130042 * T) * Math.PI) / 180;
  const mc = (Math.atan2(Math.sin(lstRad), Math.cos(lstRad) * Math.cos(eps)) * 180) / Math.PI;
  return normalize360(mc);
}

export function computeEqualHouses(ascendantLongitude: number): number[] {
  const houses: number[] = [];
  for (let i = 0; i < 12; i++) {
    houses.push(normalize360(ascendantLongitude + i * 30));
  }
  return houses;
}

/**
 * Build a NatalChart from raw birth inputs. Birth time + IANA timezone go
 * through `normalizeBirthInput` so DST, half-hour offsets, and historical
 * tzdb rules are all honored.
 */
export function computeNatalChart(input: BirthInput): NatalChart {
  const normalized = normalizeBirthInput(input);
  const warnings: ChartWarning[] = [...normalized.warnings];
  const time = Astronomy.MakeTime(normalized.utcDate);

  const sun = longitudeToPlacement(geocentricLongitude('Sun', time));
  const moon = longitudeToPlacement(geocentricLongitude('Moon', time));
  const mercury = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.mercury, time));
  const venus = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.venus, time));
  const mars = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.mars, time));
  const jupiter = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.jupiter, time));
  const saturn = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.saturn, time));
  const uranus = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.uranus, time));
  const neptune = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.neptune, time));
  const pluto = longitudeToPlacement(geocentricLongitude(PLANET_BODIES.pluto, time));

  let rising: Placement | null = null;
  let mc: Placement | null = null;
  let houses: number[] | null = null;
  if (normalized.hasBirthTime) {
    const ascLong = computeAscendant(time, input.latitude, input.longitude);
    rising = longitudeToPlacement(ascLong);
    mc = longitudeToPlacement(computeMidheaven(time, input.longitude));
    houses = computeEqualHouses(ascLong);
  }

  return {
    sun,
    moon,
    mercury,
    venus,
    mars,
    jupiter,
    saturn,
    uranus,
    neptune,
    pluto,
    rising,
    mc,
    houses,
    utcInstant: normalized.utcDate.toISOString(),
    timezone: normalized.timezone.iana,
    confidence: normalized.confidence,
    warnings,
    input: { ...input, timezone: input.timezone ?? normalized.timezone.iana },
  };
}
