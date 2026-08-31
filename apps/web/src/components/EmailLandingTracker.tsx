"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { attributePendingClick, recordEmailClick } from "@/lib/product-events";

// Records `email_clicked` when a page load carries a lifecycle-email
// `?template=…`, and attaches it to the reader whenever identity turns up —
// which is usually two navigations later.
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
// app/[locale]/layout.tsx. Two reasons, and the second is the important one:
//   1. the CTAs already point at /app, /app/plans and
//      /app/premium/celestial/natal-chart, and any future one should be
//      covered without remembering to wire it up;
//   2. the page that can finally ATTRIBUTE the click is not the page that
//      received it. A signed-out reader is bounced to /auth/login and comes
//      back on a URL with no `template` at all (AppShell builds `next` from
//      the pathname alone), so the attribution attempt has to run everywhere.
//
// TWO DISTINCT JOBS
//   recordEmailClick      — only fires on a URL carrying a known template.
//                           Writes the row, even with no session: a click that
//                           bounces at the sign-in wall is exactly the case
//                           worth separating from a click that never happened.
//   attributePendingClick — fires on every page and on every auth change.
//                           Replays the parked click once a session exists, by
//                           the same client_event_id, so the original row gains
//                           its user_id instead of gaining a twin.

function EmailLandingTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Cheap on ordinary navigations: both calls return immediately when there
    // is no template in the URL and nothing parked in sessionStorage.
    void recordEmailClick(searchParams.toString(), pathname);
    void attributePendingClick();

    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = getSupabaseBrowser();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        // The sign-in that ends the redirect trip is the moment the parked
        // click can finally be attached to someone.
        if (event === "SIGNED_OUT") return;
        void attributePendingClick();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Supabase env vars missing (e.g. a preview build). The calls above
      // already swallowed their own failures.
    }

    return () => unsubscribe?.();
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
