/**
 * Birth city suggestions — the only place the provider key exists.
 *
 * WHY THIS FUNCTION EXISTS AT ALL
 * ------------------------------
 * Checked against both providers' own documentation on 4 Sep 2026:
 *
 *   * Geoapify restricts keys by IP, HTTP referrer, origin and CORS. Real
 *     controls in a browser; none of them apply to an APK. Its documented
 *     mobile answer is matching a User-Agent substring, which any client sends.
 *   * LocationIQ states plainly that a referrer "can be spoofed" and that IP
 *     restrictions "should not be used for browser-based use-cases".
 *
 * A key shipped inside an app bundle is public. On Geoapify's 3,000 credit/day
 * free tier that is not an abstract leak — it is a denial of service against
 * our own onboarding: someone drains the quota and every new user's city search
 * fails at the exact moment they are deciding whether to finish signing up.
 *
 * So `GEOAPIFY_API_KEY` is a server secret, both apps call this endpoint, and
 * neither ever learns the provider's name from a URL.
 *
 * WHAT LEAVES THIS FUNCTION
 * -------------------------
 * The city text, an optional two-letter language, and a limit. That is the
 * whole request. No email, no user id, no auth token, no birth date, no birth
 * time — those are not omitted by discipline, they are absent from the body
 * this function is willing to read. `parseBody` below builds a fresh object
 * rather than forwarding what it was given, so a client that adds a field
 * cannot leak it by accident.
 *
 * The caller's IP is not forwarded either. Geoapify sees this function.
 */

const GEOAPIFY_KEY = Deno.env.get('GEOAPIFY_API_KEY') ?? '';

const PROD_ORIGINS = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
  'https://app.junosynastry.com',
];
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];
const ALLOWED_ORIGINS =
  Deno.env.get('ENVIRONMENT') === 'production'
    ? PROD_ORIGINS
    : [...PROD_ORIGINS, ...DEV_ORIGINS];

const corsHeaders = (origin: string | null) => ({
  // React Native sends no Origin at all; a missing Origin is not a browser
  // request and CORS does not apply to it.
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : '',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// --- input contract ---------------------------------------------------------

const MAX_QUERY_LENGTH = 120;
const MIN_LATIN_LENGTH = 3;
// Han, Hiragana, Katakana, Hangul. Written as code points rather than as
// literal ideographs so the range survives an editor and a code review.
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const LANG = /^[a-z]{2}$/;

type CleanQuery = { text: string; lang?: string; limit: number };

/**
 * Build a request from scratch. Nothing is forwarded — every field is read by
 * name, validated, and copied into a new object. A client that starts sending
 * `{ text, email }` cannot leak the email through here.
 */
function parseBody(raw: unknown): CleanQuery | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;

  const text = String(body.text ?? '')
    // Control characters, not punctuation: a newline in a city field is how a
    // log line or an upstream header gets split.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  if (!text) return null;
  const minimum = CJK.test(text) ? 2 : MIN_LATIN_LENGTH;
  if (text.length < minimum) return null;

  const langRaw = typeof body.lang === 'string' ? body.lang.toLowerCase() : '';
  const lang = LANG.test(langRaw) ? langRaw : undefined;

  const requested = Number(body.limit);
  const limit =
    Number.isFinite(requested) && requested > 0 ? Math.min(Math.trunc(requested), 10) : 5;

  return { text, ...(lang ? { lang } : {}), limit };
}

// --- coordinate guard -------------------------------------------------------

/**
 * `0,0` is rejected on purpose. It is a real point in the Gulf of Guinea and no
 * city is there, so in practice it only arrives as a coalesced null wearing a
 * location — a shape this codebase has stored as a birthplace before.
 */
function usableCoordinate(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;

type Suggestion = {
  id: string;
  name: string;
  admin1: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  source: 'remote';
};

/** Geoapify answers as geojson (`features[].properties`) or flat (`results[]`). */
function mapFeature(feature: unknown): Suggestion | null {
  if (!feature || typeof feature !== 'object') return null;
  const nested = (feature as { properties?: Record<string, unknown> }).properties;
  const p: Record<string, unknown> =
    nested && typeof nested === 'object' ? nested : (feature as Record<string, unknown>);

  const name = str(p.city) || str(p.name);
  const country = str(p.country);
  if (!name || !country) return null;

  const latitude = num(p.lat);
  const longitude = num(p.lon);
  if (!usableCoordinate(latitude, longitude)) return null;

  const admin1 = str(p.state) || str(p.county);
  const countryCode = str(p.country_code).toUpperCase();
  const tz = p.timezone as { name?: unknown } | null | undefined;
  const timezone = str(tz?.name);

  return {
    id: str(p.place_id) || `${name}|${countryCode}|${admin1}`,
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

// --- cache and rate limit ---------------------------------------------------
//
// Both are per-instance and in memory. That is honest about what they are:
// Supabase may run several instances, so this is not a global quota — it is a
// cheap brake on the obvious abuse (one client typing in a loop) and a real
// saving on the common case (everyone types "Paris"). The provider's own
// per-key quota is the actual ceiling.

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; suggestions: Suggestion[] }>();

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 40;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) hits.clear();
  return recent.length > RATE_MAX;
}

function cacheKey(q: CleanQuery): string {
  return `${q.text.toLowerCase()}|${q.lang ?? ''}|${q.limit}`;
}

// --- handler ----------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, cors);
  }

  if (!GEOAPIFY_KEY) {
    // Say "unavailable", never "misconfigured": the reader gets the same
    // honest message either way, and the response does not describe our setup.
    console.error('[suggest-birth-cities] GEOAPIFY_API_KEY is not set');
    return json({ error: 'unavailable' }, 503, cors);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: 'invalid_query' }, 400, cors);
  }

  const query = parseBody(raw);
  if (!query) return json({ error: 'invalid_query' }, 400, cors);

  // The rate-limit bucket is the caller's JWT subject when there is one, and
  // the forwarded IP otherwise. Neither is logged and neither travels onward.
  const auth = req.headers.get('authorization') ?? '';
  const bucket =
    auth.slice(-24) || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  if (rateLimited(bucket)) {
    return json({ error: 'rate_limited' }, 429, cors);
  }

  const key = cacheKey(query);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json({ suggestions: cached.suggestions, cached: true }, 200, cors);
  }

  const params = new URLSearchParams({
    text: query.text,
    // Without this, Geoapify happily offers street addresses as birthplaces.
    type: 'city',
    format: 'geojson',
    limit: String(query.limit),
    apiKey: GEOAPIFY_KEY,
  });
  if (query.lang) params.set('lang', query.lang);

  let payload: unknown;
  try {
    const upstream = await fetch(
      `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!upstream.ok) {
      // The provider's status is not the reader's problem, and echoing it would
      // leak our quota state. One honest "unavailable".
      console.warn(`[suggest-birth-cities] provider answered ${upstream.status}`);
      return json({ error: 'unavailable' }, 502, cors);
    }
    payload = await upstream.json();
  } catch (error) {
    console.warn('[suggest-birth-cities] provider unreachable', error);
    return json({ error: 'unavailable' }, 502, cors);
  }

  const body = payload as { features?: unknown; results?: unknown } | null;
  const features = Array.isArray(body?.features)
    ? body.features
    : Array.isArray(body?.results)
      ? body.results
      : [];

  const suggestions: Suggestion[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    const mapped = mapFeature(feature);
    if (!mapped) continue;
    const dedupe = `${mapped.name.toLowerCase()}|${mapped.countryCode}|${mapped.admin1.toLowerCase()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    suggestions.push(mapped);
    if (suggestions.length >= query.limit) break;
  }

  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), suggestions });

  // An empty list is a legitimate answer — "we could not find that city" — and
  // the client says so rather than substituting anything.
  return json({ suggestions, cached: false }, 200, cors);
});
