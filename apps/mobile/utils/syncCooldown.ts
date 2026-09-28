// JUNO-06 PR A — UX cooldown for the sync-entitlement 429.
//
// The EDGE owns the throttle (one sync attempt per account per 30 s, claimed
// atomically on entitlement_sync_claims). This class is the client-side
// MIRROR of that window, for UX only:
//   * it disables the "check my subscription" button for the mirrored window
//     so an impatient reader does not hammer a fail-closed 429;
//   * it is NEVER an authorization, never gates a feature, never blocks a
//     server decision — only the button that starts a NEW sync;
//   * its expiry triggers NOTHING: when it lapses the button simply becomes
//     tappable again — no automatic call, ever. The 30 s server window is
//     measured from the SERVER's claim, not from this deadline; if the two
//     drift, the server still answers 429 and this UI stays honest.
//
// Pure and synchronous so the behavior suite can drive it with explicit
// clocks (fake timers) without rendering anything.
import { SYNC_RETRY_COOLDOWN_MS } from '../services/premiumUsage';

export class SyncCooldown {
  private deadlineMs = 0;

  /** Start (or restart) the cooldown window from `now`. */
  start(now: number = Date.now()): void {
    this.deadlineMs = now + SYNC_RETRY_COOLDOWN_MS;
  }

  /** Seconds left, rounded up; 0 once the window has lapsed. */
  remainingSeconds(now: number = Date.now()): number {
    return Math.max(0, Math.ceil((this.deadlineMs - now) / 1000));
  }

  /** True while the mirrored window is still running. */
  isActive(now: number = Date.now()): boolean {
    return this.deadlineMs > now;
  }

  /** Clear early (defensive — nothing in the UI needs this today). */
  clear(): void {
    this.deadlineMs = 0;
  }
}
