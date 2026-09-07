// JUNO-11 — the origin allowlist, and the direction it fails in.
//
// Loads `supabase/functions/_shared/cors.ts` WHOLE (it is written free of any
// Deno reference precisely so this is possible) and every edge function's
// source as text, so the tests cover both the policy and its adoption.
//
// WHAT WAS WRONG
// --------------
// Seven functions carried the same block:
//
//     const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
//       ? PROD_ORIGINS : DEV_ORIGINS;   // = PROD + localhost
//
// The default is the permissive branch. `ENVIRONMENT` appears in no
// `.env.example`, no CI file and no runbook in this repository, so nothing
// proves it is set at all — and if it is not, `http://localhost:3000` may read
// cross-origin responses with the caller's credentials and, in
// `create-checkout-session`, receive the post-payment redirect.
// docs/security-audit-2026-09-07.md, JUNO-11.

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  REPO_ROOT,
  cleanupEdgeModules,
  loadWholeModule,
  readRepoFile,
} from '../../testing/edge-source';

const CORS_FILE = 'supabase/functions/_shared/cors.ts';

interface OriginPolicy {
  readonly allowed: readonly string[];
  readonly isDevelopment: boolean;
  isAllowedOrigin(origin: string | null | undefined): boolean;
  headers(origin: string | null | undefined): Record<string, string>;
  isAllowedRedirect(url: unknown): boolean;
}

type CorsModule = {
  PROD_ORIGINS: readonly string[];
  LOCAL_ORIGINS: readonly string[];
  DEVELOPMENT_ENVIRONMENT: string;
  createOriginPolicy: (env: string | null | undefined, options?: unknown) => OriginPolicy;
};

let cors: CorsModule;

beforeAll(async () => {
  cors = await loadWholeModule<CorsModule>(CORS_FILE, 'shared-cors');
});

afterAll(() => cleanupEdgeModules());

const REAL = 'https://app.junosynastry.com';

describe('JUNO-11 · which environment values widen the allowlist', () => {
  it('serves production origins when ENVIRONMENT is production', () => {
    const policy = cors.createOriginPolicy('production');
    expect(policy.isDevelopment).toBe(false);
    expect(policy.isAllowedOrigin(REAL)).toBe(true);
    expect(policy.isAllowedOrigin('http://localhost:3000')).toBe(false);
  });

  it('widens ONLY for the exact token "development"', () => {
    const policy = cors.createOriginPolicy(cors.DEVELOPMENT_ENVIRONMENT);
    expect(policy.isDevelopment).toBe(true);
    expect(policy.isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(policy.isAllowedOrigin(REAL)).toBe(true);
  });

  it('falls back to PRODUCTION when ENVIRONMENT is absent', () => {
    // The whole finding in one assertion: the old code returned the DEV list
    // here. Now an unset variable is the safe answer, not the dangerous one.
    for (const value of [undefined, null, '']) {
      const policy = cors.createOriginPolicy(value);
      expect(policy.isDevelopment, `env=${JSON.stringify(value)}`).toBe(false);
      expect(policy.isAllowedOrigin('http://localhost:3000')).toBe(false);
      expect([...policy.allowed]).toEqual([...cors.PROD_ORIGINS]);
    }
  });

  it('falls back to PRODUCTION for an unexpected or misspelled value', () => {
    for (const value of [
      'prod', 'PRODUCTION', 'staging', 'preview', 'test', 'dev',
      'developement', 'development ', ' development', 'DEVELOPMENT',
      'production-eu', '0', 'false', 'null', 'undefined',
    ]) {
      const policy = cors.createOriginPolicy(value);
      const widened = policy.isAllowedOrigin('http://localhost:3000');
      // ' development' and 'development ' are trimmed, and 'DEVELOPMENT' is
      // lowercased — those three are intentional conveniences. Everything else
      // must resolve to production.
      const expectWide = value.trim().toLowerCase() === 'development';
      expect(widened, `env=${JSON.stringify(value)}`).toBe(expectWide);
    }
  });
});

describe('JUNO-11 · origins that must be refused', () => {
  const HOSTILE = [
    // A deceptive subdomain: our host is a PREFIX of theirs.
    'https://app.junosynastry.com.evil.com',
    // A lookalike suffix.
    'https://app.junosynastry.community',
    // A lookalike prefix.
    'https://xapp.junosynastry.com',
    'https://notapp.junosynastry.com',
    // The http variant of an https origin.
    'http://app.junosynastry.com',
    // Same host, unexpected port.
    'https://app.junosynastry.com:8443',
    // Our host as a path or a query value on somebody else's origin.
    'https://evil.com/https://app.junosynastry.com',
    'https://evil.com?x=https://app.junosynastry.com',
    // Credentials in the authority.
    'https://app.junosynastry.com@evil.com',
    // Trailing dot (a distinct, resolvable FQDN).
    'https://app.junosynastry.com.',
    // Case and whitespace games.
    'https://APP.JUNOSYNASTRY.COM',
    ' https://app.junosynastry.com',
    'https://app.junosynastry.com/',
    // Non-http schemes.
    'null', 'file://', 'javascript:alert(1)', 'data:text/html,x',
  ];

  it.each(HOSTILE)('refuses %s', (origin) => {
    const p = cors.createOriginPolicy('production');
    expect(p.isAllowedOrigin(origin)).toBe(false);
  });

  it('never reflects an unknown origin back in the header', () => {
    const p = cors.createOriginPolicy('production');
    for (const origin of HOSTILE) {
      const headers = p.headers(origin);
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
      // Not `'*'` either, and not the empty string that invites a "fix".
      expect(Object.values(headers)).not.toContain('*');
      expect(Object.values(headers)).not.toContain(origin);
    }
  });

  it('sets Vary: Origin on every response, allowed or not', () => {
    const p = cors.createOriginPolicy('production');
    expect(p.headers(REAL).Vary).toBe('Origin');
    expect(p.headers('https://evil.com').Vary).toBe('Origin');
    expect(p.headers(null).Vary).toBe('Origin');
  });

  it('treats a missing Origin as not-a-browser, not as allowed', () => {
    const p = cors.createOriginPolicy('production');
    expect(p.isAllowedOrigin(null)).toBe(false);
    expect(p.isAllowedOrigin(undefined)).toBe(false);
    expect(p.headers(null)['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('echoes an allowed origin exactly', () => {
    const p = cors.createOriginPolicy('production');
    for (const origin of cors.PROD_ORIGINS) {
      expect(p.headers(origin)['Access-Control-Allow-Origin']).toBe(origin);
    }
  });

});

describe('JUNO-11 · redirect targets', () => {
  it('accepts the app\'s own checkout URLs', () => {
    const p = cors.createOriginPolicy('production');
    expect(p.isAllowedRedirect(`${REAL}/app/checkout/success`)).toBe(true);
    expect(p.isAllowedRedirect(`${REAL}/app/plans?checkout=cancelled`)).toBe(true);
  });

  it('refuses every hostile shape, including the ones that read as ours', () => {
    const p = cors.createOriginPolicy('production');
    for (const url of [
      'https://app.junosynastry.com@evil.com/app/checkout/success',
      'https://user:pass@app.junosynastry.com/app',
      'https://app.junosynastry.com.evil.com/app/checkout/success',
      'http://app.junosynastry.com/app/checkout/success',
      'https://xapp.junosynastry.com/app',
      'https://evil.com/app/checkout/success',
      'https://app.junosynastry.com:8443/app',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//app.junosynastry.com/app',
      '/app/checkout/success',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(p.isAllowedRedirect(url), `${String(url)} must be refused`).toBe(false);
    }
  });

  it('refuses localhost redirects unless development is explicit', () => {
    expect(cors.createOriginPolicy(undefined).isAllowedRedirect('http://localhost:3000/app')).toBe(false);
    expect(cors.createOriginPolicy('production').isAllowedRedirect('http://localhost:3000/app')).toBe(false);
    expect(cors.createOriginPolicy('development').isAllowedRedirect('http://localhost:3000/app')).toBe(true);
  });
});

describe('JUNO-11 · every edge function uses the shared policy', () => {
  const FUNCTIONS = [
    'calculate-chart',
    'claim-promo-code',
    'claim-referral',
    'create-checkout-session',
    'create-portal-session',
    'get-profile-chart',
    'suggest-birth-cities',
  ];

  it.each(FUNCTIONS)('%s imports it and declares no list of its own', (fn) => {
    const source = readRepoFile(`supabase/functions/${fn}/index.ts`);
    expect(source).toContain("from '../_shared/cors.ts'");
    expect(source).toContain('createOriginPolicy(Deno.env.get(');
    // The pattern that WAS the finding. Not one function may keep it.
    expect(source).not.toContain("=== 'production'");
    expect(source).not.toMatch(/const PROD_ORIGINS\s*=/);
    expect(source).not.toMatch(/const DEV_ORIGINS\s*=/);
  });

  it('leaves no function in the repo with the permissive pattern', () => {
    // A sweep, not a list: a function added tomorrow is covered.
    const dir = path.join(REPO_ROOT, 'supabase/functions');
    const offenders: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!existsSync(path.join(dir, entry.name, 'index.ts'))) continue;
      const source = readRepoFile(`supabase/functions/${entry.name}/index.ts`);
      if (source.includes("=== 'production'")) offenders.push(entry.name);
    }
    expect(offenders).toEqual([]);
  });

  it('answers a forbidden origin WITH cors headers, never bare', () => {
    // A bare `new Response('Forbidden origin', {status: 403})` carries no
    // Access-Control-*, so the browser reports an unreadable network error and
    // a legitimate origin left off the list stays broken for months.
    for (const fn of ['claim-promo-code', 'claim-referral', 'create-checkout-session', 'create-portal-session']) {
      const source = readRepoFile(`supabase/functions/${fn}/index.ts`);
      const bare = source.match(/return new Response\('Forbidden origin'[^)]*\)/g) ?? [];
      expect(bare, `${fn} still answers a forbidden origin bare`).toEqual([]);
      expect(source).toContain('forbidden_origin');
    }
  });
});

describe('JUNO-11 · the shared module stays loadable outside Deno', () => {
  it('touches no Deno global in executable code', () => {
    // The strongest proof is already in `beforeAll`: the module loaded and ran
    // under Node. This adds the static half so the reason survives — comments
    // are stripped first, because the file explains in prose that each function
    // passes its own `Deno.env.get('ENVIRONMENT')` in, and forbidding the
    // explanation would forbid the design note.
    const code = readRepoFile(CORS_FILE)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bDeno\./);
    expect(cors.createOriginPolicy('production').allowed.length).toBeGreaterThan(0);
  });

  it('declares exactly the origins the seven functions used to declare', () => {
    // Centralisation must not widen anything. This is the union that existed
    // before, and nothing more; a new subdomain is a deliberate commit.
    expect([...cors.PROD_ORIGINS].sort()).toEqual([
      'https://app.astrodatingapp.com',
      'https://app.junosynastry.com',
      'https://astrodatingapp.com',
      'https://www.astrodatingapp.com',
    ]);
    for (const origin of cors.PROD_ORIGINS) {
      expect(origin.startsWith('https://'), `${origin} must be https`).toBe(true);
    }
    for (const origin of cors.LOCAL_ORIGINS) {
      expect(origin).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
    }
  });
});
