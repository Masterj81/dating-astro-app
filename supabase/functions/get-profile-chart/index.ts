// Phase 3-A: get-profile-chart edge function.
//
// Purpose: let an authenticated user fetch the natal chart of ANOTHER active
// profile WITHOUT exposing the target's raw birth_time / birth_latitude /
// birth_longitude / birth_date / email.
//
// Architecture:
//   1. Caller's JWT is verified by the Supabase platform (verify_jwt = default true).
//   2. We re-extract the caller's user.id for the rate-limit key.
//   3. We read the target profile via the service_role client (bypassing
//      RLS and any future Phase 3-C column REVOKEs). Only the fields needed
//      for the natal chart calculation + the public profile fields are
//      pulled — and only the latter are returned to the caller.
//   4. We calculate the natal chart server-side using astronomy-engine
//      (same lib as supabase/functions/calculate-chart).
//   5. We sanitize the output: birth_time, birth_date, raw lat/long are
//      NEVER returned. coordinates in the chart are coarsened to 0.5°
//      (~55 km) so reverse-engineering the target's exact birth location
//      is not practical.
//   6. Rate limit: 100 chart views per caller per hour.
//
// What this function MUST NOT do:
//   - Return birth_time, birth_date, email, push_token, raw lat/long.
//   - Allow anonymous calls (verify_jwt enforces this).
//   - Use the caller's JWT for the target read (RLS would only return
//     the caller's own row and the public projection of others).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import * as Astronomy from 'https://esm.sh/astronomy-engine@2.1.19'
// Phase 1 timezone correctness — see supabase/functions/calculate-chart for
// the rationale. We never use the Deno worker's local clock as ground truth.
import { DateTime, IANAZone } from 'https://esm.sh/luxon@3.7.2'
import tzlookup from 'https://esm.sh/tz-lookup@6.1.25'

// ---------------------------------------------------------------------------
// Astrology helpers (kept inline — TODO: factor with calculate-chart later).
// ---------------------------------------------------------------------------

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
]

function getZodiacSign(longitude: number): string {
  const norm = ((longitude % 360) + 360) % 360
  return ZODIAC_SIGNS[Math.floor(norm / 30)]
}

function getDegreeInSign(longitude: number): number {
  const norm = ((longitude % 360) + 360) % 360
  return Math.round((norm % 30) * 100) / 100
}

function getGeocentricLongitude(body: string, time: any): number {
  if (body === 'Sun') return Astronomy.SunPosition(time).elon
  if (body === 'Moon') return Astronomy.EclipticGeoMoon(time).lon
  const geo = Astronomy.GeoVector(body, time, true)
  return Astronomy.Ecliptic(geo).elon
}

function calculateAscendant(time: any, latitude: number, longitude: number): number {
  const gmstHours = Astronomy.SiderealTime(time)
  const gmstDeg = gmstHours * 15
  const lst = ((gmstDeg + longitude) % 360 + 360) % 360
  const lstRad = (lst * Math.PI) / 180

  const T = (time.ut - 0) / 36525
  const eps = ((23.439291 - 0.0130042 * T) * Math.PI) / 180
  const latRad = (latitude * Math.PI) / 180

  const y = -Math.cos(lstRad)
  const x = Math.sin(eps) * Math.tan(latRad) + Math.cos(eps) * Math.sin(lstRad)
  let asc = (Math.atan2(y, x) * 180) / Math.PI
  return ((asc % 360) + 360) % 360
}

function resolveIanaTimezone(
  lat: number | null | undefined,
  lng: number | null | undefined,
  caller: string | null | undefined,
): { iana: string; source: 'input' | 'lookup' | 'fallback' } {
  if (caller && typeof caller === 'string' && IANAZone.isValidZone(caller)) {
    return { iana: caller, source: 'input' }
  }
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    try {
      const iana = tzlookup(lat, lng)
      if (iana && IANAZone.isValidZone(iana)) return { iana, source: 'lookup' }
    } catch {
      // Fall through to UTC fallback.
    }
  }
  return { iana: 'UTC', source: 'fallback' }
}

function buildUtcInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  iana: string,
): Date {
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: iana },
  )
  if (!dt.isValid) return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
  return dt.toUTC().toJSDate()
}

function calculatePlanetPositions(time: any) {
  // Chart model v2: outer planets included (additive keys — safe for all readers).
  const planets = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
  const out: Record<string, { longitude: number; sign: string; degree: number }> = {}
  for (const body of planets) {
    const lon = getGeocentricLongitude(body, time)
    out[body.toLowerCase()] = {
      longitude: lon,
      sign: getZodiacSign(lon),
      degree: getDegreeInSign(lon),
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

// CORS origins. Pattern aligned with calculate-chart / create-checkout-session
// / claim-referral so any new web subdomain is whitelisted in one place.
// `https://app.astrodatingapp.com` and `https://app.junosynastry.com` MUST be included — the authenticated web
// app runs there and was previously rejected, surfacing as
// "Failed to send a request to the Edge Function" on the synastry page.
const PROD_ORIGINS = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
  'https://app.junosynastry.com',
]
const DEV_ORIGINS = [
  ...PROD_ORIGINS,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8081',
  'http://localhost:19006',
]
const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
  ? PROD_ORIGINS
  : DEV_ORIGINS

function getAllowedOrigin(origin: string | null): string {
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin
  // Native mobile + Supabase relay calls have no Origin header — empty string
  // means "no CORS allowance", which is correct: those code paths don't go
  // through a browser CORS check anyway.
  return ''
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function jsonError(status: number, message: string, origin: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: corsHeaders(origin) },
  )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const origin = req.headers.get('origin')
  const allowedOrigin = getAllowedOrigin(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(allowedOrigin) })
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed', allowedOrigin)
  }

  // 1. Verify caller (defense-in-depth — verify_jwt default also enforces this).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Missing authorization', allowedOrigin)
  const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!callerToken) return jsonError(401, 'Invalid authorization', allowedOrigin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonError(500, 'Server misconfigured', allowedOrigin)
  }

  const jwtClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user: caller }, error: authError } = await jwtClient.auth.getUser(callerToken)
  if (authError || !caller) return jsonError(401, 'Unauthorized', allowedOrigin)

  // 2. Parse + validate input.
  let body: { targetUserId?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body', allowedOrigin)
  }
  const targetUserId = body.targetUserId
  if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return jsonError(400, 'Invalid targetUserId', allowedOrigin)
  }

  // 3. Rate limit (service_role can call check_rate_limit; authenticated cannot).
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const { data: rlOk, error: rlErr } = await adminClient.rpc('check_rate_limit', {
      p_user_id: caller.id,
      p_action: 'profile_chart_view',
      p_max_count: 100,
      p_window: '1 hour',
    })
    if (rlErr) {
      console.error('check_rate_limit failed (non-fatal):', rlErr.message)
    } else if (rlOk === false) {
      return jsonError(429, 'Too many requests', allowedOrigin)
    }
  } catch (e) {
    console.error('check_rate_limit threw (non-fatal):', e)
  }

  // 4. Read target via service_role (bypasses RLS + Phase 3-C column REVOKEs).
  const { data: target, error: targetErr } = await adminClient
    .from('profiles')
    .select(
      'id, name, age, birth_date, birth_time, birth_city, birth_latitude, birth_longitude, ' +
      'sun_sign, moon_sign, rising_sign, bio, image_url, images, photos, gender, ' +
      'has_voice_intro, voice_intro_url, is_verified, last_active, is_active, onboarding_completed',
    )
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetErr) {
    console.error('Target profile read failed:', targetErr.message)
    return jsonError(500, 'Failed to load profile', allowedOrigin)
  }
  if (!target) return jsonError(404, 'Profile not found', allowedOrigin)
  if (!target.is_active || !target.onboarding_completed) {
    return jsonError(404, 'Profile not available', allowedOrigin)
  }
  if (!target.birth_date) {
    // No birth date on file — return profile without chart so the UI can
    // show the basic profile but skip the natal section.
    return new Response(
      JSON.stringify({
        success: true,
        profile: sanitizeProfile(target),
        chart: null,
      }),
      { headers: corsHeaders(allowedOrigin) },
    )
  }

  // 5. Compute the natal chart server-side.
  const [year, month, day] = String(target.birth_date).split('-').map(Number)
  let hour = 12
  let minute = 0
  const hasBirthTime = typeof target.birth_time === 'string' && String(target.birth_time).length > 0
  if (hasBirthTime) {
    const [h, m] = String(target.birth_time).split(':')
    hour = Number.parseInt(h) || 12
    minute = Number.parseInt(m) || 0
  }

  // Null, never a stand-in. These two lines used to read `: 51.5074` and
  // `: 0` — Greenwich — and the result went straight into
  // `calculateAscendant`, so a profile with no stored birthplace was rendered
  // with an ascendant cast for London. Plausible, varied, fictional. The
  // angles need the PLACE as much as the clock: birth longitude enters local
  // sidereal time degree for degree.
  const lat = typeof target.birth_latitude === 'number' && Number.isFinite(target.birth_latitude)
    ? target.birth_latitude
    : null
  const lng = typeof target.birth_longitude === 'number' && Number.isFinite(target.birth_longitude)
    ? target.birth_longitude
    : null
  const hasBirthPlace = lat !== null && lng !== null

  // Phase 1 fix: resolve the IANA timezone from coords (or trust the value
  // we stored on birth_chart.timezone if present) and build the UTC instant
  // through Luxon. The legacy `new Date(Date.UTC(y, m, d, h, min))` treated
  // a local birth time AS IF it were UTC — off by the user's whole tz offset.
  const storedTz =
    typeof target.birth_chart === 'object' && target.birth_chart != null
      ? (target.birth_chart as Record<string, unknown>).timezone
      : null
  const tz = resolveIanaTimezone(
    lat,
    lng,
    typeof storedTz === 'string' ? storedTz : null,
  )
  const utcDate = buildUtcInstant(year, (month || 1), day || 1, hour, minute, tz.iana)
  const time = Astronomy.MakeTime(utcDate)

  const sunLong = getGeocentricLongitude('Sun', time)
  const moonLong = getGeocentricLongitude('Moon', time)
  const ascLong = hasBirthTime && hasBirthPlace ? calculateAscendant(time, lat as number, lng as number) : null
  const planets = calculatePlanetPositions(time)

  // 6. Coarsen coordinates to 0.5° (~55 km) before returning.
  const coarseLat = Math.round(lat * 2) / 2
  const coarseLng = Math.round(lng * 2) / 2

  const chart = {
    sun: { longitude: sunLong, sign: getZodiacSign(sunLong), degree: getDegreeInSign(sunLong) },
    moon: { longitude: moonLong, sign: getZodiacSign(moonLong), degree: getDegreeInSign(moonLong) },
    rising: ascLong != null
      ? { longitude: ascLong, sign: getZodiacSign(ascLong), degree: getDegreeInSign(ascLong) }
      : null,
    planets,
    coordinates: { latitude: coarseLat, longitude: coarseLng },
    confidence: !hasBirthTime || !hasBirthPlace || tz.source === 'fallback' ? 'low' : tz.source === 'lookup' ? 'medium' : 'high',
  }

  return new Response(
    JSON.stringify({ success: true, profile: sanitizeProfile(target), chart }),
    { headers: corsHeaders(allowedOrigin) },
  )
})

function sanitizeProfile(target: Record<string, unknown>) {
  // Keep ONLY public-facing fields. Never include birth_*, email, push_token,
  // notification_preferences, current lat/long, etc.
  return {
    id: target.id,
    name: target.name,
    age: target.age,
    sun_sign: target.sun_sign,
    moon_sign: target.moon_sign,
    rising_sign: target.rising_sign,
    bio: target.bio,
    image_url: target.image_url,
    images: target.images,
    photos: target.photos,
    gender: target.gender,
    has_voice_intro: target.has_voice_intro,
    voice_intro_url: target.voice_intro_url,
    is_verified: target.is_verified,
    last_active: target.last_active,
  }
}
