// JUNO-06 blocage 2 — execute the REAL sync-entitlement edge decisions.
//
// The operator's flow (client asks → SERVER verifies with its own
// RevenueCat credentials → server writes → client re-asks enforce) is only
// real if the verification logic itself is the deployed bytes. This suite
// loads the actual edge source through loadEdgeModule (the house pattern:
// a validator that reads text cannot prove a decision) and runs the pure
// decision helpers, plus the structural invariants of the 2026-09-23 push
// checklist: JWT-only identity, an atomic persistent throttle, fail-closed
// timeouts, ambiguity that moves no tier, bounded writes, and logs that
// carry no RevenueCat payload.

import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupEdgeModules,
  loadEdgeModule,
  readRepoFile,
} from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/sync-entitlement/index.ts';

type Entitlement = {
  expires_date?: string | null;
  product_identifier?: string | null;
};
type RcBody = {
  subscriber?: { entitlements?: Record<string, Entitlement> };
} | null;

// The verdict union, declared once: SyncHelpers' return type and the
// assertion helper below read THE SAME shape, so they cannot drift.
type SubscriberVerdict =
  | {
      kind: 'ok';
      tier: 'free' | 'premium' | 'premium_plus';
      expiresAt: string | null;
      productId: string | null;
    }
  | { kind: 'ambiguous' };

type OkVerdict = Extract<SubscriberVerdict, { kind: 'ok' }>;

// Real control-flow narrowing, no casts and no `!`: expect() alone does not
// tell tsc which branch of the union a verdict is — this assertion does.
// The production type is untouched: `ambiguous` stays impossible to read as
// a verdict with a `tier`, which is exactly what these tests enforce.
function expectOkVerdict(verdict: SubscriberVerdict): asserts verdict is OkVerdict {
  expect(verdict.kind).toBe('ok');
  if (verdict.kind !== 'ok') {
    throw new Error(`Expected ok verdict, received ${verdict.kind}`);
  }
}

type SyncHelpers = {
  SYNC_MIN_INTERVAL_MS: number;
  SYNC_TIMEOUT_MS: number;
  syncCutoff: (now?: Date) => string;
  readSubscriberVerdict: (body: RcBody, now?: Date) => SubscriberVerdict;
};

afterEach(() => cleanupEdgeModules());

async function loadHelpers(): Promise<SyncHelpers> {
  return loadEdgeModule<SyncHelpers>({
    file: EDGE_FILE,
    label: 'sync-entitlement-helpers',
    declarations: [
      'SYNC_MIN_INTERVAL_MS',
      'SYNC_TIMEOUT_MS',
      'syncCutoff',
      'readSubscriberVerdict',
    ],
  });
}

const NOW = new Date('2026-09-23T12:00:00Z');
const IN_FUTURE = '2027-01-01T00:00:00Z';
const IN_PAST = '2026-01-01T00:00:00Z';

describe('sync-entitlement · readSubscriberVerdict (the real edge bytes)', () => {
  it('a 200 with NO subscriber object is AMBIGUOUS — never a silent downgrade to free', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    expect(readSubscriberVerdict(null, NOW)).toEqual({ kind: 'ambiguous' });
    expect(readSubscriberVerdict({}, NOW)).toEqual({ kind: 'ambiguous' });
    expect(readSubscriberVerdict({ subscriber: {} }, NOW)).toEqual({ kind: 'ambiguous' });
  });

  it('an empty entitlements map is a VERIFIED free (nothing to reconcile)', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    expect(readSubscriberVerdict({ subscriber: { entitlements: {} } }, NOW)).toEqual({
      kind: 'ok',
      tier: 'free',
      expiresAt: null,
      productId: null,
    });
  });

  it('an entitlement with a PAST expiry reconciles to free — the honest downgrade', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = { subscriber: { entitlements: { premium: { expires_date: IN_PAST } } } };
    expect(readSubscriberVerdict(body, NOW)).toEqual({
      kind: 'ok',
      tier: 'free',
      expiresAt: null,
      productId: null,
    });
  });

  it('an active entitlement with a future expiry maps to its tier, carrying expiry and product', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    expect(
      readSubscriberVerdict(
        { subscriber: { entitlements: { premium: { expires_date: IN_FUTURE, product_identifier: 'play.premium.y' } } } },
        NOW,
      ),
    ).toEqual({
      kind: 'ok',
      tier: 'premium',
      expiresAt: IN_FUTURE,
      productId: 'play.premium.y',
    });
    const plusVerdict = readSubscriberVerdict(
      { subscriber: { entitlements: { premium_plus: { expires_date: IN_FUTURE } } } },
      NOW,
    );
    expectOkVerdict(plusVerdict);
    expect(plusVerdict.tier).toBe('premium_plus');
  });

  it('lifetime entitlement (no expires_date) stays active — mirrors backfill-revenuecat', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = { subscriber: { entitlements: { premium_plus: { expires_date: null } } } };
    expect(readSubscriberVerdict(body, NOW)).toEqual({
      kind: 'ok',
      tier: 'premium_plus',
      expiresAt: null,
      productId: null,
    });
  });

  it('premium_plus wins when both tiers are active (downward inclusion)', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = {
      subscriber: {
        entitlements: {
          premium: { expires_date: IN_FUTURE },
          premium_plus: { expires_date: IN_FUTURE },
        },
      },
    };
    const verdict = readSubscriberVerdict(body, NOW);
    expectOkVerdict(verdict);
    expect(verdict.tier).toBe('premium_plus');
  });

  it('premium_plus expired while premium is still active reads premium (verified, not ambiguous)', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = {
      subscriber: {
        entitlements: {
          premium: { expires_date: IN_FUTURE },
          premium_plus: { expires_date: IN_PAST },
        },
      },
    };
    const verdict = readSubscriberVerdict(body, NOW);
    expectOkVerdict(verdict);
    expect(verdict.tier).toBe('premium');
  });

  it('a MALFORMED expires_date is AMBIGUOUS — it can neither downgrade nor promote', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = {
      subscriber: { entitlements: { premium: { expires_date: 'not-a-date' } } },
    };
    expect(readSubscriberVerdict(body, NOW)).toEqual({ kind: 'ambiguous' });
  });

  it('ambiguity on the HIGHER tier is ambiguity for the verdict, even if the lower one is clean', async () => {
    const { readSubscriberVerdict } = await loadHelpers();
    const body = {
      subscriber: {
        entitlements: {
          premium: { expires_date: IN_FUTURE },
          premium_plus: { expires_date: 'garbage' },
        },
      },
    };
    // Refusing to guess is the point: the premium_plus state cannot be
    // judged, so the whole answer fails closed rather than silently reading
    // at the lower tier.
    expect(readSubscriberVerdict(body, NOW)).toEqual({ kind: 'ambiguous' });
  });
});

describe('sync-entitlement · syncCutoff (the 30 s claim window)', () => {
  it('the cutoff is exactly SYNC_MIN_INTERVAL_MS behind now, ISO-formatted', async () => {
    const h = await loadHelpers();
    expect(h.SYNC_MIN_INTERVAL_MS).toBe(30_000);
    expect(h.syncCutoff(NOW)).toBe(new Date(NOW.getTime() - 30_000).toISOString());
  });

  it('the RevenueCat call is on a deadline (fail-closed timeout budget exists)', async () => {
    const h = await loadHelpers();
    expect(h.SYNC_TIMEOUT_MS).toBeGreaterThan(0);
    expect(h.SYNC_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe('sync-entitlement · structural invariants (the push checklist, on real bytes)', () => {
  const src = readRepoFile(EDGE_FILE);
  // Comments are not code: the header DOCUMENTS the forbidden parameters by
  // name, and a scan that counts prose would fail on its own explanation.
  const code = src
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

  it('NEVER grants: it makes no decision RPC and no response carries an authorization', () => {
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/allowed\s*:/);
  });

  it('the subscriber verified is ALWAYS the caller: auth.uid from the JWT, never a body param', () => {
    expect(src).toMatch(/subscribers\/\$\{encodeURIComponent\(userId\)\}/);
    expect(src).toMatch(/auth\.getUser\(/);
    expect(code).not.toMatch(/body\.user_id|p_user_id|app_user_id/);
  });

  it('the throttle is an ATOMIC two-arm claim covering row-less users too (no TOCTOU, no unthrottled window)', () => {
    // Arm 1 — INSERT .. ON CONFLICT DO NOTHING via PostgREST: the only arm
    // that can claim for a user with NO row yet (the operator's case 1; a
    // bare UPDATE matches zero rows and would leave an unthrottled retry
    // window for every free account).
    expect(src).toMatch(/from\('entitlement_sync_claims'\)\s*\n?\s*\.upsert\(/);
    expect(src).toMatch(/onConflict: 'user_id', ignoreDuplicates: true/);
    // Arm 2 — the conditional UPDATE: the window predicate runs INSIDE the
    // statement, so of two concurrent claims only one wins.
    expect(src).toMatch(/\.update\(\{ last_sync_at: claimIso \}\)/);
    expect(src).toMatch(/last_sync_at\.is\.null,last_sync_at\.lt\.\$\{syncCutoff\(\)\}/);
    // The old read-then-act shape is gone: no throttle decision ever reads
    // a row it then acts on.
    expect(src).not.toMatch(/select\('updated_at'\)/);
  });

  it('the throttle state is PERSISTENT (a dedicated table), never an Edge-side variable, never subscriptions', () => {
    // No in-memory Map/let-last-sync bucket anywhere.
    expect(src).not.toMatch(/lastAttempt|Map\(\)|syncCache/);
    // The claim lives in its own table — which holds no entitlement data —
    // and never in subscriptions (that table is written by verified
    // outcomes only, plus the webhook/backfill writers).
    expect(src).toMatch(/from\('entitlement_sync_claims'\)/);
    // Comments are not code: the claim block DOCUMENTS that it moves no
    // tier data, and a scan that counted that prose would fail on its own
    // explanation (same lesson as the identity scan above). Anchored on the
    // CODE marker, not the table name — the header mentions the table too.
    const claimStart = src.indexOf("from('entitlement_sync_claims')");
    const claimEnd = src.indexOf('api.revenuecat.com');
    const claimCode = src
      .slice(claimStart, claimEnd)
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n');
    expect(claimCode).not.toMatch(/tier|status|expires_at|provider_/);
    expect(claimCode).not.toMatch(/from\('subscriptions'\)/);
    expect(claimCode).not.toMatch(/from\('subscriptions'\)/);
  });

  it('the RevenueCat fetch is bounded by a timeout, and the TECHNICAL claim precedes it', () => {
    expect(src).toMatch(/AbortSignal\.timeout\(SYNC_TIMEOUT_MS\)/);
    // Operator case 2: last_sync_at is written BEFORE the external call —
    // the claim (its own table) sits strictly before the fetch URL.
    const claimPos = src.indexOf("from('entitlement_sync_claims')");
    const fetchPos = src.indexOf('api.revenuecat.com');
    expect(claimPos).toBeGreaterThan(-1);
    expect(fetchPos).toBeGreaterThan(claimPos);
  });

  it('every RC failure (timeout, non-2xx, unparseable, ambiguous) writes NOTHING to subscriptions', () => {
    // subscriptions is written only by VERIFIED outcomes: its first code
    // occurrence (the downgrade UPDATE) sits strictly after the LAST
    // fail-closed branch of the verification block.
    const lastFailClosed = src.lastIndexOf("'revenuecat_unavailable'");
    const firstSubsWrite = src.indexOf("from('subscriptions')");
    expect(lastFailClosed).toBeGreaterThan(-1);
    expect(firstSubsWrite).toBeGreaterThan(lastFailClosed);
  });

  it('RC 404 is an honest "synced, tier free" — not an error, not a grant', () => {
    const at404 = src.indexOf('rcResponse.status === 404');
    expect(at404).toBeGreaterThan(-1);
    const block = src.slice(at404, at404 + 400);
    expect(block).toMatch(/synced_rc_404/);
    expect(block).toMatch(/outcome\(true, 'free', 'ok'\)/);
  });

  it('an AMBIGUOUS verdict answers unavailable and writes nothing', () => {
    const atAmbiguous = src.indexOf("verdict.kind === 'ambiguous'");
    expect(atAmbiguous).toBeGreaterThan(-1);
    expect(src.slice(atAmbiguous, atAmbiguous + 200)).toMatch(/revenuecat_unavailable/);
  });

  it('writes are bounded: subscriptions gets exactly the backfill-revenuecat column set (no throttle column)', () => {
    // Anchored on from('subscriptions') — the claim's own upsert (arm 1)
    // appears earlier in the file and would otherwise be captured.
    const upsert = src.match(
      /from\('subscriptions'\)\s*\.upsert\(\s*\{([\s\S]*?)\},\s*\{\s*onConflict: 'user_id,source'\s*\}/,
    );
    expect(upsert).not.toBeNull();
    const cols = [...upsert![1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
    expect(cols.sort()).toEqual(
      [
        'user_id', 'source', 'tier', 'status',
        'provider_customer_id', 'provider_subscription_id',
        'expires_at', 'cancel_at_period_end', 'updated_at',
      ].sort(),
    );
    // The claim state lives in its own table, never smuggled into the
    // entitlement row.
    expect(cols).not.toContain('last_sync_at');
    // The downgrade path touches two columns only.
    const downgrade = src.match(/\.update\(\{ status: 'expired', updated_at: nowIso \}\)/);
    expect(downgrade).not.toBeNull();
  });

  it('no CORS header (RN transport; nothing browser-readable)', () => {
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it('logs carry outcomes only: no raw error object, no RevenueCat body, no credential', () => {
    // The audit line is user/outcome/tier.
    expect(src).toMatch(/\[sync-entitlement\] user=\$\{userId\} outcome=/);
    // No console statement ever interpolates the caught error OBJECT (a
    // fetch error can embed the request URL); only its name.
    expect(src).not.toMatch(/console\.\w+\([^)]*,\s*error\s*\)/);
    // And nothing from the RC response body is ever logged.
    expect(src).not.toMatch(/console\.\w+\([^)]*body/);
  });
});
