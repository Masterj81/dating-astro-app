// Records that the signed-in account opened the web app / PWA.
//
// This is the web half of `apps/mobile/services/activity.ts`. That file
// explains the why at length; the short version is that `profiles.last_active`
// is the ONLY column from which D+1 / D+2 / D+7 and DAU can be computed, and
// until it is written those numbers do not exist. It was wired on mobile by
// P0-2 of docs/retention-day2-audit-2026-08.md and left unwired on web — which
// matters more than it sounds, because iOS reaches JUNO through the PWA, so
// every iOS reader was invisible to retention reporting.
//
// It is also a hard dependency for the lifecycle email sequence: every message
// past D+1 is meant to cancel itself when the reader comes back. Without a
// return timestamp the sequence can only send to everyone, active readers
// included.
//
// Best effort, exactly like `PreferredLanguageSync`: a missed beacon is a
// missing data point, never a broken page. Every failure path is swallowed.

import { getSupabaseBrowser } from "@/lib/supabase-browser";

// One write per account per window. Tab focus is noisy on the web — switching
// tabs, unlocking the phone, returning from the app switcher on iOS — and none
// of that is a distinct visit. Same 5 minutes as mobile, so the two platforms
// produce comparable numbers.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastWrittenAt = 0;
let lastUserId: string | null = null;

/**
 * Stamp `profiles.last_active` for the signed-in account.
 *
 * Safe to call on mount, on tab focus, and on bfcache restore: it is a no-op
 * when there is no session, and when the same account already reported inside
 * the window.
 */
export async function touchLastActive(): Promise<void> {
  try {
    const supabase = getSupabaseBrowser();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;
    if (!userId) return;

    const now = Date.now();
    if (userId === lastUserId && now - lastWrittenAt < MIN_INTERVAL_MS) return;

    // Claim the window BEFORE awaiting the write. Two visibility events can
    // fire in the same tick (iOS Safari emits pageshow and visibilitychange
    // together on resume); without this, both would pass the throttle check
    // and issue duplicate updates.
    const previousUserId = lastUserId;
    const previousWrittenAt = lastWrittenAt;
    lastUserId = userId;
    lastWrittenAt = now;

    const { error } = await supabase
      .from("profiles")
      .update({ last_active: new Date().toISOString() })
      .eq("id", userId);

    if (error) {
      // Release the window so the next event can retry rather than sitting
      // out five minutes on a failure that may have been transient.
      lastUserId = previousUserId;
      lastWrittenAt = previousWrittenAt;
    }
  } catch {
    /* best effort — never surface to the reader */
  }
}

/** Forget the throttle — call on sign-out so the next account reports at once. */
export function resetActivityThrottle(): void {
  lastWrittenAt = 0;
  lastUserId = null;
}
