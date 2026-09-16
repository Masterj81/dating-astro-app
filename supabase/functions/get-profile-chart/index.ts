// get-profile-chart edge function.
//
// Purpose: let an ENTITLED, AUTHORIZED user read an astrological reading of
// ANOTHER active profile without that reading carrying the target's birth
// date, birth time or birth coordinates — the columns Phase 3-C revokes.
//
// ── WHAT CHANGED ON 2026-09-07, AND WHY IT HAD TO ────────────────────────────
//
// This function used to publish `longitude` at full float64 precision on
// `sun`, `moon`, `rising`, `mc`, every planet, and the twelve `houses`, and a
// comment beside them asserted that those values "say nothing about the exact
// minute or the exact coordinates". That was false, and exactly invertible:
//
//   moon.longitude  → the birth instant, to the SECOND
//   mc.longitude    → the birth longitude (MC depends only on instant + longitude)
//   rising.longitude→ the birth latitude
//
// Measured against this very engine: 0 s of error on the instant, 1.3e-13° on
// the longitude, 8.4e-13° on the latitude. The `coordinates` field beside them
// was rounded to 0.5° "so reverse-engineering the target's exact birth location
// is not practical" — a 55 km blur in front of an unlocked door.
// (docs/security-audit-2026-09-07.md, JUNO-01.)
//
// THREE CONTROLS NOW STAND WHERE ONE PRETENDED TO:
//
//   1. MINIMISATION. The response carries `sign` + `degree` only. `longitude`
//      is GONE, not rounded. `coordinates` and `houses` are gone too: no
//      surface ever read them from this payload (the natal wheel renders the
//      reader's OWN chart). `degree` is quantised to CHART_DEGREE_QUANTUM.
//
//   2. AUTHORIZATION (JUNO-02). Entitlement is checked server-side with the
//      caller's own JWT, and visibility is decided by `can_view_profile_chart`
//      — one SQL function shared with the synastry RPC so the two cannot
//      drift. Blocks in BOTH directions, discoverability, and "is there a
//      conversation" all live there. Every refusal answers the same way, so
//      the function is not a UUID oracle.
//
//   3. RATE LIMIT, FAIL-CLOSED. Persistent, server-side, per caller. If the
//      limiter itself errors, the request is REFUSED. It used to log the error
//      and continue, which meant a broken limiter was an open door.
//
// ── WHAT CHANGED ON 2026-09-15: THE FREE DAILY SYNASTRY PREVIEW ─────────────
//
// One free comparison per reader per UTC day, decided by
// `20260915000001_synastry_free_grant.sql`. The two defects the design review
// caught are fixed HERE, in code, and both are about ordering:
//
//   DEFECT 1 — CLAIM BEFORE COMPUTE. Reserving first and computing after
//   loses the grant on any failure between the two. The order is now:
//   gate (read-only) → visibility → read → COMPUTE → claim (atomic) → emit.
//   Nothing astrological leaves this worker before the claim authorises the
//   target. A concurrent loser throws its computation away and receives
//   402 + next_available_utc.
//
//   DEFECT 2 — can_use_premium_feature AMBIGUITY. With the preview quota
//   raised to 1, `can_use_premium_feature('synastry')` answers allowed=true
//   for BOTH a subscriber and a free reader — it cannot tell the two apart,
//   so the edge cannot know whether to claim. Entitlement is now read
//   explicitly through `synastry_preview_gate()`: paid | preview_enabled |
//   preview_disabled (quota NULL → 402, the no-redeploy rollback) |
//   policy_unavailable (503, fail-closed).
//
// Response contract (free path), the `grant` field is NEW and additive:
//   allowed_free_new       → 200, grant.code = 'allowed_free_new'
//   allowed_free_existing  → 200, grant.code = 'allowed_free_existing'
//   allowed_paid (race)    → 200, no grant field (subscriber mid-request)
//   free_preview_used_other_target → 402 + next_available_utc, NO astro data,
//                                    and never any identity of today's target
//   target_ineligible      → 404, byte-identical to every other NOT_VISIBLE
//
// A subscriber never creates a grant row. A grant is never deleted: no DELETE
// compensation exists anywhere — "A reserved, B replayed, A failed" cannot
// resurrect a second free target for the same day.
//
// WHY MINIMISATION ALONE IS NOT ENOUGH, STATED SO NOBODY RE-DERIVES IT
// --------------------------------------------------------------------
// Quantising cannot close the birth-time leak. The ten bodies constrain each
// other, so even a product-destroying 1° step still pins the birth instant to
// ±20 minutes (measured; see the audit). Any full natal reading of another
// person leaks their birth time to within tens of minutes. That is why
// control 2 is load-bearing and must never be weakened to "just round harder".
//
// What this function MUST NOT do:
//   - Return birth_time, birth_date, email, push_token, raw lat/long, or any
//     ecliptic longitude.
//   - Serve a caller who is not entitled, or a target they may not see.
//   - Continue when the rate limiter fails.
//   - Distinguish "no such profile" from "not allowed" in its response.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import * as Astronomy from 'https://esm.sh/astronomy-engine@2.1.19'
// Phase 1 timezone correctness — see supabase/functions/calculate-chart for
// the rationale. We never use the Deno worker's local clock as ground truth.
import { DateTime, IANAZone } from 'https://esm.sh/luxon@3.7.2'
import tzlookup from 'https://esm.sh/tz-lookup@6.1.25'
import { createOriginPolicy } from '../_shared/cors.ts'
// THE SAME scoring model the apps use, bundled for Deno by
// `scripts/build-edge-astrology.mjs` and verified against its sources in CI.
// Not a copy: `npm run validate:edge-astrology` regenerates it and fails on
// any difference, so the server and the clients cannot score two charts
// differently. See the file's banner.
import { buildSynastryView } from '../_shared/astrology-engine.generated.ts'

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

function calculateMidheaven(time: any, longitude: number): number {
  // Identical to `computeMidheaven` in packages/shared/src/astrology/chart.ts
  // and to `calculateMidheaven` in calculate-chart. The engine contract
  // executes all three and fails if they diverge.
  const gmstHours = Astronomy.SiderealTime(time)
  const gmstDeg = gmstHours * 15
  const lst = ((gmstDeg + longitude) % 360 + 360) % 360
  const lstRad = (lst * Math.PI) / 180
  const T = (time.ut - 0) / 36525
  const eps = ((23.439291 - 0.0130042 * T) * Math.PI) / 180
  const mc = (Math.atan2(Math.sin(lstRad), Math.cos(lstRad) * Math.cos(eps)) * 180) / Math.PI
  return ((mc % 360) + 360) % 360
}

/**
 * Kept although this function no longer publishes houses (JUNO-01 removed
 * them from the payload — twelve rotations of the ascendant, read by nobody).
 *
 * It stays because `engine-contract.test.ts` executes `calculateEqualHouses`
 * from BOTH edge functions and from the shared engine and fails if the three
 * diverge. Deleting the declaration here would not remove a risk, it would
 * remove the alarm that watches `calculate-chart`, which does still use it.
 */
function calculateEqualHouses(ascendantLongitude: number): number[] {
  const houses: number[] = []
  for (let i = 0; i < 12; i++) {
    houses.push(((ascendantLongitude + i * 30) % 360 + 360) % 360)
  }
  return houses
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
// Public payload minimisation (JUNO-01)
// ---------------------------------------------------------------------------

/**
 * Quantum applied to every published `degree`, in degrees of arc.
 *
 * 0.1° = 6 arc-minutes. Chosen by measurement, not by feel, against both sides
 * of the trade-off (the study is reproduced in
 * `packages/shared/src/astrology/__tests__/chart-payload-privacy.test.ts`):
 *
 *   ATTACK SIDE — how much the inversion still yields, per quantum:
 *
 *     quantum   birth instant   birth longitude   birth latitude
 *     0.01°     ± 0.5 min       ± 0.00°           ± 0.01°     ← the old `degree`
 *     0.1°      ± 5.2 min       ± 0.04°           ± 0.18°     ← chosen
 *     0.25°     ± 13.0 min      ± 0.12°           ± 0.44°
 *     1°        ± 20.4 min      ± 0.53°           ± 2.10°
 *
 *   PRODUCT SIDE — synastry score drift over 400 random chart pairs
 *   (1 200 frame scores), against the same charts at full precision:
 *
 *     quantum   mean Δscore   max Δscore   band changes
 *     0.01°     0.005         2            0 / 1200
 *     0.1°      0.039         2            4 / 1200   ← chosen
 *     0.25°     0.089         3            12 / 1200
 *     1°        0.303         4            36 / 1200
 *
 * 0.1° is where the curve turns: it is ten times coarser than what the field
 * used to carry, costs 0.039 points of a 0-100 score on average, and the four
 * band changes are pairs already sitting on a band boundary. Coarser buys
 * minutes on the instant and costs three times the band churn.
 *
 * The honest reading of the left-hand column is that NO quantum closes the
 * birth-time leak — see the header. `can_view_profile_chart` is what does.
 *
 * Every UI that renders a placement already calls `Math.round(degree)`
 * (`NatalChartOverview.tsx:269`, `natal-chart.tsx:783`), so this quantum is
 * invisible on screen. It exists for the aspect maths in
 * `packages/shared/src/astrology/synastry.ts`, which is the only consumer that
 * needs sub-degree precision at all.
 */
const CHART_DEGREE_QUANTUM = 0.1

/** Decimal places implied by the quantum, for a clean float. */
const CHART_DEGREE_DECIMALS = 1

/**
 * Whether `chart` still carries a `degree` alongside each `sign`.
 *
 * TRUE is a migration affordance with an expiry condition, not a preference.
 * Installed mobile builds compute their own synastry from this payload by
 * rebuilding longitudes from sign + degree (`parseStoredPlacement`). Publishing
 * signs alone today would hydrate to null in those builds and drop paying
 * readers to the sign-rhythm fallback for as long as they stay on that version.
 *
 * FLIP TO FALSE WHEN, and the condition is checkable rather than a feeling:
 *   1. a mobile release carrying the `response.synastry` reader has been live
 *      long enough to cover the active install base, and
 *   2. `get-profile-chart` logs show no caller relying on the legacy path.
 *
 * At that point the response carries twelve sign names and a scored result,
 * and no placement precision whatsoever. `chart-payload-privacy.test.ts`
 * asserts the contract for BOTH values of this flag, so flipping it is a
 * one-line change that cannot silently break a client.
 */
const PUBLISH_LEGACY_DEGREES = true

/**
 * Quantise a degree-in-sign, without letting 29.97° roll into the next sign.
 *
 * The rounding is done on the degree-in-sign rather than on the longitude on
 * purpose: `sign` is published beside it, so quantising the pair independently
 * could disagree (longitude 29.96° of Aries rounds to 30.0°, which is Taurus,
 * while `sign` still says Aries — a placement that does not exist).
 */
function quantizeDegree(degreeInSign: number): number {
  const steps = Math.round(degreeInSign / CHART_DEGREE_QUANTUM)
  const quantized = steps * CHART_DEGREE_QUANTUM
  const capped = Math.min(Math.max(quantized, 0), 30 - CHART_DEGREE_QUANTUM)
  return Number(capped.toFixed(CHART_DEGREE_DECIMALS))
}

type PublicPlacement = { sign: string; degree?: number }

/**
 * One placement, as it goes on the wire: sign and a quantised degree.
 *
 * `longitude` is absent by construction rather than deleted afterwards — a
 * whitelist cannot leak a field somebody adds upstream. The shared hydrator
 * (`parseStoredPlacement`, packages/shared/src/astrology/stored.ts) rebuilds
 * the longitude from `sign` + `degree`, so synastry keeps working with no
 * client change at all.
 */
function toPublicPlacement(longitude: number): PublicPlacement {
  const placement: PublicPlacement = { sign: getZodiacSign(longitude) }
  if (PUBLISH_LEGACY_DEGREES) {
    placement.degree = quantizeDegree(getDegreeInSign(longitude))
  }
  return placement
}

export interface PublicChart {
  sun: PublicPlacement
  moon: PublicPlacement
  rising: PublicPlacement | null
  mc: PublicPlacement | null
  planets: Record<string, PublicPlacement>
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Orb precision published with a synastry aspect, in degrees.
 *
 * The aspect list is a disclosure channel in its own right, and it took a
 * second look to see it: the reader knows their OWN chart exactly, so
 * "your Sun trine their Moon, orb 2.34°" places their Moon to 0.01° — finer
 * than CHART_DEGREE_QUANTUM, which would have made moving the computation
 * server-side a step backwards.
 *
 * 0.1° is not a compromise here, it is the display precision:
 * `formatOrb` (packages/shared/src/astrology/synastry-view.ts) renders
 * `(Math.round(orb * 10) / 10).toFixed(1)` and both platforms show only the
 * top five aspects of the love frame. Rounding to what the screen shows costs
 * the product exactly nothing and stops the payload from carrying a second,
 * sharper copy of the geometry the chart no longer carries.
 *
 * The residual is honest and inherent: an entitled, authorised reader can
 * place up to five of the target's bodies to ±0.05°. A synastry product IS a
 * controlled disclosure of chart geometry; that is what the access controls
 * above are for.
 */
const SYNASTRY_ORB_QUANTUM = 0.1

/**
 * Angular measurements on a published aspect. BOTH must be quantised, and the
 * reason is algebraic rather than cautious:
 *
 *     separation = angle ± orb
 *
 * `angle` is a constant per aspect name (0, 60, 90, 120, 180). So rounding
 * `orb` while publishing `separation` raw hands the exact orb straight back,
 * and rounding `separation` while publishing `orb` raw does the same in the
 * other direction. Either alone is not a control.
 *
 * `separation` is the sharper of the two: it is |lonA − lonB| between the two
 * charts, and the reader knows their OWN longitude exactly — so an unrounded
 * separation places the target's body to float precision. It is the single
 * field that would have made moving the computation server-side a step
 * BACKWARDS from publishing quantised degrees.
 */
const QUANTISED_ASPECT_FIELDS = ['orb', 'separation'] as const

/**
 * Return a deep copy of the synastry view with every angular measurement
 * rounded to SYNASTRY_ORB_QUANTUM.
 *
 * Walks the whole structure rather than reaching into `frames[i].topAspects`:
 * `interpretiveAspects` carries aspects too, and a future field that carries
 * one more must not need this function edited to stay safe.
 *
 * Deliberately untouched:
 *   - `contribution` — a weight, not a distance. Rounding it moves the scores.
 *   - `angle`, `maxOrb` — constants from the aspect table and the orb policy.
 *     They are the same for everybody and describe no one's chart.
 */
export function withRoundedOrbs<T>(view: T): T {
  const quantise = (value: number): number => {
    const steps = Math.round(value / SYNASTRY_ORB_QUANTUM)
    return Number((steps * SYNASTRY_ORB_QUANTUM).toFixed(1))
  }
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        const isAngular = (QUANTISED_ASPECT_FIELDS as readonly string[]).includes(key)
        out[key] = isAngular && typeof value === 'number' && Number.isFinite(value)
          ? quantise(value)
          : walk(value)
      }
      return out
    }
    return node
  }
  return walk(view) as T
}

/**
 * Shape the response chart. Everything not named here does not travel.
 *
 * Deliberately absent, each for a reason that was checked rather than assumed:
 *   - `longitude` on every placement — the inversion vector (JUNO-01).
 *   - `coordinates` — searched on 2026-09-07: the only readers of
 *     `chart.coordinates` are `AccountSetupForm.tsx:551` and
 *     `AccountProfileWorkspace.tsx:633`, and both consume `calculate-chart`'s
 *     answer for the READER'S OWN chart. Nothing has ever read it from this
 *     payload, so a 0.5° blur was protecting a field nobody wanted.
 *   - `houses` — twelve raw longitudes, all derivable from the ascendant, and
 *     `NatalChartWheel` (the only house renderer on either platform) is mounted
 *     solely by the natal-chart screens, on the reader's own chart.
 */
function buildPublicChart(input: {
  sunLongitude: number
  moonLongitude: number
  ascLongitude: number | null
  mcLongitude: number | null
  planets: Record<string, { longitude: number }>
  confidence: 'high' | 'medium' | 'low'
}): PublicChart {
  const planets: Record<string, PublicPlacement> = {}
  for (const [key, value] of Object.entries(input.planets)) {
    planets[key] = toPublicPlacement(value.longitude)
  }
  return {
    sun: toPublicPlacement(input.sunLongitude),
    moon: toPublicPlacement(input.moonLongitude),
    rising: input.ascLongitude != null ? toPublicPlacement(input.ascLongitude) : null,
    mc: input.mcLongitude != null ? toPublicPlacement(input.mcLongitude) : null,
    planets,
    confidence: input.confidence,
  }
}

// ---------------------------------------------------------------------------
// Authorization (JUNO-02) + rate limit
// ---------------------------------------------------------------------------

/**
 * Chart views per caller per hour. Unchanged in value, changed in meaning: the
 * limiter is now fail-closed, so this is a ceiling rather than a suggestion.
 *
 * It is the real anti-harvesting control, because the premium check below is
 * READ-ONLY and therefore never consumes the `synastry` daily quota.
 */
const RATE_LIMIT_MAX_PER_HOUR = 100
const RATE_LIMIT_ACTION = 'profile_chart_view'

/**
 * The feature key this endpoint sells. Kept as the documentation anchor and
 * for validators/tests: the RPC call itself (`synastry_preview_gate`) takes no
 * argument — the key lives in the SQL, server-side, where a client cannot
 * substitute it. All three call sites are synastry screens
 * (`apps/mobile/app/premium-screens/synastry.tsx:169`,
 * `apps/web/src/components/SynastryOverview.tsx:240,318`).
 */
const CHART_FEATURE_KEY = 'synastry'

/**
 * One refusal shape for every "you may not have this".
 *
 * A UUID that does not exist, one that belongs to a deactivated account, one
 * that blocked the caller, and one the caller simply may not see must be
 * indistinguishable — otherwise the endpoint answers "does this person exist,
 * and did they block me?" for any UUID, which is a worse leak than the chart.
 * Status and body are identical in all four cases.
 */
const NOT_VISIBLE = { status: 404, error: 'profile_not_available' } as const

export type ChartAccessDecision =
  | { ok: true; reason: 'self' }
  | { ok: true; reason: 'entitled' }       // subscriber — no grant, no claim
  | { ok: true; reason: 'preview' }        // free reader — MUST claim after compute
  | { ok: false; status: number; error: string }

export interface ChartAccessDeps {
  /** Calls an RPC with the CALLER's JWT, so `auth.uid()` is the caller. */
  rpcAsCaller: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  /** Calls an RPC with service_role, for things `authenticated` may not run. */
  rpcAsService: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
}

/** First row of a `RETURNS TABLE` result, whatever shape the client gave back. */
export function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return (data[0] ?? null) as Record<string, unknown> | null
  if (data && typeof data === 'object') return data as Record<string, unknown>
  return null
}

/**
 * The four verdicts of `synastry_preview_gate()`, as the edge maps them.
 * Exported for the authz suite: the mapping is a contract, not an
 * implementation detail — 402 vs 503 is the rollback behaviour.
 */
export const PREVIEW_GATE_RESPONSES = {
  preview_enabled: { status: 200, error: '' },        // proceed to compute + claim
  paid: { status: 200, error: '' },                   // proceed, no claim
  preview_disabled: { status: 402, error: 'insufficient_tier' },  // quota NULL — the rollback
  policy_unavailable: { status: 503, error: 'policy_unavailable' }, // absent/ambiguous — fail closed
}

/**
 * May this caller read this target's chart, right now?
 *
 * Order matters and is defensive: the cheap identity check first, then the
 * rate limit (so a caller who is hammering the endpoint cannot use it to probe
 * entitlement), then entitlement, then visibility. Every branch that is not an
 * unambiguous yes returns a refusal; there is no fall-through.
 *
 * EVERY external call is fail-closed. An RPC that errors is a control that did
 * not run, and a control that did not run is a control that said no. The
 * previous version logged `check_rate_limit` failures and carried on, which
 * turned any transient database error into an unmetered endpoint.
 */
export async function authorizeChartAccess(
  deps: ChartAccessDeps,
  callerId: string,
  targetUserId: string,
): Promise<ChartAccessDecision> {
  // 0. Reading your own chart is never gated: it is your data, the premium
  //    surfaces need it as the left-hand side of every comparison, and the
  //    natal-chart screens have their own `natal_chart` gate.
  if (callerId === targetUserId) return { ok: true, reason: 'self' }

  // 1. Rate limit — persistent, server-side, service_role (an `authenticated`
  //    caller cannot execute check_rate_limit, which is the point).
  const rl = await deps.rpcAsService('check_rate_limit', {
    p_user_id: callerId,
    p_action: RATE_LIMIT_ACTION,
    p_max_count: RATE_LIMIT_MAX_PER_HOUR,
    p_window: '1 hour',
  })
  if (rl.error) {
    // Fail CLOSED. No target data has been read at this point.
    console.error('[get-profile-chart] rate limit check failed:', rl.error.message)
    return { ok: false, status: 503, error: 'rate_limit_unavailable' }
  }
  if (rl.data === false) {
    return { ok: false, status: 429, error: 'rate_limited' }
  }

  // 2. Entitlement — EXPLICIT tier read (2026-09-15).
  //
  // This step used to call `can_use_premium_feature`, which was correct until
  // the free preview quota was raised: from that moment `allowed=true` no
  // longer distinguished a subscriber from a free reader with a quota, and the
  // edge cannot decide whether to claim a grant for a caller it cannot
  // classify. `synastry_preview_gate()` reads the tier the same way
  // `enforce_premium_feature` does — get_user_tier + tier_at_least, caller's
  // own JWT, never a client-supplied tier — and classifies the policy row
  // itself: absent or duplicated → policy_unavailable → 503, fail-closed.
  // It writes nothing and consumes nothing.
  const gate = await deps.rpcAsCaller('synastry_preview_gate', {})
  if (gate.error) {
    console.error('[get-profile-chart] preview gate failed:', gate.error.message)
    return { ok: false, status: 503, error: 'entitlement_unavailable' }
  }
  const gateRow = firstRow(gate.data)
  const gateCode = typeof gateRow?.code === 'string' ? gateRow.code : null
  if (gateCode === 'preview_disabled') {
    // Policy present, quota NULL/0: the preview is OFF. This is the rollback
    // state — 402, not 503 — and it requires NO redeploy of this function.
    return { ok: false, status: 402, error: 'insufficient_tier' }
  }
  if (gateCode !== 'paid' && gateCode !== 'preview_enabled') {
    // policy_unavailable, an unknown code, or no row at all: fail closed.
    console.error('[get-profile-chart] preview gate verdict:', gateCode)
    return { ok: false, status: 503, error: 'policy_unavailable' }
  }
  // 3. Visibility — blocks in both directions, active + onboarded, and either
  //    mutual discoverability or an existing conversation. One SQL function,
  //    shared with get_synastry_candidate_profiles, so the picker and the
  //    reader cannot disagree about who is visible. Runs for subscribers AND
  //    free readers alike — the grant claim re-checks it later as
  //    defence-in-depth, but the target row must never be read before it.
  const vis = await deps.rpcAsCaller('can_view_profile_chart', { p_target_id: targetUserId })
  if (vis.error) {
    console.error('[get-profile-chart] visibility check failed:', vis.error.message)
    return { ok: false, status: 503, error: 'visibility_unavailable' }
  }
  if (vis.data !== true) {
    return { ok: false, status: NOT_VISIBLE.status, error: NOT_VISIBLE.error }
  }

  if (gateCode === 'preview_enabled') {
    // Free reader with an active preview. NOT a yes yet: the claim happens
    // after the computation (see the handler) and may still refuse.
    return { ok: true, reason: 'preview' }
  }
  return { ok: true, reason: 'entitled' }
}

// ---------------------------------------------------------------------------
// CORS — fail-closed allowlist, shared with every other function (JUNO-11)
// ---------------------------------------------------------------------------

const originPolicy = createOriginPolicy(Deno.env.get('ENVIRONMENT'))

function jsonError(status: number, message: string, origin: string | null): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status, headers: originPolicy.headers(origin) },
  )
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: originPolicy.headers(origin) })
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed', origin)
  }

  // 1. Verify caller (defense-in-depth — verify_jwt default also enforces this).
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonError(401, 'Missing authorization', origin)
  const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!callerToken) return jsonError(401, 'Invalid authorization', origin)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonError(500, 'Server misconfigured', origin)
  }

  const jwtClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${callerToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user: caller }, error: authError } = await jwtClient.auth.getUser(callerToken)
  if (authError || !caller) return jsonError(401, 'Unauthorized', origin)

  // 2. Parse + validate input.
  let body: { targetUserId?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'Invalid JSON body', origin)
  }
  const targetUserId = body.targetUserId
  if (!targetUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return jsonError(400, 'Invalid targetUserId', origin)
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 3. Rate limit, entitlement and visibility — all server-side, all
  //    fail-closed, and all BEFORE the target row is read. Nothing about the
  //    target reaches this worker's memory until the caller has earned it.
  const decision = await authorizeChartAccess(
    {
      rpcAsCaller: (fn, args) => jwtClient.rpc(fn, args) as unknown as Promise<{ data: unknown; error: { message: string } | null }>,
      rpcAsService: (fn, args) => adminClient.rpc(fn, args) as unknown as Promise<{ data: unknown; error: { message: string } | null }>,
    },
    caller.id,
    targetUserId,
  )
  if (!decision.ok) {
    return jsonError(decision.status, decision.error, origin)
  }

  // 4. Read target via service_role (bypasses RLS + Phase 3-C column REVOKEs).
  const { data: target, error: targetErr } = await adminClient
    .from('profiles')
    // `birth_chart` is read below for its stored IANA timezone, and was missing
    // from this list. `target.birth_chart` was therefore always `undefined`,
    // `storedTz` always null, and the zone always re-derived from coordinates —
    // which flips `tz.source` from 'input' to 'lookup', drops confidence from
    // 'high' to 'medium', and makes `applyConfidenceCap` truncate every
    // synastry score to 92. The best matches in the product were invisible.
    //
    // Adding it here cannot leak anything: `sanitizeProfile` is an allowlist
    // and never copies birth_chart into the response.
    .select(
      'id, name, age, birth_date, birth_time, birth_city, birth_latitude, birth_longitude, ' +
      'birth_chart, sun_sign, moon_sign, rising_sign, bio, image_url, images, photos, gender, ' +
      'has_voice_intro, voice_intro_url, is_verified, last_active, is_active, onboarding_completed',
    )
    .eq('id', targetUserId)
    .maybeSingle()

  if (targetErr) {
    console.error('Target profile read failed:', targetErr.message)
    return jsonError(500, 'Failed to load profile', origin)
  }
  // Same answer as "not allowed", on purpose: a distinct 'Profile not found'
  // turned this endpoint into an existence oracle for any UUID. The visibility
  // RPC above already rejected everything a caller may not see, so reaching
  // either branch here means the row vanished between the two calls.
  if (!target) return jsonError(NOT_VISIBLE.status, NOT_VISIBLE.error, origin)
  if (!target.is_active || !target.onboarding_completed) {
    return jsonError(NOT_VISIBLE.status, NOT_VISIBLE.error, origin)
  }
  if (!target.birth_date) {
    // No birth date on file — DECIDED EXPLICITLY (revue 2026-09-15), not
    // left implicit: this early return happens BEFORE the preview claim and
    // therefore serves the profile WITHOUT consuming the free daily
    // comparison. Why that is the right reading:
    //   - nothing astrological exists to gate — `chart: null`, no synastry —
    //     so consuming the day's grant here would charge for nothing;
    //   - every field in sanitizeProfile (name, signs, bio, photos…) is
    //     already served to this same caller by get_synastry_candidate_profiles;
    //   - the reader who wanted the comparison still HAS it: the claim never
    //     ran, today's target remains unset.
    // For a paid caller this path predates the preview and is unchanged.
    // Asserted structurally by profile-chart-authz.test.ts ("a target with no
    // birth date costs no grant").
    return new Response(
      JSON.stringify({
        success: true,
        profile: sanitizeProfile(target),
        chart: null,
      }),
      { headers: originPolicy.headers(origin) },
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
  // Midheaven, added 2026-09-01. The comment that used to sit here claimed
  // these outputs "say nothing about the exact minute or the exact
  // coordinates". They said everything: the MC is a function of the birth
  // instant and the birth longitude alone, so publishing it at float64
  // precision published the birthplace. It is now quantised and stripped of
  // its longitude by `buildPublicChart` — see CHART_DEGREE_QUANTUM.
  const mcLong = ascLong != null ? calculateMidheaven(time, lng as number) : null
  const housesArr = ascLong != null ? calculateEqualHouses(ascLong) : null
  const planets = calculatePlanetPositions(time)
  const confidence: 'high' | 'medium' | 'low' =
    !hasBirthTime || !hasBirthPlace || tz.source === 'fallback'
      ? 'low'
      : tz.source === 'lookup'
      ? 'medium'
      : 'high'

  // 6a. Synastry, computed HERE, at full internal precision.
  //
  // This is the half of JUNO-01 that minimisation alone could not reach. The
  // clients used to run `buildSynastryView` themselves, which meant the
  // response had to carry longitudes for twelve bodies — and those longitudes
  // inverted straight back to the target's birth instant and coordinates.
  //
  // Note what is used below and what is published: the FULL-precision chart
  // (`internalChart`, longitudes untouched, houses included) goes into the
  // computation, and only the scored result comes out. The engine's accuracy
  // is unchanged; what changed is where the arithmetic happens.
  const internalChart = {
    sun: { longitude: sunLong, sign: getZodiacSign(sunLong), degree: getDegreeInSign(sunLong) },
    moon: { longitude: moonLong, sign: getZodiacSign(moonLong), degree: getDegreeInSign(moonLong) },
    rising: ascLong != null
      ? { longitude: ascLong, sign: getZodiacSign(ascLong), degree: getDegreeInSign(ascLong) }
      : null,
    mc: mcLong != null
      ? { longitude: mcLong, sign: getZodiacSign(mcLong), degree: getDegreeInSign(mcLong) }
      : null,
    houses: housesArr,
    planets,
    coordinates: { latitude: lat, longitude: lng },
    timezone: tz.iana,
    confidence,
  }

  // The caller's own chart, read with service_role for the same reason the
  // target's is: `birth_chart` is column-revoked from `authenticated`. It is
  // the caller's OWN row — the same JSONB `get_my_full_profile()` hands them —
  // so nothing crosses a boundary here that was not already theirs.
  let synastry: unknown = null
  try {
    const { data: viewer, error: viewerErr } = await adminClient
      .from('profiles')
      .select('birth_chart')
      .eq('id', caller.id)
      .maybeSingle()
    if (viewerErr) {
      // Non-fatal: the reading still renders, the compatibility panel falls
      // back to its documented sign-rhythm state. Never fail the whole
      // request over the optional half.
      console.error('[get-profile-chart] viewer chart read failed:', viewerErr.message)
    } else {
      synastry = withRoundedOrbs(buildSynastryView(viewer?.birth_chart ?? null, internalChart))
    }
  } catch (e) {
    console.error('[get-profile-chart] synastry computation failed:', (e as Error)?.message)
  }

  // 6b. Shape the public payload.
  //
  // The equal-house cusps are not published: twelve rotations of the
  // ascendant, carrying nothing it does not, read by no surface on either
  // platform. The coordinates are gone for the same reason — the 0.5° blur was
  // guarding a field with no readers while the longitudes beside it gave the
  // exact position away.
  //
  // `chart` still carries sign + quantised degree, and that is a DELIBERATE,
  // TIME-BOXED backward-compatibility affordance, not a design choice. An
  // installed mobile build computes its own synastry from this payload; a
  // response with signs only would hydrate to null and drop those readers to
  // the sign-rhythm fallback until they update. Once `synastry` is the only
  // path in the field (see PUBLISH_LEGACY_DEGREES), the degrees go too and the
  // response carries no placement precision at all.
  const chart = buildPublicChart({
    sunLongitude: sunLong,
    moonLongitude: moonLong,
    ascLongitude: ascLong,
    mcLongitude: mcLong,
    planets,
    confidence,
  })

  // 7. Free-reader CLAIM — after the compute, before the first byte leaves.
  //
  // decision.reason === 'preview' means the gate classified the caller as a
  // free reader with an active preview. The computation above is thrown away
  // unless the atomic claim authorises THIS target. Race semantics, decided
  // by the PK (viewer, usage_date_utc):
  //
  //   - two targets computed concurrently: exactly one INSERT wins; the loser
  //     gets 402 + next_available_utc and NOTHING astrological;
  //   - same target replayed: allowed_free_existing, no write, no charge;
  //   - subscriber mid-request (allowed_paid): served, no grant field;
  //   - target became ineligible between visibility and claim: 404, byte-
  //     identical to every other NOT_VISIBLE — the grant is KEPT (a refusal
  //     must never disclose today's target, and a lost race must never
  //     resurrect a second free target);
  //   - quota flipped to NULL mid-request (rollback): 402, no grant.
  //
  // A claim RPC that ERRORS after a successful INSERT still keeps the grant:
  // the operator decision is "grant survives a lost response", and there is no
  // DELETE compensation anywhere to undo it. Fail-closed = no data emitted.
  if (decision.reason === 'preview') {
    const claim = await jwtClient.rpc('claim_synastry_free_grant', { p_target_user_id: targetUserId }) as unknown as {
      data: unknown
      error: { message: string } | null
    }
    if (claim.error) {
      // The grant, if the INSERT landed, stays. The response does not carry
      // the reading. Tomorrow works either way.
      console.error('[get-profile-chart] grant claim failed:', claim.error.message)
      return jsonError(503, 'grant_unavailable', origin)
    }
    const claimRow = firstRow(claim.data)
    const claimCode = typeof claimRow?.code === 'string' ? claimRow.code : null

    if (claimCode === 'allowed_free_new' || claimCode === 'allowed_free_existing') {
      // Best-effort telemetry — the five-event whitelist, no target id, one
      // row per reader/event/day (idempotent by ux_product_events_preview_daily).
      // Never let an analytics write affect the reading.
      try {
        await jwtClient.rpc('record_product_event', {
          p_event_name: claimCode === 'allowed_free_new' ? 'preview_succeeded' : 'preview_reopened',
          p_platform: 'web',
        })
      } catch { /* best effort by contract */ }

      return new Response(
        JSON.stringify({
          success: true,
          profile: sanitizeProfile(target),
          chart,
          synastry,
          grant: { code: claimCode, used: claimCode === 'allowed_free_new' },
        }),
        { headers: originPolicy.headers(origin) },
      )
    }

    if (claimCode === 'allowed_paid') {
      // Subscribed between the gate and the claim: serve as a subscriber.
      // No grant row exists (the claim function returns before any INSERT).
      return new Response(
        JSON.stringify({ success: true, profile: sanitizeProfile(target), chart, synastry }),
        { headers: originPolicy.headers(origin) },
      )
    }

    if (claimCode === 'free_preview_used_other_target') {
      // The other target was today's free comparison. 402 — "come back at"
      // — with the server-computed availability. NO profile, NO chart, NO
      // synastry: the computation above dies here. And never the identity
      // of today's target: the code says "another profile", nothing else.
      try {
        await jwtClient.rpc('record_product_event', {
          p_event_name: 'preview_used_other_target',
          p_platform: 'web',
        })
      } catch { /* best effort by contract */ }
      const nextAvailableUtc = typeof claimRow?.next_available_utc === 'string'
        ? claimRow.next_available_utc
        : null
      return new Response(
        JSON.stringify({
          success: false,
          error: 'free_preview_used_other_target',
          next_available_utc: nextAvailableUtc,
        }),
        { status: 402, headers: originPolicy.headers(origin) },
      )
    }

    if (claimCode === 'target_ineligible') {
      // Byte-identical to every other NOT_VISIBLE refusal.
      return jsonError(NOT_VISIBLE.status, NOT_VISIBLE.error, origin)
    }

    if (claimCode === 'preview_disabled') {
      // Quota flipped to NULL between gate and claim (the rollback). 402.
      return jsonError(402, 'insufficient_tier', origin)
    }

    // unauthorized / policy_unavailable / unknown: fail closed.
    console.error('[get-profile-chart] claim verdict:', claimCode)
    return jsonError(503, 'policy_unavailable', origin)
  }

  return new Response(
    JSON.stringify({ success: true, profile: sanitizeProfile(target), chart, synastry }),
    { headers: originPolicy.headers(origin) },
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
