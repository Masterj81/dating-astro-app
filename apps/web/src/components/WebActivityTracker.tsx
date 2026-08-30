"use client";

import { useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { resetActivityThrottle, touchLastActive } from "@/lib/web-activity";

// Writes `profiles.last_active` when a signed-in reader opens or returns to
// the web app. The mobile equivalent lives in apps/mobile/services/activity.ts
// and is called from the root layout's AppState handler; this is the same
// beacon for the browser and, crucially, for the iOS PWA.
//
// Renders nothing. Mounted once, globally, next to PreferredLanguageSync in
// app/[locale]/layout.tsx — NOT inside AppShell. The marketing pages, the
// account pages and /app all count as "the reader came back", and a reader who
// lands on the localised home page and never opens /app is exactly the D+1
// return the retention audit is trying to see.
//
// Four triggers, because the web has no single "app became active" event:
//
//   1. mount                 — a fresh page load or a client-side navigation
//                              into the tree.
//   2. onAuthStateChange     — the first moment we know who the reader is,
//                              which on a cold load happens after mount.
//   3. visibilitychange      — tab focus, phone unlock, app-switcher return.
//   4. pageshow (persisted)  — bfcache restore. iOS Safari and standalone PWAs
//                              resume from bfcache constantly and fire NO
//                              visibilitychange when they do, so without this
//                              a returning iOS reader would go unrecorded for
//                              the whole session.
//
// The 5-minute throttle in web-activity.ts absorbs the overlap between them.

export function WebActivityTracker() {
  useEffect(() => {
    let cancelled = false;

    const beacon = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void touchLastActive();
    };

    // 1. Mount.
    beacon();

    let unsubscribe: (() => void) | undefined;

    try {
      const supabase = getSupabaseBrowser();

      // 2. Sign-in / token refresh — the first point at which a cold load
      //    actually knows the reader. Sign-out clears the throttle so the next
      //    account reports immediately instead of inheriting this one's window.
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (cancelled) return;
        if (event === "SIGNED_OUT") {
          resetActivityThrottle();
          return;
        }
        beacon();
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch {
      // Supabase env vars missing (e.g. a preview build) — the listeners below
      // still attach harmlessly; touchLastActive swallows its own failures.
    }

    // 3 + 4. Returning to the page.
    const onVisibility = () => {
      if (document.visibilityState === "visible") beacon();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) beacon();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      unsubscribe?.();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return null;
}
