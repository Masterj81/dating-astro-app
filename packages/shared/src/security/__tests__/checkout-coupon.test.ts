// JUNO-03 — a discount is a server decision.
//
// Executes `resolveAutomaticCoupon` extracted from the real
// `create-checkout-session` source, plus source-level assertions that the
// request can no longer reach a discount at all. Stripe is never contacted;
// the price allowlist is injected through the same environment the function
// reads, and the coupon table is passed in.
//
// WHAT WAS WRONG
// --------------
//     const { priceId, userId, couponId, ... } = await req.json();
//     ...
//     if (couponId) { sessionParams.discounts = [{ coupon: couponId }]; }
//
// `priceId` was validated against an allowlist; `couponId` was not. The rule
// "the annual discount applies to annual plans" lived in the client, and the
// coupon's id shipped in the bundle as NEXT_PUBLIC_STRIPE_ANNUAL_COUPON_ID. So
// a signed-in account could pair a MONTHLY price with the ANNUAL coupon — or
// with any coupon that exists in the Stripe account.
// docs/security-audit-2026-09-07.md, JUNO-03.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/create-checkout-session/index.ts';

const MONTHLY_CELESTIAL = 'price_celestial_monthly_TEST';
const MONTHLY_COSMIC = 'price_cosmic_monthly_TEST';
const YEARLY_CELESTIAL = 'price_celestial_yearly_TEST';
const YEARLY_COSMIC = 'price_cosmic_yearly_TEST';
const ANNUAL_COUPON = 'coupon_annual_TEST';
const ATTACKER_COUPON = 'coupon_100_percent_off_TEST';

type EdgeModule = {
  isMonthlyPriceId: (priceId: string) => boolean;
  isYearlyPriceId: (priceId: string) => boolean;
  getBillingCycleFromPriceId: (priceId: string) => 'monthly' | 'yearly' | null;
  resolveAutomaticCoupon: (
    priceId: string,
    billingCycle: 'monthly' | 'yearly' | null,
    coupons?: Record<'monthly' | 'yearly', string | null>,
  ) => string | null;
};

let edge: EdgeModule;

/** The coupon table the server would build from its own environment. */
const SERVER_COUPONS = { monthly: null, yearly: ANNUAL_COUPON } as const;

/**
 * Executable code only, with comments blanked.
 *
 * Every file touched by this fix EXPLAINS the removed parameter by name, which
 * is the point — a future reader must be able to find out why `couponId` went
 * away. Asserting on the raw text would forbid the explanation along with the
 * defect, so the assertions below run on the code.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

beforeAll(async () => {
  edge = await loadEdgeModule<EdgeModule>({
    file: EDGE_FILE,
    label: 'create-checkout-session-coupon',
    // The price lists are built from `Deno.env.get(...)` at module scope. A
    // stub keeps the extraction faithful — the same code, reading the same
    // variables — without a Deno runtime.
    preamble: [
      'const Deno = { env: { get: (k) => ({',
      `  STRIPE_PRICE_CELESTIAL_MONTHLY: ${JSON.stringify(MONTHLY_CELESTIAL)},`,
      `  STRIPE_PRICE_COSMIC_MONTHLY: ${JSON.stringify(MONTHLY_COSMIC)},`,
      `  STRIPE_PRICE_CELESTIAL_YEARLY: ${JSON.stringify(YEARLY_CELESTIAL)},`,
      `  STRIPE_PRICE_COSMIC_YEARLY: ${JSON.stringify(YEARLY_COSMIC)},`,
      `  STRIPE_ANNUAL_COUPON_ID: ${JSON.stringify(ANNUAL_COUPON)},`,
      '}[k]) } };',
    ],
    declarations: [
      'monthlyPriceIds',
      'yearlyPriceIds',
      'isMonthlyPriceId',
      'isYearlyPriceId',
      'getBillingCycleFromPriceId',
      'AUTOMATIC_COUPONS',
      'resolveAutomaticCoupon',
    ],
  });
});

afterAll(() => cleanupEdgeModules());

describe('JUNO-03 · the discount follows the price', () => {
  it('applies the annual coupon to an annual plan', () => {
    for (const priceId of [YEARLY_CELESTIAL, YEARLY_COSMIC]) {
      const cycle = edge.getBillingCycleFromPriceId(priceId);
      expect(cycle).toBe('yearly');
      expect(edge.resolveAutomaticCoupon(priceId, cycle, SERVER_COUPONS)).toBe(ANNUAL_COUPON);
    }
  });

  it('applies NO coupon to a monthly plan', () => {
    for (const priceId of [MONTHLY_CELESTIAL, MONTHLY_COSMIC]) {
      const cycle = edge.getBillingCycleFromPriceId(priceId);
      expect(cycle).toBe('monthly');
      expect(edge.resolveAutomaticCoupon(priceId, cycle, SERVER_COUPONS)).toBeNull();
    }
  });

  it('refuses a cycle that does not match the price, whatever it is told', () => {
    // The exploit, in one line: monthly price, yearly cycle. Even if a caller
    // reached this function with a mismatched pair, the price is re-checked.
    expect(edge.resolveAutomaticCoupon(MONTHLY_CELESTIAL, 'yearly', SERVER_COUPONS)).toBeNull();
    expect(edge.resolveAutomaticCoupon(YEARLY_CELESTIAL, 'monthly', SERVER_COUPONS)).toBeNull();
  });

  it('applies nothing for an unknown price id', () => {
    for (const priceId of ['price_unknown', '', 'price_celestial_yearly_TEST_', ATTACKER_COUPON]) {
      expect(edge.getBillingCycleFromPriceId(priceId)).toBeNull();
      expect(edge.resolveAutomaticCoupon(priceId, null, SERVER_COUPONS)).toBeNull();
      // And even if a caller could force the cycle:
      expect(edge.resolveAutomaticCoupon(priceId, 'yearly', SERVER_COUPONS)).toBeNull();
    }
  });

  it('applies nothing when the environment declares no coupon', () => {
    const none = { monthly: null, yearly: null } as const;
    expect(edge.resolveAutomaticCoupon(YEARLY_CELESTIAL, 'yearly', none)).toBeNull();
  });

  it('is a pure function of the validated price', () => {
    // Same input, same answer, every time — nothing ambient, nothing from a
    // request, no clock.
    const first = edge.resolveAutomaticCoupon(YEARLY_COSMIC, 'yearly', SERVER_COUPONS);
    for (let i = 0; i < 50; i++) {
      expect(edge.resolveAutomaticCoupon(YEARLY_COSMIC, 'yearly', SERVER_COUPONS)).toBe(first);
    }
  });
});

describe('JUNO-03 · the request can no longer reach a discount', () => {
  const source = readRepoFile(EDGE_FILE);

  it('does not destructure couponId from the body', () => {
    const destructure = source.match(/const \{[^}]*\} = await req\.json\(\);/);
    expect(destructure).not.toBeNull();
    expect(destructure?.[0]).not.toContain('couponId');
    // The fields it DOES read, so a future addition is a visible diff.
    expect(destructure?.[0]).toContain('priceId');
    expect(destructure?.[0]).toContain('userId');
    expect(destructure?.[0]).toContain('promoCode');
    expect(destructure?.[0]).toContain('successUrl');
    expect(destructure?.[0]).toContain('cancelUrl');
  });

  it('never assigns a coupon from a request-derived value', () => {
    // Every `discounts = [...]` assignment must draw on a server-side source.
    // On the code, not the file: the header quotes the removed line verbatim.
    const assignments = codeOf(source).match(/sessionParams\.discounts\s*=\s*\[[^\]]*\]/g) ?? [];
    expect(assignments.length).toBeGreaterThan(0);
    for (const assignment of assignments) {
      expect(assignment).not.toContain('couponId');
      const serverSourced =
        assignment.includes('automaticCoupon') ||          // derived from priceId
        assignment.includes('promoCampaign.stripe_coupon_id') || // DB row
        assignment.includes('promotionCode.id');            // resolved by Stripe
      expect(serverSourced, `unaudited discount source: ${assignment}`).toBe(true);
    }
  });

  it('reads the coupon table from server-only variables', () => {
    const code = codeOf(source);
    const table = code.slice(
      code.indexOf('const AUTOMATIC_COUPONS'),
      code.indexOf('function resolveAutomaticCoupon'),
    );
    expect(table).toContain("Deno.env.get('STRIPE_ANNUAL_COUPON_ID')");
    // A coupon id read from a published variable is a coupon id the client
    // chooses — that is how this became a parameter in the first place.
    expect(table).not.toContain('NEXT_PUBLIC');
    expect(table).not.toContain('EXPO_PUBLIC');
  });

  it('still validates the price against the allowlist', () => {
    expect(source).toContain('allKnownPriceIds.includes(priceId)');
    expect(source).toContain("error: 'Invalid price ID'");
  });

  it('keeps the promo-campaign claim atomic', () => {
    // Idempotence of the flow, unchanged by this work: the campaign redemption
    // is claimed under a row lock so two concurrent checkouts cannot both win.
    expect(source).toContain('claim_promo_campaign_redemption');
  });

  it('answers a bad promo code without confirming which coupons exist', () => {
    // A user-entered promotion code resolves through Stripe; an unknown one
    // gets a single generic message. It must not echo the input back.
    const idx = source.indexOf("error: 'Invalid or inactive promo code'");
    expect(idx).toBeGreaterThan(0);
    const stmt = source.slice(idx - 200, idx + 200);
    expect(stmt).not.toContain('normalizedPromoCode }');
    expect(stmt).not.toContain('${normalizedPromoCode}');
  });
});

describe('JUNO-03 · the clients no longer choose a discount', () => {
  it.each([
    ['apps/web/src/lib/web-checkout.ts', 'NEXT_PUBLIC_STRIPE_ANNUAL_COUPON_ID'],
    ['apps/mobile/services/webPayments.ts', 'EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID'],
  ])('%s sends no couponId and reads no published coupon id', (file, publicVar) => {
    const code = codeOf(readRepoFile(file));
    expect(code).not.toContain('couponId');
    expect(code).not.toContain('ANNUAL_COUPON_ID');
    expect(code).not.toContain(publicVar);
    // It still sends everything the server needs, so this is a removal, not a
    // break: the price, the account, and the two redirect targets.
    expect(code).toContain('priceId');
    expect(code).toContain('userId');
    expect(code).toContain('successUrl');
    expect(code).toContain('cancelUrl');
  });

  it('an old client that still sends couponId is served safely', () => {
    // The contract for the weeks an installed build keeps sending the field:
    // it is not destructured, so it is not read, not echoed, cannot branch, and
    // cannot reach Stripe.
    const handlerCode = codeOf(readRepoFile(EDGE_FILE));
    const handler = handlerCode.slice(handlerCode.indexOf('Deno.serve(async (req)'));
    expect(handler).not.toContain('couponId');
    expect(handler).not.toMatch(/const \{[^}]*couponId/);
    expect(handler).not.toMatch(/coupon:\s*couponId/);
    // And it is still a successful checkout, not a 400: the extra field is
    // ignored, never rejected, so an old build keeps working.
    expect(handler).not.toContain("error: 'Unexpected field'");
  });
});
