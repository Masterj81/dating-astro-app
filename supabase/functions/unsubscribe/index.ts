import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// One-click unsubscribe for JUNO lifecycle email.
//
// Companion to supabase/functions/send-email. Before this endpoint existed,
// every lifecycle email carried a footer promising the reader they could
// manage their email preferences — with no link, and with
// notification_preferences read from the database and then ignored. That is a
// product defect and, for a Québec sender under CASL, a compliance one.
//
// Two entry points, both unauthenticated by design (the reader is, by
// definition, not in the app):
//
//   GET  ?token=<b64url(userId:category)>.<hmac>   → opt out, render a page
//   POST ?token=…                                   → RFC 8058 one-click,
//                                                     called by Gmail/Yahoo
//                                                     from the
//                                                     List-Unsubscribe-Post
//                                                     header
//
// GET also accepts &action=resubscribe so the confirmation page can offer a
// one-tap undo. An accidental unsubscribe should not be permanent.
//
// The token intentionally never expires: a stale unsubscribe link that fails
// is a compliance failure, not a security improvement. It grants exactly one
// capability — flipping one boolean on one profile — so replay is harmless.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Must match the derivation in send-email/index.ts.
const UNSUBSCRIBE_TOKEN_SECRET =
  Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET") ||
  (SUPABASE_SERVICE_ROLE_KEY ? `juno-unsubscribe-v1:${SUPABASE_SERVICE_ROLE_KEY}` : "");

// Host of the branded result page. `PUBLIC_APP_BASE_URL` is the canonical name
// — send-email/templates.ts reads the same variable to build CTA links, so one
// value governs every URL JUNO puts in front of a reader. `APP_BASE_URL` is
// accepted as an alias so either name works in the function environment.
//
// Setting this to empty string is a supported (if degraded) configuration: the
// function then serves its plain-text fallback instead of redirecting.
const APP_ORIGIN_FALLBACK = "https://app.junosynastry.com";

/**
 * Origin only — see the matching appOrigin() in send-email/templates.ts.
 *
 * A locale in this value (production briefly had `.../en`) pins every reader to
 * one language: the web middleware negotiates the locale itself for a
 * locale-less path, so `/unsubscribe` becomes `/fr/unsubscribe` for a French
 * browser, and `/en/unsubscribe` stays English for everyone.
 */
function appOrigin(raw: string | undefined): string {
  try {
    return new URL(raw || APP_ORIGIN_FALLBACK).origin;
  } catch {
    return APP_ORIGIN_FALLBACK;
  }
}

const APP_BASE_URL = appOrigin(
  Deno.env.get("PUBLIC_APP_BASE_URL") || Deno.env.get("APP_BASE_URL"),
);

// NOTE: junosynastry.com has no MX record as of 2026-08-27, so mail to this
// address bounces. It appears only in the plain-text fallback, which is itself
// only reached when APP_BASE_URL is unset; the branded page routes people to
// the contact form instead. Set SUPPORT_EMAIL once a mailbox exists.
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "support@junosynastry.com";

// Must match LIFECYCLE_PREF_KEY in send-email/index.ts.
const LIFECYCLE_PREF_KEY = "lifecycleEmails";

function b64UrlDecode(s: string): string {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + pad, "=");
  return atob(b64);
}

async function hmac(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyToken(
  token: string,
): Promise<{ userId: string; category: string } | null> {
  if (!UNSUBSCRIBE_TOKEN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64Payload, sig] = parts;

  let payload: string;
  try {
    payload = b64UrlDecode(b64Payload);
  } catch {
    return null;
  }

  const expectedSig = await hmac(payload, UNSUBSCRIBE_TOKEN_SECRET);
  if (!constantTimeEqual(sig, expectedSig)) return null;

  const colonIdx = payload.lastIndexOf(":");
  if (colonIdx <= 0) return null;
  const userId = payload.slice(0, colonIdx);
  const category = payload.slice(colonIdx + 1);

  if (!UUID_REGEX.test(userId)) return null;
  if (category !== "lifecycle") return null;

  return { userId, category };
}

/**
 * Merge a single key into notification_preferences without disturbing the
 * others. Read-modify-write rather than a jsonb_set RPC so this stays a
 * self-contained edge function with no migration attached.
 */
async function setLifecyclePreference(
  userId: string,
  enabled: boolean,
): Promise<{ ok: boolean; reason: string }> {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: row, error: selErr } = await supabaseAdmin
    .from("profiles")
    .select("id, notification_preferences")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("[unsubscribe] select failed:", selErr.message);
    return { ok: false, reason: "lookup_failed" };
  }
  if (!row) return { ok: false, reason: "not_found" };

  const prefs =
    row.notification_preferences && typeof row.notification_preferences === "object"
      ? { ...(row.notification_preferences as Record<string, unknown>) }
      : {};

  prefs[LIFECYCLE_PREF_KEY] = enabled;

  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({
      notification_preferences: prefs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updErr) {
    console.error("[unsubscribe] update failed:", updErr.message);
    return { ok: false, reason: "update_failed" };
  }

  return { ok: true, reason: "ok" };
}

/**
 * Also cancel anything still queued for this user, so an unsubscribe takes
 * effect immediately instead of only from the next scheduling pass.
 * Non-blocking: a failure here must not turn a successful opt-out into an
 * error page.
 */
async function cancelPendingLifecycleEmails(userId: string): Promise<void> {
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabaseAdmin
      .from("scheduled_emails")
      .update({ status: "cancelled" })
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) {
      console.error("[unsubscribe] cancel pending failed:", error.message);
    }
  } catch (err) {
    console.error("[unsubscribe] cancel pending threw:", (err as Error).message);
  }
}

/**
 * Human-facing response for the GET path.
 *
 * DELIBERATELY text/plain, not HTML. The Supabase edge gateway neutralises any
 * HTML served by a function — presumably so *.supabase.co cannot be used to
 * host phishing pages. Verified against this project on 2026-08-27: a response
 * sent as `text/html; charset=utf-8` comes back as
 *
 *     Content-Type: text/plain
 *     X-Content-Type-Options: nosniff
 *     Content-Security-Policy: default-src 'none'; sandbox
 *
 * while a JSON response from a sibling function keeps `application/json` and
 * gets neither header. The downgrade is triggered by the content type, not by
 * the status code, so a 200 confirmation page is neutralised exactly like a
 * 400 — the reader would be shown raw markup.
 *
 * (The same applies to cancel-account-deletion, which still serves HTML.)
 *
 * That is why the branded page now lives on the web app and this endpoint
 * redirects to it — see redirectToResult(). This function survives only as the
 * fallback for when APP_BASE_URL is unset, so that a misconfiguration degrades
 * to "ugly but working" rather than breaking the unsubscribe link, which would
 * be a compliance failure.
 *
 * Format for the medium we actually get: plain text renders correctly in every
 * browser. Do NOT "improve" this back to HTML — it will silently render as
 * source, and a validator check enforces that.
 */
function page(title: string, message: string, status: number): Response {
  const lines = [
    title.toUpperCase(),
    "",
    message,
  ];

  lines.push(
    "",
    "—",
    "This only affects onboarding and lifecycle email. Account and",
    "security messages are always delivered.",
    "",
    `JUNO — ${APP_BASE_URL}/app`,
    SUPPORT_EMAIL,
  );

  return new Response(lines.join("\n") + "\n", {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Statuses understood by the web result page
 * (apps/web/src/app/[locale]/unsubscribe/page.tsx). Anything else falls back
 * to `invalid` there, so the two lists cannot silently drift into a blank page.
 */
type ResultStatus =
  | "unsubscribed"
  | "resubscribed"
  | "invalid"
  | "error"
  | "gone";

/**
 * Send a human to the branded result page.
 *
 * Only `status` crosses the boundary — never the token. A token in a Vercel URL
 * would end up in browser history, referrer headers and access logs, and it
 * buys nothing: undoing an accidental unsubscribe goes through support, which
 * can call this function with `?action=resubscribe`.
 *
 * 303 rather than 302 so the redirect is unambiguously a GET, and no-store so a
 * cached result page can never be shown for a later, different outcome.
 */
function redirectToResult(status: ResultStatus): Response | null {
  if (!APP_BASE_URL) return null;
  const target = `${APP_BASE_URL}/unsubscribe?status=${status}`;
  return new Response(null, {
    status: 303,
    headers: { Location: target, "Cache-Control": "no-store" },
  });
}

/**
 * Human-facing outcome: the branded page when we have somewhere to send them,
 * the plain-text fallback when APP_BASE_URL is unset. The fallback exists so a
 * misconfiguration degrades to "ugly but working" rather than "the unsubscribe
 * link is broken", which would be a compliance failure.
 */
function humanResult(
  status: ResultStatus,
  fallbackTitle: string,
  fallbackBody: string,
  fallbackCode: number,
): Response {
  return (
    redirectToResult(status) ?? page(fallbackTitle, fallbackBody, fallbackCode)
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const parsed = token ? await verifyToken(token) : null;

  // ---- RFC 8058 one-click (mail clients POST here) ----
  // Mail providers expect a 2xx and ignore the body. Never render an error
  // page here — a non-2xx makes Gmail show the unsubscribe as failed.
  if (req.method === "POST") {
    if (!parsed) {
      console.warn("[unsubscribe] one-click POST with invalid token");
      return new Response(JSON.stringify({ ok: false }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const result = await setLifecyclePreference(parsed.userId, false);
    if (result.ok) await cancelPendingLifecycleEmails(parsed.userId);
    return new Response(JSON.stringify({ ok: result.ok }), {
      status: result.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ---- GET (a human clicked the link) ----
  //
  // Every branch below ends in a redirect to the branded result page. The
  // plain-text bodies are only reached when APP_BASE_URL is unset.
  if (!token || !parsed) {
    return humanResult(
      "invalid",
      "We couldn't verify this link",
      (token
        ? "This unsubscribe link doesn't look valid — it may have been altered\n" +
          "in transit."
        : "This unsubscribe link is missing its token.") +
        `\nWrite to ${SUPPORT_EMAIL} and we'll unsubscribe you by hand.\n` +
        "You don't have to sign in.",
      400,
    );
  }

  const wantsResubscribe = url.searchParams.get("action") === "resubscribe";
  const result = await setLifecyclePreference(parsed.userId, wantsResubscribe);

  if (!result.ok) {
    if (result.reason === "not_found") {
      return humanResult(
        "gone",
        "Nothing to unsubscribe",
        "We couldn't find an account for this link. It may already have been\n" +
          "deleted — either way, you won't receive anything further.",
        404,
      );
    }
    return humanResult(
      "error",
      "Something went wrong",
      "We couldn't update your preferences just now. Please write to\n" +
        `${SUPPORT_EMAIL} and we'll do it by hand.`,
      500,
    );
  }

  if (wantsResubscribe) {
    return humanResult(
      "resubscribed",
      "You're subscribed again",
      "You'll receive JUNO onboarding and lifecycle email as before.",
      200,
    );
  }

  await cancelPendingLifecycleEmails(parsed.userId);

  // No undo link is offered here. It would have to carry the token, and the
  // redirect target is a public web URL — token in browser history, in the
  // referrer, in Vercel's access logs. Resubscribing goes through support,
  // which can call this endpoint with `?action=resubscribe`.
  return humanResult(
    "unsubscribed",
    "You're unsubscribed",
    "You won't receive any more JUNO onboarding or lifecycle email.\n" +
      "Anything already queued has been cancelled. Your account itself is\n" +
      "untouched.",
    200,
  );
});
