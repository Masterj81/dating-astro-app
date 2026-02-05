import { NextResponse } from "next/server";
import { getResend, EMAIL_FROM } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, category, message } = body;

    if (!name || !email || !category || !message) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Invalid email address" },
        { status: 400 }
      );
    }

    const resend = getResend();

    // Send to support
    await resend.emails.send({
      from: EMAIL_FROM,
      to: "support@astrodatingapp.com",
      replyTo: email,
      subject: `[${category}] Contact form from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nCategory: ${category}\n\nMessage:\n${message}`,
    });

    // Send confirmation to user
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "We received your message — AstroDating",
      text: `Hi ${name},\n\nThanks for reaching out! We've received your message and will get back to you within 24 hours.\n\nCategory: ${category}\nYour message:\n${message}\n\n— The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    return NextResponse.json(
      { error: "Failed to send message. Please try again." },
      { status: 500 }
    );
  }
}
