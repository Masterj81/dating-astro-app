import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildAppNonceCsp, isAppPath } from "./lib/csp-app";

const intlMiddleware = createMiddleware(routing);

const CANONICAL_APP_HOST = "app.junosynastry.com";
const LEGACY_APP_HOST = "app.astrodatingapp.com";
const APP_HOSTS = new Set([LEGACY_APP_HOST, CANONICAL_APP_HOST]);
const MARKETING_SEGMENTS = new Set([
  "contact",
  "help",
  "privacy",
  "safety",
  "terms",
  "account",
]);

/**
 * JUNO-05/JUNO-13 — app-subtree request handling (2026-09-21):
 *
 * 1. NONCE CSP (JUNO-13, split policy): a fresh nonce per request is placed
 *    on the REQUEST headers (x-nonce + Content-Security-Policy) so Next.js
 *    applies it to its inline scripts during the dynamic render ([locale]/app
 *    is force-dynamic for exactly this reason). The response keeps ENFORCEMENT
 *    as the global static policy (set in next.config.ts) and carries the
 *    nonce policy as Content-Security-Policy-Report-Only — phase 1 of the
 *    documented plan (observe, then switch enforcement, phase 2).
 *
 * 2. SESSION REFRESH (JUNO-05, official @supabase/ssr pattern): a server
 *    client reads cookies from the request; getUser() refreshes an expiring
 *    session and the setAll callback writes refreshed cookies BOTH on the
 *    request (downstream renders see them) and the response (the browser
 *    keeps them). Errors mean "not logged in / expired" — the request
 *    proceeds; the client-side flow handles login.
 *
 * App paths bypass the intl middleware on purpose: they always carry an
 * explicit locale prefix (nothing to negotiate) and we must own the response
 * to propagate request headers. Everything else keeps the existing flow.
 */
function handleAppRequest(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const nonceCsp = buildAppNonceCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", nonceCsp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Report-Only: the new policy, observed without blocking anything. The
  // ENFORCEMENT header comes from next.config.ts (global) — one source of
  // truth, no duplicate CSP headers.
  response.headers.set("Content-Security-Policy-Report-Only", nonceCsp);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) {
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            // Request first: this render's server components read the
            // refreshed session. Response second: the browser keeps it.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Refresh if needed; never block the render on auth failure.
    supabase.auth.getUser().catch(() => undefined);
  }

  return response;
}

export default function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;

  if (host === LEGACY_APP_HOST) {
    const url = request.nextUrl.clone();
    url.hostname = CANONICAL_APP_HOST;
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  if (APP_HOSTS.has(host)) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/${routing.defaultLocale}/app`;
      return NextResponse.redirect(url);
    }

    const localeMatch = pathname.match(
      new RegExp(`^/(${routing.locales.join("|")})(?:/([^/]+))?/?$`)
    );

    if (localeMatch) {
      const [, locale, firstSegment] = localeMatch;

      if (!firstSegment || MARKETING_SEGMENTS.has(firstSegment)) {
        const url = request.nextUrl.clone();
        url.pathname = `/${locale}/app`;
        return NextResponse.redirect(url);
      }
    }
  }

  // App subtree (both hosts — marketing pages may link into /app): dynamic
  // render + nonce Report-Only + cookie session refresh. Must run AFTER the
  // host redirects above so marketing segments on app hosts still redirect.
  if (isAppPath(pathname)) {
    return handleAppRequest(request);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Match all pathnames except API routes, static files, etc.
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
