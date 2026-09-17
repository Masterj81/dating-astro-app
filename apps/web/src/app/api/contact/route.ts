import { isContactCategory } from "@/lib/contact-categories";
import {
    CONTACT_ADDR_MAX,
    CONTACT_ORIGIN_MAX,
    CONTACT_WINDOW_SECONDS,
    getClientOrigin,
    hmacBucket,
    verifyTurnstile,
} from "@/lib/contact-protection";
import { EMAIL_FROM, getResend } from "@/lib/resend";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

/** The functional JUNO inbox. Server-side constant only — never a value the
 *  request body can influence (JUNO-07: the destination of the ONLY email
 *  this route sends must not be caller-controlled). */
const SUPPORT_INBOX = "support@junosynastry.com";

// Accepted categories come from the shared canonical table
// (`@/lib/contact-categories`) — the SAME source the form renders from, so
// the values sent and the values accepted cannot drift. Localized labels
// are deliberately NOT accepted: the contract is language-independent.

function htmlEscape(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;',
  };
  // \u0022 and \u0027 are the two quote characters, written as escapes so the
  // regex literal never contains a bare quote (the test harness that extracts
  // this function by brace matching knows strings but not regexes).
  return String(text).replace(/[&<>\u0022\u0027]/g, (c) => map[c] || c);
}

function sanitizeHeader(text: string): string {
  return String(text).replace(/[\r\n]/g, '').slice(0, 200);
}

function renderEmailShell({
  eyebrow,
  title,
  intro,
  body,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  body: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070b16" style="width:100%;background-color:#070b16;background-image:radial-gradient(circle at top left,rgba(232,199,126,0.12) 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#12182a" style="width:100%;max-width:560px;background-color:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0, 0, 0, 0.35);">
            <tr>
              <td bgcolor="#1c1b18" style="padding:28px 32px 18px;background-color:#1c1b18;background-image:linear-gradient(135deg,rgba(232,199,126,0.18),rgba(201,162,77,0.08));border-bottom:1px solid #4a402c;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #a9823d;color:#e8c77e;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
                  ${eyebrow}
                </div>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;">
                  ${title}
                </h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#b7bfd3;font-size:14px;line-height:1.75;">
                ${body}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(request: Request) {
  // JUNO-07 (2026-09-17): this route used to be an open mail relay — it sent
  // an auto-acknowledgement to the caller-provided address, with no proof of
  // possession, no durable rate limit and no anti-automation. It now sends
  // exactly ONE email, to the server-constant JUNO inbox, behind three
  // barriers applied in the cheapest-first order so no resource is spent on
  // an abusive request:
  //
  //   1. bounded parse + validation
  //   2. Turnstile (fail-closed: absent secret or unreachable verify = 503,
  //      invalid/used/expired token = 400)
  //   3. durable, instance-shared rate limits (PostgreSQL tumbling windows
  //      via check_edge_rate_limit, service-role): per network-origin 5/h,
  //      per normalized contact address 3/h, keyed by HMAC digests so no
  //      raw email or IP is ever stored or logged. RPC error = 503.
  //
  // Only then does Resend see anything. Errors are generic codes the client
  // localizes; logs carry codes, never message bodies, addresses or tokens.
  try {
    const body = await request.json();
    const { name, email, category, message } = body ?? {};

    if (
      typeof name !== "string" || !name.trim() ||
      typeof email !== "string" || !email.trim() ||
      typeof category !== "string" || !category ||
      typeof message !== "string" || !message.trim()
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (!isContactCategory(category)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    if (message.length > 5000 || name.length > 200) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    const origin = getClientOrigin(request);

    // ── Barrier 2: Turnstile — fail-closed ────────────────────────────────
    const captcha = await verifyTurnstile(body["cf-turnstile-response"], origin);
    if (!captcha.ok) {
      if (captcha.reason === "missing" || captcha.reason === "invalid") {
        return NextResponse.json({ error: "captcha_invalid" }, { status: 400 });
      }
      console.error("[contact] captcha verification unavailable:", captcha.reason);
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }

    // ── Barrier 3: durable rate limits (origin, then address) ────────────
    const originBucket = hmacBucket("contact:origin", origin);
    const addrBucket = hmacBucket("contact:addr", email.trim().toLowerCase());
    if (!originBucket || !addrBucket) {
      // CONTACT_HASH_SECRET missing/short: an unsalted digest would be a
      // dictionary away from plaintext (emails are low entropy). Refuse.
      console.error("[contact] rate-limit keying unavailable");
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }

    const admin = getSupabaseAdmin();
    for (const [bucket, max] of [
      [originBucket, CONTACT_ORIGIN_MAX],
      [addrBucket, CONTACT_ADDR_MAX],
    ] as const) {
      const { data, error } = await admin.rpc("check_edge_rate_limit", {
        p_key: bucket,
        p_max: max,
        p_window_seconds: CONTACT_WINDOW_SECONDS,
      });
      if (error) {
        // Fail CLOSED: a limiter that cannot answer says no.
        console.error("[contact] rate limiter error:", error.code ?? "unknown");
        return NextResponse.json({ error: "unavailable" }, { status: 503 });
      }
      if (data !== true) {
        return NextResponse.json(
          { error: "rate_limited" },
          { status: 429, headers: { "Retry-After": "3600" } },
        );
      }
    }

    // ── All barriers passed: the single, internal delivery ─────────────
    const resend = getResend();
    const safeName = htmlEscape(name);
    const safeEmail = htmlEscape(email);
    const safeCategory = htmlEscape(category);
    const safeMessage = htmlEscape(message).replace(/\n/g, "<br/>");
    const subjectName = sanitizeHeader(name);
    const subjectCategory = sanitizeHeader(category);

    await resend.emails.send({
      from: EMAIL_FROM,
      to: SUPPORT_INBOX,
      replyTo: sanitizeHeader(email),
      subject: `[${subjectCategory}] Contact form from ${subjectName}`,
      html: renderEmailShell({
        eyebrow: "Support inbox",
        title: `New ${safeCategory} message`,
        intro: `A new support request was submitted by ${safeName}.`,
        body: `
          <p style="margin:0 0 12px;"><strong>Name:</strong> ${safeName}</p>
          <p style="margin:0 0 12px;"><strong>Email:</strong> ${safeEmail}</p>
          <p style="margin:0 0 12px;"><strong>Category:</strong> ${safeCategory}</p>
          <div style="margin-top:18px;padding:18px 20px;border-radius:22px;background-color:#211f19;background-image:linear-gradient(135deg,rgba(232,199,126,0.20),rgba(201,162,77,0.10));border:1px solid #5c4d2e;color:#eef2ff;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255, 255, 255, 0.72);margin-bottom:8px;">
              Message
            </div>
            <div>${safeMessage}</div>
          </div>
        `,
      }),
      text: `Name: ${name}\nEmail: ${email}\nCategory: ${category}\n\nMessage:\n${message}`,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error("[contact] submission failed");
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
