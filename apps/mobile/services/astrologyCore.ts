// Shared astrology helpers used by astrology.ts, astrologyApi.ts, and others
import * as Astronomy from 'astronomy-engine';

export const ZODIAC_SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;

export function getZodiacSign(longitude: number): { sign: string; degree: number } {
  const normalizedLong = ((longitude % 360) + 360) % 360;
  const signIndex = Math.floor(normalizedLong / 30);
  const degree = normalizedLong % 30;
  return {
    sign: ZODIAC_SIGNS[signIndex],
    degree: Math.round(degree * 100) / 100,
  };
}

export function signDegreeToLongitude(pos: { sign: string; degree: number }): number {
  const index = ZODIAC_SIGNS.indexOf(pos.sign as typeof ZODIAC_SIGNS[number]);
  if (index < 0) return 0;
  return index * 30 + pos.degree;
}

/**
 * Geocentric ecliptic longitude for a planet at a given time.
 * - Sun: use SunPosition (already geocentric).
 * - Moon: use EclipticGeoMoon (already geocentric).
 * - Planets: use GeoVector + Ecliptic to get geocentric ecliptic coords.
 */
export function getGeocentricLongitude(body: string, time: Astronomy.AstroTime): number {
  if (body === 'Sun') {
    return Astronomy.SunPosition(time).elon;
  }
  if (body === 'Moon') {
    return Astronomy.EclipticGeoMoon(time).lon;
  }
  // For planets, compute geocentric vector then convert to ecliptic
  const bodyEnum = body as Astronomy.Body;
  const geo = Astronomy.GeoVector(bodyEnum, time, true);
  const ecl = Astronomy.Ecliptic(geo);
  return ecl.elon;
}

/**
 * Calculate the Ascendant (Rising sign) using accurate GMST from astronomy-engine.
 * Uses standard ASC tangent formula with obliquity correction.
 */
export function calculateAscendant(
  time: Astronomy.AstroTime,
  latitude: number,
  longitude: number
): number {
  // Get accurate GMST from astronomy-engine (in sidereal hours)
  const gmstHours = Astronomy.SiderealTime(time);
  // Convert to degrees
  const gmstDeg = gmstHours * 15;
  // Local Sidereal Time in degrees
  const lst = ((gmstDeg + longitude) % 360 + 360) % 360;
  const lstRad = lst * Math.PI / 180;

  // Obliquity of the ecliptic (approximate for current epoch)
  const T = (time.ut - 0) / 36525; // Julian centuries from J2000 (time.ut is days since J2000)
  const eps = (23.439291 - 0.0130042 * T) * Math.PI / 180;
  const latRad = latitude * Math.PI / 180;

  // Standard ascendant formula: ASC = atan2(-cos(LST), sin(eps)*tan(lat) + cos(eps)*sin(LST))
  const y = -Math.cos(lstRad);
  const x = Math.sin(eps) * Math.tan(latRad) + Math.cos(eps) * Math.sin(lstRad);
  let asc = Math.atan2(y, x) * 180 / Math.PI;
  asc = ((asc % 360) + 360) % 360;

  return asc;
}

// Aspect definitions with orbs
export const ASPECTS = [
  { name: 'conjunction', angle: 0, orb: 8, type: 'intense' as const },
  { name: 'sextile', angle: 60, orb: 6, type: 'harmonious' as const },
  { name: 'square', angle: 90, orb: 7, type: 'challenging' as const },
  { name: 'trine', angle: 120, orb: 8, type: 'harmonious' as const },
  { name: 'opposition', angle: 180, orb: 8, type: 'challenging' as const },
] as const;

export type AspectType = 'harmonious' | 'challenging' | 'intense';

export interface DetectedAspect {
  name: string;
  angle: number;
  actualOrb: number;
  type: AspectType;
}

export function detectAspect(long1: number, long2: number): DetectedAspect | null {
  const diff = Math.abs(((long1 - long2 + 180) % 360) - 180);
  // diff is the shortest angular distance (0-180)

  for (const aspect of ASPECTS) {
    const orbDiff = Math.abs(diff - aspect.angle);
    if (orbDiff <= aspect.orb) {
      return {
        name: aspect.name,
        angle: aspect.angle,
        actualOrb: Math.round(orbDiff * 100) / 100,
        type: aspect.type,
      };
    }
  }
  return null;
}

/**
 * Generate 12 equal house cusps starting from the ascendant longitude.
 */
export function generateEqualHouses(ascendantLongitude: number): number[] {
  const houses: number[] = [];
  for (let i = 0; i < 12; i++) {
    houses.push(((ascendantLongitude + i * 30) % 360 + 360) % 360);
  }
  return houses;
}
