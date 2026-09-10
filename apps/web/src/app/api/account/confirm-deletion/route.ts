import { NextResponse } from "next/server";
import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";
import { requestMediaPurge, deletionEmailText } from "@/lib/media-purge";

// JUNO-09 — the web path deletes immediately, and until 10 Sep 2026 it deleted
// the account while leaving every uploaded file in storage. `storage.objects`
// has no foreign key to `auth.users`, so the cascade never touched it.
//
// The helpers live in `@/lib/media-purge` and not here: an App Router route may
// export ONLY its HTTP handlers, and they have to be importable by the vitest
// suite that executes the real decision rather than a copy of it.
//
// The purge itself is NOT reimplemented on this side. Both executors call the
// same edge function — see the module header for why that matters.

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

    // JUNO-09 step 1 — the durable job row, BEFORE the irreversible act.
    const purge = await requestMediaPurge(user.id, {
      baseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      secret: process.env.MEDIA_PURGE_SECRET ?? "",
      fetchImpl: fetch,
    });

    if (!purge.jobCreated) {
      // The ONLY condition that stops a deletion. The verification code has
      // already been consumed above, so the reader must request a new one —
      // which is the correct trade: a replayable code would be worse than a
      // retry, and stranding media with no record of it would be worse than
      // both.
      console.error("Account deletion refused: media purge job not created");
      return NextResponse.json(
        { error: "Failed to delete account. Please try again." },
        { status: 500 }
      );
    }

    // JUNO-09 step 2 — proceed even on an incomplete purge. The job row has no
    // FK to auth.users, survives the cascade, and the resume cron finishes.
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
      subject: "Account Deleted - JUNO",
      text: deletionEmailText(purge.done),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
