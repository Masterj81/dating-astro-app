"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { recordEmailClick } from "@/lib/product-events";

// Records `email_clicked` when a page load carries a lifecycle-email
// `?template=…`, and attributes it once the reader is known.
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
// IT FIRES TWICE, ON PURPOSE
//   1. on mount — even with no session. A reader who clicks and bounces at the
//      sign-in wall is exactly the case worth separating from a reader who
//      never clicked, and they have no auth.uid() at that moment. The RPC
//      accepts a null user_id and is granted to anon for that reason.
//   2. on sign-in — because that first path is the DOMINANT one. Lifecycle mail
//      opens in a mail app, which hands the link to a browser that usually has
//      no session; identity only arrives after the login. Without this second
//      call, `user_id` would be NULL for most real clicks and every query
//      joining clicks to profiles would come back empty.
//
// The two calls carry the same `client_event_id`, so the second upgrades the
// row in place rather than adding a duplicate (migration 20260831000002).

function EmailLandingTrackerInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const search = searchParams.toString();

    // recordEmailClick returns immediately unless `template` is present and
    // recognised, so this stays free on ordinary navigations.
    void recordEmailClick(search, pathname);

    let unsubscribe: (() => void) | undefined;
    try {
      const supabase = getSupabaseBrowser();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        // SIGNED_IN and the initial session restore are the two moments the
        // reader's identity becomes available on a page that started without
        // one. Re-record: same id, so the existing row gains its user_id.
        if (event === "SIGNED_OUT") return;
        void recordEmailClick(search, pathname);
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Supabase env vars missing (e.g. a preview build). The mount-time call
      // above already swallowed its own failure.
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
