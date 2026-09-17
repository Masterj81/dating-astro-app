import { createHmac } from "crypto";

/**
 * Server-side protections for the public contact form (JUNO-07, 2026-09-17).
 *
 * Three barriers, in the order the route applies them:
 *   1. Turnstile (anti-automation) — verified against Cloudflare siteverify,
 *      fail-closed.
 *   2. Durable per-origin limit  — `contact:origin:<hmac>` 5 / hour.
 *   3. Durable per-address limit — `contact:addr:<hmac>`   3 / hour.
 *
 * The HMAC keys exist so the raw email (or the visitor IP) NEVER reaches the
 * `edge_rate_limits` table or any log: the bucket is an irreversibly keyed
 * digest, and because the key is a server-only secret, an attacker who knows
 * a victim's address or IP still cannot compute — and therefore cannot burn —
 * their bucket by calling the RPC directly (it is granted to `authenticated`).
 */

/** Per network-origin: 5 submissions per hour. Generous for a human who
 *  retries after an error, useless for a script. */
export const CONTACT_ORIGIN_MAX = 5;
/** Per contact address: 3 per hour — stricter, because a relay abuser
 *  targeting many mailboxes still has to name each one. */
export const CONTACT_ADDR_MAX = 3;
export const CONTACT_WINDOW_SECONDS = 3600;

export const CONTACT_TURNSTILE_TIMEOUT_MS = 5000;
const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * The network origin of a request, behind Vercel.
 *
 * `x-forwarded-for` is a comma list where each proxy APPENDS the address it
 * saw; the client-controlled part of the chain sits on the LEFT. The LAST
 * entry is therefore the one added by the proxy closest to us — Vercel's
 * edge, which reports the true client IP. Taking the first entry (as the old
 * request-deletion code did) trusts whatever the client sent.
 *
 * Absent or unparseable header → a single explicit fallback bucket. We do
 * NOT pretend to have an IP-based protection we cannot establish: the shared
 * `origin:unknown` bucket is capped like any other, and the address limit
 * plus Turnstile remain.
 */
export function getClientOrigin(request: Request): string {
  const raw = request.headers.get("x-forwarded-for") ?? "";
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return "origin:unknown";
  const candidate = parts[parts.length - 1];
  // Accept only something that plausibly parses as an IP (v4/v6); Vercel
  // always sends a bare address. Anything else is treated as no origin.
  if (/^[0-9a-fA-F.:]{3,45}$/.test(candidate)) return candidate;
  return "origin:unknown";
}

/**
 * Irreversible, keyed bucket for a rate-limit key. Returns `null` when the
 * server secret is not configured — the caller must then FAIL CLOSED (503),
 * never fall back to an unsalted digest (emails are low-entropy: an unsalted
 * hash would be a dictionary away from plaintext).
 */
export function hmacBucket(namespace: string, value: string): string | null {
  const secret = process.env.CONTACT_HASH_SECRET;
  if (!secret || secret.length < 32) return null;
  return (
    namespace +
    ":" +
    createHmac("sha256", secret).update(value).digest("hex").slice(0, 32)
  );
}

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "unconfigured" | "unreachable" };

/**
 * Verify a Turnstile token server-side. Fail-closed on every axis:
 *   - secret not configured → unconfigured (503, form disabled)
 *   - token absent          → missing      (400)
 *   - siteverify unreachable / 5xx / malformed → unreachable (503)
 *   - success !== true      → invalid      (400 — covers expired and
 *                                          already-used tokens)
 * The token itself is never logged.
 */
export async function verifyTurnstile(
  token: unknown,
  origin: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: "unconfigured" };
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) {
    return { ok: false, reason: "missing" };
  }
  let outcome: { success: boolean } | null = null;
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (origin !== "origin:unknown") params.set("remoteip", origin);
    const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: AbortSignal.timeout(CONTACT_TURNSTILE_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "unreachable" };
    const data = (await res.json()) as { success?: unknown };
    if (typeof data.success !== "boolean") return { ok: false, reason: "unreachable" };
    outcome = { success: data.success };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  return outcome.success ? { ok: true } : { ok: false, reason: "invalid" };
}
