import Stripe from 'https://esm.sh/stripe@14.14.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createOriginPolicy } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// CORS + redirect allowlist — fail-closed, shared with every other function.
// See supabase/functions/_shared/cors.ts (JUNO-11): the default is the
// PRODUCTION list, and only ENVIRONMENT === 'development' widens it.
const originPolicy = createOriginPolicy(Deno.env.get('ENVIRONMENT'));

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const monthlyPriceIds = [
  Deno.env.get('STRIPE_PRICE_CELESTIAL_MONTHLY'),
  Deno.env.get('STRIPE_PRICE_COSMIC_MONTHLY'),
].filter((value): value is string => Boolean(value));

const yearlyPriceIds = [
  Deno.env.get('STRIPE_PRICE_CELESTIAL_YEARLY'),
  Deno.env.get('STRIPE_PRICE_COSMIC_YEARLY'),
].filter((value): value is string => Boolean(value));

const isMonthlyPriceId = (priceId: string) => monthlyPriceIds.includes(priceId);
const isYearlyPriceId = (priceId: string) => yearlyPriceIds.includes(priceId);
const getBillingCycleFromPriceId = (priceId: string): 'monthly' | 'yearly' | null => {
  if (isMonthlyPriceId(priceId)) return 'monthly';
  if (isYearlyPriceId(priceId)) return 'yearly';
  return null;
};

// ---------------------------------------------------------------------------
// Discounts are a server decision (JUNO-03)
// ---------------------------------------------------------------------------
//
// WHAT WAS WRONG
// --------------
// The request body carried `couponId` and this function applied it verbatim:
//
//     if (couponId) { sessionParams.discounts = [{ coupon: couponId }]; }
//
// The `priceId` beside it was validated against an allowlist. The coupon was
// not. The rule "the annual discount applies to annual plans" lived entirely
// in the client (`apps/web/src/lib/web-checkout.ts:34`,
// `apps/mobile/services/webPayments.ts:49`), and the coupon's id was published
// in the bundle as `NEXT_PUBLIC_STRIPE_ANNUAL_COUPON_ID`. So any signed-in
// account could POST a MONTHLY price with the ANNUAL coupon and be billed
// accordingly — and, more broadly, could apply ANY coupon that exists in the
// Stripe account to any plan, including internal or partner coupons created
// for a test. (docs/security-audit-2026-09-07.md, JUNO-03.)
//
// HOW IT IS FIXED
// ---------------
// The discount is now DERIVED from the validated `priceId`, from a server-only
// table. `couponId` is no longer part of the input contract: an old client that
// still sends one is served correctly and the field is ignored, never echoed,
// never used to branch. There is no request shape that can select a discount.

/**
 * The only automatic discounts, keyed by the billing cycle they belong to.
 *
 * Values come from the function's own environment, never from `NEXT_PUBLIC_*`
 * or `EXPO_PUBLIC_*`. A coupon id is not a secret, but it is a server input:
 * publishing it is what turned it into a parameter.
 */
const AUTOMATIC_COUPONS: Record<'monthly' | 'yearly', string | null> = {
  monthly: Deno.env.get('STRIPE_MONTHLY_COUPON_ID') || null,
  // Historically `EXPO_PUBLIC_STRIPE_ANNUAL_COUPON_ID`. Same value, read from a
  // server-only variable now.
  yearly:
    Deno.env.get('STRIPE_ANNUAL_COUPON_ID') ||
    Deno.env.get('STRIPE_YEARLY_COUPON_ID') ||
    null,
};

/**
 * The discount this plan earns. Pure: the same validated price always resolves
 * to the same coupon, and nothing the caller sends can influence it.
 */
export function resolveAutomaticCoupon(
  priceId: string,
  billingCycle: 'monthly' | 'yearly' | null,
  coupons: Record<'monthly' | 'yearly', string | null> = AUTOMATIC_COUPONS,
): string | null {
  if (!billingCycle) return null;
  // Belt and braces: the cycle is derived from the price allowlist above, so a
  // cycle without a matching price cannot occur — assert it rather than trust it.
  const cycleMatchesPrice =
    billingCycle === 'yearly' ? isYearlyPriceId(priceId) : isMonthlyPriceId(priceId);
  if (!cycleMatchesPrice) return null;
  return coupons[billingCycle] ?? null;
}

type PromoCampaign = {
  code: string;
  platform: 'stripe' | 'play_store';
  billing_cycle: 'monthly' | 'yearly';
  reward_type: 'stripe_deferred_coupon' | 'stripe_checkout_coupon' | 'play_store_defer_billing';
  stripe_coupon_id: string | null;
  play_defer_duration_seconds: number | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  metadata: Record<string, unknown> | null;
};

function isPromoCampaignCurrentlyActive(campaign: PromoCampaign | null): campaign is PromoCampaign {
  if (!campaign?.active) return false;

  const now = Date.now();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > now) {
    return false;
  }
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < now) {
    return false;
  }

  return true;
}

async function getPromoCampaign(
  supabaseAdmin: ReturnType<typeof createClient>,
  code: string,
  platform: 'stripe' | 'play_store',
  billingCycle: 'monthly' | 'yearly'
) {
  const { data, error } = await supabaseAdmin
    .from('promo_campaigns')
    .select(
      'code, platform, billing_cycle, reward_type, stripe_coupon_id, play_defer_duration_seconds, active, starts_at, ends_at, max_redemptions, metadata'
    )
    .eq('code', code)
    .eq('platform', platform)
    .eq('billing_cycle', billingCycle)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load promo campaign: ${error.message}`);
  }

  return isPromoCampaignCurrentlyActive(data as PromoCampaign | null)
    ? (data as PromoCampaign)
    : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = originPolicy.headers(origin);

  // A browser request from an origin we do not serve is refused — but WITH the
  // policy's headers. The previous `new Response('Forbidden origin')` carried
  // none, which is how a legitimate origin left off the list surfaces in a
  // console as an unreadable network error instead of a 403 anyone can debug.
  // An absent Origin (native app, server-to-server) is not a browser request
  // and is not subject to this check; the JWT below is what authorises it.
  if (origin && !originPolicy.isAllowedOrigin(origin)) {
    return jsonResponse({ error: 'forbidden_origin' }, 403, corsHeaders);
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Missing Supabase function configuration' }, 500, corsHeaders);
    }

    if (!Deno.env.get('STRIPE_SECRET_KEY')) {
      return jsonResponse({ error: 'Missing STRIPE_SECRET_KEY' }, 500, corsHeaders);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401, corsHeaders);
    }

    // `couponId` is deliberately NOT destructured. Old clients still send it
    // (apps ship for weeks); the field is read by nobody, echoed by nobody, and
    // cannot reach Stripe. See AUTOMATIC_COUPONS above — JUNO-03.
    const { priceId, userId, promoCode, successUrl, cancelUrl } = await req.json();

    if (!priceId || !userId || !successUrl || !cancelUrl) {
      return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
    }

    // Validate redirect URLs against the same fail-closed allowlist that
    // governs CORS. Origin equality covers scheme, host and port together, and
    // `isAllowedRedirect` additionally rejects credentials in the authority —
    // `https://app.junosynastry.com@evil.com` reads as our host to a person and
    // parses to `evil.com`.
    if (!originPolicy.isAllowedRedirect(successUrl) || !originPolicy.isAllowedRedirect(cancelUrl)) {
      return jsonResponse({ error: 'Invalid redirect URL' }, 400, corsHeaders);
    }

    // Validate priceId is one of the known Stripe prices to prevent abuse
    const allKnownPriceIds = [...monthlyPriceIds, ...yearlyPriceIds];
    if (!allKnownPriceIds.includes(priceId)) {
      return jsonResponse({ error: 'Invalid price ID' }, 400, corsHeaders);
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user || user.id !== userId) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    // Get user email from Supabase
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`Failed to load profile: ${profileError.message}`);
    }

    // Check if user already has a Stripe customer ID
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .eq('source', 'stripe')
      .maybeSingle();

    if (subscriptionError) {
      throw new Error(`Failed to load subscription: ${subscriptionError.message}`);
    }

    let customerId = subscription?.stripe_customer_id;
    const normalizedPromoCode = String(promoCode || '').trim().toUpperCase();
    const promoBillingCycle = getBillingCycleFromPriceId(priceId);
    const promoCampaign =
      normalizedPromoCode && promoBillingCycle
        ? await getPromoCampaign(supabaseAdmin, normalizedPromoCode, 'stripe', promoBillingCycle)
        : null;

    // Create a new Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email,
        metadata: {
          supabase_user_id: userId,
        },
      });
      customerId = customer.id;
    }

    if (promoCampaign) {
      // P0-3 — use the atomic RPC so that max_redemptions cannot be bypassed
      // by racing two concurrent checkouts. The RPC enforces the cap under a
      // row-level lock on the campaign row and also handles the
      // already-claimed / already-consumed cases.
      const { data: claimResult, error: claimError } = await supabaseAdmin.rpc(
        'claim_promo_campaign_redemption',
        {
          p_user_id: userId,
          p_campaign_code: promoCampaign.code,
          p_platform: 'stripe',
          p_billing_cycle: promoCampaign.billing_cycle,
          p_stripe_customer_id: customerId,
          p_stripe_price_id: priceId,
          p_metadata: { source: 'create-checkout-session' },
        }
      );

      if (claimError) {
        throw new Error(`Failed to claim promo campaign: ${claimError.message}`);
      }

      const claim = Array.isArray(claimResult) ? claimResult[0] : claimResult;
      if (!claim?.ok) {
        const reason = claim?.reason ?? 'unknown';
        const userMessage =
          reason === 'already_consumed'
            ? 'Promo code already used'
            : reason === 'already_claimed'
            ? 'Promo code already claimed'
            : reason === 'campaign_limit_reached'
            ? 'Promo code limit reached'
            : reason === 'campaign_not_found' || reason === 'campaign_inactive'
            ? 'Invalid promo code'
            : 'Unable to apply promo code';
        return jsonResponse({ error: userMessage }, 400, corsHeaders);
      }
    }

    // Create Stripe Checkout session
    const sessionParams: any = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          supabase_user_id: userId,
          ...(promoCampaign ? { campaign_code: promoCampaign.code } : {}),
        },
      },
      metadata: {
        supabase_user_id: userId,
        ...(promoCampaign ? { campaign_code: promoCampaign.code } : {}),
      },
      allow_promotion_codes: true, // Allow users to enter promo codes
    };

    if (promoCampaign) {
      delete sessionParams.allow_promotion_codes;
      if (
        promoCampaign.reward_type === 'stripe_checkout_coupon' &&
        promoCampaign.stripe_coupon_id
      ) {
        sessionParams.discounts = [{ coupon: promoCampaign.stripe_coupon_id }];
      }
    }

    // The automatic discount, DERIVED from the validated price. Nothing in the
    // request reaches this decision; a monthly price can never pick up the
    // annual coupon, whatever the caller sends. (JUNO-03.)
    const automaticCoupon = resolveAutomaticCoupon(priceId, promoBillingCycle);
    if (automaticCoupon && !promoCampaign) {
      sessionParams.discounts = [{ coupon: automaticCoupon }];
      delete sessionParams.allow_promotion_codes; // Can't use both
    }

    // Resolve a user-entered Stripe promotion code to its internal ID.
    if (normalizedPromoCode && !promoCampaign) {
      const promotionCodes = await stripe.promotionCodes.list({
        code: normalizedPromoCode,
        active: true,
        limit: 1,
      });

      const promotionCode = promotionCodes.data[0];
      if (!promotionCode) {
        return jsonResponse({ error: 'Invalid or inactive promo code' }, 400, corsHeaders);
      }

      sessionParams.discounts = [{ promotion_code: promotionCode.id }];
      delete sessionParams.allow_promotion_codes; // Can't use both
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return jsonResponse({ url: session.url }, 200, corsHeaders);
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
    return jsonResponse({ error: 'Something went wrong' }, 500, corsHeaders);
  }
});
