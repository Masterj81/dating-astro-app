// JUNO-13 phase 2 — single source of the ENFORCEMENT (nonce-less) CSP for
// every surface the middleware does NOT nonce: marketing, auth, callback.
//
// WHY THIS MODULE EXISTS (measured 2026-09-22, runbook §6quater/§6sexies):
// Vercel lifts Next's `headers()` config into platform routing and FOLDS the
// lifted Content-Security-Policy into the internal request the App Router
// render reads — overwriting the middleware's nonce'd request CSP (Next
// 15.5.25 extracts the nonce from `content-security-policy` first, no
// fall-through to Report-Only). A config-level CSP on `/:path*` therefore
// silently disables noncing on every deployment. The static policy is set by
// the MIDDLEWARE (intl branch) instead; /app responses carry the enforced
// nonce'd policy from the same middleware. Other headers (X-Frame-Options,
// COOP, CORP, nosniff…) stay in next.config: nothing extracts them from the
// request, so their injection is harmless.

// Supabase project used for API, auth, and storage
const SUPABASE_HOST = "qtihezzbuubnyvrjdkjd.supabase.co";
const ALLOWED_IMAGE_HOSTS = [
  SUPABASE_HOST,
  "lh3.googleusercontent.com",
  "randomuser.me",
  "images.unsplash.com",
];
// Vercel Analytics + Speed Insights script + beacon endpoints.
// In dev these are loaded from external origins; in prod they are proxied
// through /_vercel/insights/* (first-party) but we keep the origins
// whitelisted so dev and prod behave the same and CSP errors don't surface.
const VERCEL_INSIGHTS = "https://va.vercel-scripts.com";
const VERCEL_VITALS = "https://vitals.vercel-insights.com";
// Cloudflare Turnstile (JUNO-07, 2026-09-17): the contact form's widget loads
// its api.js from this exact origin and renders its challenge in an iframe.
// The MINIMAL Cloudflare-documented fix is script-src + script-src-elem +
// frame-src scoped to THIS origin only — no wildcard, and NO connect-src
// entry: siteverify runs SERVER-side, so the browser never talks to
// Cloudflare beyond the script and the frame.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  // Only load resources from these origins by default
  `default-src 'self'`,
  // Scripts: self + Next.js inline scripts + Vercel Analytics / Speed
  // Insights. 'unsafe-inline' remains ONLY on these nonce-less surfaces
  // (static marketing pages — their inline scripts are build-time Next
  // hydration payloads). The /app subtree gets the nonce'd enforced policy
  // (src/lib/csp-app.ts) with NO 'unsafe-inline' in script directives.
  `script-src 'self' 'unsafe-inline' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
  `script-src-elem 'self' 'unsafe-inline' ${VERCEL_INSIGHTS} ${TURNSTILE_ORIGIN}`,
  // Styles: self + inline (Next.js / CSS-in-JS)
  `style-src 'self' 'unsafe-inline'`,
  // Images: self + allowed profile image sources + data URIs + blobs
  `img-src 'self' ${ALLOWED_IMAGE_HOSTS.map((host) => `https://${host}`).join(" ")} data: blob:`,
  // Fonts: self only (no external font providers detected)
  `font-src 'self'`,
  // API / WebSocket connections: self + Supabase + Vercel Analytics/Vitals
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} ${VERCEL_INSIGHTS} ${VERCEL_VITALS}`,
  // Media: none needed currently
  `media-src 'self'`,
  // Frames: Turnstile's challenge iframe ONLY. Single explicit origin, no
  // wildcard. X-Frame-Options: DENY stays: it governs who may frame US;
  // frame-src governs what WE frame. The two coexist by design.
  `frame-src ${TURNSTILE_ORIGIN}`,
  // Form actions: self only
  `form-action 'self'`,
  // Base URI: self only
  `base-uri 'self'`,
  // Object/embed: none
  `object-src 'none'`,
  // Workers: the PWA kill-switch service worker (same origin).
  `worker-src 'self'`,
  // Framing of THIS site: nobody (X-Frame-Options: DENY covers legacy).
  `frame-ancestors 'none'`,
];

export const ENFORCEMENT_CSP = cspDirectives.join("; ");
