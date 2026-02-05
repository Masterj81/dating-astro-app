// Client-side throttle — prevents redundant network calls.
// Server-side triggers are the real enforcement; this is for UX.

const lastCall: Record<string, number> = {};

/**
 * Returns true if the action is allowed, false if throttled.
 * @param key   Unique action identifier (e.g. "swipe", "sendMessage")
 * @param msGap Minimum milliseconds between allowed calls
 */
export function throttleAction(key: string, msGap: number): boolean {
  const now = Date.now();
  const prev = lastCall[key] ?? 0;
  if (now - prev < msGap) return false;
  lastCall[key] = now;
  return true;
}
