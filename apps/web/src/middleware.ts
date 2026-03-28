import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

const APP_HOSTS = new Set(["app.astrodatingapp.com"]);
const MARKETING_SEGMENTS = new Set([
  "contact",
  "help",
  "privacy",
  "safety",
  "terms",
  "account",
]);

export default function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const pathname = request.nextUrl.pathname;

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

  return intlMiddleware(request);
}

export const config = {
  matcher: [
    // Match all pathnames except API routes, static files, etc.
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
