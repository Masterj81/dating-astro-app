import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// P0-4 support — Daily cron that hard-deletes accounts whose 7-day
// soft-deletion grace window has expired.
//
// Invoked by pg_cron (see migration 20260419000004 + 20260419000005). The
// request MUST carry a secret header whose value matches the
// EXPIRED_DELETIONS_SECRET env var, so that only the cron job can trigger
// hard deletions.
//
// Flow:
//   1. Verify shared secret header (constant-time compare).
//   2. Select profiles where deletion_scheduled_for < NOW() and not NULL.
//   3. For each, call auth.admin.deleteUser() — the FK cascade removes
//      the profile row and related data.
//   4. Return a summary for cron logging.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPIRED_DELETIONS_SECRET = Deno.env.get("EXPIRED_DELETIONS_SECRET") || "";

const MAX_BATCH = 200;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!EXPIRED_DELETIONS_SECRET) {
    console.error("[process-expired-deletions] EXPIRED_DELETIONS_SECRET not configured");
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const providedSecret = req.headers.get("x-expired-deletions-secret") || "";
  if (!constantTimeEquals(providedSecret, EXPIRED_DELETIONS_SECRET)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const nowIso = new Date().toISOString();
  const { data: expired, error: selectError } = await supabaseAdmin
    .from("profiles")
    .select("id, deletion_scheduled_for")
    .not("deletion_scheduled_for", "is", null)
    .lt("deletion_scheduled_for", nowIso)
    .limit(MAX_BATCH);

  if (selectError) {
    console.error("[process-expired-deletions] select error:", selectError.message);
    return jsonResponse({ error: "select_failed", message: selectError.message }, 500);
  }

  const targets = expired ?? [];
  if (targets.length === 0) {
    return jsonResponse({ success: true, deleted: 0, failures: [] }, 200);
  }

  let deleted = 0;
  const failures: Array<{ user_id: string; error: string }> = [];

  for (const row of targets) {
    const userId = row.id as string;
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error(
        `[process-expired-deletions] failed to delete user ${userId}:`,
        deleteError.message,
      );
      failures.push({ user_id: userId, error: deleteError.message });
      continue;
    }
    deleted += 1;
  }

  console.log(
    `[process-expired-deletions] batch complete: deleted=${deleted}, failures=${failures.length}, total_candidates=${targets.length}`,
  );

  return jsonResponse(
    {
      success: true,
      deleted,
      failures,
      total_candidates: targets.length,
      truncated: targets.length >= MAX_BATCH,
    },
    200,
  );
});
