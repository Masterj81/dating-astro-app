import { supabase } from './supabase';

// Records that the signed-in account opened the app.
//
// P0-2 of docs/retention-day2-audit-2026-08.md. `profiles.last_active` exists
// in the schema and is READ in one place (app/chat/[id].tsx) but has never been
// written by anything. That single gap is why no retention number is
// computable today: D+1, D+2, D+7 and DAU all reduce to "did this account come
// back", and nothing records that it did.
//
// It is also a hard dependency for the email lifecycle. Every message past
// D+1 is meant to be cancelled when the reader returns; without a return
// timestamp the sequence can only send to everyone, active users included.
//
// Best effort, like every other preference write in this codebase: a missed
// beacon is a missing data point, never a broken session.

// One write per account per window. Foregrounding is noisy — task switching,
// notification shade, biometric prompts — and none of that is a distinct
// visit.
const MIN_INTERVAL_MS = 5 * 60 * 1000;

let lastWrittenAt = 0;
let lastUserId: string | null = null;

/**
 * Stamp `profiles.last_active` for the signed-in account.
 *
 * Safe to call on mount and on every foreground: it is a no-op when there is
 * no session, and when the same account already reported inside the window.
 */
export async function touchLastActive(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return;

    const now = Date.now();
    if (userId === lastUserId && now - lastWrittenAt < MIN_INTERVAL_MS) return;

    const { error } = await supabase
      .from('profiles')
      .update({ last_active: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      if (__DEV__) console.warn('[activity] last_active write failed:', error.message);
      return;
    }

    lastUserId = userId;
    lastWrittenAt = now;
  } catch (err) {
    if (__DEV__) console.warn('[activity] touchLastActive threw:', err);
  }
}

/** Forget the throttle — call on sign-out so the next account reports at once. */
export function resetActivityThrottle(): void {
  lastWrittenAt = 0;
  lastUserId = null;
}
