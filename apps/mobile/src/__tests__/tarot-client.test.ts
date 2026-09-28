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

// ---- 6. the screen controller — the consumption lock -----------------------
//
// The controller's global slot is the product invariant: at most ONE
// premium-tarot-reading operation per screen instance, WHATEVER the
// parameters — the Edge decides and spends per INVOCATION, so a second
// concurrent invocation with different parameters would be a second
// consumption even though its answer would be dropped. Every concurrency
// test below counts the transport calls explicitly (never just the render).

describe('createTarotScreenController — consumption lock', () => {
  function makeCallbacks() {
    const calls: string[] = [];
    return {
      calls,
      callbacks: {
        onPending: () => calls.push('pending'),
        onSuccess: (r: ServerTarotReading | null, v: boolean) =>
          calls.push(`success:${v}:${r?.period}/${r?.mode}/${r?.seed}`),
        onPremiumRequired: () => calls.push('premium_required'),
        onFailure: (code: string) => calls.push(`failure:${code}`),
      },
    };
  }

  /** A controllable pending edge invocation (resolve becomes callable once
   *  the mock actually fires — the handle is a mutable object, never a
   *  value snapshot). */
  function deferredInvoke() {
    const handle: { resolve: (v: { data: unknown; error: unknown }) => void } = {
      resolve: () => {
        throw new Error('deferredInvoke resolved before the invocation started');
      },
    };
    invokeMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          handle.resolve = r;
        }),
    );
    return handle;
  }

  /** A controllable pending session renewal (same mutable-handle pattern). */
  function deferredRefresh() {
    const handle: { resolve: (v: unknown) => void } = {
      resolve: () => {
        throw new Error('deferredRefresh resolved before the refresh started');
      },
    };
    refreshSessionMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          handle.resolve = r;
        }),
    );
    return handle;
  }

  /** The exact bodies that reached the transport, in order. */
  const bodiesOnTheWire = () =>
    invokeMock.mock.calls.map((c: unknown[]) => (c[1] as { body: unknown }).body);

  const flush = () => new Promise((r) => { setTimeout(r, 0); });

  // (1) identical double tap
  it('two simultaneous calls with IDENTICAL parameters -> ONE edge invocation', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const p1 = controller.load('monthly', 'love', 'en');
    const p2 = controller.load('monthly', 'love', 'en');
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(bodiesOnTheWire()).toEqual([{ period: 'monthly', mode: 'love', locale: 'en' }]);

    d.resolve(ok200(validReading()));
    await Promise.all([p1, p2]);
    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });

  // (2, 3) period switches mid-flight
  it('monthly in flight, weekly attempted before resolution -> ONE total invocation', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const p1 = controller.load('monthly', 'love', 'en');
    const p2 = controller.load('weekly', 'love', 'en');
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(bodiesOnTheWire()).toEqual([{ period: 'monthly', mode: 'love', locale: 'en' }]);

    d.resolve(ok200(validReading()));
    await Promise.all([p1, p2]);
    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });

  it('weekly in flight, monthly attempted before resolution -> ONE total invocation', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    void controller.load('weekly', 'love', 'en');
    void controller.load('monthly', 'love', 'en');
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(bodiesOnTheWire()).toEqual([{ period: 'weekly', mode: 'love', locale: 'en' }]);

    d.resolve(ok200(validReading({ period: 'weekly' })));
    await flush();
    expect(calls).toEqual(['pending', 'success:false:weekly/love/seed-1']);
  });

  // (4) mode switch mid-flight
  it('mode change attempted before resolution -> ONE total invocation', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    void controller.load('monthly', 'love', 'en');
    void controller.load('monthly', 'general', 'en');
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(bodiesOnTheWire()).toEqual([{ period: 'monthly', mode: 'love', locale: 'en' }]);

    d.resolve(ok200(validReading()));
    await flush();
    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });

  // (5) locale switch mid-flight
  it('locale change attempted before resolution -> ONE total invocation', async () => {
    const d = deferredInvoke();
    const { callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    void controller.load('monthly', 'love', 'en');
    void controller.load('monthly', 'love', 'fr');
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(bodiesOnTheWire()).toEqual([{ period: 'monthly', mode: 'love', locale: 'en' }]);
    d.resolve(ok200(validReading()));
  });

  // (6) Try Again mid-flight
  it('Try Again pressed before resolution -> ONE total invocation (one potential consumption)', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const p1 = controller.load('monthly', 'love', 'en');
    const p2 = controller.load('monthly', 'love', 'en'); // the impatient retry
    await flush();

    expect(invokeMock).toHaveBeenCalledTimes(1);

    d.resolve(ok200(validReading()));
    await Promise.all([p1, p2]);
    expect(calls.filter((c) => c.startsWith('success'))).toHaveLength(1);
  });

  // (7, 8, 20) no deferred promise, nothing auto-fires, B never reaches the wire later
  it('resolution launches NOTHING automatically: no deferred request, no relaunch with the attempted parameters', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    void controller.load('monthly', 'love', 'en');
    void controller.load('weekly', 'general', 'fr'); // attempted mid-flight
    d.resolve(ok200(validReading()));
    await flush();
    await flush(); // let any hypothetical deferred/queued work fire

    expect(invokeMock).toHaveBeenCalledTimes(1); // still exactly the one call
    expect(bodiesOnTheWire()).toEqual([{ period: 'monthly', mode: 'love', locale: 'en' }]);
    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });

  // (9) after release, an explicit action launches exactly one new call
  it('after the flight, a NEW explicit action launches exactly one new invocation', async () => {
    const d1 = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const p1 = controller.load('monthly', 'love', 'en');
    d1.resolve(ok200(validReading()));
    await p1;
    expect(invokeMock).toHaveBeenCalledTimes(1);

    const d2 = deferredInvoke();
    const p2 = controller.load('weekly', 'general', 'fr'); // explicit new action
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(bodiesOnTheWire()[1]).toEqual({ period: 'weekly', mode: 'general', locale: 'fr' });

    d2.resolve(ok200(validReading({ period: 'weekly', mode: 'general', locale: 'fr' })));
    await p2;
    expect(calls).toEqual([
      'pending',
      'success:false:monthly/love/seed-1',
      'pending',
      'success:false:weekly/general/seed-1',
    ]);
  });

  // (10-14) the lock is released after EVERY failure shape — and never retried
  const releaseCases: { name: string; answer: () => { data: unknown; error: unknown }; }[] = [
    { name: '402 refusal', answer: () => httpError(402, { success: false, error: 'premium_required', reason: 'insufficient_tier' }) },
    { name: '429 (no retry)', answer: () => httpError(429, null) },
    { name: '500 config_error (no retry)', answer: () => httpError(500, { error: 'config_error' }) },
    { name: '503 decision_unavailable (no retry)', answer: () => httpError(503, { error: 'decision_unavailable' }) },
    { name: 'transport exception', answer: () => transportError() },
    { name: 'malformed 200', answer: () => ({ data: { success: true, reading: { period: 'monthly', cards: [] } }, error: null }) },
  ];
  for (const { name, answer } of releaseCases) {
    it(`the lock is released after a ${name} — a later explicit call works, nothing retried on its own`, async () => {
      invokeMock.mockResolvedValueOnce(answer());
      const { callbacks } = makeCallbacks();
      const controller = createTarotScreenController(callbacks);
      await controller.load('monthly', 'love', 'en');
      expect(invokeMock).toHaveBeenCalledTimes(1);

      await flush();
      await flush();
      expect(invokeMock).toHaveBeenCalledTimes(1); // no automatic retry

      invokeMock.mockResolvedValueOnce(ok200(validReading()));
      await controller.load('monthly', 'love', 'en'); // explicit new action
      expect(invokeMock).toHaveBeenCalledTimes(2);
    });
  }

  // (15, 16) the 401 renewal is ONE locked operation, captured params only
  it('401 -> refresh -> re-invocation is ONE locked operation: a mid-renewal parameter change launches nothing, both invocations carry the CAPTURED parameters', async () => {
    const d1 = deferredInvoke();
    const dRefresh = deferredRefresh();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const op = controller.load('monthly', 'love', 'en'); // invocation 1 (pending)
    d1.resolve(httpError(401, { success: false, error: 'unauthenticated' }));
    await flush(); // now waiting inside the renewal

    const attempted = controller.load('weekly', 'general', 'fr'); // mid-renewal change
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(1); // nothing launched

    const d2 = deferredInvoke();
    dRefresh.resolve({ data: { session: { access_token: 'renewed' } }, error: null });
    await flush();
    expect(invokeMock).toHaveBeenCalledTimes(2); // the single authorized re-invocation
    expect(bodiesOnTheWire()).toEqual([
      { period: 'monthly', mode: 'love', locale: 'en' }, // captured at departure —
      { period: 'monthly', mode: 'love', locale: 'en' }, // never the attempted weekly/fr
    ]);

    d2.resolve(ok200(validReading()));
    await Promise.all([op, attempted]);
    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });

  // (17) a second 401 is terminal AND releases the lock
  it('a second 401 ends the operation: no third invocation, lock released for the next explicit action', async () => {
    const d1 = deferredInvoke();
    const d2 = deferredInvoke();
    const { callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const op = controller.load('monthly', 'love', 'en'); // invocation 1 pending
    refreshSessionMock.mockResolvedValueOnce({
      data: { session: { access_token: 'renewed' } },
      error: null,
    });
    d1.resolve(httpError(401, { error: 'unauthenticated' }));
    await flush(); // renewal ok -> the single re-invocation starts (d2)

    d2.resolve(httpError(401, { error: 'unauthenticated' })); // second 401: terminal
    await op;

    expect(invokeMock).toHaveBeenCalledTimes(2); // never 3
    invokeMock.mockResolvedValueOnce(ok200(validReading()));
    await controller.load('monthly', 'love', 'en'); // explicit new action works
    expect(invokeMock).toHaveBeenCalledTimes(3);
  });

  // (18) unmount during the flight
  it('unmount (dispose) during the call: the late answer sets NOTHING and relaunches nothing', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    const loadPromise = controller.load('monthly', 'love', 'en');
    expect(calls).toEqual(['pending']);
    controller.dispose(); // the screen unmounts before the answer lands
    d.resolve(ok200(validReading()));
    await loadPromise;
    await flush();

    expect(calls).toEqual(['pending']); // no success, no failure, nothing
    expect(invokeMock).toHaveBeenCalledTimes(1); // and no relaunch
  });

  // (19) the rendered answer is the one actually launched
  it('the rendered reading carries the LAUNCHED request\u2019s captured parameters — never the attempted ones', async () => {
    const d = deferredInvoke();
    const { calls, callbacks } = makeCallbacks();
    const controller = createTarotScreenController(callbacks);

    void controller.load('monthly', 'love', 'en');    // launched
    void controller.load('weekly', 'general', 'fr');  // attempted mid-flight: no-op
    d.resolve(ok200(validReading()));                  // the monthly/love/en answer
    await flush();

    expect(calls).toEqual(['pending', 'success:false:monthly/love/seed-1']);
  });
});

// ---- 6b. the screen controller — routing -----------------------------------

describe('createTarotScreenController — outcome routing', () => {
  it('402 routes to onPremiumRequired only — never onSuccess, no premium byte', async () => {
    invokeMock.mockResolvedValueOnce(
      httpError(402, { success: false, error: 'premium_required', reason: 'insufficient_tier' }),
    );
    const calls: string[] = [];
    const controller = createTarotScreenController({
      onPending: () => calls.push('pending'),
      onSuccess: () => calls.push('success'),
      onPremiumRequired: () => calls.push('premium_required'),
      onFailure: (c) => calls.push(`failure:${c}`),
    });
    await controller.load('monthly', 'love', 'en');
    expect(calls).toEqual(['pending', 'premium_required']);
  });

  it('every other failure routes to onFailure with its code', async () => {
    invokeMock.mockResolvedValueOnce(httpError(503, { error: 'decision_unavailable' }));
    const calls: string[] = [];
    await createTarotScreenController({
      onPending: () => calls.push('pending'),
      onSuccess: () => calls.push('success'),
      onPremiumRequired: () => calls.push('premium_required'),
      onFailure: (c) => calls.push(`failure:${c}`),
    }).load('monthly', 'love', 'en');
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
