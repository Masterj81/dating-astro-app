import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// P0-4 — Soft-deletion with a 7-day grace window.
//
// Flow:
//   1. Verify the caller's JWT.
//   2. Require a "recent auth" (re-authentication within the last 5 minutes)
//      to prevent a drive-by deletion via a stolen token or open session.
//   3. Flip deletion_requested_at / deletion_scheduled_for on profiles.
//   4. Send a confirmation + cancellation email with a signed token.
//   5. A daily cron hard-deletes accounts whose grace window has expired.
//
// Re-auth is detected via `user.last_sign_in_at` (preferred) and falls back
// to the JWT `iat` claim so that API-token sessions still have to refresh.

const RECENT_AUTH_WINDOW_SECONDS = 5 * 60; // 5 minutes
const GRACE_WINDOW_DAYS = 7;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// TODO (ops): inject DELETION_TOKEN_SECRET in the edge function environment.
// Without it, the cancellation link is disabled; users have to contact
// support to abort a deletion. See "Actions manuelles" in the security report.
const DELETION_TOKEN_SECRET = Deno.env.get("DELETION_TOKEN_SECRET") || "";

const EMAIL_FROM =
  Deno.env.get("EMAIL_FROM") || "AstroDating <noreply@astrodatingapp.com>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const APP_BASE_URL =
  Deno.env.get("PUBLIC_WEB_BASE_URL") || "https://www.astrodatingapp.com";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function sign(value: string, secret: string): Promise<string> {
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

async function buildCancellationToken(userId: string, scheduledFor: string): Promise<string | null> {
  if (!DELETION_TOKEN_SECRET) return null;
  // token = base64url(userId:scheduledFor) + "." + hmac
  const payload = `${userId}:${scheduledFor}`;
  const enc = new TextEncoder().encode(payload);
  let bin = "";
  for (const b of enc) bin += String.fromCharCode(b);
  const b64Payload = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sig = await sign(payload, DELETION_TOKEN_SECRET);
  return `${b64Payload}.${sig}`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // --- Recent auth gate ----------------------------------------------------
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const jwt = decodeJwtPayload(token);
    const nowSec = Math.floor(Date.now() / 1000);

    const lastSignInSec = user.last_sign_in_at
      ? Math.floor(new Date(user.last_sign_in_at).getTime() / 1000)
      : null;
    const iatSec = typeof jwt?.iat === "number" ? (jwt.iat as number) : null;

    const mostRecentAuthSec = Math.max(
      lastSignInSec ?? 0,
      iatSec ?? 0,
    );

    if (!mostRecentAuthSec || nowSec - mostRecentAuthSec > RECENT_AUTH_WINDOW_SECONDS) {
      return jsonResponse(
        {
          error: "recent_auth_required",
          message: "Please sign in again to confirm account deletion.",
        },
        401,
      );
    }

    // --- Soft delete ---------------------------------------------------------
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const requestedAt = new Date().toISOString();
    const scheduledFor = new Date(
      Date.now() + GRACE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        deletion_requested_at: requestedAt,
        deletion_scheduled_for: scheduledFor,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("[delete-account] Failed to mark profile for deletion:", updateError.message);
      return jsonResponse({ error: "Failed to schedule account deletion" }, 500);
    }

    // --- Confirmation + cancellation email -----------------------------------
    // The cancellation link hits the cancel-account-deletion edge function
    // directly; that function returns a self-contained HTML confirmation page,
    // so we don't need a matching Next.js route on the web app.
    const cancelToken = await buildCancellationToken(user.id, scheduledFor);
    const cancelUrl = cancelToken
      ? `${SUPABASE_URL}/functions/v1/cancel-account-deletion?token=${encodeURIComponent(cancelToken)}`
      : null;

    if (RESEND_API_KEY && user.email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [user.email],
          subject: "Account Deletion Scheduled - AstroDating",
          html: `<!DOCTYPE html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0b1020;color:#e5e7eb;padding:32px;">
    <div style="max-width:560px;margin:0 auto;background:#12182a;border:1px solid #2a3247;border-radius:16px;padding:28px;">
      <h1 style="color:#fff;">Account deletion scheduled</h1>
      <p>Your AstroDating account will be permanently deleted on
      <strong>${new Date(scheduledFor).toUTCString()}</strong>
      (${GRACE_WINDOW_DAYS} days from now). Your profile is already hidden.</p>
      ${
        cancelUrl
          ? `<p>Changed your mind? You can cancel at any time before that date:</p>
             <p><a href="${cancelUrl}" style="background:#e94560;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;display:inline-block;">Cancel deletion</a></p>`
          : `<p>To cancel the deletion, please contact
             <a href="mailto:support@astrodatingapp.com" style="color:#f9a8d4;">support@astrodatingapp.com</a>.</p>`
      }
      <p style="color:#94a3b8;font-size:13px;">If you did not request this, contact support immediately to secure your account.</p>
    </div>
  </body>
</html>`,
        }),
      }).catch((err) => {
        console.error("[delete-account] email send failed (non-blocking):", err?.message || err);
      });
    }

    return jsonResponse(
      {
        success: true,
        scheduled_for: scheduledFor,
        grace_window_days: GRACE_WINDOW_DAYS,
        cancellation_available: Boolean(cancelUrl),
      },
      200,
    );
  } catch (err) {
    console.error("[delete-account] Error:", (err as Error).message);
    return jsonResponse({ error: "Something went wrong" }, 500);
  }
});
