/**
 * JUNO-05 (garde CSRF, 2026-09-21) — fail-closed same-origin assertion for
 * any FUTURE cookie-authenticated mutating route.
 *
 * TODAY there is no such route: every /api route authenticates with a
 * Bearer header the caller must already hold (request-deletion, contact…),
 * and SameSite=Lax on the session cookie already withholds it from
 * cross-site POSTs. This guard exists so the day a route starts relying on
 * the session cookie, the protection is one import away — and the validator
 * (scripts/validate-web-session-csp.mjs) refuses any route that imports a
 * server Supabase client on a mutating method without importing this.
 *
 * Fail-closed: absent Origin AND absent Referer → refusal (a same-origin
 * browser request always carries at least one). Exact-origin match on the
 * authorized host list; no substring, no prefix.
 */
const ALLOWED_ORIGINS = new Set([
  "https://app.junosynastry.com",
  "https://www.junosynastry.com",
  "https://junosynastry.com",
]);

export function assertSameOriginRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const candidate = origin || (referer ? new URL(referer).origin : null);

  if (!candidate || !ALLOWED_ORIGINS.has(candidate)) {
    return new Response(JSON.stringify({ error: "forbidden_origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
