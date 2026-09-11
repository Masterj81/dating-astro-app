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
  Deno.env.get("EMAIL_FROM") || "JUNO <noreply@junosynastry.com>";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
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

// ---------------------------------------------------------------------------
// The "deletion scheduled" email — email 2 of 3 in the account-deletion flow.
//
// A pure function, exported, and kept out of the request handler on purpose:
// the vitest suite in packages/shared renders it and asserts on the HTML and
// text a reader receives. Inside `Deno.serve` it was unreachable by any test.
//
// Every dynamic value is escaped, and the two the server generated are ALSO
// validated by shape before they are rendered: an unexpected cancel URL is
// treated as "no link" (the reader is told to write to support), an invalid
// date refuses to render. Guessing is not an option in a security email.
// ---------------------------------------------------------------------------

/** The address readers are told to write to. Displayed, never a recipient. */
export const SUPPORT_EMAIL = "support@junosynastry.com";

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // \u0022 and \u0027 are the two quote characters, written as escapes so a
    // regex literal never contains a bare quote: the test harness that extracts
    // this function by brace matching knows strings but not regexes.
    .replace(/\u0022/g, "&quot;")
    .replace(/\u0027/g, "&#x27;");
}

/**
 * The only cancel link this email may carry: this project's own
 * cancel-account-deletion function, over https, with a token made of the
 * base64url alphabet plus the "." separator, percent-encoded or not.
 */
export function isAcceptableCancelUrl(url: string | null, supabaseUrl: string): url is string {
  if (!url || !supabaseUrl) return false;
  if (!url.startsWith(`${supabaseUrl}/functions/v1/cancel-account-deletion?token=`)) return false;
  const token = url.slice(url.indexOf("?token=") + 7);
  return /^[A-Za-z0-9._~%-]{20,}$/.test(token);
}

export interface DeletionScheduledInput {
  /** ISO-8601 instant the cron will hard-delete the account. */
  scheduledForIso: string;
  graceDays: number;
  /** Signed cancel link, or null when DELETION_TOKEN_SECRET is unset. */
  cancelUrl: string | null;
  /** The function's own base URL — the only host a cancel link may point at. */
  supabaseUrl: string;
}

export function renderDeletionScheduledEmail(
  input: DeletionScheduledInput,
): { subject: string; html: string; text: string } {
  const when = new Date(input.scheduledForIso);
  if (Number.isNaN(when.getTime())) {
    throw new Error("scheduled deletion date is invalid; email not rendered");
  }
  const whenLabel = when.toUTCString();
  const safeWhen = escapeHtml(whenLabel);
  const days = Number.isInteger(input.graceDays) && input.graceDays > 0 ? input.graceDays : null;
  if (days === null) throw new Error("grace window is invalid; email not rendered");
  const daysLabel = `${days} day${days === 1 ? "" : "s"}`;

  const cancelUrl = isAcceptableCancelUrl(input.cancelUrl, input.supabaseUrl) ? input.cancelUrl : null;
  const safeCancel = cancelUrl ? escapeHtml(cancelUrl) : null;

  const cancelBlock = safeCancel
    ? `<p style="margin:0 0 14px;color:#eef2ff;">Changed your mind? You can keep your account at any time before that date. Nothing is deleted until then.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">
                  <tr>
                    <td align="center" bgcolor="#e8c77e" style="border-radius:14px;">
                      <a href="${safeCancel}" style="display:inline-block;padding:14px 28px;background-color:#e8c77e;border-radius:14px;color:#0b0b14;font-size:16px;font-weight:700;line-height:1.2;text-decoration:none;">Keep my JUNO account</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 22px;color:#8f9ab5;font-size:12px;line-height:1.6;">If the button doesn't work, paste this link into your browser:<br /><a href="${safeCancel}" style="color:#e8c77e;text-decoration:underline;word-break:break-all;">${safeCancel}</a></p>
                <p style="margin:0 0 22px;color:#8f9ab5;font-size:12px;line-height:1.6;">If the link no longer works, write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8c77e;">${SUPPORT_EMAIL}</a> before the scheduled date and we will keep your account.</p>`
    : `<p style="margin:0 0 22px;color:#eef2ff;">Changed your mind? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8c77e;">${SUPPORT_EMAIL}</a> from this address before the scheduled date and we will keep your account. Nothing is deleted until then.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>Account deletion scheduled</title>
  </head>
  <body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your profile is hidden. Your account is deleted on ${safeWhen} unless you keep it before then.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070b16" style="width:100%;background-color:#070b16;background-image:radial-gradient(circle at top left,rgba(232,199,126,0.12) 0%,#0b1020 46%,#070b16 100%);">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#12182a" style="width:100%;max-width:560px;background-color:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;">
            <tr>
              <td bgcolor="#1c1b18" style="padding:28px 32px 22px;background-color:#1c1b18;background-image:linear-gradient(135deg,rgba(232,199,126,0.18),rgba(201,162,77,0.08));border-bottom:1px solid #4a402c;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:8px 14px;border:1px solid #a9823d;border-radius:999px;color:#e8c77e;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">Privacy</td>
                  </tr>
                </table>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;font-weight:700;">Account deletion scheduled</h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">Your profile is hidden as of now, and your ${daysLabel} grace period has started.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#b7bfd3;font-size:14px;line-height:1.75;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#211f19" style="width:100%;margin:0 0 22px;background-color:#211f19;border:1px solid #5c4d2e;border-radius:22px;">
                  <tr>
                    <td style="padding:20px 22px;">
                      <div style="margin:0 0 8px;color:#b8a87f;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;">Permanent deletion on</div>
                      <div style="color:#f2dca8;font-size:18px;font-weight:700;line-height:1.4;">${safeWhen}</div>
                      <div style="margin-top:6px;color:#b7bfd3;">${daysLabel} from this request</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 12px;">Until that date your profile stays hidden: nobody can find you, see your photos or message you. When the grace period ends, your account and every file you uploaded &mdash; photos, voice introduction, verification video &mdash; are permanently removed. This cannot be undone afterwards.</p>
                <p style="margin:0 0 20px;">A paid subscription is not cancelled by deleting your account. If you have one through Google Play, cancel it in Google Play; if you subscribed on the web, write to us and we will cancel it.</p>
                ${cancelBlock}
                <div style="padding-top:18px;border-top:1px solid #2a3247;color:#7c869e;font-size:12px;line-height:1.7;">
                  If you did not request this, someone may have access to your account: write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8c77e;">${SUPPORT_EMAIL}</a> immediately.<br />
                  JUNO &mdash; Montr&eacute;al, Qu&eacute;bec, Canada
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Account deletion scheduled",
    "",
    `Your JUNO account will be permanently deleted on ${whenLabel} (${daysLabel} from this request). Your profile is hidden as of now: nobody can find you, see your photos or message you.`,
    "",
    "When the grace period ends, your account and every file you uploaded (photos, voice introduction, verification video) are permanently removed. This cannot be undone afterwards.",
    "",
    "A paid subscription is not cancelled by deleting your account. If you have one through Google Play, cancel it in Google Play; if you subscribed on the web, write to us and we will cancel it.",
    "",
    cancelUrl
      ? `Changed your mind? Keep your account at any time before that date: ${cancelUrl}\nIf the link no longer works, write to ${SUPPORT_EMAIL} before the scheduled date.`
      : `Changed your mind? Write to ${SUPPORT_EMAIL} from this address before the scheduled date and we will keep your account.`,
    "",
    `If you did not request this, someone may have access to your account: write to ${SUPPORT_EMAIL} immediately.`,
    "",
    "- The JUNO Team",
  ].join("\n");

  return { subject: "Account Deletion Scheduled - JUNO", html, text };
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
      const scheduledEmail = renderDeletionScheduledEmail({
        scheduledForIso: scheduledFor,
        graceDays: GRACE_WINDOW_DAYS,
        cancelUrl,
        supabaseUrl: SUPABASE_URL,
      });
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [user.email],
          subject: scheduledEmail.subject,
          html: scheduledEmail.html,
          text: scheduledEmail.text,
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
