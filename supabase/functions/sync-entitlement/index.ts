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
// Security posture (audited 2026-09-23 against the operator's push checklist):
//   - Caller = the authenticated Supabase user (Authorization JWT, plus the
//     platform's verify_jwt = true in supabase/config.toml — defense in
//     depth). No admin secret, no user_id/app_user_id parameter — the
//     subscriber fetched from RevenueCat is ALWAYS auth.uid(), so one
//     account cannot read or write another's state.
//   - Throttle: one sync attempt per account per 30 s, claimed ATOMICALLY and
//     PERSISTENTLY on `entitlement_sync_claims` (table created by
//     20260922000002, owned by this function alone, holding no tier/expiry/
//     product data). Two arms, each a single row-locked statement, so the
//     claim covers users with NO `subscriptions` row too (a free account —
//     the webhook only writes rows on purchase events; a bare UPDATE-claim
//     would leave them an unthrottled retry window):
//     arm 1  INSERT ... ON CONFLICT (user_id) DO NOTHING RETURNING — wins
//            exactly on the first-ever sync (the row is created, throttled
//            from that instant);
//     arm 2  conditional UPDATE whose predicate (last_sync_at IS NULL OR
//            last_sync_at < cutoff) runs INSIDE the statement — of two
//            concurrent claims only one wins.
--     Zero rows from both arms ⇒ throttled: an honest 429, at most 30 s to
--     wait. A RevenueCat failure AFTER a claim leaves the claim standing on
--     purpose: the technical write happened before the external call, moved
--     no entitlement data, and bounds the retry cadence.
//   - Fail-closed, everywhere: RevenueCat unreachable, slow (8 s deadline),
//     non-2xx, unparseable, or AMBIGUOUS (a 200 without a subscriber object,
//     an entitlement whose expires_date does not parse) ⇒ NO state change —
//     an ambiguous answer never downgrades or promotes anyone silently.
//     Only a VERIFIED answer writes: an entitlement with a PAST expiry
//     reconciles DOWN (that is RC's truth, not ambiguity); a 404 is an
//     honest "synced, tier free" (the subscriber never existed there).
//   - Writes, two distinct kinds, never conflated: (a) the TECHNICAL claim —
//     entitlement_sync_claims only (user_id + timestamp), written BEFORE the
//     RevenueCat call and surviving its failure on purpose, moving no
//     entitlement data; (b) the VERIFIED reconcile — public.subscriptions,
//     written ONLY on a verified answer, bounded to the exact column set
//     backfill-revenuecat writes, on the same ON CONFLICT (user_id, source)
//     key the webhook's reconciliation uses.
//   - Logs: outcomes only — the caller's own user id (already carried by
//     every Supabase request log), outcome name, tier. Never a RevenueCat
//     body, never the API key, never entitlement detail, never a raw error
//     object (a fetch error can embed the request URL).
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

// One reconciliation attempt per account per window. Claimed via the atomic
// conditional UPDATE below — see the security posture above.
const SYNC_MIN_INTERVAL_MS = 30_000;

// RevenueCat must answer within this budget or the sync fails CLOSED — a
// hanging upstream must never leave the reader in limbo.
const SYNC_TIMEOUT_MS = 8_000;

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
    | 'state_unavailable'
    | 'config_error';
};

/** Pure: the exclusive cutoff a sync claim must beat (ISO instant). */
export function syncCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - SYNC_MIN_INTERVAL_MS).toISOString();
}

/**
 * Pure: read RevenueCat's answer as a verdict.
 *
 * `ambiguous` is the load-bearing value: a 200 without a subscriber object,
 * or an entitlement whose expires_date does not parse, cannot be judged —
 * and an answer that cannot be judged must not move anyone's tier in either
 * direction (operator checklist: "une réponse ambiguë ne rétrograde ni ne
 * promeut silencieusement"). What IS judged:
 *   - no active entitlement            → free (verified: nothing to
 *     reconcile);
 *   - entitlement with a PAST expiry   → free (RC's truth: it lapsed — the
 *     honest downgrade path, not ambiguity);
 *   - expires_date null/undefined      → lifetime, active (RC's encoding);
 *   - unparseable expires_date         → ambiguous, no write.
 */
export type RcVerdict =
  | {
      kind: 'ok';
      tier: 'free' | 'premium' | 'premium_plus';
      expiresAt: string | null;
      productId: string | null;
    }
  | { kind: 'ambiguous' };

export function readSubscriberVerdict(
  body: RcSubscriberResponse | null,
  now: Date = new Date(),
): RcVerdict {
  const ent = body?.subscriber?.entitlements;
  if (!body?.subscriber || !ent) return { kind: 'ambiguous' };

  const readEntitlement = (
    name: string,
  ):
    | { status: 'active'; expiresAt: string | null; productId: string | null }
    | { status: 'inactive' }
    | { status: 'ambiguous' } => {
    const e = ent[name];
    if (!e) return { status: 'inactive' };
    if (e.expires_date === null || e.expires_date === undefined) {
      // RC's encoding for a lifetime entitlement.
      return { status: 'active', expiresAt: null, productId: e.product_identifier ?? null };
    }
    const expiry = new Date(e.expires_date);
    if (Number.isNaN(expiry.getTime())) return { status: 'ambiguous' };
    return expiry > now
      ? { status: 'active', expiresAt: e.expires_date, productId: e.product_identifier ?? null }
      : { status: 'inactive' };
  };

  for (const name of ['premium_plus', 'premium'] as const) {
    const r = readEntitlement(name);
    if (r.status === 'ambiguous') return { kind: 'ambiguous' };
    if (r.status === 'active') {
      return { kind: 'ok', tier: name, expiresAt: r.expiresAt, productId: r.productId };
    }
    // Inactive at this tier: fall through and try the lower one.
  }
  return { kind: 'ok', tier: 'free', expiresAt: null, productId: null };
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

function outcome(
  synced: boolean,
  tier: SyncOutcome['tier'],
  reason: SyncOutcome['reason'],
  status = 200,
): Response {
  return new Response(
    JSON.stringify({ synced, tier, reason } satisfies SyncOutcome),
    { status, headers: jsonHeaders() },
  );
}

// Outcome audit line — the caller's own id (already carried by every
// Supabase request log), the outcome, the tier. Nothing from RevenueCat's
// payload, no credential, no raw error.
function audit(userId: string, outcomeName: string, tier: string): void {
  console.log(`[sync-entitlement] user=${userId} outcome=${outcomeName} tier=${tier}`);
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders(),
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return outcome(false, 'free', 'unauthenticated', 401);
  }

  // Identify the caller from THEIR OWN JWT — never a request parameter.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

  if (userError || !user) {
    return outcome(false, 'free', 'unauthenticated', 401);
  }

  if (!REVENUECAT_API_KEY) {
    return outcome(false, 'free', 'config_error', 500);
  }

  const userId = user.id;

  // ---------------------------------------------------------------------------
  // Throttle — claimed atomically and persistently BEFORE any upstream call.
  //
  // Arm 1: INSERT ... ON CONFLICT (user_id) DO NOTHING, returning a row only
  //        when the account had none — the first-ever sync creates its claim
  //        row and is throttled from that instant (a bare UPDATE-claim cannot
  //        do this: it matches zero rows for a row-less user and leaves an
  //        unthrottled retry window — the operator's case 1).
  // Arm 2: conditional UPDATE; the window predicate runs INSIDE the
  //        statement under the row lock, so of two concurrent claims only
  //        one wins.
  // Zero rows from both arms ⇒ throttled: honest 429, at most 30 s to wait.
  // The claim is a TECHNICAL WRITE that happens BEFORE the RevenueCat call
  // and survives its failure on purpose — it moves no tier/expiry/product
  // data (this table holds none) and it is what bounds the retry cadence.
  // ---------------------------------------------------------------------------
  try {
    const claimIso = new Date().toISOString();

    const { data: inserted, error: insertError } = await supabase
      .from('entitlement_sync_claims')
      .upsert(
        { user_id: userId, last_sync_at: claimIso },
        { onConflict: 'user_id', ignoreDuplicates: true },
      )
      .select('user_id');

    if (insertError) throw insertError;

    let claimed = (inserted ?? []).length > 0;

    if (!claimed) {
      const { data: renewed, error: renewError } = await supabase
        .from('entitlement_sync_claims')
        .update({ last_sync_at: claimIso })
        .eq('user_id', userId)
        .or(`last_sync_at.is.null,last_sync_at.lt.${syncCutoff()}`)
        .select('user_id');

      if (renewError) throw renewError;
      claimed = (renewed ?? []).length > 0;
    }

    if (!claimed) {
      audit(userId, 'throttled', 'free');
      return outcome(false, 'free', 'rate_limited', 429);
    }
  } catch (error) {
    console.error('[sync-entitlement] claim failed:', errorName(error));
    audit(userId, 'claim_error', 'free');
    return outcome(false, 'free', 'state_unavailable', 503);
  }

  // ---------------------------------------------------------------------------
  // The verification: RevenueCat's own API, the server's own credentials, on
  // a deadline. Every failure mode below is fail-closed: no state change.
  // ---------------------------------------------------------------------------
  let verdict: RcVerdict;
  try {
    const rcResponse = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${REVENUECAT_API_KEY}` },
        signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
      },
    );

    if (rcResponse.status === 404) {
      // No RevenueCat record: nothing to reconcile. A local entitlement
      // claiming otherwise changes nothing — the server state stays free.
      audit(userId, 'synced_rc_404', 'free');
      return outcome(true, 'free', 'ok');
    }

    if (!rcResponse.ok) {
      audit(userId, `rc_http_${rcResponse.status}`, 'free');
      return outcome(false, 'free', 'revenuecat_unavailable', 502);
    }

    // Unparseable body = ambiguous = fail-closed, never a silent downgrade.
    const body = (await rcResponse.json().catch(() => null)) as RcSubscriberResponse | null;
    verdict = readSubscriberVerdict(body);
    if (verdict.kind === 'ambiguous') {
      audit(userId, 'rc_ambiguous', 'free');
      return outcome(false, 'free', 'revenuecat_unavailable', 502);
    }
  } catch (error) {
    // Network failure, TLS, or the 8 s deadline: RevenueCat did not answer.
    console.error('[sync-entitlement] verification failed:', errorName(error));
    audit(userId, 'rc_unreachable', 'free');
    return outcome(false, 'free', 'revenuecat_unavailable', 502);
  }

  // ---------------------------------------------------------------------------
  // Writes — only a VERIFIED verdict reaches this point. Bounded to the
  // columns backfill-revenuecat writes (plus last_sync_at), on the same
  // ON CONFLICT (user_id, source) key.
  // ---------------------------------------------------------------------------
  try {
    const nowIso = new Date().toISOString();

    if (verdict.tier === 'free') {
      // RevenueCat itself says free (or every entitlement lapsed): reconcile
      // the server DOWN. A stale local entitlement cannot survive it.
      await supabase
        .from('subscriptions')
        .update({ status: 'expired', updated_at: nowIso })
        .eq('user_id', userId)
        .eq('source', 'play_store');
      audit(userId, 'synced_downgrade', 'free');
      return outcome(true, 'free', 'ok');
    }

    const { error: upsertError } = await supabase.from('subscriptions').upsert(
      {
        user_id: userId,
        source: 'play_store',
        tier: verdict.tier,
        status: 'active',
        provider_customer_id: userId,
        provider_subscription_id: verdict.productId,
        expires_at: verdict.expiresAt,
        cancel_at_period_end: false,
        updated_at: nowIso,
      },
      { onConflict: 'user_id,source' },
    );

    if (upsertError) throw upsertError;

    audit(userId, 'synced_paid', verdict.tier);
    return outcome(true, verdict.tier, 'ok');
  } catch (error) {
    console.error('[sync-entitlement] write failed:', errorName(error));
    audit(userId, 'state_error', 'free');
    return outcome(false, 'free', 'state_unavailable', 503);
  }
});
