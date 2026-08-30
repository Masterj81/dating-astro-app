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
// Show a rising sign only when something in the data PROVES it was computed
// from a real birth time. Absence of proof is treated as absence of a rising
// sign. That is the conservative direction on purpose: hiding a real
// ascendant costs a reader one line of their profile and is fixed by
// re-running onboarding; showing a fabricated one is JUNO stating a falsehood
// about someone, which is the thing this product cannot do.
//
// Callers pass whatever they can see. Different surfaces see different things:
//   - own profile / natal chart → `birthTime` (the strongest proof)
//   - synastry / stored charts  → `birthChart`
//   - the discovery deck        → neither; get_discoverable_profiles returns
//                                 only `rising_sign`, so nothing can be
//                                 proven and the placement stays hidden.

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

  // 3. The caller can see birth_time and it is present. The strongest positive
  //    proof available, and the common case for a reader's own profile.
  if (typeof birthTime === 'string' && birthTime.trim().length > 0) return true;

  // 4. No birth_time visible — fall back to what the stored chart admits about
  //    itself. The engine records these honestly even in the buggy build,
  //    because the substitution happened after the chart was computed.
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
    // A chart that states a good confidence AND carries a rising placement is
    // the only chart-only case we accept.
    if ((chart.confidence === 'high' || chart.confidence === 'medium') && hasChartRising) {
      return true;
    }
  }

  // 5. Cannot prove it. This is where the discovery deck lands — the RPC
  //    returns neither birth_time nor birth_chart — and where legacy charts
  //    that predate the `confidence` field land. Both stay hidden.
  return false;
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
