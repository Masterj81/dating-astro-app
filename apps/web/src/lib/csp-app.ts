/**
 * JUNO-13 — CSP helpers for the APP SUBTREE nonce policy (2026-09-21).
 *
 * GATE OUTCOME (PoC on the exact Next.js 15.5.25, 2026-09-21 —
 * docs/runbooks/web-session-csp-2026-09.md): a nonce REQUIRES per-request
 * rendering. A page that never reads request data stays static even with the
 * nonce middleware present (prerendered .html kept), but its build-time HTML
 * can never carry a per-request nonce — so a GLOBAL nonce policy would
 * convert all 352 static pages to SSR (SEO, CDN cache, TTFB, Vercel cost)
 * and hash/SRI cannot cover Next's inline Flight payload. Decision:
 * SPLIT POLICY — marketing stays static with the current enforcement; the
 * /{locale}/app subtree opts into dynamic rendering + this nonce policy.
 *
 * Deployment shape (phase 1): the nonce policy ships as
 * Content-Security-Policy-Report-Only on app paths, while ENFORCEMENT stays
 * the global static policy (unsafe-inline — nonced scripts pass it too, so
 * the dual header is consistent). The request CSP carries the nonce so Next
 * auto-nonces its inline scripts during the dynamic render, making the
 * Report-Only signal MEANINGFUL (zero console violations = ready to switch
 * enforcement; the switch itself is a documented one-line change, phase 2).
 */

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const VERCEL_INSIGHTS = "https://va.vercel-scripts.com";

/** App-subtree paths — where sessions live and where the nonce applies.
 *  Deliberately narrow: NOT marketing, NOT /auth (static, Turnstile-free),
 *  NOT /contact. Exported for tests and the validator. */
export function isAppPath(pathname: string): boolean {
  return /^\/[a-z]{2}(?:-[A-Za-z]{2})?\/app(\/|$)/.test(pathname);
}

/** Build the app-subtree nonce policy. Same nonce goes to: the request CSP
 *  header (Next auto-nonces its scripts from it) and the Report-Only
 *  response header. Fresh per call — the middleware generates one nonce per
 *  request and reuses the value for both headers. */
export function buildAppNonceCsp(nonce: string): string {
  if (!/^[A-Za-z0-9+/=_-]{16,64}$/.test(nonce)) {
    throw new Error("[csp-app] nonce must be base64/base64url, 16-64 chars");
  }
  return [
    "default-src 'self'",
    // 'strict-dynamic': script nonced by the nonce may load its own deps
    // (framework chunks) without listing them. Hosts are CSP2 fallback for
    // browsers without strict-dynamic — kept identical to the enforcement
    // allowlist so both policies allow the same origins.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}`,
    `script-src-elem 'self' 'nonce-${nonce}' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}`,
    // Styles stay 'unsafe-inline' on purpose (separate justification: styles
    // are not executable; Next/third-party inject style attributes; the risk
    // removed here is SCRIPT injection).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://qtihezzbuubnyvrjdkjd.supabase.co https://lh3.googleusercontent.com https://randomuser.me https://images.unsplash.com data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://qtihezzbuubnyvrjdkjd.supabase.co wss://qtihezzbuubnyvrjdkjd.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com",
    "media-src 'self'",
    `frame-src ${TURNSTILE_ORIGIN}`,
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
