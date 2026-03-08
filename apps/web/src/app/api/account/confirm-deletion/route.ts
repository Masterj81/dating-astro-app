import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email and code are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const resend = getResend();

    // Look up user
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid code or email" },
        { status: 400 }
      );
    }

    // Fetch deletion request
    const { data: req, error: fetchErr } = await supabaseAdmin
      .from("deletion_requests")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !req) {
      return NextResponse.json(
        { error: "No deletion request found. Please request a new code." },
        { status: 400 }
      );
    }

    // Check max attempts
    if (req.attempts >= 5) {
      // Clean up the request
      await supabaseAdmin
        .from("deletion_requests")
        .delete()
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "Too many attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // Increment attempts
    await supabaseAdmin
      .from("deletion_requests")
      .update({ attempts: req.attempts + 1 })
      .eq("user_id", user.id);

    // Check expiry
    if (new Date(req.expires_at) < new Date()) {
      await supabaseAdmin
        .from("deletion_requests")
        .delete()
        .eq("user_id", user.id);

      return NextResponse.json(
        { error: "Code has expired. Please request a new code." },
        { status: 400 }
      );
    }

    // Verify code hash
    const codeHash = createHash("sha256").update(code).digest("hex");
    if (codeHash !== req.code_hash) {
      return NextResponse.json(
        { error: "Invalid verification code" },
        { status: 400 }
      );
    }

    // Delete the deletion request
    await supabaseAdmin
      .from("deletion_requests")
      .delete()
      .eq("user_id", user.id);

    // Delete user — cascades to all tables
    const { error: deleteErr } =
      await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteErr) {
      console.error("Delete user error:", deleteErr);
      return NextResponse.json(
        { error: "Failed to delete account. Please try again." },
        { status: 500 }
      );
    }

    // Send confirmation email
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "Account Deleted — AstroDating",
      text: `Hi,\n\nYour AstroDating account has been permanently deleted. All associated data (profile, matches, messages) has been removed.\n\nIf you didn't request this, please contact us immediately at support@astrodatingapp.com.\n\n— The AstroDating Team`,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
