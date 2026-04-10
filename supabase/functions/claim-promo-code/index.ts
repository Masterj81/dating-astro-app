import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const PROD_ORIGINS = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
];

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];

const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, ...DEV_ORIGINS];

const getCorsHeaders = (origin: string | null) => {
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

const PROMO_CODE_PATTERN = /^[A-Z0-9_-]{2,50}$/;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 10;

type PromoCampaign = {
  code: string;
  platform: 'stripe' | 'play_store';
  billing_cycle: 'monthly' | 'yearly';
  reward_type:
    | 'stripe_deferred_coupon'
    | 'stripe_checkout_coupon'
    | 'play_store_defer_billing'
    | 'play_store_subscription_option';
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  metadata?: Record<string, unknown> | null;
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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Forbidden origin', { status: 403 });
  }

  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders);
    }

    const body = await req.json();
    const code = String(body?.code ?? '').trim().toUpperCase();
    const platform = String(body?.platform ?? '').trim().toLowerCase();
    const billingCycle = String(body?.billingCycle ?? 'monthly').trim().toLowerCase();

    // --- Input validation ---
    if (!code || !PROMO_CODE_PATTERN.test(code)) {
      return jsonResponse({ error: 'Invalid promo code format' }, 400, corsHeaders);
    }

    if (platform !== 'play_store') {
      return jsonResponse({ error: 'Unsupported promo platform' }, 400, corsHeaders);
    }

    if (billingCycle !== 'monthly' && billingCycle !== 'yearly') {
      return jsonResponse({ error: 'Unsupported billing cycle' }, 400, corsHeaders);
    }

    // --- Auth ---
    const authHeader =
      req.headers.get('authorization') ?? req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? '';

    if (!token) {
      return jsonResponse({ error: 'Missing auth token' }, 401, corsHeaders);
    }

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey);

    const {
      data: { user },
      error: authError,
    } = await userSupabase.auth.getUser(token);

    const userId = user?.id ?? null;

    if (authError || !userId) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    }

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // --- Rate limiting ---
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

    const { count: recentClaims, error: rlError } = await serviceSupabase
      .from('promo_campaign_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('updated_at', windowStart);

    if (rlError) {
      console.error('[claim-promo-code] rate limit check error', rlError.message);
    }

    if ((recentClaims ?? 0) >= RATE_LIMIT_MAX) {
      console.warn('[claim-promo-code] rate limit exceeded', { userId });
      return jsonResponse({ error: 'Too many requests, try again later' }, 429, corsHeaders);
    }

    // --- Campaign lookup ---
    const { data: campaignData, error: campaignError } = await serviceSupabase
      .from('promo_campaigns')
      .select('code, platform, billing_cycle, reward_type, active, starts_at, ends_at, max_redemptions, metadata')
      .eq('code', code)
      .eq('platform', platform)
      .eq('billing_cycle', billingCycle)
      .maybeSingle();

    if (campaignError) {
      console.error('[claim-promo-code] campaign lookup error', campaignError.message);
      return jsonResponse({ error: 'Unable to verify promo code' }, 500, corsHeaders);
    }

    const campaign = isPromoCampaignCurrentlyActive(campaignData as PromoCampaign | null)
      ? (campaignData as PromoCampaign)
      : null;

    if (
      !campaign ||
      (campaign.reward_type !== 'play_store_defer_billing' &&
        campaign.reward_type !== 'play_store_subscription_option')
    ) {
      console.warn('[claim-promo-code] invalid code attempt', { userId, code, platform });
      return jsonResponse({ error: 'Invalid promo code' }, 400, corsHeaders);
    }

    // --- max_redemptions enforcement ---
    if (campaign.max_redemptions !== null) {
      const { count: totalRedemptions, error: countError } = await serviceSupabase
        .from('promo_campaign_redemptions')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_code', campaign.code)
        .eq('platform', platform);

      if (countError) {
        console.error('[claim-promo-code] redemption count error', countError.message);
        return jsonResponse({ error: 'Unable to verify promo code' }, 500, corsHeaders);
      }

      if ((totalRedemptions ?? 0) >= campaign.max_redemptions) {
        return jsonResponse({ error: 'Promo code limit reached' }, 400, corsHeaders);
      }
    }

    // --- Existing redemption check (block all non-terminal statuses) ---
    const { data: existingRedemption, error: lookupError } = await serviceSupabase
      .from('promo_campaign_redemptions')
      .select('status')
      .eq('user_id', userId)
      .eq('campaign_code', campaign.code)
      .eq('platform', platform)
      .maybeSingle();

    if (lookupError) {
      console.error('[claim-promo-code] redemption lookup error', lookupError.message);
      return jsonResponse({ error: 'Unable to verify promo code' }, 500, corsHeaders);
    }

    if (existingRedemption) {
      if (existingRedemption.status === 'consumed') {
        return jsonResponse({ error: 'Promo code already used' }, 400, corsHeaders);
      }
      // pending / checkout_completed — already claimed, waiting for processing
      return jsonResponse({ error: 'Promo code already claimed' }, 400, corsHeaders);
    }

    // --- INSERT (not upsert) to prevent race conditions ---
    const { error: insertError } = await serviceSupabase
      .from('promo_campaign_redemptions')
      .insert({
        user_id: userId,
        campaign_code: campaign.code,
        platform,
        status: 'pending',
        metadata: {
          source: 'claim-promo-code',
          claimed_at: new Date().toISOString(),
          billing_cycle: campaign.billing_cycle,
          reward_type: campaign.reward_type,
        },
        updated_at: new Date().toISOString(),
      });

    if (insertError) {
      // Unique constraint violation = concurrent duplicate request
      if (insertError.code === '23505') {
        return jsonResponse({ error: 'Promo code already claimed' }, 400, corsHeaders);
      }
      console.error('[claim-promo-code] insert error', insertError.message);
      return jsonResponse({ error: 'Unable to apply promo code' }, 500, corsHeaders);
    }

    console.log('[claim-promo-code] claimed', {
      userId,
      code: campaign.code,
      platform,
      billingCycle: campaign.billing_cycle,
    });

    return jsonResponse(
      {
        success: true,
        code: campaign.code,
        campaign: {
          billingCycle: campaign.billing_cycle,
          rewardType: campaign.reward_type,
          metadata: campaign.metadata ?? {},
        },
      },
      200,
      corsHeaders
    );
  } catch (error) {
    console.error('[claim-promo-code] unexpected error', error);
    return jsonResponse({ error: 'An unexpected error occurred' }, 500, corsHeaders);
  }
});
