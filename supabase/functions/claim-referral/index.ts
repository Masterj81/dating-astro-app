import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const REWARD_DAYS = 30; // 1 month free for both

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

    if (!code || code.length < 6 || code.length > 12) {
      return jsonResponse({ error: 'Invalid referral code' }, 400, corsHeaders);
    }

    // Auth
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? '';

    if (!token) {
      return jsonResponse({ error: 'Missing auth token' }, 401, corsHeaders);
    }

    const userSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);

    if (authError || !user?.id) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401, corsHeaders);
    }

    const refereeId = user.id;
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if referee already used a referral code
    const { data: existingRedemption } = await serviceSupabase
      .from('referral_redemptions')
      .select('id')
      .eq('referee_id', refereeId)
      .maybeSingle();

    if (existingRedemption) {
      return jsonResponse({ error: 'You have already used a referral code' }, 400, corsHeaders);
    }

    // Find the referrer by code
    const { data: referrerProfile } = await serviceSupabase
      .from('profiles')
      .select('id, referral_code')
      .eq('referral_code', code)
      .maybeSingle();

    if (!referrerProfile) {
      return jsonResponse({ error: 'Invalid referral code' }, 400, corsHeaders);
    }

    // Can't refer yourself
    if (referrerProfile.id === refereeId) {
      return jsonResponse({ error: 'You cannot use your own referral code' }, 400, corsHeaders);
    }

    // Record the referral
    const { error: insertError } = await serviceSupabase
      .from('referral_redemptions')
      .insert({
        referrer_id: referrerProfile.id,
        referee_id: refereeId,
        referral_code: code,
        reward_type: 'free_month',
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return jsonResponse({ error: 'You have already used a referral code' }, 400, corsHeaders);
      }
      console.error('[claim-referral] insert error', insertError.message);
      return jsonResponse({ error: 'Unable to process referral' }, 500, corsHeaders);
    }

    // Update referee's profile
    await serviceSupabase
      .from('profiles')
      .update({ referred_by: referrerProfile.id })
      .eq('id', refereeId);

    // Grant reward to both: extend or create premium subscription
    const now = new Date();
    const rewardExpiry = new Date(now.getTime() + REWARD_DAYS * 24 * 60 * 60 * 1000);

    for (const userId of [refereeId, referrerProfile.id]) {
      const isReferrer = userId === referrerProfile.id;

      // Check existing subscription
      const { data: existingSub } = await serviceSupabase
        .from('subscriptions')
        .select('id, tier, status, expires_at')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .order('expires_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (existingSub?.expires_at) {
        // Extend existing subscription by REWARD_DAYS
        const currentExpiry = new Date(existingSub.expires_at);
        const newExpiry = new Date(currentExpiry.getTime() + REWARD_DAYS * 24 * 60 * 60 * 1000);

        await serviceSupabase
          .from('subscriptions')
          .update({
            expires_at: newExpiry.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('id', existingSub.id);
      } else if (!existingSub) {
        // Create a new free premium subscription
        await serviceSupabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            source: 'stripe',
            tier: 'premium',
            status: 'active',
            expires_at: rewardExpiry.toISOString(),
            cancel_at_period_end: true,
            updated_at: now.toISOString(),
          }, { onConflict: 'user_id,source' });
      }

      // Mark reward as given
      await serviceSupabase
        .from('referral_redemptions')
        .update({
          [isReferrer ? 'referrer_rewarded' : 'referee_rewarded']: true,
        })
        .eq('referee_id', refereeId);
    }

    console.log('[claim-referral] success', {
      referrer: referrerProfile.id,
      referee: refereeId,
      code,
    });

    return jsonResponse({
      success: true,
      reward: `${REWARD_DAYS} days of premium for both you and your friend`,
    }, 200, corsHeaders);
  } catch (error) {
    console.error('[claim-referral] error', error);
    return jsonResponse({ error: 'An unexpected error occurred' }, 500, corsHeaders);
  }
});
