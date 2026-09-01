// Is this rising sign real, or was it invented?
//
// THE BUG THIS ANSWERS
// --------------------
// The ascendant is the one placement that cannot be computed without an exact
// birth minute. `computeNatalChart` knows that and returns `rising: null`
// (chart.ts), and so does the `calculate-chart` edge function. But the mobile
// facade used to paper over that null:
//
//     rising: placement(chart.rising, { sign: 'Aries', degree: 0, longitude: 0 })
//
// Onboarding openly encourages skipping the birth time ("Don't worry if you're
// not sure"), so every account that skipped it was written to the database as
// `rising_sign = 'Aries'` and told, on its very first personalised screen, a
// fact about itself that is false eleven times out of twelve.
// (docs/retention-day2-audit-2026-08.md §3.5.)
//
// The engine is fixed. This module exists for everything downstream, because
// fixing the engine does NOT fix the rows already written — and a screen that
// renders `profiles.rising_sign` cannot tell a real Aries from a fabricated
// one by looking at the string.
//
// THE RULE
// --------
// Show a rising sign only when something PROVES it was computed from a real
// birth time. Anything contradicted, or unprovable, is treated as absent.
// Showing a fabricated ascendant is JUNO stating a falsehood about someone,
// which is the thing this product cannot do.
//
// WHERE THE PROOF COMES FROM (this changed on 2026-08-30)
// -------------------------------------------------------
// Migration `20260830000001_enforce_rising_requires_birth_time` puts a
// BEFORE INSERT OR UPDATE trigger on `profiles` that nulls `rising_sign` (and
// `birth_chart->rising`) whenever `birth_time` is null. The invariant now
// holds in the database:
//
//     birth_time IS NULL  ⟹  rising_sign IS NULL
//
// whose contrapositive is what matters here:
//
//     rising_sign IS NOT NULL  ⟹  birth_time IS NOT NULL
//
// and, since 20260901000002, the stronger form — because the ascendant needs
// the birthplace as much as the clock, and four code paths used to substitute
// one rather than admit they had none:
//
//     rising_sign IS NOT NULL  ⟹  birth_time IS NOT NULL
//                              ∧  birth_latitude IS NOT NULL
//                              ∧  birth_longitude IS NOT NULL
//
// That second migration does not DELETE the suspect signs: it moves them to
// `rising_sign_unconfirmed`, out of the one column the blind surfaces read.
//
// So a stored sign is, on its own, evidence that a birth time existed when it
// was computed. Before the trigger it was not, and this module refused a bare
// sign outright — which was right at the time, but hid every REAL ascendant on
// the surfaces that can only see the column (`get_discoverable_profiles`
// returns neither `birth_time` nor `birth_chart`). That cost is no longer
// necessary, and paying it anyway would be its own small dishonesty: telling
// 93 people we do not know their ascendant when we do.
//
// ⚠️ THIS RELAXATION DEPENDS ON THAT TRIGGER. If it is ever dropped or
// disabled, a bare sign stops proving anything and rule 5 below must go back
// to returning false. `supabase/tests/rising_requires_birth_time.test.sql`
// exists so that dropping it fails loudly.
//
// Richer signals still win when a caller has them: `birthTime` and the stored
// chart can each CONTRADICT the column, and a contradiction always hides the
// placement.

/** Warning codes that mean the ascendant could not be computed honestly. */
const DISQUALIFYING_WARNINGS = new Set([
  'missing_birth_time',
  'houses_unavailable_without_birth_time',
]);

export interface RisingTrustInput {
  /**
   * `profiles.birth_time` as stored. Pass it whenever the caller can read it.
   *
   *   - a non-empty string → the ascendant was computable
   *   - null / ''          → it was not, whatever `rising_sign` says
   *   - undefined          → this caller cannot see the column; fall through
   *                          to the chart-based signals below
   *
   * Note the difference between `null` and `undefined` is load-bearing here.
   */
  birthTime?: string | null;
  /** `profiles.birth_chart` in any historical shape, or a computed chart. */
  birthChart?: unknown;
  /** `profiles.rising_sign` as stored. */
  storedRisingSign?: string | null;
  /**
   * `profiles.birth_latitude` / `birth_longitude`.
   *
   * Same three-valued convention as `birthTime`: a number is proof, `null` is
   * proof of absence, `undefined` means this caller cannot see the column.
   * The ascendant needs the PLACE as much as the clock — birth longitude
   * enters local sidereal time degree for degree — so a caller that CAN see
   * these must not be told to trust a sign computed without them.
   */
  birthLatitude?: number | null;
  birthLongitude?: number | null;
  /**
   * `profiles.rising_sign_unconfirmed` — an ascendant set aside by migration
   * 20260901000002 because it was computed without a reliable birthplace.
   *
   * Present so a surface can say "we can recompute this once you confirm your
   * birth city" instead of pretending the placement never existed. It must
   * NEVER be rendered as a placement.
   */
  unconfirmedRisingSign?: string | null;
}

/**
 * True when a coordinate pair is usable as an actual birthplace.
 *
 * A NULL test, never a truthiness test. `calculate-chart` used `!lat || !lng`,
 * which treats a genuine 0 — the prime meridian, the equator — as missing, and
 * so replaced correct data with a substituted location.
 *
 * Exported because `houses.ts` must ask exactly the same question: two
 * definitions of "we know where they were born" is one too many.
 */
export function hasUsableBirthPlace(input: {
  birthLatitude?: number | null;
  birthLongitude?: number | null;
}): boolean {
  return (
    typeof input.birthLatitude === 'number' &&
    Number.isFinite(input.birthLatitude) &&
    typeof input.birthLongitude === 'number' &&
    Number.isFinite(input.birthLongitude)
  );
}

/** True when the caller can see the coordinate columns at all. */
function canSeeBirthPlace(input: RisingTrustInput): boolean {
  return input.birthLatitude !== undefined || input.birthLongitude !== undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * True only when the rising sign can be shown in good faith.
 *
 * Evaluated in order of how directly each signal proves the point. Anything
 * unproven returns false.
 */
export function isRisingTrustworthy(input: RisingTrustInput): boolean {
  const { birthTime, birthChart, storedRisingSign } = input;

  // 1. Nothing to show. Cheapest exit, and it covers every account written by
  //    the fixed engine: no birth time in, no rising sign out.
  const hasStoredSign =
    typeof storedRisingSign === 'string' && storedRisingSign.trim().length > 0;

  const chart = asRecord(birthChart);
  const chartRising = chart ? asRecord(chart.rising) : null;
  const hasChartRising = typeof chartRising?.sign === 'string' && chartRising.sign !== '';

  if (!hasStoredSign && !hasChartRising) return false;

  // 2. The caller can see birth_time and it is empty. Decisive: the ascendant
  //    depends on the minute of birth, so any sign stored against a null
  //    birth_time was invented. This is what protects rows already poisoned by
  //    the old fallback, with no migration required.
  if (birthTime === null || (typeof birthTime === 'string' && birthTime.trim() === '')) {
    return false;
  }

  // 2b. The caller can see the coordinates and there are none. Decisive for
  //     the same reason as 2: the ascendant depends on the birthplace as
  //     strongly as on the clock, and four code paths used to substitute one
  //     (Greenwich in the edge functions, Montréal in the mobile facade and
  //     the geocoder). A sign stored against null coordinates was cast for a
  //     city the reader has never been to.
  //
  //     Migration 20260901000002 moves those signs out of `rising_sign` into
  //     `rising_sign_unconfirmed`, so in practice this branch is a second lock
  //     on a door the database already closed — which is exactly what it is
  //     for: `birthTime === null` in rule 2 was written the same way, and it
  //     is what protected readers while the poisoned rows were still live.
  if (canSeeBirthPlace(input) && !hasUsableBirthPlace(input)) return false;

  // 3. The caller can see birth_time and it is present. The strongest positive
  //    proof available, and the common case for a reader's own profile.
  if (typeof birthTime === 'string' && birthTime.trim().length > 0) return true;

  // 4. The stored chart can CONTRADICT the column. These checks run even when
  //    the column looks fine, because a chart that admits it could not compute
  //    an ascendant outranks a sign sitting next to it.
  if (chart) {
    if (Array.isArray(chart.warnings)) {
      for (const warning of chart.warnings) {
        if (typeof warning === 'string' && DISQUALIFYING_WARNINGS.has(warning)) return false;
      }
    }
    // 'low' means either no birth time or a fallback timezone. Both make the
    // ascendant unreliable, so both hide it.
    if (chart.confidence === 'low') return false;
    // An explicitly null rising on a readable chart is the engine saying it
    // could not compute one.
    if ('rising' in chart && chart.rising === null) return false;
  }

  // 5. Nothing contradicted it, and there is a sign to show.
  //
  //    A bare stored sign is enough BECAUSE the database enforces
  //    `birth_time IS NULL ⟹ rising_sign IS NULL` (migration
  //    20260830000001). Read the header before loosening or tightening this:
  //    it is the one line that depends on a trigger existing.
  //
  //    A chart-only placement is accepted on the same footing — it comes from
  //    the same protected row, or from a chart just computed by
  //    `get-profile-chart`, which returns `rising: null` without a birth time.
  return hasStoredSign || hasChartRising;
}

/**
 * The rising sign to display, or null when it must not be shown.
 * Prefers the stored column, falling back to the chart's own placement.
 */
export function resolveTrustedRisingSign(input: RisingTrustInput): string | null {
  if (!isRisingTrustworthy(input)) return null;

  const stored = input.storedRisingSign;
  if (typeof stored === 'string' && stored.trim().length > 0) return stored.trim();

  const chart = asRecord(input.birthChart);
  const rising = chart ? asRecord(chart.rising) : null;
  const sign = rising?.sign;
  return typeof sign === 'string' && sign.trim().length > 0 ? sign.trim() : null;
}

/**
 * True when this reader has an ascendant we set aside for lack of a
 * birthplace, and confirming their birth city would let us recompute it.
 *
 * This is the state behind "Confirm your birth city to calculate your rising
 * sign accurately". It is deliberately NOT the same question as
 * `isRisingTrustworthy`:
 *
 *   isRisingTrustworthy          may I show a sign?          (no, in this state)
 *   risingNeedsLocationConfirmation  should I ask for the city?  (yes)
 *
 * A reader who never gave a birth time is NOT in this state — the city would
 * not help them, and asking for it would send them to fix the wrong field.
 * `docs/twelve-houses-audit-2026-08.md` §7.1 calls this the middle state, the
 * one implementations forget.
 */
export function risingNeedsLocationConfirmation(input: RisingTrustInput): boolean {
  const { birthTime } = input;

  // Without a clock the birthplace changes nothing.
  if (typeof birthTime !== 'string' || birthTime.trim().length === 0) return false;

  // A caller that cannot see the coordinates cannot answer this. Returning
  // false is the safe direction: it shows no CTA rather than showing one to
  // someone whose chart is perfectly fine.
  if (!canSeeBirthPlace(input)) return false;
  if (hasUsableBirthPlace(input)) return false;

  // There must be something to recompute. A reader who never had an ascendant
  // at all is offered the city in onboarding, not here.
  const setAside =
    typeof input.unconfirmedRisingSign === 'string' &&
    input.unconfirmedRisingSign.trim().length > 0;
  const chart = asRecord(input.birthChart);
  const chartSetAside = chart
    ? asRecord(chart.rising_unconfirmed) !== null
    : false;

  return setAside || chartSetAside;
}
