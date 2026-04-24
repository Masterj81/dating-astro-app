/**
 * Shared helpers for the marketing agent.
 *
 * Keep this file small and dependency-free — it is imported by both the CLI
 * (agent.ts, evolve.ts, schedule-server.ts) and the dashboard server.
 */

import { writeFileSync, renameSync, unlinkSync, existsSync } from "fs";
import { randomUUID } from "crypto";

/**
 * Atomic write: serialize, write to <path>.tmp, fsync via writeFileSync, then rename.
 *
 * Why: posts.json / memory.json / schedule.json are concurrently touched by the
 * agent CLI and the dashboard's 30s scheduler interval. A non-atomic write that
 * is interrupted (Ctrl+C, crash, race) leaves a half-written JSON file that
 * crashes the next loadPosts() call. Rename-into-place avoids that.
 */
export function atomicWriteJson(path: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const tmp = `${path}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
  writeFileSync(tmp, json);
  try {
    renameSync(tmp, path);
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch { /* ignore */ }
    }
    throw err;
  }
}

/**
 * fetch() wrapper with a default 30s timeout via AbortSignal.
 *
 * Why: outbound calls (Anthropic, Blotato, Gemini, Pollinations, Supabase
 * Storage) have no timeout by default. A hung TCP connection blocks the agent
 * indefinitely, which on the dashboard means the scheduler never wakes back up.
 */
export async function fetchWithTimeout(
  input: string | URL | Request,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, signal: callerSignal, ...rest } = init;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...rest, signal });
}

/**
 * Generate a collision-resistant filename suffix.
 *
 * Why: image-generator.ts used to produce `post-${Date.now()}.png`, which
 * collides when two variants are generated in the same millisecond.
 */
export function uniqueSuffix(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}
