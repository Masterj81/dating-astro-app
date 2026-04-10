import type { NextConfig } from "next";
import { resolve } from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Supabase project used for API, auth, and storage
const SUPABASE_HOST = "qtihezzbuubnyvrjdkjd.supabase.co";

// Content-Security-Policy directives
// Using enforce mode — all known origins are whitelisted so the app works normally.
const cspDirectives = [
  // Only load resources from these origins by default
  `default-src 'self'`,
  // Scripts: self + Next.js inline scripts (hash/nonce would be better but
  // Next.js injects inline scripts for hydration that change every build,
  // so 'unsafe-inline' is the practical choice until Next.js supports nonces
  // natively in the App Router).
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  // Styles: self + inline (Next.js / CSS-in-JS)
  `style-src 'self' 'unsafe-inline'`,
  // Images: self + Supabase storage + Google profile pictures + data URIs + blobs
  `img-src 'self' https://${SUPABASE_HOST} https://lh3.googleusercontent.com data: blob:`,
  // Fonts: self only (no external font providers detected)
  `font-src 'self'`,
  // API / WebSocket connections: self + Supabase (REST, Auth, Realtime, Edge Functions)
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST}`,
  // Media: none needed currently
  `media-src 'self'`,
  // Frames: none (matches X-Frame-Options DENY)
  `frame-src 'none'`,
  // Form actions: self only
  `form-action 'self'`,
  // Base URI: self only
  `base-uri 'self'`,
  // Object/embed: none
  `object-src 'none'`,
];

const contentSecurityPolicy = cspDirectives.join("; ");

const nextConfig: NextConfig = {
  outputFileTracingRoot: resolve(__dirname, "../../"),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: SUPABASE_HOST,
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
