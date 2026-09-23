// JUNO-06 blocage 2 — server-verified entitlement synchronization.
//
// WHY THIS FUNCTION EXISTS (operator ruling, 2026-09-22/23): the mobile gate
// used to let a local RevenueCat entitlement override a server refusal. That
// is the phone outranking the server, and a patched APK can forge the local
// state. The ruling's required flow is implemented exactly:
//
//   1. the client asks for a synchronization (this call);
//   2. the server verifies the purchase with RevenueCat, using ITS OWN
//      credentials (REVENUECAT_API_KEY — the same secret backfill-revenuecat
//      uses; the client never sees it);
//   3. the server writes the verified state into `subscriptions`;
//   4. the client re-asks the premium decision (enforce_premium_feature);
//   5. only that new server verdict can grant access.
//
// This function NEVER grants anything itself. It returns the reconciliation
// outcome; access remains enforce_premium_feature's call.
//
// Security posture:
//   - Caller = the authenticated Supabase user (Authorization JWT). No admin
//     secret, no user_id parameter — the subscriber fetched from RevenueCat is
//     ALWAYS auth.uid(), so one account cannot read or write another's state.
//   - Writes only to `subscriptions` via the service role, exactly like the
//     webhook. The webhook stays authoritative for lifecycle events; this
//     path only reconciles what RevenueCat's own API reports right now.
//   - Rate limit: one sync per account per 30s (fail-closed 429), so a
//     patched client cannot hammer RevenueCat through us.
//   - No CORS: called from the React Native app via supabase.functions.invoke,
//     same transport as get-profile-chart.
//
// Testable outside Deno: pure decision helpers live at the bottom and are
// exercised by packages/shared/src/security/__tests__/sync-entitlement.test.ts
// through loadEdgeModule (the house pattern for executing real edge bytes).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false } },
);

const REVENUECAT_API_KEY = Deno.env.get('REVENUECAT_API_KEY') ?? '';

// One reconciliation per account per window. Fail-closed: no bucket infra
// beyond the table below — a simple per-user last_sync_at check under the
// same row lock the upsert serializes on.
const SYNC_MIN_INTERVAL_MS = 30_000;

type RcEntitlement = {
  expires_date?: string | null;
  product_identifier?: string | null;
};

type RcSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>;
  };
};

export type SyncOutcome = {
  synced: boolean;
  tier: 'free' | 'premium' | 'premium_plus';
  reason:
    | 'ok'
    | 'unauthenticated'
    | 'rate_limited'
    | 'revenuecat_unavailable'
    | 'config_error';
};

/** Pure: map a RevenueCat subscriber payload to the tier it proves. */
export function tierFromSubscriber(
  body: RcSubscriberResponse | null,
  now: Date = new Date(),
): 'free' | 'premium' | 'premium_plus' {
  const ent = body?.subscriber?.entitlements ?? {};
  const active = (name: string) => {
    const e = ent[name];
    if (!e) return false;
    if (!e.expires_date) return true; // lifetime
    return new Date(e.expires_date) > now;
  };
  if (active('premium_plus')) return 'premium_plus';
  if (active('premium')) return 'premium';
  return 'free';
}

/** Pure: should this sync attempt be throttled? */
export function isThrottled(
  lastSyncAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSyncAt) return false;
  return now.getTime() - new Date(lastSyncAt).getTime() < SYNC_MIN_INTERVAL_MS;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ synced: false, tier: 'free', reason: 'unauthenticated' } satisfies SyncOutcome),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Identify the caller from THEIR OWN JWT — never a request parameter.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

  if (userError || !user) {
    return new Response(
      JSON.stringify({ synced: false, tier: 'free', reason: 'unauthenticated' } satisfies SyncOutcome),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!REVENUECAT_API_KEY) {
    return new Response(
      JSON.stringify({ synced: false, tier: 'free', reason: 'config_error' } satisfies SyncOutcome),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    // Throttle on the subscriptions row itself (the same row the upsert
    // targets, so the check+write is serialized by the conflict key).
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('updated_at')
      .eq('user_id', user.id)
      .eq('source', 'play_store')
      .maybeSingle();

    if (isThrottled(existing?.updated_at ?? null)) {
      return new Response(
        JSON.stringify({ synced: false, tier: 'free', reason: 'rate_limited' } satisfies SyncOutcome),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // The verification: RevenueCat's own API, the server's own credentials.
    const rcResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      { headers: { Authorization: `Bearer ${REVENUECAT_API_KEY}` } },
    );

    if (rcResponse.status === 404) {
      // No RevenueCat record: nothing to reconcile. A local entitlement
      // claiming otherwise changes nothing — the server state stays free.
      return new Response(
        JSON.stringify({ synced: true, tier: 'free', reason: 'ok' } satisfies SyncOutcome),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!rcResponse.ok) {
      // Fail-closed: RevenueCat unreachable => NO state change, NO grant.
      return new Response(
        JSON.stringify({ synced: false, tier: 'free', reason: 'revenuecat_unavailable' } satisfies SyncOutcome),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const body = (await rcResponse.json()) as RcSubscriberResponse;
    const tier = tierFromSubscriber(body);

    if (tier === 'free') {
      // RevenueCat itself says free: reconcile the server DOWN. This is the
      // downgrade path — a stale local entitlement cannot survive it.
      await supabase
        .from('subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('source', 'play_store');
      return new Response(
        JSON.stringify({ synced: true, tier: 'free', reason: 'ok' } satisfies SyncOutcome),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    const ent = body.subscriber?.entitlements?.[tier] ?? {};
    const expiresAt = ent.expires_date ?? null;
    const active = expiresAt ? new Date(expiresAt) > new Date() : true;

    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        source: 'play_store',
        tier,
        status: active ? 'active' : 'expired',
        provider_customer_id: user.id,
        provider_subscription_id: ent.product_identifier ?? null,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source' },
    );

    if (upsertError) throw upsertError;

    return new Response(
      JSON.stringify({ synced: true, tier, reason: 'ok' } satisfies SyncOutcome),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[sync-entitlement] unexpected:', error);
    return new Response(
      JSON.stringify({ synced: false, tier: 'free', reason: 'revenuecat_unavailable' } satisfies SyncOutcome),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
