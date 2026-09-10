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
//   3. For each, record a media purge job and attempt the purge (JUNO-09).
//   4. Only if the job row exists, call auth.admin.deleteUser() — the FK
//      cascade removes the profile row and related data.
//   5. Return a summary for cron logging.
//
// JUNO-09 — WHY STEP 3 EXISTS AND WHY IT GATES STEP 4
// ---------------------------------------------------------------------------
// The FK cascade removes no storage object: `storage.objects` has no foreign key
// to `auth.users`. Until 10 Sep 2026 this function deleted the account and left
// the avatar, the voice intro and the verification video behind, with nothing
// recording that they existed. Five such objects are still in storage, the
// oldest from 1 Feb 2026, and one of them is a video of someone's face.
//
// The purge itself lives in ONE place, `purge-user-media`, because the web route
// is Node and this is Deno — two copies of a deletion routine would drift the way
// the two ephemerides did.
//
// The gate is asymmetric, on purpose:
//
//   * job row NOT created  -> DO NOT delete the account. There would be no
//     record that media survives, and no way to resume. This is the only
//     condition that stops a deletion.
//   * purge incomplete     -> delete the account anyway. The reader asked for
//     it; refusing because object storage is unwell would be a worse failure
//     than the one being fixed. The job row stays `pending` and the resume cron
//     finishes the work.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EXPIRED_DELETIONS_SECRET = Deno.env.get("EXPIRED_DELETIONS_SECRET") || "";
const MEDIA_PURGE_SECRET = Deno.env.get("MEDIA_PURGE_SECRET") || "";

const MAX_BATCH = 200;

/** JUNO-09. Path of the one function allowed to delete a user's media. */
export const PURGE_FUNCTION_PATH = "/functions/v1/purge-user-media";

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

/** What the purge attempt tells the caller. */
export interface PurgeOutcome {
  /** The durable job row exists. FALSE forbids deleting the account. */
  jobCreated: boolean;
  /** Every bucket finished. False is fine — the resume cron continues. */
  done: boolean;
  /** One of the seven classes, or null. Never a message, never a path. */
  errorClass: string | null;
}

/**
 * Ask `purge-user-media` to record a job and purge, for one account.
 *
 * FAIL-CLOSED ON `jobCreated`. Every failure mode — an unset secret, a network
 * error, a non-2xx, a malformed body — yields `jobCreated: false`, and the
 * caller then leaves the account alone. Guessing "it probably worked" is how an
 * orphan is created with no record of it.
 *
 * Injectable `fetchImpl` so the decision is testable without a network.
 */
export async function requestMediaPurge(
  userId: string,
  deps: {
    baseUrl: string;
    secret: string;
    fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
  },
): Promise<PurgeOutcome> {
  if (!deps.secret || !deps.baseUrl) {
    console.error("[process-expired-deletions] MEDIA_PURGE_SECRET absent — deletion skipped");
    return { jobCreated: false, done: false, errorClass: "permission_denied" };
  }

  try {
    const response = await deps.fetchImpl(`${deps.baseUrl}${PURGE_FUNCTION_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-media-purge-secret": deps.secret,
      },
      body: JSON.stringify({ userId, requestedBy: "mobile_cron" }),
    });

    if (!response.ok) {
      console.error(`[process-expired-deletions] purge refused: status=${response.status}`);
      return { jobCreated: false, done: false, errorClass: "storage_unavailable" };
    }

    const payload = await response.json().catch(() => null);
    if (!payload || payload.jobCreated !== true) {
      return { jobCreated: false, done: false, errorClass: "unknown" };
    }
    return {
      jobCreated: true,
      done: payload.done === true,
      errorClass: typeof payload.errorClass === "string" ? payload.errorClass : null,
    };
  } catch {
    // The message is deliberately not logged: it can carry a URL.
    console.error("[process-expired-deletions] purge call threw — deletion skipped");
    return { jobCreated: false, done: false, errorClass: "storage_unavailable" };
  }
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
  let purgesIncomplete = 0;
  let blockedByPurge = 0;
  const failures: Array<{ user_id: string; error: string }> = [];

  for (const row of targets) {
    const userId = row.id as string;

    // JUNO-09 step 1 — the durable job row, BEFORE the irreversible act.
    const purge = await requestMediaPurge(userId, {
      baseUrl: SUPABASE_URL,
      secret: MEDIA_PURGE_SECRET,
      fetchImpl: fetch,
    });

    if (!purge.jobCreated) {
      // The one condition that stops a deletion. Deleting now would strand the
      // media with nothing recording that it exists — the finding itself.
      // The account keeps its `deletion_scheduled_for`, so the next pass retries.
      blockedByPurge += 1;
      failures.push({ user_id: userId, error: "media_purge_job_not_created" });
      continue;
    }
    if (!purge.done) purgesIncomplete += 1;

    // JUNO-09 step 2 — proceed even on an incomplete purge. The job row survives
    // the cascade (no FK to auth.users) and the resume cron finishes.
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
    `[process-expired-deletions] batch complete: deleted=${deleted}, ` +
    `failures=${failures.length}, blocked_by_purge=${blockedByPurge}, ` +
    `purges_incomplete=${purgesIncomplete}, total_candidates=${targets.length}`,
  );

  return jsonResponse(
    {
      success: true,
      deleted,
      failures,
      blocked_by_purge: blockedByPurge,
      purges_incomplete: purgesIncomplete,
      total_candidates: targets.length,
      truncated: targets.length >= MAX_BATCH,
    },
    200,
  );
});
