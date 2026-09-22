import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { buildAppNonceCsp, isAppPath } from "./lib/csp-app";
import { ENFORCEMENT_CSP } from "./lib/csp-static";

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

  // JUNO-13 (2026-09-22, measured): on Vercel the render reads a MERGED view
  // of request + response headers, and a response Content-Security-Policy —
  // from next.config headers() OR set here — OVERWRITES the nonce'd request
  // CSP above (Next extracts the nonce from the request's
  // `content-security-policy`, preferring it over the Report-Only one).
  // Therefore this response must NOT carry an enforcement CSP: it lives in
  // vercel.json (platform routing headers, applied after the render, never
  // folded into the request) for the /app subtree, and on the intl branch
  // below for everything else. /en/app/csp-diag proved both halves of this.
  //
  // Report-Only: the nonce'd policy, observed without blocking anything —
  // phase 1 of the documented plan (observe, then switch enforcement, phase 2
  // — which will fold these two back into one response header).
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

export default async function middleware(request: NextRequest) {
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

  // Marketing/intl paths: same enforcement CSP as before (it used to come
  // from next.config headers(), which Vercel injects into the render's
  // request — see src/lib/csp-static.ts). Applied here so nothing changes
  // for the visitor while the /app subtree regains its nonce.
  const intlResponse = await intlMiddleware(request);
  intlResponse.headers.set("Content-Security-Policy", ENFORCEMENT_CSP);
  return intlResponse;
}

export const config = {
  matcher: [
    // Match all pathnames except API routes, static files, etc.
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
