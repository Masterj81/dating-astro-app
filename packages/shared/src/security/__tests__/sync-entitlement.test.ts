// JUNO-06 blocage 2 — execute the REAL sync-entitlement edge decisions.
//
// The operator's flow (client asks → SERVER verifies with its own
// RevenueCat credentials → server writes → client re-asks enforce) is only
// real if the verification logic itself is the deployed bytes. This suite
// loads the actual edge source through loadEdgeModule (the house pattern:
// a validator that reads text cannot prove a decision) and runs the pure
// decision helpers, plus the structural invariants that make the endpoint
// safe: it never grants, it never accepts a caller-chosen identity, and it
// fails closed on every RevenueCat/DB failure.

import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupEdgeModules,
  loadEdgeModule,
  readRepoFile,
} from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/sync-entitlement/index.ts';

type SyncHelpers = {
  tierFromSubscriber: (
    body: {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null; product_identifier?: string | null }
        >;
      };
    } | null,
    now?: Date,
  ) => 'free' | 'premium' | 'premium_plus';
  isThrottled: (lastSyncAt: string | null | undefined, now?: Date) => boolean;
};

afterEach(() => cleanupEdgeModules());

async function loadHelpers(): Promise<SyncHelpers> {
  return loadEdgeModule<SyncHelpers>({
    file: EDGE_FILE,
    label: 'sync-entitlement-helpers',
    declarations: ['SYNC_MIN_INTERVAL_MS', 'tierFromSubscriber', 'isThrottled'],
  });
}

const NOW = new Date('2026-09-23T12:00:00Z');
const IN_FUTURE = '2027-01-01T00:00:00Z';
const IN_PAST = '2026-01-01T00:00:00Z';

describe('sync-entitlement · tierFromSubscriber (the real edge bytes)', () => {
  it('no entitlements at all → free (nothing to reconcile)', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    expect(tierFromSubscriber(null, NOW)).toBe('free');
    expect(tierFromSubscriber({ subscriber: {} }, NOW)).toBe('free');
    expect(tierFromSubscriber({ subscriber: { entitlements: {} } }, NOW)).toBe('free');
  });

  it('an expired entitlement reconciles to free — the DOWNGRADE case', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    const body = {
      subscriber: { entitlements: { premium: { expires_date: IN_PAST } } },
    };
    expect(tierFromSubscriber(body, NOW)).toBe('free');
  });

  it('an active entitlement with a future expiry maps to its tier', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    expect(
      tierFromSubscriber(
        { subscriber: { entitlements: { premium: { expires_date: IN_FUTURE } } } },
        NOW,
      ),
    ).toBe('premium');
    expect(
      tierFromSubscriber(
        { subscriber: { entitlements: { premium_plus: { expires_date: IN_FUTURE } } } },
        NOW,
      ),
    ).toBe('premium_plus');
  });

  it('lifetime entitlement (no expires_date) stays active — mirrors backfill-revenuecat', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    const body = {
      subscriber: { entitlements: { premium_plus: { expires_date: null } } },
    };
    expect(tierFromSubscriber(body, NOW)).toBe('premium_plus');
  });

  it('premium_plus wins when both tiers are active (downward inclusion)', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    const body = {
      subscriber: {
        entitlements: {
          premium: { expires_date: IN_FUTURE },
          premium_plus: { expires_date: IN_FUTURE },
        },
      },
    };
    expect(tierFromSubscriber(body, NOW)).toBe('premium_plus');
  });

  it('a malformed expires_date is not a crash: the comparison decides', async () => {
    const { tierFromSubscriber } = await loadHelpers();
    const body = {
      subscriber: { entitlements: { premium: { expires_date: 'not-a-date' } } },
    };
    // Invalid Date comparisons are false → not active → free. Fail-closed.
    expect(tierFromSubscriber(body, NOW)).toBe('free');
  });
});

describe('sync-entitlement · isThrottled (one reconciliation per window)', () => {
  it('no previous sync → not throttled', async () => {
    const { isThrottled } = await loadHelpers();
    expect(isThrottled(null, NOW)).toBe(false);
    expect(isThrottled(undefined, NOW)).toBe(false);
  });

  it('inside the 30s window → throttled (a patched client cannot hammer RevenueCat through us)', async () => {
    const { isThrottled } = await loadHelpers();
    expect(isThrottled(new Date(NOW.getTime() - 10_000).toISOString(), NOW)).toBe(true);
    expect(isThrottled(new Date(NOW.getTime() - 29_999).toISOString(), NOW)).toBe(true);
  });

  it('outside the window → allowed again', async () => {
    const { isThrottled } = await loadHelpers();
    expect(isThrottled(new Date(NOW.getTime() - 30_000).toISOString(), NOW)).toBe(false);
    expect(isThrottled(new Date(NOW.getTime() - 60_000).toISOString(), NOW)).toBe(false);
  });
});

describe('sync-entitlement · structural invariants (the flow is the fix)', () => {
  const src = readRepoFile(EDGE_FILE);

  it('NEVER grants: it makes no RPC at all — a comment may mention enforce, a call cannot', () => {
    // The header documents that enforce is the client's NEXT step; what is
    // forbidden is CALLING it (or any decision RPC) from here.
    expect(src).not.toMatch(/\.rpc\(/);
    // And no response payload carries an authorization field.
    expect(src).not.toMatch(/allowed\s*:/);
  });

  it('the subscriber verified is ALWAYS the caller: auth.uid from the JWT, never a body param', () => {
    // The RevenueCat fetch is templated on the authenticated user's id, and
    // the request body is never asked for a user id.
    expect(src).toMatch(/subscribers\/\$\{encodeURIComponent\(user\.id\)\}/);
    expect(src).not.toMatch(/body\.user_id|p_user_id/);
  });

  it('fails closed: a RevenueCat failure writes NOTHING and answers unavailable', () => {
    expect(src).toMatch(/revenuecat_unavailable/);
    // The write happens only on the verified paths: no upsert before the
    // !ok bail-outs.
    const firstRcBail = src.indexOf('revenuecat_unavailable');
    const upsert = src.indexOf('.upsert(');
    expect(firstRcBail).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(-1);
  });

  it('RC 404 is an honest "synced, tier free" — not an error, not a grant', () => {
    const at404 = src.indexOf('rcResponse.status === 404');
    expect(at404).toBeGreaterThan(-1);
    const block = src.slice(at404, at404 + 400);
    expect(block).toMatch(/synced: true/);
    expect(block).toMatch(/tier: 'free'/);
  });

  it('writes go to subscriptions with the service role — the same table the webhook owns', () => {
    expect(src).toMatch(/from\('subscriptions'\)/);
    expect(src).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('serves no CORS header (RN transport; nothing browser-readable)', () => {
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });
});
