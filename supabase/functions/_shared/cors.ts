// Origin allowlist and redirect validation — one implementation, fail-closed.
//
// WHY THIS FILE EXISTS
// --------------------
// Seven edge functions carried the same block, copy-pasted:
//
//     const ALLOWED_ORIGINS = Deno.env.get('ENVIRONMENT') === 'production'
//       ? PROD_ORIGINS
//       : DEV_ORIGINS;            // = PROD_ORIGINS + localhost:3000, :8081, :19006
//
// The default is the permissive branch. A variable that is absent, renamed,
// mis-cased or misspelled — and `ENVIRONMENT` appears in no `.env.example`, no
// CI file and no runbook in this repository — silently allows `http://localhost`
// to read cross-origin responses with the caller's credentials, and (in
// `create-checkout-session`, which validates `successUrl` against the same
// list) to receive the post-payment redirect.
//
// The inversion is the whole point: **production is the default**, and the
// local origins are added ONLY when the environment is explicitly and exactly
// `development`. Anything else — unset, 'prod', 'PRODUCTION', 'staging', a
// typo — resolves to the production allowlist. A wrong value can now only ever
// be more restrictive, which surfaces as a visible CORS failure in a browser
// console instead of an invisible hole.
//
// WHAT ELSE IS FIXED HERE
// -----------------------
//   * `Access-Control-Allow-Origin` is OMITTED rather than sent empty when the
//     origin is unknown. An empty value is already a failed check in every
//     browser, but omitting says the same thing without inviting a future
//     reader to "fix" the blank by reflecting the request.
//   * `Vary: Origin` accompanies every response, so a shared cache cannot serve
//     one origin's allowance to another.
//   * Error responses get the same headers as success responses. Several
//     functions returned bare `new Response('Forbidden origin', {status: 403})`
//     with no CORS headers at all, which makes the failure unreadable in the
//     browser (it surfaces as a generic network error, and that is how a
//     legitimate origin gets left off the list for months).
//   * Redirect targets are validated by ORIGIN EQUALITY, never by prefix or
//     `includes`. `https://app.junosynastry.com.evil.com`,
//     `https://xapp.junosynastry.com`, `http://app.junosynastry.com` and
//     `https://app.junosynastry.com@evil.com` all fail, and the last one is the
//     reason `username`/`password` are rejected explicitly as well as by origin:
//     it reads as the real host to a human and parses to `evil.com`.
//
// This module is deliberately free of any `Deno` reference so it can be loaded
// and executed by the vitest suite in `packages/shared`. Each function passes
// its own `Deno.env.get('ENVIRONMENT')` in.

/**
 * The only origins JUNO is ever served from.
 *
 * This is the EXACT union of what the seven functions declared individually
 * before centralisation — deliberately not one entry more. Widening an
 * allowlist is a product decision, not a refactoring side effect; a new
 * subdomain gets added here on purpose, in its own commit.
 */
export const PROD_ORIGINS: readonly string[] = [
  'https://www.astrodatingapp.com',
  'https://astrodatingapp.com',
  'https://app.astrodatingapp.com',
  'https://app.junosynastry.com',
];

/**
 * Local development origins. Declared explicitly, enabled explicitly, and
 * unreachable in production: `next dev` uses 3000, `expo start --web` 8081,
 * and the legacy webpack dev server 19006. Same union rule as above.
 */
export const LOCAL_ORIGINS: readonly string[] = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];

/** The single value that opens the local allowlist. Nothing else does. */
export const DEVELOPMENT_ENVIRONMENT = 'development';

export interface OriginPolicy {
  /** Every origin this policy accepts, in order. */
  readonly allowed: readonly string[];
  /** True when the environment resolved to the local-development allowlist. */
  readonly isDevelopment: boolean;
  /** Is this exact origin allowed? `null` (native app, curl) is not an origin. */
  isAllowedOrigin(origin: string | null | undefined): boolean;
  /** Headers for any response — success or error. */
  headers(origin: string | null | undefined): Record<string, string>;
  /** Is this absolute URL safe to redirect a paying user to? */
  isAllowedRedirect(url: unknown): boolean;
}

export interface OriginPolicyOptions {
  /** Override the production list (tests, or a function with a narrower scope). */
  prodOrigins?: readonly string[];
  /** Override the local list. */
  localOrigins?: readonly string[];
  /** Methods advertised in the preflight response. */
  methods?: string;
}

/**
 * Build the policy for one function.
 *
 * @param environment the raw `ENVIRONMENT` value, or undefined when unset.
 *        ONLY the exact string `development` (after trim + lowercase) widens
 *        the allowlist. Everything else — including `undefined` — is treated
 *        as production.
 */
export function createOriginPolicy(
  environment: string | null | undefined,
  options: OriginPolicyOptions = {},
): OriginPolicy {
  const prod = options.prodOrigins ?? PROD_ORIGINS;
  const local = options.localOrigins ?? LOCAL_ORIGINS;
  const methods = options.methods ?? 'POST, OPTIONS';

  const normalized = typeof environment === 'string' ? environment.trim().toLowerCase() : '';
  const isDevelopment = normalized === DEVELOPMENT_ENVIRONMENT;
  const allowed: readonly string[] = isDevelopment ? [...prod, ...local] : [...prod];

  function isAllowedOrigin(origin: string | null | undefined): boolean {
    if (typeof origin !== 'string' || origin === '') return false;
    // Exact match on the serialized origin. No prefix, no suffix, no `includes`,
    // no regex: `https://app.junosynastry.com.evil.com` starts with nothing the
    // list contains, but `includes` would have said yes to
    // `https://evil.com/?x=https://app.junosynastry.com`.
    return allowed.includes(origin);
  }

  function headers(origin: string | null | undefined): Record<string, string> {
    const base: Record<string, string> = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      // A cache in front of the function must not hand one origin's allowance
      // to the next caller.
      Vary: 'Origin',
    };
    if (isAllowedOrigin(origin)) {
      base['Access-Control-Allow-Origin'] = origin as string;
    }
    return base;
  }

  function isAllowedRedirect(url: unknown): boolean {
    if (typeof url !== 'string' || url === '') return false;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    // Credentials in the authority are how `https://app.junosynastry.com@evil.com`
    // reads as our host to a person. `parsed.origin` already resolves to
    // `https://evil.com`, so the check below would catch it — this rejects the
    // shape outright so the intent survives a future refactor of that check.
    if (parsed.username !== '' || parsed.password !== '') return false;
    // `new URL('javascript:alert(1)').origin` is the string "null", which is
    // not in the allowlist; being explicit costs one line and reads better.
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    // Origin equality covers scheme, host and port together: the http variant
    // of an https domain, a deceptive subdomain, a lookalike suffix and an
    // unexpected port all fail here.
    return allowed.includes(parsed.origin);
  }

  return { allowed, isDevelopment, isAllowedOrigin, headers, isAllowedRedirect };
}

/**
 * JSON response helper that always carries the policy's headers, so an error
 * path can never answer with a different CORS posture than the success path.
 */
export function jsonWithCors(
  policy: OriginPolicy,
  origin: string | null | undefined,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), { status, headers: policy.headers(origin) });
}
