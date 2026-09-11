import { NextResponse } from "next/server";
import { getResend, EMAIL_FROM } from "@/lib/resend";

/** The address readers are told to write to. Displayed, never a recipient. */
const SUPPORT_EMAIL = "support@junosynastry.com";

const VALID_CATEGORIES = [
  "General Question", "Account Issue", "Billing & Subscription",
  "Bug Report", "Safety Concern", "Feature Request", "Other",
];

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
  try {
    const body = await request.json();
    const { name, email, category, message } = body;

    if (!name || !email || !category || !message) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    if (String(message).length > 5000) {
      return NextResponse.json({ error: "Message too long" }, { status: 400 });
    }

    const resend = getResend();
    const safeName = htmlEscape(name);
    const safeEmail = htmlEscape(email);
    const safeCategory = htmlEscape(category);
    const safeMessage = htmlEscape(message).replace(/\n/g, "<br/>");
    const subjectName = sanitizeHeader(name);
    const subjectCategory = sanitizeHeader(category);

    // The functional JUNO inbox. Inbound delivery to this address was
    // verified before replacing the legacy AstroDating mailbox.
    await resend.emails.send({
      from: EMAIL_FROM,
      to: "support@junosynastry.com",
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

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "We received your message - JUNO",
      html: renderEmailShell({
        eyebrow: "Support",
        title: "We received your message",
        intro: `Hi ${safeName}, thanks for reaching out. We&#x27;ve received your message and will get back to you within 24 hours.`,
        body: `
          <p style="margin:0 0 12px;"><strong>Category:</strong> ${safeCategory}</p>
          <div style="margin-top:18px;padding:18px 20px;border-radius:22px;background-color:#211f19;background-image:linear-gradient(135deg,rgba(232,199,126,0.20),rgba(201,162,77,0.10));border:1px solid #5c4d2e;color:#eef2ff;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255, 255, 255, 0.72);margin-bottom:8px;">
              Your message
            </div>
            <div>${safeMessage}</div>
          </div>
          <p style="margin:18px 0 0;">
            Need to add a detail? Write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#e8c77e;">${SUPPORT_EMAIL}</a> and mention the category above.
          </p>
        `,
      }),
      text: `Hi ${name},\n\nThanks for reaching out! We've received your message and will get back to you within 24 hours.\n\nCategory: ${category}\nYour message:\n${message}\n\nNeed to add a detail? Write to ${SUPPORT_EMAIL} and mention the category above.\n\n- The JUNO Team`,
    });

    return NextResponse.json({ success: true });
  } catch {
    console.error("Contact form error: failed to send");
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 },
    );
  }
}
