import Stripe from 'https://esm.sh/stripe@14.14.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createOriginPolicy } from '../_shared/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Allowed origins for CORS
// CORS — fail-closed allowlist shared by every edge function.
// See supabase/functions/_shared/cors.ts (JUNO-11): PRODUCTION is the default,
// and only ENVIRONMENT === 'development' widens it. An absent, renamed or
// misspelled variable can now only be more restrictive, never less.
const originPolicy = createOriginPolicy(Deno.env.get('ENVIRONMENT'));
const ALLOWED_ORIGINS = originPolicy.allowed;

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    // Refused, but WITH the policy's headers: a bare response carries no
    // Access-Control-*, so a legitimate origin left off the list surfaces in
    // the browser as an unreadable network error instead of a 403. (JUNO-11.)
    return jsonResponse({ error: 'forbidden_origin' }, 403, getCorsHeaders(origin));
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

    const { userId, returnUrl } = await req.json();

    if (!userId || !returnUrl) {
      return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
    }

    // Validate returnUrl against the same fail-closed allowlist that governs
    // CORS. `isAllowedRedirect` compares serialized ORIGINS — so the http
    // variant of an https host, a deceptive subdomain and a lookalike suffix
    // all fail — and additionally rejects credentials in the authority, which
    // is how `https://app.junosynastry.com@evil.com` reads as our host to a
    // person while parsing to somebody else's. (JUNO-11.)
    if (!originPolicy.isAllowedRedirect(returnUrl)) {
      return jsonResponse({ error: 'Invalid return URL' }, 400, corsHeaders);
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

    // Get Stripe customer ID from Supabase
    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .eq('source', 'stripe')
      .maybeSingle();

    if (subscriptionError) {
      throw new Error(`Failed to load subscription: ${subscriptionError.message}`);
    }

    if (!subscription?.stripe_customer_id) {
      return jsonResponse({ error: 'No Stripe subscription found' }, 404, corsHeaders);
    }

    // Create Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: returnUrl,
    });

    return jsonResponse({ url: session.url }, 200, corsHeaders);
  } catch (error) {
    console.error('Error creating portal session:', error.message);
    return jsonResponse({ error: 'Something went wrong' }, 500, corsHeaders);
  }
});
