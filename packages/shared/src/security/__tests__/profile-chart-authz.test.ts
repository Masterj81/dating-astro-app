// JUNO-02 + rate limiting — who `get-profile-chart` serves, and what happens
// when a control cannot answer.
//
// Executes `authorizeChartAccess` extracted from the real edge source, with the
// two RPC channels injected. Every branch is exercised against a mock that
// records what was called, so the tests assert ORDER and FAIL-CLOSED behaviour,
// not just return values — "did it refuse?" is half the question; "did it read
// the target's row before refusing?" is the other half.
//
// WHAT WAS WRONG
// --------------
// The function authenticated its caller and stopped. No subscription check, no
// block check, no relationship check: any valid JWT could name any UUID and
// receive that person's natal reading. And the rate limiter — the only thing
// bounding bulk collection — logged its own failures and carried on, so a
// transient database error turned the endpoint into an unmetered exporter.
// docs/security-audit-2026-09-07.md, JUNO-02.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/get-profile-chart/index.ts';

type RpcResult = { data: unknown; error: { message: string } | null };
type Decision =
  | { ok: true; reason: 'self' | 'entitled' }
  | { ok: false; status: number; error: string };

type EdgeModule = {
  RATE_LIMIT_MAX_PER_HOUR: number;
  RATE_LIMIT_ACTION: string;
  CHART_FEATURE_KEY: string;
  NOT_VISIBLE: { status: number; error: string };
  authorizeChartAccess: (
    deps: {
      rpcAsCaller: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
      rpcAsService: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
    },
    callerId: string,
    targetUserId: string,
  ) => Promise<Decision>;
};

let edge: EdgeModule;

beforeAll(async () => {
  edge = await loadEdgeModule<EdgeModule>({
    file: EDGE_FILE,
    label: 'get-profile-chart-authz',
    declarations: [
      'RATE_LIMIT_MAX_PER_HOUR',
      'RATE_LIMIT_ACTION',
      'CHART_FEATURE_KEY',
      'NOT_VISIBLE',
      'firstRow',
      'authorizeChartAccess',
    ],
  });
});

afterAll(() => cleanupEdgeModules());

const CALLER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

interface ScenarioOptions {
  rateLimit?: RpcResult;
  entitlement?: RpcResult;
  visibility?: RpcResult;
}

/** A mock pair that records every RPC, in order. */
function makeDeps(options: ScenarioOptions = {}) {
  const calls: Array<{ via: 'caller' | 'service'; fn: string; args: Record<string, unknown> }> = [];
  const allow: RpcResult = { data: true, error: null };
  const entitled: RpcResult = { data: [{ allowed: true, reason: 'ok' }], error: null };

  const deps = {
    rpcAsService: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ via: 'service', fn, args });
      if (fn === 'check_rate_limit') return options.rateLimit ?? allow;
      throw new Error(`unexpected service RPC: ${fn}`);
    },
    rpcAsCaller: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ via: 'caller', fn, args });
      if (fn === 'can_use_premium_feature') return options.entitlement ?? entitled;
      if (fn === 'can_view_profile_chart') return options.visibility ?? allow;
      throw new Error(`unexpected caller RPC: ${fn}`);
    },
  };
  return { deps, calls };
}

describe('JUNO-02 · entitlement', () => {
  it('serves an entitled account', async () => {
    const { deps, calls } = makeDeps();
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: true, reason: 'entitled' });
    expect(calls.map((c) => c.fn)).toEqual([
      'check_rate_limit',
      'can_use_premium_feature',
      'can_view_profile_chart',
    ]);
  });

  it('refuses a free account with 402 and the server\'s own reason', async () => {
    const { deps, calls } = makeDeps({
      entitlement: { data: [{ allowed: false, reason: 'insufficient_tier' }], error: null },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: false, status: 402, error: 'insufficient_tier' });
    // Stopped before visibility: nothing about the target was read.
    expect(calls.map((c) => c.fn)).not.toContain('can_view_profile_chart');
  });

  it('honours a free-preview grant without consuming anything', async () => {
    // `can_use_premium_feature` is the READ-ONLY counterpart of
    // `enforce_premium_feature`. Using the enforcing one here would spend the
    // reader's daily preview on merely opening a profile — the double
    // consumption bug fixed on 2026-08-23.
    const { deps, calls } = makeDeps({
      entitlement: { data: [{ allowed: true, reason: 'free_preview' }], error: null },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision.ok).toBe(true);
    expect(calls.some((c) => c.fn === 'enforce_premium_feature')).toBe(false);
    expect(calls.some((c) => c.fn === 'increment_feature_usage')).toBe(false);
  });

  it('refuses when the entitlement quota is exhausted', async () => {
    const { deps } = makeDeps({
      entitlement: { data: [{ allowed: false, reason: 'quota_exceeded' }], error: null },
    });
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: 402, error: 'quota_exceeded',
    });
  });

  it('asks about the feature the product actually sells', async () => {
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    const gate = calls.find((c) => c.fn === 'can_use_premium_feature');
    expect(gate?.args).toEqual({ p_feature_key: edge.CHART_FEATURE_KEY });
    expect(edge.CHART_FEATURE_KEY).toBe('synastry');
  });

  it('never lets the caller name the user whose entitlement is checked', async () => {
    // The RPC takes no user id: identity comes from auth.uid() inside the
    // function. A `p_user_id` argument here would be a guard someone can forget.
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    for (const call of calls.filter((c) => c.fn === 'can_use_premium_feature')) {
      expect(Object.keys(call.args)).toEqual(['p_feature_key']);
    }
  });

  it('runs the entitlement check with the CALLER\'s JWT, never service_role', async () => {
    // Asked as service_role, `auth.uid()` is null and the function answers
    // about nobody. This is the difference between a check and a formality.
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(calls.find((c) => c.fn === 'can_use_premium_feature')?.via).toBe('caller');
    expect(calls.find((c) => c.fn === 'can_view_profile_chart')?.via).toBe('caller');
  });
});

describe('JUNO-02 · visibility', () => {
  it('refuses a target the caller may not see', async () => {
    const { deps } = makeDeps({ visibility: { data: false, error: null } });
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: edge.NOT_VISIBLE.status, error: edge.NOT_VISIBLE.error,
    });
  });

  it('answers identically for blocked, inactive, non-existent and not-discoverable', async () => {
    // The visibility RPC collapses all four into `false` precisely so this
    // function cannot tell them apart. If it ever could, the endpoint would
    // answer "does this person exist, and did they block me?" for any UUID.
    const outcomes = await Promise.all(
      [false, false, false, null].map(async (value) => {
        const { deps } = makeDeps({ visibility: { data: value, error: null } });
        return edge.authorizeChartAccess(deps, CALLER, TARGET);
      }),
    );
    const distinct = new Set(outcomes.map((o) => JSON.stringify(o)));
    expect(distinct.size).toBe(1);
    expect([...distinct][0]).toContain(String(edge.NOT_VISIBLE.status));
  });

  it('treats a non-true answer as a refusal', async () => {
    // `data !== true`, not `data === false`: an RPC that starts returning a row
    // object, a string, or undefined must not read as permission.
    for (const value of [null, undefined, 0, '', 'true', {}, [], [{ ok: true }]]) {
      const { deps } = makeDeps({ visibility: { data: value, error: null } });
      const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
      expect(decision.ok, `visibility data ${JSON.stringify(value)} must not allow`).toBe(false);
    }
  });

  it('lets a caller read their own chart without any gate', async () => {
    const { deps, calls } = makeDeps();
    const decision = await edge.authorizeChartAccess(deps, CALLER, CALLER);
    expect(decision).toEqual({ ok: true, reason: 'self' });
    // Explicitly defined behaviour: it is their own data, the premium surfaces
    // need it as the left-hand side of every comparison, and the natal-chart
    // screens carry their own `natal_chart` gate.
    expect(calls).toEqual([]);
  });
});

describe('rate limiting · server-side and fail-closed', () => {
  it('returns 429 when the quota is exceeded', async () => {
    const { deps } = makeDeps({ rateLimit: { data: false, error: null } });
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: 429, error: 'rate_limited',
    });
  });

  it('REFUSES when the limiter itself errors', async () => {
    // The regression this exists to prevent, verbatim from the old code:
    //     if (rlErr) { console.error('check_rate_limit failed (non-fatal)'); }
    // A control that did not run is a control that said no.
    const { deps, calls } = makeDeps({
      rateLimit: { data: null, error: { message: 'connection reset' } },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: false, status: 503, error: 'rate_limit_unavailable' });
    // And it stopped there: no entitlement probe, no visibility probe, no read.
    expect(calls.map((c) => c.fn)).toEqual(['check_rate_limit']);
  });

  it('REFUSES when the entitlement check errors', async () => {
    const { deps } = makeDeps({
      entitlement: { data: null, error: { message: 'permission denied' } },
    });
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: 503, error: 'entitlement_unavailable',
    });
  });

  it('REFUSES when the visibility check errors', async () => {
    const { deps } = makeDeps({
      visibility: { data: null, error: { message: 'function does not exist' } },
    });
    // This is also the rollback posture: with the migration reverted, the
    // deployed function answers 503 rather than serving anything.
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: 503, error: 'visibility_unavailable',
    });
  });

  it('rate-limits BEFORE entitlement, so the endpoint is not an entitlement oracle', async () => {
    const { deps, calls } = makeDeps({ rateLimit: { data: false, error: null } });
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(calls.map((c) => c.fn)).toEqual(['check_rate_limit']);
  });

  it('keys the limit on the caller, with a bounded window', async () => {
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    const rl = calls.find((c) => c.fn === 'check_rate_limit');
    expect(rl?.via).toBe('service');
    expect(rl?.args).toEqual({
      p_user_id: CALLER,
      p_action: edge.RATE_LIMIT_ACTION,
      p_max_count: edge.RATE_LIMIT_MAX_PER_HOUR,
      p_window: '1 hour',
    });
    expect(edge.RATE_LIMIT_MAX_PER_HOUR).toBeGreaterThan(0);
    expect(edge.RATE_LIMIT_MAX_PER_HOUR).toBeLessThanOrEqual(200);
  });

  it('counts every repeated call, including the refused ones', async () => {
    // A limiter that only counts successes is a limiter an attacker steps
    // around by making requests that fail.
    let seen = 0;
    const deps = {
      rpcAsService: async (fn: string): Promise<RpcResult> => {
        if (fn === 'check_rate_limit') {
          seen += 1;
          return { data: seen <= edge.RATE_LIMIT_MAX_PER_HOUR, error: null };
        }
        throw new Error(fn);
      },
      rpcAsCaller: async (fn: string): Promise<RpcResult> => {
        if (fn === 'can_use_premium_feature') {
          return { data: [{ allowed: false, reason: 'insufficient_tier' }], error: null };
        }
        return { data: true, error: null };
      },
    };
    for (let i = 0; i < edge.RATE_LIMIT_MAX_PER_HOUR; i++) {
      await edge.authorizeChartAccess(deps, CALLER, TARGET);
    }
    const overflow = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(overflow).toEqual({ ok: false, status: 429, error: 'rate_limited' });
    expect(seen).toBe(edge.RATE_LIMIT_MAX_PER_HOUR + 1);
  });

  it('leaks nothing about the target in any refusal', async () => {
    const refusals = await Promise.all([
      makeDeps({ rateLimit: { data: false, error: null } }),
      makeDeps({ rateLimit: { data: null, error: { message: 'boom' } } }),
      makeDeps({ entitlement: { data: [{ allowed: false, reason: 'insufficient_tier' }], error: null } }),
      makeDeps({ visibility: { data: false, error: null } }),
      makeDeps({ visibility: { data: null, error: { message: 'boom' } } }),
    ].map(({ deps }) => edge.authorizeChartAccess(deps, CALLER, TARGET)));

    for (const refusal of refusals) {
      const body = JSON.stringify(refusal);
      expect(body).not.toContain(TARGET);
      expect(body).not.toMatch(/birth|latitude|longitude|email|name/i);
      // No provider message either: 'connection reset' / 'permission denied'
      // describe our infrastructure to a stranger.
      expect(body).not.toContain('boom');
    }
  });
});

describe('JUNO-02 · the source keeps the guarantees the tests rely on', () => {
  const source = readRepoFile(EDGE_FILE);

  it('authorises before reading the target row', () => {
    const authorizeAt = source.indexOf('await authorizeChartAccess(');
    const readAt = source.indexOf(".from('profiles')");
    expect(authorizeAt).toBeGreaterThan(0);
    expect(readAt).toBeGreaterThan(0);
    expect(authorizeAt).toBeLessThan(readAt);
  });

  it('never calls the consuming enforcement RPC', () => {
    expect(source).not.toContain("rpc('enforce_premium_feature'");
    expect(source).not.toContain("'enforce_premium_feature'");
  });

  it('does not distinguish "not found" from "not allowed" in its replies', () => {
    // Every post-read refusal answers with NOT_VISIBLE, so a caller cannot
    // tell an absent UUID from one they may not see. Asserted on the calls
    // rather than on the whole file: the comment beside them names the shape
    // that was removed, and a test that forbids naming it forbids explaining it.
    const calls = source.match(/return jsonError\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    const postRead = source.slice(source.indexOf('if (targetErr)'));
    const refusals = postRead.match(/return jsonError\([^)]*\)/g) ?? [];
    const notFound = refusals.filter((call) => /404|NOT_VISIBLE/.test(call));
    expect(notFound.length).toBeGreaterThan(0);
    for (const call of notFound) {
      expect(call).toContain('NOT_VISIBLE.status');
      expect(call).toContain('NOT_VISIBLE.error');
    }
  });

  it('trusts no premium flag from the request body', () => {
    const bodyParse = source.slice(source.indexOf('body = await req.json()'));
    const parsed = bodyParse.slice(0, bodyParse.indexOf('adminClient'));
    expect(parsed).not.toMatch(/\btier\b/);
    expect(parsed).not.toMatch(/\bentitlement\b/);
    expect(parsed).not.toMatch(/\bisPremium\b/);
    // The whole input contract is one UUID.
    expect(source).toContain('body: { targetUserId?: string }');
  });
});
