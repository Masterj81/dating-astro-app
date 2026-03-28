import { NextResponse } from "next/server";
import { getResend, EMAIL_FROM } from "@/lib/resend";

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
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#0b1020;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:radial-gradient(circle at top left,#2d1638 0%,#0b1020 46%,#070b16 100%);padding:32px 14px;">
      <tr>
        <td align="center">
          <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#12182a;border:1px solid #2a3247;border-radius:28px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.35);">
            <tr>
              <td style="padding:28px 32px 18px;background:linear-gradient(135deg,rgba(244,114,182,0.18),rgba(167,139,250,0.08));border-bottom:1px solid #2a3247;">
                <div style="display:inline-block;padding:9px 14px;border-radius:999px;border:1px solid #4b556f;color:#f8d4df;font-size:11px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;">
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const resend = getResend();
    const messageHtml = String(message).replace(/\n/g, "<br/>");

    await resend.emails.send({
      from: EMAIL_FROM,
      to: "support@astrodatingapp.com",
      replyTo: email,
      subject: `[${category}] Contact form from ${name}`,
      html: renderEmailShell({
        eyebrow: "Support inbox",
        title: `New ${category} message`,
        intro: `A new support request was submitted by ${name}.`,
        body: `
          <p style="margin:0 0 12px;"><strong>Name:</strong> ${name}</p>
          <p style="margin:0 0 12px;"><strong>Email:</strong> ${email}</p>
          <p style="margin:0 0 12px;"><strong>Category:</strong> ${category}</p>
          <div style="margin-top:18px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(99,102,241,0.14));border:1px solid rgba(255,255,255,0.08);color:#eef2ff;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:8px;">
              Message
            </div>
            <div>${messageHtml}</div>
          </div>
        `,
      }),
      text: `Name: ${name}\nEmail: ${email}\nCategory: ${category}\n\nMessage:\n${message}`,
    });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "We received your message - AstroDating",
      html: renderEmailShell({
        eyebrow: "Support",
        title: "We received your message",
        intro: `Hi ${name}, thanks for reaching out. We've received your message and will get back to you within 24 hours.`,
        body: `
          <p style="margin:0 0 12px;"><strong>Category:</strong> ${category}</p>
          <div style="margin-top:18px;padding:18px 20px;border-radius:22px;background:linear-gradient(135deg,rgba(236,72,153,0.22),rgba(99,102,241,0.14));border:1px solid rgba(255,255,255,0.08);color:#eef2ff;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.72);margin-bottom:8px;">
              Your message
            </div>
            <div>${messageHtml}</div>
          </div>
          <p style="margin:18px 0 0;">
            If you need to add more detail, just reply to this email.
          </p>
        `,
      }),
      text: `Hi ${name},\n\nThanks for reaching out! We've received your message and will get back to you within 24 hours.\n\nCategory: ${category}\nYour message:\n${message}\n\n- The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 },
    );
  }
}
