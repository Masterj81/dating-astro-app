import Stripe from 'https://esm.sh/stripe@14.14.0?target=denonext';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
});

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];

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

    const { userId, returnUrl } = await req.json();

    if (!userId || !returnUrl) {
      return jsonResponse({ error: 'Missing required fields' }, 400, corsHeaders);
    }

    // Validate returnUrl to prevent open-redirect attacks
    try {
      const parsed = new URL(returnUrl);
      if (!ALLOWED_ORIGINS.includes(parsed.origin)) {
        return jsonResponse({ error: 'Invalid return URL' }, 400, corsHeaders);
      }
    } catch {
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
