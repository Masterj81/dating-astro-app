/**
 * The remote birth-city provider.
 *
 * WHY A PROXY AND NOT A PUBLIC KEY
 * --------------------------------
 * Checked against the providers' own documentation on 4 Sep 2026:
 *
 *   * Geoapify restricts keys by IP, HTTP referrer, origin and CORS. Those are
 *     real controls in a browser and no control at all in an APK — the
 *     documented mobile story is matching a User-Agent substring, which any
 *     client can send.
 *   * LocationIQ says it outright: the referrer "can be spoofed", and IP
 *     restrictions "should not be used for browser-based use-cases".
 *
 * A key shipped in an app bundle is public. On a 3,000 credit/day free tier
 * that is not an abstract leak — it is a denial of service against our own
 * onboarding: someone drains the quota and every new user's city search fails
 * at the exact moment they are deciding whether to finish signing up.
 *
 * So the key stays server-side and both apps call our own endpoint. That also
 * gives one rate limit, one cache and one place where the request is scrubbed,
 * instead of two clients that will drift.
 *
 * WHAT THIS FILE IS
 * -----------------
 * Pure mapping and validation, no fetch of its own beyond the injected one, so
 * every branch is testable without a network. The client-side transport is
 * `createRemoteBirthCityProvider`; the Geoapify wire format is decoded by
 * `mapGeoapifyFeature`, which is exported for the edge function to reuse.
 */
import {
  isUsableBirthCoordinate,
  MAX_CITY_QUERY_LENGTH,
  minimumQueryLength,
  normalizeCityQuery,
} from './index';
import type { BirthCitySuggestion } from './types';

/**
 * What we are willing to send to a third party: the city text, and nothing
 * else. No email, no user id, no auth token, no birth date, no birth time.
 *
 * This is a type, not a comment, because the temptation to "just pass the
 * locale and the user id for analytics" is real and this shape refuses it.
 */
export type BirthCityQuery = {
  /** The text the reader typed. Sanitised before it leaves. */
  text: string;
  /** ISO 639-1, to get local place names back. Not a user identifier. */
  lang?: string;
  /** Hard cap. The UI shows five. */
  limit?: number;
};

export type BirthCityProviderResult =
  | { ok: true; suggestions: BirthCitySuggestion[] }
  | { ok: false; reason: 'invalid_query' | 'unavailable' | 'rate_limited' };

export type BirthCityProvider = (
  query: BirthCityQuery,
  signal?: AbortSignal,
) => Promise<BirthCityProviderResult>;

/** ISO 639-1 only. Anything else is dropped rather than forwarded. */
const LANG = /^[a-z]{2}$/;

/**
 * Everything that leaves for the provider passes through here.
 *
 * Returns null when the query should not be sent at all — too short, too long,
 * or empty after normalisation. A null is a refusal, not an error to report.
 */
export function sanitizeProviderQuery(query: BirthCityQuery): BirthCityQuery | null {
  const text = String(query.text ?? '')
    // Control characters, not punctuation: a newline typed into a city
    // field is how a log line or an HTTP header gets split downstream.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CITY_QUERY_LENGTH);

  const normalized = normalizeCityQuery(text);
  if (normalized.length < minimumQueryLength(normalized)) return null;
  if (normalized.length > MAX_CITY_QUERY_LENGTH) return null;

  const lang = typeof query.lang === 'string' && LANG.test(query.lang) ? query.lang : undefined;
  // A non-positive limit is a caller bug, not a request for one row.
  const requested = Number(query.limit);
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.trunc(requested), 10) : 5;

  return { text, ...(lang ? { lang } : {}), limit };
}

/** One Geoapify `features[].properties` object, as far as we care about it. */
type GeoapifyProperties = {
  city?: unknown;
  name?: unknown;
  state?: unknown;
  county?: unknown;
  country?: unknown;
  country_code?: unknown;
  formatted?: unknown;
  place_id?: unknown;
  lat?: unknown;
  lon?: unknown;
  timezone?: { name?: unknown } | null;
};

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

/**
 * Decode one Geoapify feature into a suggestion, or reject it.
 *
 * Rejects rather than repairs. A feature with no usable coordinate is not a
 * city with a small problem — the whole point of this pipeline is that a
 * birthplace is either resolved or absent, and `isUsableBirthCoordinate`
 * refuses `0,0` because that is the shape a coalesced null takes.
 */
export function mapGeoapifyFeature(feature: unknown): BirthCitySuggestion | null {
  if (!feature || typeof feature !== 'object') return null;
  // Two wire shapes, both real: `format=geojson` (the default) nests the fields
  // under `properties`; `format=json` returns them flat. Reading only one of
  // them decodes nothing and looks exactly like "city not found".
  const nested = (feature as { properties?: GeoapifyProperties }).properties;
  const properties: GeoapifyProperties =
    nested && typeof nested === 'object' ? nested : (feature as GeoapifyProperties);
  if (!properties || typeof properties !== 'object') return null;

  // `city` is the field we asked for with `type=city`; `name` is the fallback
  // for places Geoapify labels differently (city-states, some districts).
  const name = str(properties.city) || str(properties.name);
  const country = str(properties.country);
  if (!name || !country) return null;

  const latitude = num(properties.lat);
  const longitude = num(properties.lon);
  if (!isUsableBirthCoordinate(latitude, longitude)) return null;

  const admin1 = str(properties.state) || str(properties.county);
  const countryCode = str(properties.country_code).toUpperCase();
  const timezone = str(properties.timezone?.name);

  return {
    id: str(properties.place_id) || `${normalizeCityQuery(name)}|${countryCode}|${normalizeCityQuery(admin1)}`,
    name,
    admin1,
    country,
    countryCode,
    latitude,
    longitude,
    ...(timezone ? { timezone } : {}),
    source: 'remote',
  };
}

/** Decode a whole Geoapify autocomplete response. Bad features are dropped. */
export function mapGeoapifyResponse(payload: unknown, limit = 5): BirthCitySuggestion[] {
  const body = payload as { features?: unknown; results?: unknown } | null;
  const features = Array.isArray(body?.features)
    ? body.features
    : Array.isArray(body?.results)
      ? body.results
      : null;
  if (!features) return [];
  const out: BirthCitySuggestion[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const suggestion = mapGeoapifyFeature(feature);
    if (!suggestion) continue;
    // Geoapify happily returns the same city twice at different ranks.
    const key = `${normalizeCityQuery(suggestion.name)}|${suggestion.countryCode}|${normalizeCityQuery(suggestion.admin1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(suggestion);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Build the Geoapify URL. Exported so the edge function and the tests agree on
 * exactly one construction — including `type=city`, which is what keeps a
 * street address from being offered as a birthplace.
 */
export function buildGeoapifyUrl(query: BirthCityQuery, apiKey: string): string {
  const params = new URLSearchParams({
    text: query.text,
    type: 'city',
    format: 'json',
    limit: String(query.limit ?? 5),
    apiKey,
  });
  if (query.lang) params.set('lang', query.lang);
  return `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`;
}

export type RemoteProviderOptions = {
  /** Our own endpoint. Never the provider's — the key does not ship. */
  endpoint: string;
  /** Injected so tests, web and React Native can each supply their own. */
  fetchImpl?: typeof fetch;
  /** Extra headers, e.g. the Supabase anon key for a verify_jwt function. */
  headers?: Record<string, string>;
};

/**
 * The transport both clients use.
 *
 * The body carries the query and nothing else — see `BirthCityQuery`. Every
 * suggestion that comes back is re-validated on this side too: the endpoint is
 * ours, but "ours" is not a coordinate check.
 */
export function createRemoteBirthCityProvider(
  options: RemoteProviderOptions,
): BirthCityProvider {
  const doFetch = options.fetchImpl ?? fetch;

  return async (query, signal) => {
    const clean = sanitizeProviderQuery(query);
    if (!clean) return { ok: false, reason: 'invalid_query' };

    try {
      const response = await doFetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
        body: JSON.stringify(clean),
        ...(signal ? { signal } : {}),
      });

      if (response.status === 429) return { ok: false, reason: 'rate_limited' };
      if (!response.ok) return { ok: false, reason: 'unavailable' };

      const payload: unknown = await response.json();
      const raw = (payload as { suggestions?: unknown })?.suggestions;
      if (!Array.isArray(raw)) return { ok: false, reason: 'unavailable' };

      const suggestions: BirthCitySuggestion[] = [];
      for (const item of raw) {
        // Same guard as anything else crossing a boundary: a suggestion
        // without finite coordinates is not a place.
        const validated = validateRemote(item);
        if (validated) suggestions.push(validated);
      }
      return { ok: true, suggestions };
    } catch {
      // Aborts land here too. The caller distinguishes by checking its own
      // signal; there is nothing useful to say about a cancelled keystroke.
      return { ok: false, reason: 'unavailable' };
    }
  };
}

function validateRemote(item: unknown): BirthCitySuggestion | null {
  if (!item || typeof item !== 'object') return null;
  const s = item as Partial<BirthCitySuggestion>;
  if (typeof s.name !== 'string' || !s.name.trim()) return null;
  if (typeof s.country !== 'string' || !s.country.trim()) return null;
  if (!isUsableBirthCoordinate(s.latitude, s.longitude)) return null;
  return {
    id: typeof s.id === 'string' && s.id ? s.id : `${normalizeCityQuery(s.name)}|${s.countryCode ?? ''}`,
    name: s.name.trim(),
    admin1: typeof s.admin1 === 'string' ? s.admin1 : '',
    country: s.country.trim(),
    countryCode: typeof s.countryCode === 'string' ? s.countryCode.toUpperCase() : '',
    latitude: s.latitude as number,
    longitude: s.longitude as number,
    ...(typeof s.timezone === 'string' && s.timezone ? { timezone: s.timezone } : {}),
    source: 'remote',
  };
}
