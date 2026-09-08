// JUNO-04 — what the marketing agent's edge function will and will not serve.
//
// WHY THIS SUITE EXISTS
// ---------------------
// `marketingagent/` held SUPABASE_SERVICE_ROLE_KEY in a plaintext .env on a
// workstation: a JWT valid until 2036 that bypasses RLS on every table
// (`profiles` with all its PII and birth data, `messages`) and can delete any
// account through the auth admin API. It used that key for four operations on
// one table and one bucket.
//
// The fix is not a rotation — that would replace one omnipotent credential with
// another omnipotent credential in the same file. The fix is that the agent now
// holds MARKETING_AGENT_TOKEN and reaches those four operations through this
// function, which is the thing that has to be right. So this suite executes the
// REAL authorization decision extracted from the deployed source, and asserts
// ORDER and FAIL-CLOSED behaviour, not just return values.
//
// The negative cases are the point. "Does the right token work?" is the half
// that gets tested by using the tool; "does an absent configuration refuse?" is
// the half that only fails in production.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';

const EDGE_FILE = 'supabase/functions/marketing-agent/index.ts';
const MIGRATION = 'supabase/migrations/20260908000001_marketing_agent_narrow_rpcs.sql';

type RpcResult = { data: unknown; error: { message: string } | null };
type AuthDecision = { ok: true } | { ok: false; status: number; error: string };

type EdgeModule = {
  MARKETING_TOKEN_ENV: string;
  MIN_TOKEN_LENGTH: number;
  RATE_LIMIT_MAX_PER_HOUR: number;
  RATE_LIMIT_WINDOW_SECONDS: number;
  MARKETING_BUCKET: string;
  MAX_IMAGE_BYTES: number;
  IMAGE_TYPES: Record<string, string>;
  ALLOWED_OPERATIONS: readonly string[];
  UNAUTHORIZED: { status: number; error: string };
  NOT_CONFIGURED: { status: number; error: string };
  RATE_LIMITED: { status: number; error: string };
  RATE_LIMIT_UNAVAILABLE: { status: number; error: string };
  constantTimeEqual: (a: string, b: string) => boolean;
  buildStoragePath: (contentType: string, uuid: string, now: Date) => string | null;
  parseOperation: (body: unknown) =>
    | { ok: true; op: string; body: Record<string, unknown> }
    | { ok: false; error: string };
  authorizeMarketingRequest: (
    deps: {
      configuredToken: string;
      checkRateLimit: (
        key: string,
        max: number,
        windowSeconds: number,
      ) => Promise<RpcResult>;
    },
    authHeader: string | null,
    clientAddress: string,
  ) => Promise<AuthDecision>;
};

let edge: EdgeModule;

/** 64 hex characters — what `openssl rand -hex 32` produces. */
const GOOD_TOKEN = 'a'.repeat(32) + 'b'.repeat(32);
const ADDRESS = '203.0.113.7';

/** Records what was called, in order, so the suite can assert sequencing. */
function spyDeps(options: {
  token?: string;
  rate?: RpcResult;
} = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      configuredToken: options.token ?? GOOD_TOKEN,
      checkRateLimit: async (key: string, max: number, windowSeconds: number) => {
        calls.push(`rate:${key}:${max}:${windowSeconds}`);
        return options.rate ?? { data: true, error: null };
      },
    },
  };
}

function codeOf(relativePath: string): string {
  return readRepoFile(relativePath)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

beforeAll(async () => {
  edge = await loadEdgeModule<EdgeModule>({
    file: EDGE_FILE,
    label: 'marketing-agent-authz',
    declarations: [
      'MARKETING_TOKEN_ENV',
      'MIN_TOKEN_LENGTH',
      'RATE_LIMIT_MAX_PER_HOUR',
      'RATE_LIMIT_WINDOW_SECONDS',
      'MARKETING_BUCKET',
      'MAX_IMAGE_BYTES',
      'IMAGE_TYPES',
      'ALLOWED_OPERATIONS',
      'UNAUTHORIZED',
      'NOT_CONFIGURED',
      'RATE_LIMITED',
      'RATE_LIMIT_UNAVAILABLE',
      'constantTimeEqual',
      'buildStoragePath',
      'parseOperation',
      'authorizeMarketingRequest',
    ],
  });
});

afterAll(() => {
  cleanupEdgeModules();
});

// ---------------------------------------------------------------------------
// Negative authorization — the half that only fails in production
// ---------------------------------------------------------------------------

describe('an unconfigured agent refuses everything', () => {
  it('refuses when MARKETING_AGENT_TOKEN is unset, and does not consult anything else', async () => {
    const { deps, calls } = spyDeps({ token: '' });
    const decision = await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, ADDRESS);

    expect(decision).toEqual({ ok: false, ...edge.NOT_CONFIGURED });
    // No rate-limit row is written for a request that could never have been
    // served: an unconfigured function must not fill the limiter table either.
    expect(calls).toEqual([]);
  });

  it('refuses a token shorter than the minimum, however well it matches', async () => {
    const short = 'short-but-correct';
    expect(short.length).toBeLessThan(edge.MIN_TOKEN_LENGTH);

    const { deps } = spyDeps({ token: short });
    const decision = await edge.authorizeMarketingRequest(deps, `Bearer ${short}`, ADDRESS);

    // Presenting the configured value is not enough — the configuration itself
    // is rejected. A weak shared secret otherwise works perfectly and nothing
    // ever reports it.
    expect(decision).toEqual({ ok: false, ...edge.NOT_CONFIGURED });
  });

  it('accepts a token of exactly the minimum length', async () => {
    const exact = 'z'.repeat(edge.MIN_TOKEN_LENGTH);
    const { deps } = spyDeps({ token: exact });
    expect(await edge.authorizeMarketingRequest(deps, `Bearer ${exact}`, ADDRESS)).toEqual({
      ok: true,
    });
  });

  it('requires at least 128 bits of shared secret', () => {
    // 32 characters of hex is 128 bits. Lowering this constant is a decision
    // somebody should have to make on purpose.
    expect(edge.MIN_TOKEN_LENGTH).toBeGreaterThanOrEqual(32);
  });
});

describe('a wrong or absent credential', () => {
  it('refuses a missing Authorization header', async () => {
    const { deps } = spyDeps();
    expect(await edge.authorizeMarketingRequest(deps, null, ADDRESS)).toEqual({
      ok: false,
      ...edge.UNAUTHORIZED,
    });
  });

  it('refuses an empty bearer', async () => {
    const { deps } = spyDeps();
    for (const header of ['', 'Bearer', 'Bearer ', 'Bearer    ']) {
      expect(await edge.authorizeMarketingRequest(deps, header, ADDRESS)).toEqual({
        ok: false,
        ...edge.UNAUTHORIZED,
      });
    }
  });

  it('refuses a wrong token, a prefix of the right one, and the right one with a suffix', async () => {
    const { deps } = spyDeps();
    const wrong = [
      'x'.repeat(64),
      GOOD_TOKEN.slice(0, -1),
      `${GOOD_TOKEN}x`,
      GOOD_TOKEN.toUpperCase(),
      ` ${GOOD_TOKEN.slice(1)}`,
    ];
    for (const token of wrong) {
      expect(
        await edge.authorizeMarketingRequest(deps, `Bearer ${token}`, ADDRESS),
        `token ${token.slice(0, 8)}… should be refused`,
      ).toEqual({ ok: false, ...edge.UNAUTHORIZED });
    }
  });

  it('answers identically whether the credential is absent or wrong', async () => {
    const { deps } = spyDeps();
    const absent = await edge.authorizeMarketingRequest(deps, null, ADDRESS);
    const wrong = await edge.authorizeMarketingRequest(deps, 'Bearer nope', ADDRESS);
    // No oracle: an attacker must not learn that a header was recognised as
    // well-formed but rejected on value.
    expect(absent).toEqual(wrong);
  });

  it('accepts the configured token, with or without the Bearer prefix casing', async () => {
    const { deps } = spyDeps();
    for (const header of [`Bearer ${GOOD_TOKEN}`, `bearer ${GOOD_TOKEN}`, GOOD_TOKEN]) {
      expect(await edge.authorizeMarketingRequest(deps, header, ADDRESS)).toEqual({ ok: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The rate limit: fail-closed, and placed where it can bound a guess
// ---------------------------------------------------------------------------

describe('rate limiting', () => {
  it('runs BEFORE the credential is compared', async () => {
    // A limiter placed after the credential check cannot bound an attempt to
    // guess the credential: a failed guess never reaches it.
    const { deps, calls } = spyDeps();
    await edge.authorizeMarketingRequest(deps, 'Bearer wrong-token-entirely', ADDRESS);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('rate:marketing_agent:203.0.113.7');
  });

  it('refuses when the limiter itself fails — fail-closed', async () => {
    // Wave 1 fixed exactly this in get-profile-chart, where the limiter logged
    // its own failure and carried on, turning a transient database error into
    // an unmetered endpoint.
    const { deps } = spyDeps({ rate: { data: null, error: { message: 'boom' } } });
    expect(await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, ADDRESS)).toEqual({
      ok: false,
      ...edge.RATE_LIMIT_UNAVAILABLE,
    });
  });

  it('refuses when the limiter says no', async () => {
    const { deps } = spyDeps({ rate: { data: false, error: null } });
    expect(await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, ADDRESS)).toEqual({
      ok: false,
      ...edge.RATE_LIMITED,
    });
  });

  it('treats any non-true answer as a refusal', async () => {
    // `data: null` is what a limiter returns when it did not answer. Truthiness
    // would have read `"false"` and `0` differently from `false`.
    for (const data of [null, undefined, 0, '', 'true', {}]) {
      const { deps } = spyDeps({ rate: { data, error: null } });
      expect(
        await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, ADDRESS),
        `data=${JSON.stringify(data)} must not be an allow`,
      ).toEqual({ ok: false, ...edge.RATE_LIMITED });
    }
  });

  it('passes the configured window and ceiling, and keys on the client address', async () => {
    const { deps, calls } = spyDeps();
    await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, ADDRESS);
    expect(calls[0]).toBe(
      `rate:marketing_agent:${ADDRESS}:${edge.RATE_LIMIT_MAX_PER_HOUR}:${edge.RATE_LIMIT_WINDOW_SECONDS}`,
    );
  });

  it('still keys the limiter when the address is unknown', async () => {
    // An empty key makes check_edge_rate_limit return FALSE, which would refuse
    // every request from a caller whose address the platform did not forward.
    const { deps, calls } = spyDeps();
    await edge.authorizeMarketingRequest(deps, `Bearer ${GOOD_TOKEN}`, '');
    expect(calls[0]).toContain('marketing_agent:unknown');
  });
});

// ---------------------------------------------------------------------------
// Constant-time comparison
// ---------------------------------------------------------------------------

describe('the token comparison', () => {
  it('accumulates rather than returning at the first difference', () => {
    const decl = readRepoFile(EDGE_FILE).match(
      /export function constantTimeEqual[\s\S]*?\n}/,
    );
    expect(decl).toBeTruthy();
    const body = decl![0];
    expect(body).toContain('diff |=');
    expect(body.slice(body.indexOf('for ('))).not.toContain('return false');
  });

  it('is correct where it has to be', () => {
    expect(edge.constantTimeEqual(GOOD_TOKEN, GOOD_TOKEN)).toBe(true);
    expect(edge.constantTimeEqual(GOOD_TOKEN, GOOD_TOKEN.slice(0, -1) + 'c')).toBe(false);
    expect(edge.constantTimeEqual('', '')).toBe(true);
    expect(edge.constantTimeEqual('a', 'ab')).toBe(false);
  });

  it('is what the authorization actually uses', () => {
    const code = codeOf(EDGE_FILE);
    expect(code).toContain('constantTimeEqual(presented, deps.configuredToken)');
    expect(code).not.toMatch(/presented\s*===\s*deps\.configuredToken/);
  });
});

// ---------------------------------------------------------------------------
// The operation allowlist
// ---------------------------------------------------------------------------

describe('operations are an allowlist', () => {
  it('names exactly the three database operations the agent performs', () => {
    expect([...edge.ALLOWED_OPERATIONS].sort()).toEqual([
      'list_queue',
      'schedule_post',
      'sync_status',
    ]);
  });

  it('accepts each allowed operation', () => {
    for (const op of edge.ALLOWED_OPERATIONS) {
      const parsed = edge.parseOperation({ op });
      expect(parsed.ok).toBe(true);
    }
  });

  it('refuses anything else, including things that only look like operations', () => {
    const rejected = [
      { op: 'delete_all' },
      { op: 'schedule_post ' },
      { op: 'SCHEDULE_POST' },
      { op: 'schedule_post; drop table marketing_posts' },
      { op: 'rpc' },
      { op: '' },
      { op: 1 },
      { op: null },
      { op: ['schedule_post'] },
      {},
      { operation: 'list_queue' },
    ];
    for (const body of rejected) {
      expect(edge.parseOperation(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it('refuses a body that is not an object', () => {
    for (const body of [null, undefined, 'schedule_post', 42, [], [{ op: 'list_queue' }], true]) {
      expect(edge.parseOperation(body).ok, JSON.stringify(body ?? null)).toBe(false);
    }
  });

  it('does not treat an inherited property as an operation', () => {
    // `{}.constructor` and friends are reachable through the prototype; the
    // check must read an own, string-valued `op`.
    const hostile = Object.create({ op: 'schedule_post' }) as Record<string, unknown>;
    expect(edge.parseOperation(hostile).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Storage paths are chosen by the server
// ---------------------------------------------------------------------------

describe('the upload path', () => {
  const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  const NOW = new Date(Date.UTC(2026, 8, 8));

  it('is built from a server UUID and carries no caller input', () => {
    const path = edge.buildStoragePath('image/png', UUID, NOW);
    expect(path).toBe(`marketing/2026/${UUID}.png`);
  });

  it('maps each allowed content type to its extension', () => {
    expect(edge.buildStoragePath('image/jpeg', UUID, NOW)).toMatch(/\.jpg$/);
    expect(edge.buildStoragePath('image/webp', UUID, NOW)).toMatch(/\.webp$/);
    expect(edge.buildStoragePath('image/gif', UUID, NOW)).toMatch(/\.gif$/);
  });

  it('tolerates a charset parameter and odd casing, as a real client sends', () => {
    expect(edge.buildStoragePath('IMAGE/PNG', UUID, NOW)).toMatch(/\.png$/);
    expect(edge.buildStoragePath('image/png; charset=binary', UUID, NOW)).toMatch(/\.png$/);
    expect(edge.buildStoragePath('  image/png  ', UUID, NOW)).toMatch(/\.png$/);
  });

  it('refuses every content type that is not on the allowlist', () => {
    const rejected = [
      'text/html',
      'image/svg+xml',           // scriptable, and the bucket is public
      'application/octet-stream',
      'application/javascript',
      '',
      'image/png/../../evil',
      'image',
    ];
    for (const type of rejected) {
      expect(edge.buildStoragePath(type, UUID, NOW), type).toBeNull();
    }
  });

  it('cannot be steered out of the marketing prefix', () => {
    // Everything variable in the path is the UUID and the extension, and both
    // come from this function. There is no caller string in the result.
    for (const type of Object.keys(edge.IMAGE_TYPES)) {
      const path = edge.buildStoragePath(type, UUID, NOW)!;
      expect(path.startsWith('marketing/')).toBe(true);
      expect(path).not.toContain('..');
      expect(path).toMatch(/^marketing\/\d{4}\/[0-9a-f-]{36}\.[a-z]{3,4}$/i);
    }
  });

  it('writes to the marketing bucket, not to the one holding profile photos', () => {
    expect(edge.MARKETING_BUCKET).toBe('marketing-images');
    const code = codeOf(EDGE_FILE);
    expect(code).not.toContain("'avatars'");
    expect(code).not.toContain('"avatars"');
  });
});

// ---------------------------------------------------------------------------
// Structural promises of the deployed file
// ---------------------------------------------------------------------------

describe('the function as deployed', () => {
  const code = () => codeOf(EDGE_FILE);

  it('serves no CORS header at all', () => {
    // The only caller is a Node process. Emitting no Access-Control-Allow-Origin
    // is stricter than any allowlist and costs nothing.
    expect(code()).not.toContain('Access-Control-Allow-Origin');
    expect(code()).not.toContain('_shared/cors.ts');
  });

  it('never enables upsert on the upload', () => {
    // `upsert: true` was the old behaviour, with a caller-derived filename:
    // two posts in the same millisecond overwrote each other.
    expect(code()).toContain('upsert: false');
    expect(code()).not.toContain('upsert: true');
  });

  it('reaches the table only through the three narrow RPCs', () => {
    const source = code();
    for (const rpc of [
      'marketing_agent_schedule_post',
      'marketing_agent_list_queue',
      'marketing_agent_post_statuses',
    ]) {
      expect(source).toContain(rpc);
    }
    // No direct PostgREST access to the table, which would bypass the
    // validation the RPCs perform.
    expect(source).not.toMatch(/\.from\(\s*["']marketing_posts["']\s*\)/);
    expect(source).not.toMatch(/\.from\(\s*["']profiles["']\s*\)/);
  });

  it('bounds the upload before reading the body, and again after', () => {
    const source = code();
    expect(source).toContain('content-length');
    // Content-length is a claim; the byte count is the fact. Both checks must
    // be present.
    expect(source.match(/image_too_large/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(edge.MAX_IMAGE_BYTES).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  it('answers only POST', () => {
    expect(code()).toContain('method_not_allowed');
  });
});

// ---------------------------------------------------------------------------
// The migration's half of the contract
// ---------------------------------------------------------------------------

describe('the narrow RPCs, as written in the migration', () => {
  const sql = () => readRepoFile(MIGRATION);

  it('pins search_path to empty on all three', () => {
    const pinned = sql().match(/SET search_path = ''/g) ?? [];
    expect(pinned.length).toBeGreaterThanOrEqual(3);
  });

  it('revokes execute from every client role and grants only service_role', () => {
    const text = sql();
    for (const fn of [
      'marketing_agent_schedule_post',
      'marketing_agent_list_queue',
      'marketing_agent_post_statuses',
    ]) {
      expect(text).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}[^;]*FROM PUBLIC, anon, authenticated;`),
      );
      expect(text).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[^;]*TO service_role;`),
      );
    }
    // `authenticated` must not appear on the grant side for any of them.
    expect(text).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.marketing_agent_[^;]*TO authenticated/);
  });

  it('builds no dynamic SQL', () => {
    // A single EXECUTE format(...) would make every allowlist above decorative.
    expect(sql()).not.toMatch(/\bEXECUTE\s+format\s*\(/i);
    expect(sql()).not.toMatch(/\bEXECUTE\s+'/i);
  });

  it('validates the platform list against a fixed set', () => {
    const text = sql();
    expect(text).toContain('unknown_platform');
    expect(text).toMatch(/c_platforms\s+CONSTANT\s+TEXT\[\]/);
  });

  it('constrains image_url to an object in the marketing bucket', () => {
    // publish-scheduled-posts hands this value to Blotato unchanged, so an
    // unconstrained column is an SSRF-shaped hole in somebody else's service.
    const text = sql();
    expect(text).toContain('image_url_not_in_marketing_bucket');
    expect(text).toContain('/storage/v1/object/public/marketing-images/');
  });

  it('ships the rate limiter this function fails closed on', () => {
    // `marketing-agent` refuses every request when check_edge_rate_limit
    // errors — the correct design, and the reason this dependency is not
    // optional. On 8 Sep 2026 that function turned out to be ABSENT from
    // production: 20260420000004 created it, in this repository, and had
    // never been applied. Three deployed functions call it and all three fail
    // OPEN, so nothing ever reported it.
    const repair = readRepoFile(
      'supabase/migrations/20260908000002_edge_rate_limits_present.sql',
    );
    expect(repair).toContain('CREATE OR REPLACE FUNCTION public.check_edge_rate_limit');
    expect(repair).toContain('CREATE TABLE IF NOT EXISTS public.edge_rate_limits');
    expect(repair).toContain('GRANT  EXECUTE ON FUNCTION public.check_edge_rate_limit');
    // Its self-check must prove the counter actually counts: a function that
    // exists and always returns TRUE is indistinguishable, to the three
    // fail-open callers, from one that is missing.
    expect(repair).toContain("le deuxieme appel aurait du etre refuse");
  });

  it('verifies its own effect rather than announcing success', () => {
    // PostgreSQL emits `WARNING: no privileges could be revoked` and COMMITS.
    const text = sql();
    expect(text).toContain('RAISE EXCEPTION');
    expect(text).toContain('has_function_privilege');
    // Both halves: the privilege is gone AND the product still works.
    expect(text).toContain("has_function_privilege('service_role'");
  });
});
