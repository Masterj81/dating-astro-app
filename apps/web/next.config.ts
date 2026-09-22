import type { NextConfig } from "next";
import { resolve } from "path";
import createNextIntlPlugin from "next-intl/plugin";

// JUNO-13 (2026-09-22): the Content-Security-Policy is deliberately ABSENT
// from headers(). Vercel lifts Next's headers() config into platform
// routing and injects the CSP into the REQUEST the App Router render reads,
// overwriting the middleware's nonce'd request CSP — Next then extracts the
// nonce from a policy that has none, and no inline script is ever nonced on
// a deployment (works under local `next start`, which never injects config
// headers into the request). The enforcement CSP is set by the middleware
// for every response it produces (src/lib/csp-static.ts, single source).
// The headers below stay here: nothing on the render path extracts them
// from the request, so Vercel's injection of them is harmless.

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Supabase project used for API, auth, and storage
const SUPABASE_HOST = "qtihezzbuubnyvrjdkjd.supabase.co";
const ALLOWED_IMAGE_HOSTS = [
  SUPABASE_HOST,
  "lh3.googleusercontent.com",
  "randomuser.me",
  "images.unsplash.com",
];

// Content-Security-Policy directives live in src/lib/csp-static.ts
// (ENFORCEMENT_CSP) and are applied by src/middleware.ts — see the comment
// at the top of this file for why they must not be a headers() entry.
const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, "../../"),
  images: {
    remotePatterns: [
      ...ALLOWED_IMAGE_HOSTS.map((hostname) => ({
        protocol: "https" as const,
        hostname,
      })),
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Content-Security-Policy intentionally omitted — see the note at
          // the top of this file (middleware owns it via csp-static.ts).
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // JUNO-13 (2026-09-21) — isolation headers, static-safe (no impact
          // on rendering). COOP same-origin: our OAuth flows are full-page
          // redirects (no popups), so cutting window.opener across origins
          // breaks nothing and closes silent tab-nabbing. CORP same-origin:
          // our resources may not be embedded cross-origin. COEP is
          // DELIBERATELY absent: it would require CORP/credentialless on
          // every cross-origin resource we consume (Supabase, Turnstile,
          // Unsplash/Google images) — unproven, deferred (runbook §CSP).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
