/**
 * JUNO-06 PR B — behavior suite for the hardened premium-tarot-reading client.
 *
 * Under test: the REAL production code — services/serverTarot.ts
 * (fetchTarotReading + classifyTarotHttpError) and utils/tarotController.ts —
 * plus utils/sessionRenewal.ts through it. Only the Supabase boundary is
 * mocked, and it mirrors the installed supabase-js surface exactly:
 *
 *   * functions.invoke RESOLVES { data, error } for a 2xx and for a resolved
 *     FunctionsFetchError, and THROWS FunctionsHttpError for a non-2xx edge
 *     answer — with the raw Response in `.context` (functions-js 2.114.0's
 *     documented shape; premium-reprise canaries prove the suite depends on
 *     the real module, not a copy).
 *   * auth.refreshSession is the 401-renewal primitive.
 *
 * The contract asserted (and defended by the PR B canaries):
 *   - every HTTP answer maps to the edge's own vocabulary (status primary,
 *     body reason only refines 402); malformed bodies degrade, never throw;
 *   - 401 earns at most ONE renewal and ONE re-invocation — no loop;
 *   - no failure ever carries a reading/cards/meaning/tier — an error is
 *     never an authorization and never premium content;
 *   - single-flight: identical concurrent calls = ONE edge invocation;
 *   - the controller drops stale and post-unmount answers, and a 402 never
 *     routes to onSuccess.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyTarotHttpError,
  fetchTarotReading,
  type ServerTarotReading,
  type TarotFetch,
} from '../../services/serverTarot';
import { createTarotScreenController } from '../../utils/tarotController';

const invokeMock = vi.fn();
const refreshSessionMock = vi.fn();

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

// ---- helpers ---------------------------------------------------------------

function validReading(overrides?: Partial<ServerTarotReading>): ServerTarotReading {
  return {
    mode: 'love',
    period: 'monthly',
    locale: 'en',
    seed: 'seed-1',
    generatedAt: '2026-09-28T00:00:00Z',
    isFallback: false,
    cards: [
      {
        position: 'present',
        card: {
          id: 'the-star',
          imageFile: 'the-star.jpg',
          name: 'The Star',
          reversed: false,
          meaning: 'A calm, honest hope.',
          isFallback: false,
        },
      },
    ],
    ...overrides,
  };
}

function ok200(reading: ServerTarotReading, viaFreePreview = false) {
  return { data: { success: true, reading, viaFreePreview }, error: null };
}

/** A non-2xx edge answer, as supabase-js surfaces it (throw + context). */
function httpError(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    data: null,
    error: {
      name: 'FunctionsHttpError',
      context: new Response(
        body === undefined ? null : JSON.stringify(body),
        { status, headers: { 'Content-Type': 'application/json', ...headers } },
      ),
    },
  };
}

/** A resolved transport failure: no HTTP answer, therefore no context. */
function transportError() {
  return { data: null, error: { name: 'FunctionsFetchError', message: 'boom' } };
}

const renewalOk = () =>
  refreshSessionMock.mockResolvedValueOnce({
    data: { session: { access_token: 'renewed' } },
    error: null,
  });

/** Every distinct renewal-failure shape. */
const renewalFailures = {
  error: () =>
    refreshSessionMock.mockResolvedValueOnce({ data: { session: null }, error: { message: 'no' } }),
  noSession: () =>
    refreshSessionMock.mockResolvedValueOnce({ data: { session: null }, error: null }),
  noToken: () =>
    refreshSessionMock.mockResolvedValueOnce({
      data: { session: { access_token: '' } },
      error: null,
    }),
};

beforeEach(() => {
  invokeMock.mockReset();
  refreshSessionMock.mockReset();
});

// ---- 1. pure classification -------------------------------------------------

describe('classifyTarotHttpError (the HTTP contract)', () => {
  it('maps the edge vocabulary: 401/402/429/400/405/500/503, unknown -> server', () => {
    expect(classifyTarotHttpError(401, null)).toEqual({ ok: false, code: 'unauthenticated' });
    expect(classifyTarotHttpError(402, { error: 'premium_required', reason: 'insufficient_tier' })).toEqual({
      ok: false,
      code: 'premium_required',
      reason: 'insufficient_tier',
    });
    expect(classifyTarotHttpError(429, null)).toEqual({ ok: false, code: 'rate_limited' });
    expect(classifyTarotHttpError(400, { error: 'invalid_body' })).toEqual({ ok: false, code: 'invalid_body' });
    expect(classifyTarotHttpError(405, { error: 'method_not_allowed' })).toEqual({ ok: false, code: 'method_not_allowed' });
    expect(classifyTarotHttpError(500, { error: 'config_error' })).toEqual({ ok: false, code: 'config_error' });
    expect(classifyTarotHttpError(503, { error: 'decision_unavailable' })).toEqual({ ok: false, code: 'decision_unavailable' });
    expect(classifyTarotHttpError(418, null)).toEqual({ ok: false, code: 'server' });
  });

  it('402 defaults its bounded reason to insufficient_tier and passes the server one through', () => {
    expect(classifyTarotHttpError(402, null)).toEqual({
      ok: false,
      code: 'premium_required',
      reason: 'insufficient_tier',
    });
    const refined = classifyTarotHttpError(402, {
      error: 'premium_required',
      reason: 'free_preview_exhausted',
    }) as Extract<TarotFetch, { ok: false }>;
    expect(refined.reason).toBe('free_preview_exhausted');
  });

  it('429 surfaces Retry-After seconds as a bounded display hint only', () => {
    expect(classifyTarotHttpError(429, null, 30)).toEqual({
      ok: false,
      code: 'rate_limited',
      retryAfterSeconds: 30,
    });
    // No hint, no field — never an invented business delay.
    expect(classifyTarotHttpError(429, null)).not.toHaveProperty('retryAfterSeconds');
  });
});

// ---- 2. success 200 ---------------------------------------------------------

describe('fetchTarotReading — 200 answers', () => {
  it('monthly 200: ok with the server reading; the body carries period verbatim (no client-side key mapping)', async () => {
    invokeMock.mockResolvedValueOnce(ok200(validReading()));
    const result = await fetchTarotReading('monthly', 'love', 'en');
    expect(result).toEqual({ ok: true, reading: validReading(), viaFreePreview: false });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toEqual('premium-tarot-reading');
    // The client maps NOTHING: weekly/monthly travel verbatim; the
    // tarot_cosmic/tarot_monthly mapping lives in the edge alone.
    expect(invokeMock.mock.calls[0][1]).toEqual({ body: { period: 'monthly', mode: 'love', locale: 'en' } });
  });

  it('weekly 200: ok, viaFreePreview preserved', async () => {
    invokeMock.mockResolvedValueOnce(ok200(validReading({ period: 'weekly' }), true));
    const result = await fetchTarotReading('weekly', 'love', 'en');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reading.period).toBe('weekly');
      expect(result.reading.seed).toBe('seed-1');
      expect(result.reading.cards).toHaveLength(1);
      expect(result.reading.isFallback).toBe(false);
      expect(result.viaFreePreview).toBe(true);
    }
  });

  it('malformed 200 bodies are controlled refusals, never partial readings', async () => {
    const malformed = [
      ok200({ ...validReading(), cards: [] }),                        // empty spread
      ok200({ ...validReading(), period: 'weekly' }),                 // period mismatch
      ok200({
        ...validReading(),
        cards: [{
          position: 'present',
          card: { ...validReading().cards[0].card, meaning: '' },     // empty meaning
        }],
      }),
      ok200({ ...validReading(), seed: 42 as unknown as string }),    // wrong type
    ];
    for (const answer of malformed) {
      invokeMock.mockResolvedValueOnce(answer);
      const result = await fetchTarotReading('monthly', 'love', 'en');
      expect(result).toEqual({ ok: false, code: 'server' });
    }
  });
});

// ---- 3. the 401 bounded renewal ---------------------------------------------

describe('fetchTarotReading — 401 and the bounded session renewal', () => {
  it('401 then renewal success then 200: exactly two invocations, one refresh, the renewed session is used', async () => {
    invokeMock
      .mockResolvedValueOnce(httpError(401, { success: false, error: 'unauthenticated' }))
      .mockResolvedValueOnce(ok200(validReading()));
    renewalOk();

    const result = await fetchTarotReading('monthly', 'love', 'en');

    expect(result.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);   // the call + the single retry
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('a second 401 after a successful renewal is TERMINAL — no third invocation, refresh budget is one', async () => {
    invokeMock
      .mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' }))
      .mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' }));
    renewalOk();

    const result = await fetchTarotReading('monthly', 'love', 'en');

    expect(result).toEqual({ ok: false, code: 'unauthenticated' });
    expect(invokeMock).toHaveBeenCalledTimes(2);   // never 3: no loop, ever
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('renewal returning an error stops the flow: unauthenticated, one invocation', async () => {
    invokeMock.mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' }));
    renewalFailures.error();
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'unauthenticated' });
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('renewal returning no session stops the flow', async () => {
    invokeMock.mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' }));
    renewalFailures.noSession();
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'unauthenticated' });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('renewal returning a session WITHOUT an access token stops the flow', async () => {
    invokeMock.mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' }));
    renewalFailures.noToken();
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'unauthenticated' });
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('NO other status triggers a refresh: 400/402/405/429/500/503 and transport never call refreshSession', async () => {
    const answers = [
      httpError(400, { error: 'invalid_body' }),
      httpError(402, { error: 'premium_required', reason: 'insufficient_tier' }),
      httpError(405, { error: 'method_not_allowed' }),
      httpError(429, null),
      httpError(500, { error: 'config_error' }),
      httpError(503, { error: 'decision_unavailable' }),
      transportError(),
    ];
    for (const answer of answers) {
      invokeMock.mockResolvedValueOnce(answer);
      await fetchTarotReading('monthly', 'love', 'en');
    }
    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledTimes(7); // one per answer, no retries
  });
});

// ---- 4. statuses ------------------------------------------------------------

describe('fetchTarotReading — status mapping', () => {
  it('402 premium_required with the real reason and zero premium fields exposed', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(402, { success: false, error: 'premium_required', reason: 'insufficient_tier' }),
    );
    const result = await fetchTarotReading('monthly', 'love', 'en');
    expect(result).toEqual({ ok: false, code: 'premium_required', reason: 'insufficient_tier' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('reading');
    expect(serialized).not.toContain('cards');
    expect(serialized).not.toContain('meaning');
    expect(serialized).not.toContain('"tier":');
  });

  it('429 rate_limited: no retry, and a parseable Retry-After rides as a display hint', async () => {
    invokeMock.mockResolvedValueOnce(httpError(429, null, { 'retry-after': '30' }));
    const result = await fetchTarotReading('monthly', 'love', 'en');
    expect(result).toEqual({ ok: false, code: 'rate_limited', retryAfterSeconds: 30 });
    expect(invokeMock).toHaveBeenCalledTimes(1); // no automatic retry
  });

  it('503 decision_unavailable and 500 config_error are distinct honest failures', async () => {
    invokeMock.mockResolvedValueOnce(httpError(503, { error: 'decision_unavailable' }));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'decision_unavailable' });
    invokeMock.mockResolvedValueOnce(httpError(500, { error: 'config_error' }));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'config_error' });
  });

  it('400 and 405 are controlled non-granting failures', async () => {
    invokeMock.mockResolvedValueOnce(httpError(400, { error: 'invalid_body' }));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'invalid_body' });
    invokeMock.mockResolvedValueOnce(httpError(405, { error: 'method_not_allowed' }));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'method_not_allowed' });
  });

  it('a resolved SDK transport error maps to network (no context to read)', async () => {
    invokeMock.mockResolvedValueOnce(transportError());
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'network' });
  });

  it('a thrown invoke maps to network', async () => {
    invokeMock.mockRejectedValueOnce(new Error('fetch failed'));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'network' });
  });

  it('a body-less 200 (data null) is a controlled server refusal', async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'server' });
  });

  it('a non-JSON error body degrades to status-only classification without throwing', async () => {
    const bad = {
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: new Response('<<not-json>>', { status: 503 }),
      },
    };
    invokeMock.mockResolvedValueOnce(bad);
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'decision_unavailable' });
  });
});

// ---- 5. single-flight -------------------------------------------------------

describe('fetchTarotReading — single-flight', () => {
  it('a double tap (two identical concurrent calls) is ONE edge invocation with one shared result', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );

    const p1 = fetchTarotReading('monthly', 'love', 'en');
    const p2 = fetchTarotReading('monthly', 'love', 'en');
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledTimes(1); // the second caller JOINED

    resolveFirst(ok200(validReading()));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(r1.ok).toBe(true);
  });

  it('the lock is released after an error — a later, intentional call invokes again', async () => {
    invokeMock.mockResolvedValueOnce(httpError(500, { error: 'config_error' }));
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'config_error' });

    invokeMock.mockResolvedValueOnce(ok200(validReading()));
    const second = await fetchTarotReading('monthly', 'love', 'en');
    expect(second.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it('different parameters are different requests (a mode switch is intentional, not merged)', async () => {
    invokeMock.mockResolvedValueOnce(ok200(validReading()));
    invokeMock.mockResolvedValueOnce(ok200(validReading({ mode: 'general' })));
    const [a, b] = await Promise.all([
      fetchTarotReading('monthly', 'love', 'en'),
      fetchTarotReading('monthly', 'general', 'en'),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

// ---- 6. the screen controller ----------------------------------------------

describe('createTarotScreenController', () => {
  function makeCallbacks() {
    const calls: string[] = [];
    return {
      calls,
      callbacks: {
        onPending: () => calls.push('pending'),
        onSuccess: (r: ServerTarotReading | null, v: boolean) => calls.push(`success:${v}:${r?.seed ?? 'null'}`),
        onPremiumRequired: () => calls.push('premium_required'),
        onFailure: (code: string) => calls.push(`failure:${code}`),
      },
    };
  }

  it('unmount (dispose) during the call: the late answer sets NOTHING', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const loadPromise = controller.load('monthly', 'love', 'en');
    expect(calls).toEqual(['pending']);
    controller.dispose(); // the screen unmounts before the answer lands
    resolveFirst(ok200(validReading()));
    await loadPromise;

    expect(calls).toEqual(['pending']); // no success, no failure, nothing
  });

  it('a stale answer can never overwrite a newer request: load A, load B, resolve A then B', async () => {
    let resolveA!: (v: { data: unknown; error: unknown }) => void;
    let resolveB!: (v: { data: unknown; error: unknown }) => void;
    invokeMock
      .mockImplementationOnce(() => new Promise((r) => { resolveA = r; }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));

    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const pa = controller.load('monthly', 'love', 'en');   // seq 1
    const pb = controller.load('monthly', 'general', 'en'); // seq 2 supersedes

    resolveA(ok200(validReading({ seed: 'STALE' })));
    await pa;
    expect(calls).toEqual(['pending', 'pending']); // A's answer dropped entirely

    resolveB(ok200(validReading({ mode: 'general', seed: 'FRESH' })));
    await pb;
    expect(calls).toEqual(['pending', 'pending', 'success:false:FRESH']);
  });

  it('a repeated Try Again before completion is one invocation and one outcome (no double consumption)', async () => {
    let resolveFirst!: (v: { data: unknown; error: unknown }) => void;
    invokeMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const p1 = controller.load('monthly', 'love', 'en');
    const p2 = controller.load('monthly', 'love', 'en'); // the impatient double tap
    await Promise.resolve();
    await Promise.resolve();

    resolveFirst(ok200(validReading()));
    await Promise.all([p1, p2]);

    expect(invokeMock).toHaveBeenCalledTimes(1);           // single-flight
    expect(calls.filter((c) => c.startsWith('success'))).toHaveLength(1); // one outcome
  });

  it('402 routes to onPremiumRequired only — never onSuccess, no premium byte', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(402, { success: false, error: 'premium_required', reason: 'insufficient_tier' }),
    );
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    await controller.load('monthly', 'love', 'en');
    expect(calls).toEqual(['pending', 'premium_required']);
  });

  it('every other failure routes to onFailure with its code', async () => {
    invokeMock.mockResolvedValueOnce(httpError(503, { error: 'decision_unavailable' }));
    const { calls, callbacks } = makeCallbacks();
    await createTarotScreenController(callbacks).load('monthly', 'love', 'en');
    expect(calls).toEqual(['pending', 'failure:decision_unavailable']);
  });
});

// ---- 7. the grant-free invariant --------------------------------------------

describe('fetchTarotReading — fail-closed invariant', () => {
  it('NO failure outcome transports a reading, cards, meanings or a tier', async () => {
    const cases: { setup: () => void; expected: unknown }[] = [
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(401, { error: 'unauthenticated' })), expected: { ok: false, code: 'unauthenticated' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(402, { error: 'premium_required', reason: 'insufficient_tier' })), expected: { ok: false, code: 'premium_required', reason: 'insufficient_tier' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(429, null)), expected: { ok: false, code: 'rate_limited' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(503, { error: 'decision_unavailable' })), expected: { ok: false, code: 'decision_unavailable' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(500, { error: 'config_error' })), expected: { ok: false, code: 'config_error' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(400, { error: 'invalid_body' })), expected: { ok: false, code: 'invalid_body' } },
      { setup: () => invokeMock.mockResolvedValueOnce(httpError(405, { error: 'method_not_allowed' })), expected: { ok: false, code: 'method_not_allowed' } },
      { setup: () => invokeMock.mockResolvedValueOnce(transportError()), expected: { ok: false, code: 'network' } },
      { setup: () => invokeMock.mockResolvedValueOnce({ data: null, error: null }), expected: { ok: false, code: 'server' } },
    ];

    for (const { setup, expected } of cases) {
      setup();
      renewalFailures.error(); // any 401 stays budgeted
      const result = await fetchTarotReading('monthly', 'love', 'en');
      expect(result).toEqual(expected);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('"reading"');
      expect(serialized).not.toContain('"cards"');
      expect(serialized).not.toContain('"meaning"');
      expect(serialized).not.toContain('"tier"');
      expect(serialized).not.toContain('"allowed"');
    }
  });

  it('no local fallback exists: every failure path is a refusal, and the only ok:true comes from a validated server payload', async () => {
    // A shapeless 200 is NOT ok — the client cannot assemble a reading itself.
    invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'server' });

    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    expect(await fetchTarotReading('monthly', 'love', 'en')).toEqual({ ok: false, code: 'server' });
  });
});
