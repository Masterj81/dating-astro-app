import Stripe from 'https://esm.sh/stripe@14.14.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Allowed origins for CORS
const PROD_ORIGINS = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
  'https://app.junosynastry.com',
];
const DEV_ORIGINS = [
  ...PROD_ORIGINS,
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];
const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
  ? PROD_ORIGINS
  : DEV_ORIGINS;

const getCorsHeaders = (origin: string | null) => {
  // SECURITY: Only return CORS headers for known origins. Never fall back to a default.
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

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
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden origin', { status: 403 });
  }
  const corsHeaders = getCorsHeaders(origin);

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

    const { priceId, userId, couponId, promoCode, successUrl, cancelUrl } = await req.json();

    if (!priceId || !userId || !successUrl || !cancelUrl) {
      return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
    }

    // Validate redirect URLs to prevent open-redirect attacks
    const allowedRedirectOrigins = ALLOWED_ORIGINS;
    const isValidUrl = (url: string) => {
      try {
        const parsed = new URL(url);
        return allowedRedirectOrigins.includes(parsed.origin);
      } catch {
        return false;
      }
    };
    if (!isValidUrl(successUrl) || !isValidUrl(cancelUrl)) {
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

    // Apply a specific coupon if provided (legacy annual discount flow).
    if (couponId) {
      sessionParams.discounts = [{ coupon: couponId }];
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
