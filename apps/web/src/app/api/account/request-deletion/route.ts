import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (entry && entry.resetAt > now && entry.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }
    if (!entry || entry.resetAt <= now) {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    } else {
      entry.count++;
    }

    const { email, userId } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "Valid user ID is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    // Look up the current user directly; still return success if it doesn't match.
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = userData?.user;

    if (userError || !user || user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ success: true });
    }

    const { randomBytes } = await import("crypto");
    const code = randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars = 4 billion combinations
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: dbError } = await supabaseAdmin
      .from("deletion_requests")
      .upsert(
        {
          user_id: user.id,
          code_hash: codeHash,
          expires_at: expiresAt,
          attempts: 0,
        },
        { onConflict: "user_id" }
      );

    if (dbError) {
      console.error("DB error:", dbError);
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "Account Deletion Code - AstroDating",
      text: `Your account deletion verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n- The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
