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
//
// WHAT CHANGED ON 2026-09-15 (free daily synastry preview)
// --------------------------------------------------------
// Entitlement is now read through `synastry_preview_gate()` — an EXPLICIT tier
// read. `can_use_premium_feature` answers allowed=true for a subscriber AND
// for a free reader with a quota; once the preview quota was raised the edge
// could no longer tell whether to claim a grant. The gate returns
// paid | preview_enabled | preview_disabled | policy_unavailable, and the
// mapping here is contract: preview_disabled is the no-redeploy ROLLBACK (402,
// not 503), policy_unavailable is fail-closed.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/get-profile-chart/index.ts';

type RpcResult = { data: unknown; error: { message: string } | null };
type Decision =
  | { ok: true; reason: 'self' | 'entitled' | 'preview' }
  | { ok: false; status: number; error: string };

type EdgeModule = {
  RATE_LIMIT_MAX_PER_HOUR: number;
  RATE_LIMIT_ACTION: string;
  CHART_FEATURE_KEY: string;
  NOT_VISIBLE: { status: number; error: string };
  PREVIEW_GATE_RESPONSES: Record<string, { status: number; error: string }>;
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
      'PREVIEW_GATE_RESPONSES',
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
  gate?: RpcResult;
  visibility?: RpcResult;
}

/** A mock pair that records every RPC, in order. */
function makeDeps(options: ScenarioOptions = {}) {
  const calls: Array<{ via: 'caller' | 'service'; fn: string; args: Record<string, unknown> }> = [];
  const allow: RpcResult = { data: true, error: null };
  // Default gate: a subscriber. Free-path tests override with
  // preview_enabled / preview_disabled / policy_unavailable.
  const paid: RpcResult = { data: [{ code: 'paid', required_tier: 'celestial' }], error: null };

  const deps = {
    rpcAsService: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ via: 'service', fn, args });
      if (fn === 'check_rate_limit') return options.rateLimit ?? allow;
      throw new Error(`unexpected service RPC: ${fn}`);
    },
    rpcAsCaller: async (fn: string, args: Record<string, unknown>): Promise<RpcResult> => {
      calls.push({ via: 'caller', fn, args });
      if (fn === 'synastry_preview_gate') return options.gate ?? paid;
      if (fn === 'can_view_profile_chart') return options.visibility ?? allow;
      throw new Error(`unexpected caller RPC: ${fn}`);
    },
  };
  return { deps, calls };
}

describe('JUNO-02 · entitlement, read explicitly', () => {
  it('serves a subscribed account without any claim', async () => {
    const { deps, calls } = makeDeps();
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: true, reason: 'entitled' });
    expect(calls.map((c) => c.fn)).toEqual([
      'check_rate_limit',
      'synastry_preview_gate',
      'can_view_profile_chart',
    ]);
  });

  it('classifies a free reader with an active preview as reason "preview"', async () => {
    // NOT a yes: the handler still has to claim after computing. The
    // authorization merely says "there is something to claim".
    const { deps, calls } = makeDeps({
      gate: { data: [{ code: 'preview_enabled', required_tier: 'celestial' }], error: null },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: true, reason: 'preview' });
    expect(calls.map((c) => c.fn)).toEqual([
      'check_rate_limit',
      'synastry_preview_gate',
      'can_view_profile_chart',
    ]);
  });

  it('refuses a free account with 402 when the preview quota is NULL — the rollback', async () => {
    // quota NULL (or 0) is preview_disabled: the ROLLBACK state. It must be a
    // 402 "pay for it", never a 503 "broken" — and it must not require this
    // edge function to be redeployed.
    const { deps, calls } = makeDeps({
      gate: { data: [{ code: 'preview_disabled', required_tier: 'celestial' }], error: null },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision).toEqual({ ok: false, status: 402, error: 'insufficient_tier' });
    // Stopped before visibility: nothing about the target was read.
    expect(calls.map((c) => c.fn)).not.toContain('can_view_profile_chart');
  });

  it('fails CLOSED (503) when the policy row is absent or ambiguous', async () => {
    const { deps } = makeDeps({
      gate: { data: [{ code: 'policy_unavailable', required_tier: null }], error: null },
    });
    expect(await edge.authorizeChartAccess(deps, CALLER, TARGET)).toEqual({
      ok: false, status: 503, error: 'policy_unavailable',
    });
  });

  it('fails CLOSED on an unknown gate code or a missing row', async () => {
    // A gate that starts returning something new must not fall through to
    // "entitled" — the fall-through would be a fail-open.
    for (const data of [null, [], [{}], [{ code: null }], [{ code: 'new_thing' }]]) {
      const { deps } = makeDeps({ gate: { data, error: null } });
      const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
      expect(decision.ok, `gate data ${JSON.stringify(data)} must not allow`).toBe(false);
      if (!decision.ok) expect(decision.status).toBe(503);
    }
  });

  it('the gate never consumes anything', async () => {
    // `synastry_preview_gate` is the READ-ONLY counterpart of any enforcing
    // call. Using an enforcing one here would spend the reader's daily preview
    // on merely opening a profile — the double-consumption bug fixed on
    // 2026-08-23.
    const { deps, calls } = makeDeps({
      gate: { data: [{ code: 'preview_enabled', required_tier: 'celestial' }], error: null },
    });
    const decision = await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(decision.ok).toBe(true);
    expect(calls.some((c) => c.fn === 'enforce_premium_feature')).toBe(false);
    expect(calls.some((c) => c.fn === 'increment_feature_usage')).toBe(false);
    expect(calls.some((c) => c.fn === 'claim_synastry_free_grant')).toBe(false);
  });

  it('passes NO arguments to the gate — identity and feature live server-side', async () => {
    // The RPC takes no user id (identity from auth.uid()) and no feature key
    // (the key lives in the SQL). An argument here would be a guard someone
    // can forget to pass, or a feature a client could substitute.
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    const gate = calls.find((c) => c.fn === 'synastry_preview_gate');
    expect(gate?.args).toEqual({});
    expect(edge.CHART_FEATURE_KEY).toBe('synastry');
  });

  it('runs the gate with the CALLER\'s JWT, never service_role', async () => {
    // Asked as service_role, `auth.uid()` is null and the gate answers
    // policy_unavailable. This is the difference between a check and a
    // formality.
    const { deps, calls } = makeDeps();
    await edge.authorizeChartAccess(deps, CALLER, TARGET);
    expect(calls.find((c) => c.fn === 'synastry_preview_gate')?.via).toBe('caller');
    expect(calls.find((c) => c.fn === 'can_view_profile_chart')?.via).toBe('caller');
  });

  it('maps the gate codes to the response contract (402 vs 503 is the rollback)', async () => {
    expect(edge.PREVIEW_GATE_RESPONSES.preview_disabled).toEqual({ status: 402, error: 'insufficient_tier' });
    expect(edge.PREVIEW_GATE_RESPONSES.policy_unavailable).toEqual({ status: 503, error: 'policy_unavailable' });
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

  it('REFUSES when the gate itself errors', async () => {
    const { deps } = makeDeps({
      gate: { data: null, error: { message: 'permission denied' } },
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
        if (fn === 'synastry_preview_gate') {
          return { data: [{ code: 'preview_disabled', required_tier: 'celestial' }], error: null };
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
      makeDeps({ gate: { data: [{ code: 'preview_disabled', required_tier: 'celestial' }], error: null } }),
      makeDeps({ gate: { data: [{ code: 'policy_unavailable', required_tier: null }], error: null } }),
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

  it('a target with no birth date costs NO grant — decided, not implicit', () => {
    // DECISION (revue 2026-09-15): a target without a birth_date answers with
    // profile only (chart: null, no synastry) BEFORE the claim, so a free
    // reader's daily comparison is never consumed by a profile that carries
    // nothing to gate. Asserted on the source: the early return must precede
    // the claim block, and the slice between them must not call the claim.
    const noBirthAt = source.indexOf('if (!target.birth_date)');
    const claimBlockAt = source.indexOf("if (decision.reason === 'preview')");
    expect(noBirthAt).toBeGreaterThan(0);
    expect(claimBlockAt).toBeGreaterThan(0);
    expect(noBirthAt).toBeLessThan(claimBlockAt);
    const between = source.slice(noBirthAt, claimBlockAt);
    expect(between.indexOf('claim_synastry_free_grant')).toBe(-1);
    // And the early RESPONSE publishes no chart and no synastry. Scoped to
    // the JSON body — the decision comment beside it names the words on
    // purpose and must stay.
    const bodyAt = source.indexOf('JSON.stringify({', noBirthAt);
    expect(bodyAt).toBeGreaterThan(0);
    expect(bodyAt).toBeLessThan(claimBlockAt);
    const body = source.slice(bodyAt, bodyAt + 220);
    expect(body).toContain('chart: null');
    expect(body.indexOf('synastry')).toBe(-1);
    expect(body).toContain('profile: sanitizeProfile(target)');
  });

  it('never calls the consuming enforcement RPC', () => {
    expect(source).not.toContain("rpc('enforce_premium_feature'");
    expect(source).not.toContain("'enforce_premium_feature'");
  });

  it('CLAIMS THE GRANT AFTER THE COMPUTE, NEVER BEFORE', () => {
    // The ordering defect the design review caught: reserving first and
    // computing second loses the grant on any failure between the two.
    // Order in the source must be: gate → visibility → compute → claim → emit.
    const gateAt = source.indexOf("'synastry_preview_gate'");
    const claimAt = source.indexOf("'claim_synastry_free_grant'");
    const computeAt = source.indexOf('buildSynastryView(');
    const publicChartAt = source.indexOf('const chart = buildPublicChart(');
    const firstEmitAt = source.indexOf('grant: { code: claimCode');

    expect(gateAt).toBeGreaterThan(0);
    expect(claimAt).toBeGreaterThan(0);
    expect(computeAt).toBeGreaterThan(0);
    expect(publicChartAt).toBeGreaterThan(0);
    expect(firstEmitAt).toBeGreaterThan(0);

    expect(gateAt).toBeLessThan(computeAt);          // gate before compute
    expect(publicChartAt).toBeLessThan(claimAt);     // claim AFTER the public chart is built
    expect(claimAt).toBeLessThan(firstEmitAt);       // nothing emitted before the claim
  });

  it('the claim runs only on the preview path, with the CALLER\'s JWT', () => {
    // `decision.reason === 'preview'` is the only branch that claims: a
    // subscriber never writes a grant row. And jwtClient (not adminClient)
    // carries the caller's identity into auth.uid() — a service-role claim
    // would bypass RLS and write grants on behalf of nobody.
    const claimAt = source.indexOf("if (decision.reason === 'preview')");
    expect(claimAt).toBeGreaterThan(0);
    const claimBlock = source.slice(claimAt, claimAt + 1200);
    expect(claimBlock).toContain("jwtClient.rpc('claim_synastry_free_grant'");
    expect(claimBlock).not.toContain('adminClient');
  });

  it('the loser of a race receives NO astrological data', () => {
    // 402 free_preview_used_other_target must not carry chart, synastry, or
    // the profile — the computation dies at the claim. Anchored on the
    // response's own `next_available_utc:` line (unique to it), walking BACK
    // to the `return new Response(` that encloses it, then forward to the
    // next branch of the claim so a later `chart` in the subscriber path
    // cannot mask a leak inside this one.
    const anchorAt = source.indexOf('next_available_utc: nextAvailableUtc');
    expect(anchorAt).toBeGreaterThan(0);
    const responseAt = source.lastIndexOf('return new Response(', anchorAt);
    expect(responseAt).toBeGreaterThan(0);
    const loserBlock = source.slice(responseAt, responseAt + 1600);
    const nextBranch = loserBlock.indexOf('if (claimCode');
    const responseBody = loserBlock.slice(0, nextBranch > 0 ? nextBranch : 400);
    expect(responseBody).toContain('next_available_utc');
    expect(responseBody).toContain('free_preview_used_other_target');
    expect(responseBody.indexOf('chart')).toBe(-1);
    expect(responseBody.indexOf('synastry')).toBe(-1);
    expect(responseBody.indexOf('sanitizeProfile')).toBe(-1);
  });

  it('target_ineligible answers with the uniform NOT_VISIBLE refusal', () => {
    // The claim may refuse a target that visibility accepted a moment
    // earlier. That refusal must be indistinguishable from every other
    // "not available" — otherwise the claim becomes the UUID oracle the
    // visibility check refuses to be. Anchored on the claim's own branch
    // (the bare string also appears in the header comment).
    const ineligibleAt = source.indexOf("if (claimCode === 'target_ineligible')");
    expect(ineligibleAt).toBeGreaterThan(0);
    const block = source.slice(ineligibleAt, ineligibleAt + 400);
    expect(block).toContain('NOT_VISIBLE.status');
    expect(block).toContain('NOT_VISIBLE.error');
  });

  it('a claim RPC error fails CLOSED and never deletes the grant', () => {
    // "grant survives a lost response" is the operator decision. No DELETE
    // compensation may exist anywhere in the function — its presence would
    // resurrect the "A reserves, B replays, A fails and un-reserves" race.
    expect(source).not.toMatch(/delete.*synastry_free_grant/i);
    expect(source).not.toMatch(/\.remove\(\s*['"]synastry_free_grant/);
    expect(source).toContain("'grant_unavailable'");
  });

  it('telemetry uses only whitelisted preview events, never a target id', () => {
    // preview_presented | preview_succeeded | preview_reopened |
    // preview_used_other_target | upgrade_clicked — and record_product_event
    // never receives a target, chart, or profile argument.
    const events = source.match(/p_event_name:\s*'([^']+)'/g) ?? [];
    const allowed = new Set([
      "p_event_name: 'preview_succeeded'",
      "p_event_name: 'preview_reopened'",
      "p_event_name: 'preview_used_other_target'",
    ]);
    for (const e of events) expect(allowed.has(e)).toBe(true);
    // Bounded to the call line: [^)] alone crosses newlines into the profile
    // sanitizer's legitimate `target.` fields below.
    expect(source).not.toMatch(/record_product_event[^\n)]*target/i);
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
