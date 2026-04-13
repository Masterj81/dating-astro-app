import { NextResponse } from "next/server";
import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const { email, userId, code } = await request.json();

    if (!email || !userId || !code) {
      return NextResponse.json(
        { error: "Email, user ID and code are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    // --- SECURITY: Verify the caller is authenticated and owns this account ---
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: { user: callerUser }, error: callerError } =
      await supabaseAdmin.auth.getUser(token);

    if (callerError || !callerUser || callerUser.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // --- END auth check ---

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = userData?.user;

    if (userError || !user || user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Invalid code or email" },
        { status: 400 }
      );
    }

    const { data: deletionRequest, error: fetchErr } = await supabaseAdmin
      .from("deletion_requests")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !deletionRequest) {
      return NextResponse.json(
        { error: "No deletion request found. Please request a new code." },
        { status: 400 }
      );
    }

    // SECURITY: Check expiration BEFORE incrementing attempts
    if (new Date(deletionRequest.expires_at) < new Date()) {
      await supabaseAdmin
        .from("deletion_requests")
        .delete()
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "Code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    if (deletionRequest.attempts >= 5) {
      await supabaseAdmin
        .from("deletion_requests")
        .delete()
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }

    await supabaseAdmin
      .from("deletion_requests")
      .update({ attempts: deletionRequest.attempts + 1 })
      .eq("user_id", user.id);

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    const codeHash = createHash("sha256").update(code).digest("hex");
    const expectedHash = deletionRequest.code_hash;
    const hashesMatch =
      codeHash.length === expectedHash.length &&
      cryptoTimingSafeEqual(Buffer.from(codeHash), Buffer.from(expectedHash));
    if (!hashesMatch) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    await supabaseAdmin
      .from("deletion_requests")
      .delete()
      .eq("user_id", user.id);

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteErr) {
      console.error("Delete user error: account deletion failed");
      return NextResponse.json(
        { error: "Failed to delete account. Please try again." },
        { status: 500 }
      );
    }

    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "Account Deleted - AstroDating",
      text: `Hi,\n\nYour AstroDating account has been permanently deleted. All associated data (profile, matches, messages) has been removed.\n\nIf you didn't request this, please contact us immediately at support@astrodatingapp.com.\n\n- The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
