import { NextResponse } from "next/server";
import { createHash, randomInt } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    // Look up user — always return success to prevent enumeration
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      // Return success even if not found (anti-enumeration)
      return NextResponse.json({ success: true });
    }

    // Generate 6-digit code
    const code = randomInt(100000, 999999).toString();
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

    // Upsert deletion request
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

    // Send code via email
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "Account Deletion Code — AstroDating",
      text: `Your account deletion verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, you can safely ignore this email.\n\n— The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
