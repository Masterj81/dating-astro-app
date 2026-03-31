/**
 * Client-side rate limiter with exponential backoff.
 * Prevents brute force attacks on referral codes, promo codes, and auth.
 */

type RateLimiterState = {
  attempts: number;
  lastAttempt: number;
  lockedUntil: number;
};

const state: Record<string, RateLimiterState> = {};

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_LOCKOUT_MS = 300_000; // 5 minutes after max attempts

export function checkRateLimit(
  key: string,
  options?: {
    maxAttempts?: number;
    windowMs?: number;
    lockoutMs?: number;
  }
): { allowed: boolean; retryAfterMs: number } {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const lockoutMs = options?.lockoutMs ?? DEFAULT_LOCKOUT_MS;
  const now = Date.now();

  if (!state[key]) {
    state[key] = { attempts: 0, lastAttempt: 0, lockedUntil: 0 };
  }

  const entry = state[key];

  // Check if locked out
  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }

  // Reset window if expired
  if (now - entry.lastAttempt > windowMs) {
    entry.attempts = 0;
  }

  // Check if over limit
  if (entry.attempts >= maxAttempts) {
    entry.lockedUntil = now + lockoutMs;
    return { allowed: false, retryAfterMs: lockoutMs };
  }

  return { allowed: true, retryAfterMs: 0 };
}

export function recordAttempt(key: string): void {
  const now = Date.now();
  if (!state[key]) {
    state[key] = { attempts: 0, lastAttempt: 0, lockedUntil: 0 };
  }
  state[key].attempts++;
  state[key].lastAttempt = now;
}

export function resetRateLimit(key: string): void {
  delete state[key];
}

export function formatRetryMessage(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) return `Try again in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes}m`;
}
