// JUNO-13 — single source of truth for the ENFORCEMENT (nonce-less) CSP.
//
// WHY THIS MODULE EXISTS (measured 2026-09-22, diag/nonce-perpage campaign):
// Vercel lifts Next's `headers()` config into platform-level routing, and the
// lifted Content-Security-Policy is injected into the REQUEST stream the App
// Router render reads — overwriting whatever the middleware set there. Next
// 15.5.25 extracts the per-request nonce from the request's
// `content-security-policy` header during the render, so a config-level CSP
// on `/:path*` silently defeats the nonce on every deployment (locally,
// `next start` never injects config headers into the request, which is why
// nonces worked locally and never on Vercel — /en/app/csp-diag evidence).
// The enforcement CSP therefore MUST NOT live in next.config headers(); the
// middleware owns it instead, for every response it produces. Other headers
// (X-Frame-Options, HSTS…) stay in next.config: nothing extracts them from
// the request, so their injection is harmless.
//
// The nonce'd Report-Only policy for the /app subtree stays in
// src/lib/csp-app.ts (buildAppNonceCsp) — two different policies, two jobs.

// Supabase project used for API, auth, and storage
const SUPABASE_HOST = "qtihezzbuubnyvrjdkjd.supabase.co";
const ALLOWED_IMAGE_HOSTS = [
  SUPABASE_HOST,
  "lh3.googleusercontent.com",
  "randomuser.me",
  "images.unsplash.com",
];
// Vercel Analytics + Speed Insights script + beacon endpoints.
const VERCEL_INSIGHTS = "https://va.vercel-scripts.com";
const VERCEL_VITALS = "https://vitals.vercel-insights.com";
// Cloudflare Turnstile (JUNO-07, 2026-09-17): the contact form's widget loads
// its api.js from this exact origin and renders its challenge in an iframe.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  `default-src 'self'`,
  // Scripts: self + Next.js inline scripts + Vercel Analytics / Speed Insights.
  // ('unsafe-inline' is the practical choice for static pages — the /app
  // subtree gets the nonce'd Report-Only policy from the middleware.)
  `script-src 'self' 'unsafe-inline' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
  `script-src-elem 'self' 'unsafe-inline' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' ${ALLOWED_IMAGE_HOSTS.map((host) => `https://${host}`).join(" ")} data: blob:`,
  `font-src 'self'`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} ${VERCEL_INSIGHTS} ${VERCEL_VITALS}`,
  `media-src 'self'`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  `form-action 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `worker-src 'self'`,
  `frame-ancestors 'none'`,
];

export const ENFORCEMENT_CSP = cspDirectives.join("; ");
