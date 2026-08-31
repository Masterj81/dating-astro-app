"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordEmailClick } from "@/lib/product-events";

// Records `email_clicked` when a page load carries a lifecycle-email
// `?template=…`.
//
// WHY THIS EXISTS
// The CTAs have carried `template` + three UTM params since the lifecycle
// sequence shipped (send-email/templates.ts `appLink`), and the middleware
// preserves them through the `/app` → `/{locale}/app` redirect. Nothing read
// them. So with 10 emails sent and 0 returns, "nobody clicked" and "everybody
// clicked and bounced" produced the identical row of data — and they call for
// opposite fixes.
//
// MOUNTED GLOBALLY, next to PreferredLanguageSync and WebActivityTracker in
// app/[locale]/layout.tsx. Not on /app alone: the CTAs already point at /app,
// /app/plans and /app/premium/celestial/natal-chart, and any future one should
// be covered without remembering to wire it up.
//
// IT DOES NOT WAIT FOR A SESSION, on purpose. A reader who clicks and bounces
// at the sign-in wall is exactly the case worth separating from a reader who
// never clicked, and they have no auth.uid() at that moment. The RPC accepts
// a null user_id and is granted to anon for that reason.

function EmailLandingTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // recordEmailClick returns immediately unless `template` is present and
    // recognised, so this stays free on ordinary navigations.
    void recordEmailClick(searchParams.toString(), pathname);
  }, [pathname, searchParams]);

  return null;
}

export function EmailLandingTracker() {
  // useSearchParams opts the subtree into client-side rendering; without a
  // Suspense boundary Next.js de-opts every page under this layout to dynamic
  // rendering, which would cost the whole marketing site its static output.
  return (
    <Suspense fallback={null}>
      <EmailLandingTrackerInner />
    </Suspense>
  );
}
