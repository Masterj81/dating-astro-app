import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// P0-4 support — Cancel a pending account deletion.
//
// This endpoint is GET-friendly so it can be hit directly from the
// cancellation email link. It accepts:
//   - ?token=<base64url(userId:scheduledFor).hmac>
//   - OR an authenticated POST with a JWT that matches the profile.
//
// The token is signed with DELETION_TOKEN_SECRET (HMAC-SHA256) — see the
// matching buildCancellationToken() in supabase/functions/delete-account.
//
// On success we clear deletion_requested_at / deletion_scheduled_for and
// restore is_active = TRUE so the profile becomes visible again.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DELETION_TOKEN_SECRET = Deno.env.get("DELETION_TOKEN_SECRET") || "";

const APP_BASE_URL =
  Deno.env.get("PUBLIC_WEB_BASE_URL") || "https://www.astrodatingapp.com";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

async function verifyToken(
  token: string,
): Promise<{ userId: string; scheduledFor: string } | null> {
  if (!DELETION_TOKEN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64Payload, sig] = parts;

  let payload: string;
  try {
    payload = b64UrlDecode(b64Payload);
  } catch {
    return null;
  }

  const expectedSig = await hmac(payload, DELETION_TOKEN_SECRET);
  if (!constantTimeEqual(sig, expectedSig)) return null;

  const colonIdx = payload.lastIndexOf(":");
  if (colonIdx <= 0) return null;
  const userId = payload.slice(0, colonIdx);
  const scheduledFor = payload.slice(colonIdx + 1);

  // Basic sanity: scheduled_for must parse to a future or recent date.
  const ts = Date.parse(scheduledFor);
  if (Number.isNaN(ts)) return null;

  return { userId, scheduledFor };
}

async function cancelForUserId(userId: string) {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Only clear if a deletion is actually pending — avoid reviving accounts
  // that were never scheduled (or were already hard-deleted).
  const { data: row, error: selErr } = await supabaseAdmin
    .from("profiles")
    .select("id, deletion_requested_at, deletion_scheduled_for")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    console.error("[cancel-account-deletion] select failed:", selErr.message);
    return { ok: false, reason: "lookup_failed" as const };
  }
  if (!row) return { ok: false, reason: "not_found" as const };
  if (!row.deletion_requested_at) {
    return { ok: false, reason: "no_pending_deletion" as const };
  }

  // If the grace window has expired, the daily cron may already have
  // hard-deleted the user; refuse to "cancel" a deletion that is effectively
  // already final.
  if (
    row.deletion_scheduled_for &&
    new Date(row.deletion_scheduled_for).getTime() < Date.now()
  ) {
    return { ok: false, reason: "grace_window_expired" as const };
  }

  const { error: updErr } = await supabaseAdmin
    .from("profiles")
    .update({
      deletion_requested_at: null,
      deletion_scheduled_for: null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updErr) {
    console.error("[cancel-account-deletion] update failed:", updErr.message);
    return { ok: false, reason: "update_failed" as const };
  }

  return { ok: true as const, reason: "ok" as const };
}

function htmlResponse(title: string, message: string, status: number) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#0b1020;color:#e5e7eb;padding:40px;">
  <div style="max-width:560px;margin:0 auto;background:#12182a;border:1px solid #2a3247;border-radius:16px;padding:28px;">
    <h1 style="color:#fff;">${title}</h1>
    <p>${message}</p>
    <p><a href="${APP_BASE_URL}" style="color:#f9a8d4;">Return to AstroDating</a></p>
  </div>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --------- Token-based (GET, from email link) ---------
  if (req.method === "GET") {
    const token = url.searchParams.get("token") || "";
    if (!token) {
      return htmlResponse(
        "Invalid link",
        "This cancellation link is missing its token. Please use the link in the email we sent you.",
        400,
      );
    }

    const parsed = await verifyToken(token);
    if (!parsed) {
      return htmlResponse(
        "Invalid or expired link",
        "We couldn't verify this cancellation link. If you still want to keep your account, please sign back in and contact support@astrodatingapp.com.",
        400,
      );
    }

    const result = await cancelForUserId(parsed.userId);
    if (result.ok) {
      return htmlResponse(
        "Deletion cancelled",
        "Your account deletion has been cancelled. Your profile is active again.",
        200,
      );
    }
    if (result.reason === "grace_window_expired") {
      return htmlResponse(
        "Too late to cancel",
        "The 7-day grace window has already passed. Please contact support if you believe this is in error.",
        410,
      );
    }
    return htmlResponse(
      "Nothing to cancel",
      "No pending deletion was found for this account.",
      404,
    );
  }

  // --------- JWT-based (POST, from the authenticated app) ---------
  if (req.method === "POST") {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const result = await cancelForUserId(user.id);
    if (result.ok) return jsonResponse({ success: true }, 200);
    if (result.reason === "grace_window_expired") {
      return jsonResponse({ error: "grace_window_expired" }, 410);
    }
    return jsonResponse({ error: result.reason }, 404);
  }

  return new Response("Method not allowed", { status: 405 });
});
