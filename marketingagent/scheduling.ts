/**
 * Shared scheduling helpers — next posting window, human-to-Date parsing.
 *
 * Previously duplicated between dashboard.ts (as `getNextPostingWindow` returning
 * an ISO string) and schedule-server.ts (as `getNextSlot` returning a Date).
 * Now both callers route through this module so the window rules can't drift.
 */

import { POSTING_WINDOW_HOURS } from "./constants.js";

/**
 * Next posting slot strictly in the future.
 *
 * At exactly 11:00:00.000 the result is 12:00 (not 11:00) — we never schedule
 * in the same tick as "now", because the dashboard scheduler polls every 30s
 * and would double-publish.
 */
export function getNextPostingWindow(from: Date = new Date()): Date {
  const next = new Date(from);
  for (const hour of POSTING_WINDOW_HOURS) {
    if (hour > next.getHours()) {
      next.setHours(hour, 0, 0, 0);
      return next;
    }
  }
  next.setDate(next.getDate() + 1);
  next.setHours(POSTING_WINDOW_HOURS[0], 0, 0, 0);
  return next;
}

/** Convenience: ISO-string form for callers that persist into JSON. */
export function getNextPostingWindowISO(from: Date = new Date()): string {
  return getNextPostingWindow(from).toISOString();
}

/**
 * Parse a user-supplied schedule input.
 *   "next"                 → next posting window
 *   "tomorrow"             → tomorrow 11:00
 *   "tomorrow HH:MM"       → tomorrow at HH:MM
 *   anything else          → new Date(input); rejects NaN and dates > 60s in the past
 */
export function parseDateTime(input: string): Date {
  if (input === "next") return getNextPostingWindow();

  if (input.startsWith("tomorrow")) {
    const time = input.replace("tomorrow", "").trim();
    const [hours, minutes] = (time || "11:00").split(":").map(Number);
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes || 0, 0, 0);
    return next;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${input}"`);
  }
  // Catch typos like "2025-..." (past year) before they queue an instant publish.
  if (parsed.getTime() < Date.now() - 60_000) {
    throw new Error(`Refusing to schedule in the past: "${input}" -> ${parsed.toISOString()}`);
  }
  return parsed;
}
