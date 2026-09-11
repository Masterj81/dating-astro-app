// The two emails of the web account-deletion flow: the verification code, and
// the confirmation once the account is gone.
//
// WHY THIS IS A MODULE AND NOT PART OF EITHER ROUTE
// ---------------------------------------------------------------------------
// A Next.js App Router `route.ts` may export ONLY its HTTP method handlers and a
// fixed set of config names; anything else fails typecheck. These renderers
// have to be importable — by the two routes, and by the vitest suite that
// asserts on the HTML and text a reader actually receives rather than on a
// reassuring string in the source. So they live here, and this file imports
// nothing: it can be loaded under plain Node as easily as under Next.
//
// WHAT IT IS, AND IS NOT
// ---------------------------------------------------------------------------
// Presentation only. Whether a deletion may proceed, in what order the media
// purge and `auth.admin.deleteUser()` run, and what `purge.done` means are
// decided in the routes and in `media-purge.ts` (JUNO-09, closed 11 Sep 2026).
// This module is handed the outcome and renders it — and its one hard rule is
// that it renders the outcome, never the intent: the confirmation says the
// media are gone only when the purge reported that they are.
//
// The rendering is deterministic: same input, byte-identical output. There is
// no clock and no randomness in here, so a test can pin the exact HTML.
//
// The shell repeats what `supabase/functions/send-email/templates.ts` and the
// other transactional senders draw — the same palette, the same card. That is
// deliberate: this module is Node, the others are Deno, and a shared file
// between the two runtimes would need a build step that nothing else needs.
// Two short shells that look alike beat one abstraction that ships to both.

/** The address readers are told to write to. Displayed, never a recipient. */
export const SUPPORT_EMAIL = "support@junosynastry.com";

/** The code the request route generates: `randomBytes(8).toString("hex").toUpperCase()`. */
const DELETION_CODE_SHAPE = /^[0-9A-F]{16}$/;

/**
 * HTML-escape a string for insertion as text or as an attribute value.
 *
 * Every dynamic value in this module goes through it, including the ones the
 * server generated itself. Escaping a hex code is a no-op, and that is the
 * point: the rule is "everything is escaped", which needs no judgement call
 * at each call site.
 */
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

interface ShellInput {
  /** Short uppercase label in the header pill. Static copy. */
  eyebrow: string;
  /** The `<h1>` and the `<title>`. Static copy. */
  title: string;
  /** Hidden preview line for the inbox list. Static copy. */
  preheader: string;
  /** Lead paragraph under the title. Static copy. */
  intro: string;
  /** Already-rendered, already-escaped HTML for the card body. */
  body: string;
  /** Small closing line above the support address. Static copy. */
  footer: string;
}

/**
 * The JUNO card: deep ground, gold header, one content column.
 *
 * Email-client rules, each of which cost somebody a rendering bug once:
 *   - every `background-image` gradient sits on a `background-color` and, on the
 *     cells that matter, a `bgcolor` attribute — clients that drop gradients
 *     (Outlook desktop, some webmails) still get the dark card, not white;
 *   - the card is `width="560"` for Outlook AND `width:100%;max-width:560px`
 *     for phones, so it never overflows a narrow viewport;
 *   - `role="presentation"` on every layout table, so screen readers do not
 *     announce a data table;
 *   - the palette is the one in docs/design-palette-2026-09.md — gold is the
 *     identity. No coral, no pink-purple wash from the first version.
 */
function shell(input: ShellInput): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${input.title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#070b16;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${input.preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070b16" style="width:100%;background-color:#070b16;background-image:radial-gradient(circle at top left,rgba(232,199,126,0.12) 0%,#0b1020 46%,#070b16 100%);">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#12182a" style="width:100%;max-width:560px;background-color:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;">
            <tr>
              <td bgcolor="#1c1b18" style="padding:28px 32px 22px;background-color:#1c1b18;background-image:linear-gradient(135deg,rgba(232,199,126,0.18),rgba(201,162,77,0.08));border-bottom:1px solid #4a402c;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:8px 14px;border:1px solid #a9823d;border-radius:999px;color:#e8c77e;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">${input.eyebrow}</td>
                  </tr>
                </table>
                <h1 style="margin:18px 0 10px;color:#ffffff;font-size:30px;line-height:1.15;letter-spacing:-0.03em;font-weight:700;">${input.title}</h1>
                <p style="margin:0;color:#d4d9e7;font-size:16px;line-height:1.7;">${input.intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;color:#b7bfd3;font-size:14px;line-height:1.75;">
                ${input.body}
                <div style="margin-top:26px;padding-top:18px;border-top:1px solid #2a3247;color:#7c869e;font-size:12px;line-height:1.7;">
                  ${input.footer}<br />
                  Questions? <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8c77e;text-decoration:underline;">${SUPPORT_EMAIL}</a><br />
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
}

/** A gold-bordered callout on the card. `inner` is already-escaped HTML. */
function callout(label: string, inner: string, align: "left" | "center" = "left"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#211f19" style="width:100%;margin:0 0 22px;background-color:#211f19;border:1px solid #5c4d2e;border-radius:22px;">
                  <tr>
                    <td style="padding:20px 22px;text-align:${align};">
                      <div style="margin:0 0 8px;color:#b8a87f;font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;">${label}</div>
                      ${inner}
                    </td>
                  </tr>
                </table>`;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

/**
 * Email 1 of 3 — the verification code.
 *
 * The code is server-generated, but it is still VALIDATED by shape before it
 * is rendered: a value of the wrong shape means a caller changed and this
 * module refuses to guess. Refusing here costs the reader one retry; rendering
 * an arbitrary string into an HTML email would cost more.
 */
export function deletionCodeEmail(code: string): RenderedEmail {
  if (!DELETION_CODE_SHAPE.test(code)) {
    throw new Error("deletion code has an unexpected shape; email not rendered");
  }
  const safeCode = escapeHtml(code);
  // Four groups of four, for reading aloud or typing from a phone. The reader
  // types the code without spaces; the route hashes exactly what it generated.
  const grouped = safeCode.match(/.{1,4}/g)?.join("&nbsp;&nbsp;") ?? safeCode;

  const html = shell({
    eyebrow: "Account security",
    title: "Confirm account deletion",
    preheader: "Your verification code expires in 10 minutes. Enter it only in JUNO.",
    intro: "We received a request to permanently delete your JUNO account. Enter this code in JUNO to continue.",
    body:
      callout(
        "Verification code",
        `<div style="color:#f2dca8;font-family:Consolas,'Courier New',monospace;font-size:30px;font-weight:700;letter-spacing:0.12em;line-height:1.3;">${grouped}</div>
                      <div style="margin-top:8px;color:#8f9ab5;font-size:12px;">Type it without spaces.</div>`,
        "center",
      ) +
      `<p style="margin:0 0 12px;color:#eef2ff;"><strong>This code expires in 10 minutes.</strong></p>
                <p style="margin:0 0 12px;">Enter it only in JUNO, on the account-deletion screen. <strong style="color:#eef2ff;">Never send this code to anyone</strong> &mdash; not by email, not by message. JUNO will never ask you for it.</p>
                <p style="margin:0;">Deleting your account is permanent. Once confirmed, your profile, conversations, messages and uploaded files are removed and cannot be recovered.</p>`,
    footer: "If you did not request this, ignore this email. Nothing happens without the code, and your account stays active.",
  });

  const text = [
    "Confirm account deletion",
    "",
    "We received a request to permanently delete your JUNO account.",
    "",
    `Your verification code: ${code}`,
    "",
    "This code expires in 10 minutes. Enter it only in JUNO, on the account-deletion screen.",
    "Never send this code to anyone - not by email, not by message. JUNO will never ask you for it.",
    "",
    "Deleting your account is permanent. Once confirmed, your profile, conversations, messages and uploaded files are removed and cannot be recovered.",
    "",
    "If you did not request this, ignore this email. Nothing happens without the code, and your account stays active.",
    "",
    `Questions? ${SUPPORT_EMAIL}`,
    "- The JUNO Team",
  ].join("\n");

  return { html, text };
}

/**
 * Email 3 of 3 — the account is gone.
 *
 * Two honest states, decided by the purge's own report and by nothing else:
 *   - `purgeComplete === true`: every bucket finished; the email may say the
 *     files are removed;
 *   - otherwise: the account is deleted, the job row survives the cascade and
 *     the resume cron finishes; the email says so, with the 24-hour bound.
 *
 * The version this replaced said "All associated data (profile, matches,
 * messages) has been removed" — a retired table, and a completed deletion
 * asserted at a moment when no media had been deleted at all. The sentence a
 * reader relies on when deciding not to follow up is the one this module must
 * never get wrong.
 */
export function deletionCompletedEmail(purgeComplete: boolean): RenderedEmail {
  const status = purgeComplete
    ? callout(
        "Deletion complete",
        `<p style="margin:0;color:#eef2ff;font-size:15px;line-height:1.7;">Your profile, conversations, messages and uploaded files &mdash; photos, voice introduction and verification video &mdash; have been removed.</p>`,
      )
    : callout(
        "Account deleted",
        `<p style="margin:0 0 10px;color:#eef2ff;font-size:15px;line-height:1.7;">Your profile, conversations and messages have been removed.</p>
                      <p style="margin:0;color:#eef2ff;font-size:15px;line-height:1.7;">A small number of uploaded files are still being deleted. They will be gone within 24 hours, and no action is needed from you.</p>`,
      );

  const html = shell({
    eyebrow: "Privacy",
    title: "Your JUNO account has been deleted",
    preheader: purgeComplete
      ? "Your account and your uploaded files have been removed."
      : "Your account has been removed. The last uploaded files are being deleted.",
    intro: "Your deletion request has been carried out. You no longer have a JUNO profile, and nobody can find or message you.",
    body:
      status +
      `<p style="margin:0 0 12px;">Public links to your photos or voice introduction stop working once the files are gone.</p>
                <p style="margin:0 0 12px;"><strong style="color:#eef2ff;">Deleting your account does not cancel a paid subscription on its own.</strong> If you subscribed through Google Play, cancel it in Google Play. If you subscribed on the web and still see a charge, write to us and we will cancel it.</p>
                <p style="margin:0;">Thank you for having been part of JUNO. If you come back one day, you are welcome to start fresh.</p>`,
    footer: "If you did not request this deletion, contact us immediately.",
  });

  const text = [
    "Your JUNO account has been deleted",
    "",
    "Your deletion request has been carried out. You no longer have a JUNO profile, and nobody can find or message you.",
    "",
    purgeComplete
      ? "Your profile, conversations, messages and uploaded files (photos, voice introduction, verification video) have been removed."
      : "Your profile, conversations and messages have been removed. A small number of uploaded files are still being deleted. They will be gone within 24 hours, and no action is needed from you.",
    "",
    "Public links to your photos or voice introduction stop working once the files are gone.",
    "",
    "Deleting your account does not cancel a paid subscription on its own. If you subscribed through Google Play, cancel it in Google Play. If you subscribed on the web and still see a charge, write to us and we will cancel it.",
    "",
    `If you did not request this deletion, contact us immediately at ${SUPPORT_EMAIL}.`,
    "",
    "- The JUNO Team",
  ].join("\n");

  return { html, text };
}
