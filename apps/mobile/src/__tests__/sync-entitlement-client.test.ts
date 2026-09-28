/**
 * JUNO-06 PR A — behavior suite for the hardened sync-entitlement client.
 *
 * The service under test is apps/mobile/services/premiumUsage.ts
 * (syncEntitlement + classifySyncHttpError) and utils/syncCooldown.ts. The
 * mocks mirror the real supabase-js surface the service reads:
 *
 *   * functions.invoke resolves { data, error } for an HTTP answer and
 *     THROWS FunctionsHttpError for a non-2xx one — with the raw Response in
 *     `.context` (the exact shape serverTarot.ts already relies on). The
 *     suite builds REAL `Response` objects so `.json()` behaves for true.
 *   * auth.refreshSession is the bounded 401-renewal primitive.
 *
 * The contract asserted here (and defended by the canaries run against this
 * file during development):
 *   - every distinguishable failure maps to its code (401/429/502/503±reason/
 *     transport/malformed);
 *   - 401 earns AT MOST one renewal and one re-invocation — never a loop;
 *   - 429 triggers NO retry and its cooldown is a UI mirror only: it lapses
 *     into an idle button, fires nothing, and the next call is a fresh tap;
 *   - single-flight: concurrent callers join one edge invocation;
 *   - NO failure outcome carries a tier — an error is never an authorization.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifySyncHttpError,
  SYNC_RETRY_COOLDOWN_MS,
  syncEntitlement,
  type EntitlementSync,
} from '../../services/premiumUsage';
import { SyncCooldown } from '../../utils/syncCooldown';

const invokeMock = vi.fn();
const refreshSessionMock = vi.fn();

// Hoisted above the imports by vitest; the factory runs lazily, when the
// service under test first imports the mocked module.
vi.mock('../../services/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...(args as [])),
    },
    auth: {
      refreshSession: (...args: unknown[]) =>
        refreshSessionMock(...(args as [])),
    },
  },
}));

// ---- helpers -------------------------------------------------------------

/** A successful 200 body from the edge. */
function okBody(tier: 'free' | 'premium' | 'premium_plus') {
  return { synced: true, tier, reason: 'ok' };
}

/** A non-2xx edge answer, as supabase-js surfaces it: error.context = Response. */
function httpError(status: number, body: unknown) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      context: new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    },
  };
}

/** A transport failure: no HTTP answer, therefore no context. */
function transportError() {
  return { data: null, error: { name: 'FunctionsFetchError', message: 'boom' } };
}

const renewalOk = () => refreshSessionMock.mockResolvedValueOnce({
  data: { session: { access_token: 'x' } },
  error: null,
});
const renewalFails = () =>
  refreshSessionMock.mockResolvedValueOnce({ data: { session: null }, error: null });

beforeEach(() => {
  invokeMock.mockReset();
  refreshSessionMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---- 1. pure classification ----------------------------------------------

describe('classifySyncHttpError (the HTTP contract)', () => {
  it('401 -> unauthenticated, 429 -> rate_limited, 502 -> revenuecat_unavailable', () => {
    expect(classifySyncHttpError(401, null)).toBe('unauthenticated');
    expect(classifySyncHttpError(429, { reason: 'rate_limited' })).toBe('rate_limited');
    expect(classifySyncHttpError(502, { reason: 'revenuecat_unavailable' })).toBe(
      'revenuecat_unavailable',
    );
  });

  it('503 -> state_unavailable | config_error by reason, unknown statuses -> server', () => {
    expect(classifySyncHttpError(503, { reason: 'state_unavailable' })).toBe(
      'state_unavailable',
    );
    expect(classifySyncHttpError(503, { reason: 'config_error' })).toBe('config_error');
    expect(classifySyncHttpError(503, null)).toBe('server');
    expect(classifySyncHttpError(418, { reason: 'teapot' })).toBe('server');
  });
});

// ---- 2. success 200 ------------------------------------------------------

describe('syncEntitlement — 200 answers', () => {
  it('success 200 free: ok:true, tier free', async () => {
    invokeMock.mockResolvedValueOnce({ data: okBody('free'), error: null });
    const result = await syncEntitlement();
    expect(result).toEqual({ ok: true, tier: 'free' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it('success 200 paid: ok:true, tier premium_plus', async () => {
    invokeMock.mockResolvedValueOnce({ data: okBody('premium_plus'), error: null });
    const result = await syncEntitlement();
    expect(result).toEqual({ ok: true, tier: 'premium_plus' });
  });
});

// ---- 3. the 401 bounded renewal -----------------------------------------

describe('syncEntitlement — 401 and the bounded session renewal', () => {
  it('401 then renewal succeeds: exactly ONE re-invocation, then the answer is returned', async () => {
    invokeMock
      .mockResolvedValueOnce(httpError(401, { synced: false, tier: 'free', reason: 'unauthenticated' }))
      .mockResolvedValueOnce({ data: okBody('premium'), error: null });
    renewalOk();

    const result = await syncEntitlement();

    expect(result).toEqual({ ok: true, tier: 'premium' });
    expect(invokeMock).toHaveBeenCalledTimes(2); // the call + the single retry
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('401 then renewal impossible: unauthenticated, NO second invocation, nothing granted', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(401, { synced: false, tier: 'free', reason: 'unauthenticated' }),
    );
    renewalFails();

    const result = await syncEntitlement();

    expect(result).toEqual({ ok: false, code: 'unauthenticated' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('a SECOND 401 after a successful renewal is terminal — the renewal budget is one', async () => {
    invokeMock
      .mockResolvedValueOnce(httpError(401, { reason: 'unauthenticated' }))
      .mockResolvedValueOnce(httpError(401, { reason: 'unauthenticated' }));
    renewalOk();

    const result = await syncEntitlement();

    expect(result).toEqual({ ok: false, code: 'unauthenticated' });
    expect(invokeMock).toHaveBeenCalledTimes(2); // never 3: no loop, ever
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });
});

// ---- 4. 429 and its cooldown ---------------------------------------------

describe('syncEntitlement — 429', () => {
  it('429 is classified rate_limited and triggers NO retry', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(429, { synced: false, tier: 'free', reason: 'rate_limited' }),
    );

    const result = await syncEntitlement();

    expect(result).toEqual({ ok: false, code: 'rate_limited' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });
});

describe('SyncCooldown — the UX mirror of the 30 s window', () => {
  it('active right after a 429, shows 30 seconds', () => {
    const cd = new SyncCooldown();
    expect(cd.isActive()).toBe(false); // idle before any 429
    cd.start();
    expect(cd.isActive()).toBe(true);
    expect(cd.remainingSeconds()).toBe(SYNC_RETRY_COOLDOWN_MS / 1000);
  });

  it('button window lapses after 30 s (fake timers) and NOTHING fires at zero', async () => {
    vi.useFakeTimers();
    invokeMock.mockResolvedValueOnce(
      httpError(429, { synced: false, tier: 'free', reason: 'rate_limited' }),
    );

    const result = await syncEntitlement();
    expect(result).toEqual({ ok: false, code: 'rate_limited' });

    const cd = new SyncCooldown();
    cd.start();

    vi.setSystemTime(Date.now() + 29_000);
    expect(cd.isActive()).toBe(true); // still waiting at +29 s
    expect(cd.remainingSeconds()).toBe(1);

    vi.advanceTimersByTime(1_000); // +30 s total
    expect(cd.isActive()).toBe(false); // available again...
    expect(cd.remainingSeconds()).toBe(0);

    // ...and availability triggers no call of its own: the invoke count is
    // still exactly the one 429'd attempt.
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});

// ---- 5. 502 / 503 / network / malformed ----------------------------------

describe('syncEntitlement — honest retryable failures', () => {
  it('502 -> revenuecat_unavailable', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(502, { synced: false, tier: 'free', reason: 'revenuecat_unavailable' }),
    );
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'revenuecat_unavailable' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('503 state_unavailable', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(503, { synced: false, tier: 'free', reason: 'state_unavailable' }),
    );
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'state_unavailable' });
  });

  it('503 config_error', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(503, { synced: false, tier: 'free', reason: 'config_error' }),
    );
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'config_error' });
  });

  it('transport failure (no context) -> network', async () => {
    invokeMock.mockResolvedValueOnce(transportError());
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'network' });
  });

  it('thrown invoke -> network', async () => {
    invokeMock.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'network' });
  });

  it('malformed/unreadable body -> server', async () => {
    // A 503 whose body is not JSON: json() rejects, classification must fall
    // to 'server' — never a guess, never a grant.
    const bad = {
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: new Response('<<not-json>>', { status: 503 }),
      },
    };
    invokeMock.mockResolvedValueOnce(bad);
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'server' });
  });

  it('200 with an unknown reason -> server', async () => {
    invokeMock.mockResolvedValueOnce({ data: { synced: false, reason: 'something_new' }, error: null });
    expect(await syncEntitlement()).toEqual({ ok: false, code: 'server' });
  });
});

// ---- 6. single-flight -----------------------------------------------------

describe('syncEntitlement — single-flight', () => {
  it('a double tap (two concurrent calls) is ONE edge invocation with one shared result', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    invokeMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const p1 = syncEntitlement();
    const p2 = syncEntitlement();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledTimes(1); // the second caller JOINED

    resolveFirst({ data: okBody('free'), error: null });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(r1).toEqual({ ok: true, tier: 'free' });
  });

  it('the in-flight slot is released after completion — a later tap invokes again', async () => {
    invokeMock.mockResolvedValueOnce({ data: okBody('free'), error: null });
    await syncEntitlement();

    invokeMock.mockResolvedValueOnce({ data: okBody('free'), error: null });
    await syncEntitlement();

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

// ---- 7. no failure is an authorization ------------------------------------

describe('syncEntitlement — fail-closed invariant', () => {
  it('NO failure outcome carries a tier or ok:true', async () => {
    const cases: { setup: () => void; expectedCode: string }[] = [
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(401, { reason: 'unauthenticated' })), expectedCode: 'unauthenticated' },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(429, { reason: 'rate_limited' })), expectedCode: 'rate_limited' },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(502, { reason: 'revenuecat_unavailable' })), expectedCode: 'revenuecat_unavailable' },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(503, { reason: 'state_unavailable' })), expectedCode: 'state_unavailable' },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(503, { reason: 'config_error' })), expectedCode: 'config_error' },
      { setup: () => invokeMock.mockResolvedValueOnce(transportError()), expectedCode: 'network' },
      { setup: () => invokeMock.mockResolvedValueOnce({ data: null, error: null }), expectedCode: 'server' },
    ];

    for (const { setup, expectedCode } of cases) {
      setup();
      renewalFails(); // any 401 path stays budgeted
      const result: EntitlementSync = await syncEntitlement();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(expectedCode);
        expect('tier' in result).toBe(false); // an error never carries a tier
      }
    }
  });
});
