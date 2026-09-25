// JUNO-06 blocage 1 — execute the REAL premium-tarot-reading edge contract.
//
// The tarot reading became a server artifact so the corpus could leave the
// APK. Three things must be proven on real bytes, not on a fixture:
//
//   1. DRIFT IS IMPOSSIBLE: the committed artifact (tarot.generated.ts, what
//      the edge imports) draws EXACTLY what packages/shared draws — same
//      seed, same cards, same meanings, same fallback flag. The bundle is
//      generated from the single source; this suite executes both and
//      compares. (validate:edge-tarot regenerates and sha-compares the TEXT;
//      this compares the BEHAVIOUR end to end.)
//   2. THE GATE IS THE EDGE'S: authorization happens inside the function,
//      fails closed on every failure, and a refusal returns premium_required
//      with NO reading bytes attached.
//   3. THE DECISION RUNS AS THE CALLER (2026-09-25 revision): the first
//      version called the enforce RPC on a module-level anon client, so
//      PostgREST executed it under the revoked-for role and every reader got
//      503. supabase-js rpc() options accept only {head, get, count} — a
//      `headers` third argument is IGNORED — so the caller's JWT must ride on
//      a REQUEST-SCOPED client. The behavioural block below executes the real
//      handler with the real npm supabase-js (2.114.0, the pinned edge
//      version) against an intercepted transport and proves: the RPC request
//      leaves with `Authorization: Bearer <the caller's JWT>` (never the anon
//      key), two concurrent requests never share a token, and every 401/402/
//      503 body carries no reading, card, or corpus bytes.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanupEdgeModules, loadEdgeModule, loadWholeModule, readRepoFile } from '../../testing/edge-source';
import { generateReading } from '../../tarot/index';

const EDGE_FILE = 'supabase/functions/premium-tarot-reading/index.ts';
const ARTIFACT_FILE = 'supabase/functions/premium-tarot-reading/tarot.generated.ts';

type ArtifactModule = {
  generateReading: typeof generateReading;
  DECK: ReadonlyArray<{ id: string }>;
  CORPUS_EN: { names: Record<string, string>; meanings: Record<string, unknown> };
  CORPUS_FR: { names: Record<string, string>; meanings: Record<string, unknown> };
};

type HandleRequest = (req: Request) => Promise<Response>;

const TEST_URL = 'http://edge-test.local';
const TEST_ANON = 'test-anon-key';

afterEach(() => {
  cleanupEdgeModules();
  vi.unstubAllGlobals();
});

async function loadArtifact(): Promise<ArtifactModule> {
  // The artifact is dependency-free ESM TypeScript with no Deno global at
  // the top level — exactly what loadWholeModule exists for.
  return loadWholeModule<ArtifactModule>(ARTIFACT_FILE, 'tarot-generated-artifact');
}

describe('premium-tarot-reading · the artifact IS the shared engine', () => {
  it('same (user, mode, period, now) → identical reading, card for card, meaning for meaning', async () => {
    const artifact = await loadArtifact();
    for (const period of ['weekly', 'monthly'] as const) {
      for (const mode of ['love', 'general'] as const) {
        const shared = generateReading({
          userId: '11111111-1111-4111-8111-111111111111',
          mode,
          period,
          locale: 'fr',
          now: new Date('2026-09-23T12:00:00Z'),
        });
        const bundled = artifact.generateReading({
          userId: '11111111-1111-4111-8111-111111111111',
          mode,
          period,
          locale: 'fr',
          now: new Date('2026-09-23T12:00:00Z'),
        });
        expect(bundled).toEqual(shared);
      }
    }
  });

  it('the locale never changes the draw — switching language translates, never re-deals', async () => {
    const artifact = await loadArtifact();
    const en = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'en',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    const fr = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'fr',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    expect(fr.cards.map((c) => c.card.id)).toEqual(en.cards.map((c) => c.card.id));
    expect(fr.cards.map((c) => c.card.reversed)).toEqual(en.cards.map((c) => c.card.reversed));
    // And the six non-written locales fall back to English, flagged honestly.
    const de = artifact.generateReading({
      userId: '22222222-2222-4222-8222-222222222222',
      mode: 'love',
      period: 'weekly',
      locale: 'de',
      now: new Date('2026-09-23T12:00:00Z'),
    });
    expect(de.isFallback).toBe(true);
    expect(de.cards[0]!.card.meaning).toBe(en.cards[0]!.card.meaning);
  });

  it('the artifact carries the full deck and both written corpora — nothing was trimmed in bundling', async () => {
    const artifact = await loadArtifact();
    expect(artifact.DECK).toHaveLength(78);
    expect(Object.keys(artifact.CORPUS_EN.names)).toHaveLength(78);
    expect(Object.keys(artifact.CORPUS_FR.names)).toHaveLength(78);
    // And it is dependency-free: no URL import survived the bundling.
    const text = readRepoFile(ARTIFACT_FILE);
    expect(text).not.toMatch(/from\s+'https?:/);
    expect(text).not.toMatch(/@supabase|astronomy-engine|luxon|tz-lookup/);
  });
});

describe('premium-tarot-reading · the edge contract (structural, on the real source)', () => {
  const src = readRepoFile(EDGE_FILE);

  it('THE decision is inside the edge, before any reading is produced', () => {
    expect(src).toMatch(/enforce_premium_feature/);
    // enforce runs BEFORE generateReading in the file's control flow.
    expect(src.indexOf('enforce_premium_feature')).toBeLessThan(src.indexOf('generateReading('));
  });

  it('a refusal is 402 premium_required and reaches the client BEFORE any draw', () => {
    // The refusal payload names premium_required, and the only producer call
    // sits strictly after the refusal branch: a 402 reader never receives
    // reading bytes, and nothing draws before the server says yes.
    const refusal = src.indexOf("error: 'premium_required'");
    const draw = src.indexOf('generateReading(');
    expect(refusal).toBeGreaterThan(-1);
    expect(draw).toBeGreaterThan(refusal);
    // The refusal's JSON payload carries no cards array.
    const refusalBlock = src.slice(refusal, refusal + 260);
    expect(refusalBlock).not.toMatch(/cards|reading/);
  });

  it('fails closed when the decision cannot be reached (503, no fallback draw)', () => {
    expect(src).toMatch(/decision_unavailable/);
    // No local re-deal exists anywhere: the only producer is the call that
    // follows the server's yes.
    const draws = src.match(/generateReading\(/g);
    expect(draws).toHaveLength(1);
  });

  it('the seed identity is the authenticated user, never a body parameter', () => {
    expect(src).toMatch(/userId:\s*user\.id/);
    expect(src).not.toMatch(/body\.userId|body\.user_id|p_user_id/);
  });

  it('answers the free-preview fact so the client can show the honest banner', () => {
    expect(src).toMatch(/viaFreePreview/);
    expect(src).toMatch(/d\.reason === 'free_preview'/);
  });

  it('serves no CORS header (RN transport, like sync-entitlement and get-profile-chart)', () => {
    expect(src).not.toMatch(/Access-Control-Allow-Origin/);
  });

  it('imports the COMMITTED artifact, not the package — deploy-time bundling cannot drift', () => {
    expect(src).toMatch(/from '\.\/tarot\.generated\.ts'/);
    expect(src).not.toMatch(/@astro\/shared/);
  });

  // ── 2026-09-25 revision probes ────────────────────────────────────────────
  it('pins the supabase-js import to the exact tested version (no floating @2)', () => {
    expect(src).toMatch(/esm\.sh\/@supabase\/supabase-js@2\.114\.0/);
    expect(src).not.toMatch(/@supabase\/supabase-js@2(?!\.114\.0)/);
  });

  it('creates the client INSIDE the request handler — no module-level client', () => {
    const clientAt = src.indexOf('createClient(');
    const handlerAt = src.indexOf('handleRequest');
    expect(clientAt).toBeGreaterThan(handlerAt);
    expect(src.match(/createClient\(/g)).toHaveLength(1);
  });

  it('the caller JWT rides on the REQUEST client global headers, from the local authHeader', () => {
    expect(src).toMatch(/global:\s*\{\s*headers:\s*\{\s*Authorization:\s*authHeader\s*,?\s*\}\s*,?\s*\}/);
  });

  it('rpc() carries no third-argument headers — that API does not exist and would be ignored', () => {
    const rpcAt = src.indexOf("requestClient.rpc(");
    expect(rpcAt).toBeGreaterThan(-1);
    const call = src.slice(rpcAt, rpcAt + 320);
    expect(call).not.toMatch(/headers/);
  });

  it('never reads the service-role key, and holds no module-level mutable auth state', () => {
    expect(src).not.toMatch(/SERVICE_ROLE/i);
    expect(src).not.toMatch(/^let\s+[A-Za-z_$]*(auth|jwt|token)/im);
    expect(src).not.toMatch(/let\s+\w*(Auth|Jwt|Token)\b/);
  });

  it('comments tell the CURRENT truth: no free-preview-per-day claim while M1c is not applied', () => {
    expect(src).not.toMatch(/free preview[^.\n]{0,40}1\s*\/\s*day/i);
    expect(src).not.toMatch(/1\s*\/\s*day[^.\n]{0,40}free preview/i);
  });

  it('Deno.serve wires the exported handler and nothing else', () => {
    expect(src).toMatch(/Deno\.serve\(async \(req\) => handleRequest\(req\)\);/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOURAL: the real handler bytes, the real npm supabase-js (the version
// the edge pins), an intercepted transport. What leaves the process is
// asserted, not what the source looks like.
// ─────────────────────────────────────────────────────────────────────────────

type RecordedCall = { url: string; headers: Headers; body?: string };

describe('premium-tarot-reading · the decision runs as the caller (behavioural)', () => {
  let artifact: ArtifactModule;
  let handleRequest: HandleRequest;
  let drawSpy: ReturnType<typeof vi.fn>;
  let calls: RecordedCall[];
  let rpcDecision: unknown;
  let rpcError: boolean;

  /** Install the transport interceptor. Call before each request. */
  function stubTransport(user: { id: string } | null, delayRpc?: (deliver: () => void) => void) {
    calls = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      let bodyText: string | undefined;
      if (init?.body) bodyText = String(init.body);
      calls.push({ url, headers, body: bodyText });

      if (url.endsWith('/auth/v1/user')) {
        if (!user) return new Response(JSON.stringify({ message: 'bad JWT' }), { status: 401 });
        return new Response(
          JSON.stringify({ id: user.id, aud: 'authenticated', role: 'authenticated' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/rest/v1/rpc/enforce_premium_feature')) {
        if (delayRpc) {
          return new Promise<Response>((resolve) => {
            delayRpc(() => resolve(rpcResponse()));
          });
        }
        return rpcResponse();
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  function rpcResponse(): Response {
    if (rpcError) return new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 });
    return new Response(JSON.stringify(rpcDecision), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function request(jwt: string | null, body = { period: 'monthly', mode: 'love', locale: 'en' }) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (jwt) headers.Authorization = `Bearer ${jwt}`;
    return new Request('https://edge.local/functions/v1/premium-tarot-reading', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  function rpcCalls(): RecordedCall[] {
    return calls.filter((c) => c.url.includes('/rest/v1/rpc/enforce_premium_feature'));
  }

  beforeAll(async () => {
    artifact = await loadArtifact();
    // The handler imports generateReading from the artifact at module scope;
    // we hand it the REAL one behind a spy so the suite can also prove the
    // draw never happens on a refusal.
    drawSpy = vi.fn((...args: Parameters<typeof generateReading>) =>
      artifact.generateReading(...(args as [never])),
    );
    (globalThis as Record<string, unknown>).__TAROT_EDGE_ENV__ = {
      SUPABASE_URL: TEST_URL,
      SUPABASE_ANON_KEY: TEST_ANON,
    };
    (globalThis as Record<string, unknown>).__TAROT_EDGE_ARTIFACT__ = { generateReading: drawSpy };
    const mod = await loadEdgeModule<{ handleRequest: HandleRequest; fail: unknown; CORS: unknown }>({
      file: EDGE_FILE,
      declarations: ['CORS', 'fail', 'handleRequest'],
      label: 'tarot-edge-handler',
      preamble: [
        // The REAL npm supabase-js — the same major/minor the edge pins in
        // its Deno import; the transport it drives is intercepted below.
        `import { createClient } from '@supabase/supabase-js';`,
        `const __env = (globalThis.__TAROT_EDGE_ENV__ ??= {});`,
        `const Deno = { env: { get: (k) => __env[k] } };`,
        `const generateReading = globalThis.__TAROT_EDGE_ARTIFACT__.generateReading;`,
      ],
    });
    handleRequest = mod.handleRequest;
  });

  afterEach(() => {
    rpcError = false;
    rpcDecision = undefined;
    drawSpy.mockClear();
  });

  it('405 on GET', async () => {
    stubTransport({ id: 'u' });
    const res = await handleRequest(new Request('https://edge.local/', { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('401 without an Authorization header', async () => {
    stubTransport({ id: 'u' });
    const res = await handleRequest(request(null));
    expect(res.status).toBe(401);
    const payload = await res.json();
    expect(payload).toEqual({ success: false, error: 'unauthenticated' });
  });

  it('500 config_error when the environment is not provisioned', async () => {
    stubTransport({ id: 'u' });
    const env = (globalThis as Record<string, unknown>).__TAROT_EDGE_ENV__ as Record<string, string>;
    const saved = { ...env };
    env.SUPABASE_URL = '';
    try {
      const res = await handleRequest(request('jwt-a'));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ success: false, error: 'config_error' });
    } finally {
      Object.assign(env, saved);
    }
  });

  it('THE REGRESSION: the RPC leaves with the CALLER JWT, not the anon key', async () => {
    rpcDecision = [{ allowed: false, reason: 'insufficient_tier', current_count: 0 }];
    stubTransport({ id: '11111111-1111-4111-8111-111111111111' });
    const res = await handleRequest(request('caller-jwt-value'));
    expect(res.status).toBe(402);

    const rpc = rpcCalls();
    expect(rpc).toHaveLength(1);
    // apikey stays the public anon key; authorization is the CALLER's bearer.
    expect(rpc[0]!.headers.get('apikey')).toBe(TEST_ANON);
    expect(rpc[0]!.headers.get('authorization')).toBe('Bearer caller-jwt-value');
  });

  it('free refusal → 402 premium_required, no reading bytes, and NO draw anywhere', async () => {
    rpcDecision = [{ allowed: false, reason: 'insufficient_tier', current_count: 0 }];
    stubTransport({ id: '11111111-1111-4111-8111-111111111111' });
    const res = await handleRequest(request('jwt-a'));
    expect(res.status).toBe(402);
    const text = await res.text();
    expect(text).toContain('premium_required');
    expect(text).not.toMatch(/cards|reading|meaning|isFallback/);
    expect(drawSpy).not.toHaveBeenCalled();
    expect(rpcCalls()).toHaveLength(1); // exactly one enforce per request
  });

  it('RPC failure → 503 decision_unavailable, no fallback draw', async () => {
    rpcError = true;
    stubTransport({ id: '11111111-1111-4111-8111-111111111111' });
    const res = await handleRequest(request('jwt-a'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, error: 'decision_unavailable' });
    expect(drawSpy).not.toHaveBeenCalled();
  });

  it('paid allowed → 200, the full reading, viaFreePreview=false, seeded by auth.uid', async () => {
    rpcDecision = [{ allowed: true, reason: 'ok', current_count: 1 }];
    stubTransport({ id: '33333333-3333-4333-8333-333333333333' });
    const res = await handleRequest(request('jwt-paid', { period: 'monthly', mode: 'love', locale: 'fr' }));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      success: boolean;
      viaFreePreview: boolean;
      reading: Awaited<ReturnType<typeof generateReading>>;
    };
    expect(payload.success).toBe(true);
    // Current catalogue: previews are NULL, so a paid grant is never a preview.
    expect(payload.viaFreePreview).toBe(false);
    expect(payload.reading.cards).toHaveLength(3);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    // Seed identity is auth.uid() — the id from getUser, never the body.
    expect(drawSpy.mock.calls[0]![0]).toMatchObject({
      userId: '33333333-3333-4333-8333-333333333333',
      mode: 'love',
      period: 'monthly',
      locale: 'fr',
    });
    // And the RPC asked for the monthly key on the monthly period.
    const rpc = rpcCalls();
    expect(rpc[0]!.body).toContain('tarot_monthly');
  });

  it('weekly maps to tarot_cosmic', async () => {
    rpcDecision = [{ allowed: false, reason: 'insufficient_tier', current_count: 0 }];
    stubTransport({ id: '11111111-1111-4111-8111-111111111111' });
    await handleRequest(request('jwt-a', { period: 'weekly' }));
    expect(rpcCalls()[0]!.body).toContain('tarot_cosmic');
  });

  it('invalid JSON body → 400', async () => {
    stubTransport({ id: '11111111-1111-4111-8111-111111111111' });
    const req = new Request('https://edge.local/', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt-a', 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(400);
  });

  it('two concurrent requests NEVER share an Authorization (request-scoped client)', async () => {
    rpcDecision = [{ allowed: false, reason: 'insufficient_tier', current_count: 0 }];
    // Hold both RPCs until both requests have arrived, then let them race:
    // a module-level client (or mutable JWT) would mix the tokens here.
    let arrived = 0;
    const release: (() => void)[] = [];
    const barrier = (deliver: () => void) => {
      release.push(deliver);
      arrived += 1;
      if (arrived === 2) release.forEach((d) => d());
    };
    stubTransport({ id: '44444444-4444-4444-8444-444444444444' }, barrier);

    const [resA, resB] = await Promise.all([
      handleRequest(request('jwt-A')),
      handleRequest(request('jwt-B')),
    ]);
    expect(resA.status).toBe(402);
    expect(resB.status).toBe(402);

    const rpc = rpcCalls();
    expect(rpc).toHaveLength(2);
    const auths = rpc.map((c) => c.headers.get('authorization')).sort();
    expect(auths).toEqual(['Bearer jwt-A', 'Bearer jwt-B']);
    expect(auths).not.toContain(`Bearer ${TEST_ANON}`);
  });
});
