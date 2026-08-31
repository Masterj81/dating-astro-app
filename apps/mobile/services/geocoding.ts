// Geocoding service: hardcoded city cache + Nominatim/OpenStreetMap fallback.
//
// Phase 1 timezone correctness:
//   - We now return an IANA timezone (e.g. "America/New_York") via tz-lookup
//     instead of an integer hour offset. The legacy `Math.round(lng / 15)`
//     fallback IS GONE — it ignored DST, half-hour offsets (India +5:30),
//     45-minute offsets (Nepal +5:45), and historical tzdb rules.
//   - The legacy `timezone: number` field is kept on the result for any
//     callers that still want a coarse offset, but it is computed *from the
//     IANA zone* at the current instant, not from longitude/15.
//
// Birth datetime math now goes through `@astro/shared/astrology` — see
// `apps/mobile/services/astrology.ts`.

import tzlookup from 'tz-lookup';

export interface GeoResult {
  latitude: number;
  longitude: number;
  displayName: string;
  /** IANA timezone identifier resolved for these coordinates. */
  iana: string;
  /**
   * Current UTC offset in hours for the resolved IANA zone, computed from
   * tzdb. Provided for legacy callers; new code should use `iana` and let
   * the shared astrology engine do the date math with full DST awareness.
   */
  timezone: number;
}

// Hardcoded city cache. We keep the lat/lng — the timezone is derived from
// the IANA zone, not stored. Removing the hardcoded `tz: number` field was
// deliberate: it made it easy to ship "Cairo = +2" code that silently
// ignored Cairo's irregular DST transitions.
const CITY_CACHE: Record<string, { lat: number; lng: number }> = {
  'new york': { lat: 40.7128, lng: -74.006 },
  'los angeles': { lat: 34.0522, lng: -118.2437 },
  'chicago': { lat: 41.8781, lng: -87.6298 },
  'london': { lat: 51.5074, lng: -0.1278 },
  'paris': { lat: 48.8566, lng: 2.3522 },
  'tokyo': { lat: 35.6762, lng: 139.6503 },
  'sydney': { lat: -33.8688, lng: 151.2093 },
  'montreal': { lat: 45.5017, lng: -73.5673 },
  'toronto': { lat: 43.6532, lng: -79.3832 },
  'vancouver': { lat: 49.2827, lng: -123.1207 },
  'berlin': { lat: 52.52, lng: 13.405 },
  'madrid': { lat: 40.4168, lng: -3.7038 },
  'rome': { lat: 41.9028, lng: 12.4964 },
  'beijing': { lat: 39.9042, lng: 116.4074 },
  'shanghai': { lat: 31.2304, lng: 121.4737 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'singapore': { lat: 1.3521, lng: 103.8198 },
  'mumbai': { lat: 19.076, lng: 72.8777 },
  'delhi': { lat: 28.7041, lng: 77.1025 },
  'cairo': { lat: 30.0444, lng: 31.2357 },
  'são paulo': { lat: -23.5505, lng: -46.6333 },
  'sao paulo': { lat: -23.5505, lng: -46.6333 },
  'mexico city': { lat: 19.4326, lng: -99.1332 },
  'buenos aires': { lat: -34.6037, lng: -58.3816 },
  'moscow': { lat: 55.7558, lng: 37.6173 },
  'seoul': { lat: 37.5665, lng: 126.978 },
  'hong kong': { lat: 22.3193, lng: 114.1694 },
  'bangkok': { lat: 13.7563, lng: 100.5018 },
  'istanbul': { lat: 41.0082, lng: 28.9784 },
  'amsterdam': { lat: 52.3676, lng: 4.9041 },
  'barcelona': { lat: 41.3851, lng: 2.1734 },
  'lisbon': { lat: 38.7223, lng: -9.1393 },
  'riyadh': { lat: 24.7136, lng: 46.6753 },
  'johannesburg': { lat: -26.2041, lng: 28.0473 },
  'casablanca': { lat: 33.5731, lng: -7.5898 },
  'algiers': { lat: 36.7538, lng: 3.0588 },
  'tunis': { lat: 36.8065, lng: 10.1815 },
  'miami': { lat: 25.7617, lng: -80.1918 },
  'san francisco': { lat: 37.7749, lng: -122.4194 },
  'houston': { lat: 29.7604, lng: -95.3698 },
  'phoenix': { lat: 33.4484, lng: -112.074 },
  'denver': { lat: 39.7392, lng: -104.9903 },
  'seattle': { lat: 47.6062, lng: -122.3321 },
  'ottawa': { lat: 45.4215, lng: -75.6972 },
};

function resolveIana(lat: number, lng: number): string {
  try {
    return tzlookup(lat, lng);
  } catch {
    return 'UTC';
  }
}

function currentOffsetHours(iana: string): number {
  // Best-effort coarse offset: get the offset for "now" in the IANA zone.
  // Used only by legacy callers reading `result.timezone` as a number. New
  // code should pass `result.iana` to the shared astrology engine which
  // computes the offset at the actual birth instant.
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: iana,
      timeZoneName: 'shortOffset',
    });
    const parts = fmt.formatToParts(new Date());
    const tz = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
    const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(tz);
    if (!m) return 0;
    const sign = m[1] === '-' ? -1 : 1;
    const hours = parseInt(m[2], 10);
    const minutes = m[3] ? parseInt(m[3], 10) : 0;
    return sign * (hours + minutes / 60);
  } catch {
    return 0;
  }
}

function buildResult(lat: number, lng: number, displayName: string): GeoResult {
  const iana = resolveIana(lat, lng);
  return {
    latitude: lat,
    longitude: lng,
    displayName,
    iana,
    timezone: currentOffsetHours(iana),
  };
}

// Rate limiter: enforce minimum 1 second between Nominatim requests.
let lastNominatimRequest = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequest;
  if (timeSinceLast < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - timeSinceLast));
  }
  lastNominatimRequest = Date.now();
  return fetch(url);
}

/**
 * Geocode a city name to coordinates + IANA timezone.
 *
 * Resolution order:
 *   1. Exact match in hardcoded cache
 *   2. Partial string match in cache
 *   3. Nominatim API (rate-limited)
 *   4. Fallback: Montreal (lat/lng known; tz resolved through tz-lookup so
 *      this never produces a stale fixed offset)
 */
export async function geocodeCity(city: string): Promise<GeoResult | null> {
  // Normalize: lowercase, trim, remove combining diacritics introduced by NFD
  // (Unicode block U+0300..U+036F covers the Latin combining marks).
  const normalized = city
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (CITY_CACHE[normalized]) {
    const c = CITY_CACHE[normalized];
    return buildResult(c.lat, c.lng, city);
  }

  for (const [name, coords] of Object.entries(CITY_CACHE)) {
    if (normalized.includes(name) || name.includes(normalized)) {
      return buildResult(coords.lat, coords.lng, city);
    }
  }

  try {
    const encodedCity = encodeURIComponent(city);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=1`;
    const response = await rateLimitedFetch(url);
    if (response.ok) {
      const results = await response.json();
      if (results && results.length > 0) {
        const result = results[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        return buildResult(lat, lng, result.display_name || city);
      }
    }
  } catch {
    // Network error — fall through.
  }

  // No fallback. This used to `return buildResult(45.5017, -73.5673, city)` —
  // Montréal — for any city the cache, the substring match and Nominatim all
  // failed to resolve. The caller could not tell that apart from a real
  // result, so an unrecognised birthplace produced a chart cast for a city the
  // reader has very likely never been to, complete with an ascendant and
  // twelve house cusps.
  //
  // Null is the honest answer, and `computeNatalChart` knows what to do with
  // it: planets still compute, angles do not, and the chart carries
  // `missing_birth_place`.
  return null;
}
