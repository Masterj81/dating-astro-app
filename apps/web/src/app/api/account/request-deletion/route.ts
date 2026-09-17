import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getResend, EMAIL_FROM } from "@/lib/resend";
import { deletionCodeEmail } from "@/lib/account-deletion-email";

// JUNO-14 (2026-09-17): the in-process `Map` rate limiter is GONE. On Vercel
// serverless it was per-instance (cold starts reset it, parallel instances
// each kept their own count), never grew a purge, and keyed on the FIRST
// x-forwarded-for entry — which is client-controlled when the chain is
// forged. The durable replacement is `check_rate_limit(uuid, text, int,
// interval)`: an atomic, persistent, PostgreSQL tumbling window, keyed on the
// AUTHENTICATED user id (verified below before the limit is consumed — an
// unauthenticated caller burns nothing), called through the service-role
// client because the RPC is not exposed to anon/authenticated. RPC failure
// is a REFUSAL (fail-closed), never a silent pass.
const RATE_LIMIT_ACTION = "web_deletion_request";
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = "1 hour";

export async function POST(request: Request) {
  try {
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

    // --- Durable, per-ACCOUNT rate limit (after auth: the counter is keyed
    // on the verified identity, so no caller can spend anyone else's quota,
    // and no number of fresh serverless instances dilutes the window). ---
    const { data: allowed, error: rateLimitError } = await supabaseAdmin.rpc(
      "check_rate_limit",
      {
        p_user_id: callerUser.id,
        p_action: RATE_LIMIT_ACTION,
        p_max_count: RATE_LIMIT_MAX,
        p_window: RATE_LIMIT_WINDOW,
      }
    );
    if (rateLimitError) {
      // Fail CLOSED: a limiter that cannot answer says no.
      console.error("Deletion request rate limiter error");
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 503 }
      );
    }
    if (allowed !== true) {
      return NextResponse.json(
        { error: "Too many requests. Try again later." },
        { status: 429 }
      );
    }
    // --- END rate limit ---

    // Look up the current user directly; still return success if it doesn't match.
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    const user = userData?.user;

    if (userError || !user || user.email?.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ success: true });
    }

    // SECURITY: Use 8 bytes (16 hex chars) for stronger entropy (2^64 combinations)
    const code = randomBytes(8).toString("hex").toUpperCase();
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
      console.error("DB error saving deletion request");
      return NextResponse.json(
        { error: "Something went wrong" },
        { status: 500 }
      );
    }

    const deletionEmail = deletionCodeEmail(code);
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: "Account Deletion Code - JUNO",
      html: deletionEmail.html,
      text: deletionEmail.text,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
