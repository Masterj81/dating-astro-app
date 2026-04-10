import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const REVENUECAT_API_KEY = Deno.env.get('REVENUECAT_API_KEY') ?? '';
const BACKFILL_SECRET = Deno.env.get('BACKFILL_SECRET') ?? '';

type RcEntitlement = {
  expires_date?: string | null;
  product_identifier?: string;
};

type RcSubscription = {
  store?: string;
  expires_date?: string | null;
};

type RcSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>;
    subscriptions?: Record<string, RcSubscription>;
  };
};

type Source = 'app_store' | 'play_store';
type Tier = 'premium' | 'premium_plus';
type Status = 'active' | 'expired';

function detectSource(body: RcSubscriberResponse): Source | null {
  const subscriptions = body.subscriber?.subscriptions ?? {};

  for (const value of Object.values(subscriptions)) {
    const store = value.store?.toUpperCase();
    if (store === 'APP_STORE' || store === 'MAC_APP_STORE') {
      return 'app_store';
    }
    if (store === 'PLAY_STORE') {
      return 'play_store';
    }
  }

  return null;
}

function detectTier(body: RcSubscriberResponse): {
  tier: Tier | null;
  expiresAt: string | null;
  productIdentifier: string | null;
} {
  const entitlements = body.subscriber?.entitlements ?? {};

  if (entitlements.premium_plus) {
    return {
      tier: 'premium_plus',
      expiresAt: entitlements.premium_plus.expires_date ?? null,
      productIdentifier: entitlements.premium_plus.product_identifier ?? null,
    };
  }

  if (entitlements.premium) {
    return {
      tier: 'premium',
      expiresAt: entitlements.premium.expires_date ?? null,
      productIdentifier: entitlements.premium.product_identifier ?? null,
    };
  }

  return { tier: null, expiresAt: null, productIdentifier: null };
}

function computeStatus(expiresAt: string | null): Status {
  if (!expiresAt) {
    return 'active';
  }

  return new Date(expiresAt) > new Date() ? 'active' : 'expired';
}

async function fetchSubscriber(userId: string): Promise<RcSubscriberResponse | null> {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${userId}`, {
    headers: {
      Authorization: `Bearer ${REVENUECAT_API_KEY}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`RevenueCat API error ${response.status} for user ${userId}`);
  }

  return (await response.json()) as RcSubscriberResponse;
}

async function upsertSubscription(params: {
  userId: string;
  source: Source;
  tier: Tier;
  status: Status;
  expiresAt: string | null;
  providerSubscriptionId: string | null;
}) {
  const { error } = await supabase.from('subscriptions').upsert(
    {
      user_id: params.userId,
      source: params.source,
      tier: params.tier,
      status: params.status,
      provider_customer_id: params.userId,
      provider_subscription_id: params.providerSubscriptionId,
      expires_at: params.expiresAt,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: 'user_id,source',
    }
  );

  if (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('authorization') ?? '';

  if (!BACKFILL_SECRET) {
    return new Response(JSON.stringify({ error: 'Missing BACKFILL_SECRET config' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (authHeader !== `Bearer ${BACKFILL_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!REVENUECAT_API_KEY) {
      return new Response(JSON.stringify({ error: 'Missing REVENUECAT_API_KEY' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: users, error } = await supabase.from('profiles').select('id');

    if (error) {
      throw error;
    }

    let scanned = 0;
    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users ?? []) {
      scanned += 1;

      try {
        const body = await fetchSubscriber(user.id);

        if (!body) {
          skipped += 1;
          continue;
        }

        const source = detectSource(body);
        const { tier, expiresAt, productIdentifier } = detectTier(body);

        if (!source || !tier) {
          skipped += 1;
          continue;
        }

        const status = computeStatus(expiresAt);

        await upsertSubscription({
          userId: user.id,
          source,
          tier,
          status,
          expiresAt,
          providerSubscriptionId: productIdentifier,
        });

        synced += 1;
      } catch (err) {
        failed += 1;
        console.error('[Backfill RC] Failed for user', user.id, err);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned,
        synced,
        skipped,
        failed,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
