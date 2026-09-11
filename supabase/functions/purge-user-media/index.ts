import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JUNO-09 — the only place in this codebase that deletes a user's media.
//
// WHY THIS FUNCTION EXISTS
// -----------------------
// All three deletion paths called `auth.admin.deleteUser()` and nothing else.
// The FK cascade removes `profiles` and everything hanging off it. It removes
// NO storage object: those live in `storage.objects`, which has no foreign key
// to `auth.users`.
//
// Measured 9 Sep 2026, corrected 10 Sep after JUNO-29 closed:
//
//     orphaned `avatars`         4
//     orphaned `verifications`   1   <- a video of someone's face
//     ------------------------------
//     TOTAL                      5   oldest: 1 Feb 2026
//
// ONE IMPLEMENTATION, AND THAT IS THE POINT
// -----------------------------------------
// `process-expired-deletions` is Deno; the web `confirm-deletion` route is Node.
// Two runtimes cannot share a module without a build step, and a build step that
// nobody runs is how this repository ended up with two ephemerides and two tarot
// decks that had already drifted. So the purge lives HERE, once, and both
// executors reach it server-to-server. That makes "every path uses the central
// purge" PROVABLE — `scripts/validate-media-purge.mjs` proves it — rather than
// hoped for.
//
// ORDER OF OPERATIONS, AND WHY THIS EXACT ORDER
// --------------------------------------------
//   1. create the media_purge_jobs row      <- MANDATORY precondition
//   2. attempt the purge, bounded batches, bounded time budget
//   3. delete auth.users                    <- the executor does this
//   4. mark the job completed, or leave it pending
//   5. a cron resumes whatever is still pending
//
// Step 1 before step 3 is not a preference. The job row carries the UUID and has
// NO foreign key to `auth.users`, so it survives the cascade — it is the only
// thing that does, and therefore the only thing that can drive a resume after
// the account is gone. If step 1 fails, the executor MUST NOT delete the
// account: it would create an orphan with no record that it exists.
//
// Step 3 never depends on step 2 succeeding. A reader asked for their account to
// be deleted; refusing because object storage is unwell would be a worse failure
// than the one being fixed. Step 5 is what guarantees the end state.
//
// OWNERSHIP IS PROVED, NEVER MATCHED
// ----------------------------------
// Every upload in this codebase writes `{uuid}/{filename}` — verified in all
// five call sites (mobile profile x2, verification, voice intro, web workspace).
// Ownership is therefore the FIRST PATH SEGMENT equalling the target UUID in
// full. Never a substring match: `scripts/seed-profile-photos.js` writes
// `seed-{uuid}.jpg` AT THE BUCKET ROOT, so a `path.includes(uuid)` test would
// treat 60 seed objects as user media and delete them. There are 62 such objects
// in `avatars` today.
//
// A path that cannot be proved owned is NEVER removed. It is counted as failed
// with class `ambiguous_ownership`, which leaves the job pending and visible.
//
// NO CORS, ON PURPOSE
// -------------------
// The only callers are two servers. Emitting no `Access-Control-Allow-Origin`
// means no browser can read a response from this endpoint, whatever the origin —
// stricter than any allowlist, and free. Do not add `_shared/cors.ts` here.
//
// NOTHING SENSITIVE IS LOGGED
// ---------------------------
// Bucket names, categories and counts. Never a path, a filename, a signed URL,
// or a storage error message — a storage error message contains the path that
// failed. `classifyStorageError` maps a message to one of seven CLASSES and
// discards the message itself. That is also what the database enforces:
// `media_purge_jobs.last_error_class` has a CHECK against those seven values.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/** This function's own credential. Independent of every other secret. */
export const PURGE_SECRET_ENV = "MEDIA_PURGE_SECRET";

/** Header carrying it. Named for this function alone. */
export const PURGE_SECRET_HEADER = "x-media-purge-secret";

/**
 * Below this the secret is refused outright, at boot.
 *
 * 32 hex characters is 128 bits. The check exists because a weak shared secret
 * fails silently here: the function works perfectly, and nothing ever reports
 * that the credential is guessable. Same floor as `_assert_cron_secret`, and
 * they must stay equal — `validate-media-purge.mjs` asserts it.
 */
export const MIN_SECRET_LENGTH = 32;

export const RATE_LIMIT_MAX_PER_HOUR = 240;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * The buckets this function may touch. Hard-coded, never derived from input.
 *
 * `marketing-images` and `tarot` are deliberately absent: they hold no user
 * media, and a bucket list that can grow by configuration is a bucket list that
 * can grow by accident.
 */
export const PURGE_BUCKETS = ["avatars", "voice-intros", "verifications"] as const;

/** Page size for `list`. Supabase caps this at 100 per call anyway. */
export const LIST_PAGE_SIZE = 100;

/** Objects removed per `remove()` call. */
export const REMOVE_BATCH_SIZE = 100;

/**
 * Folder levels explored BELOW the `{uuid}/` prefix.
 *
 * Every current upload writes exactly one level, so 0 would suffice today. A
 * legacy or future path with a subfolder would then be silently left behind —
 * and "silently left behind" is the whole finding. Three levels covers any
 * plausible shape; anything deeper leaves the bucket `done: false`, so the
 * resume cron keeps working on it instead of the job being closed as finished.
 */
export const MAX_DEPTH = 3;

/** Per-user time budget. Well under the platform limit, so a slow bucket cannot
 *  starve the ones after it — the job simply stays pending and resumes. */
export const USER_BUDGET_MS = 20_000;

/** Whole-invocation budget in resume mode, across all claimed jobs. */
export const RESUME_BUDGET_MS = 45_000;

/** Jobs claimed per resume pass. */
export const RESUME_DEFAULT_LIMIT = 10;
export const RESUME_MAX_LIMIT = 50;

export const ERROR_CLASSES = [
  "storage_unavailable",
  "permission_denied",
  "bucket_missing",
  "ambiguous_ownership",
  "rate_limited",
  "timeout",
  "unknown",
] as const;

export const UNAUTHORIZED = { status: 401, error: "unauthorized" };
export const NOT_CONFIGURED = { status: 500, error: "server_misconfigured" };
export const RATE_LIMITED = { status: 429, error: "rate_limited" };
export const RATE_LIMIT_UNAVAILABLE = { status: 503, error: "rate_limit_unavailable" };
export const BAD_REQUEST = { status: 400, error: "bad_request" };

/**
 * Length-independent comparison.
 *
 * The early length return leaks the configured length, which is not a secret and
 * is asserted to be >= 32 anyway. What matters is that a correct prefix costs no
 * more time than a wrong one.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A canonical UUID, anchored at both ends.
 *
 * Anchoring is the entire security property. Without `^` and `$`,
 * `"../../etc/passwd/0000...-....-....-....-............"` matches, and the
 * value is then used to build a storage prefix. The version nibble is NOT
 * constrained: Supabase issues v4, but a v1 or v7 account id must still be
 * purgeable, and rejecting one would silently skip a real user's media.
 */
export function isStrictUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Map a storage error to one of the seven classes. The message is DISCARDED.
 *
 * A storage error message contains the path that failed, which is exactly what
 * must not be logged or stored. Returning a class rather than a message is not
 * tidiness: `media_purge_jobs.last_error_class` has a CHECK against these seven
 * values, so a message would be REFUSED by the database.
 */
export function classifyStorageError(message: unknown): string {
  const text = typeof message === "string" ? message.toLowerCase() : "";
  if (!text) return "unknown";
  if (text.includes("not found") && text.includes("bucket")) return "bucket_missing";
  if (text.includes("bucket not found")) return "bucket_missing";
  if (text.includes("permission") || text.includes("forbidden") ||
      text.includes("unauthorized") || text.includes("not authorized")) {
    return "permission_denied";
  }
  if (text.includes("too many") || text.includes("rate limit")) return "rate_limited";
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("network") || text.includes("unavailable") ||
      text.includes("econn") || text.includes("socket") ||
      text.includes("fetch failed") || text.includes("503") || text.includes("502")) {
    return "storage_unavailable";
  }
  return "unknown";
}

/**
 * Build the full object path for one listing entry, and prove it is owned.
 *
 * Returns `null` when ownership cannot be proved — the caller must then NOT
 * remove it. Every rejection below has a concrete counterexample in this
 * project's own storage:
 *
 *   - `prefix` not starting with the uuid   -> a caller-supplied prefix
 *   - a segment equal to `.` or `..`        -> traversal out of the user folder
 *   - a leading `/`                         -> absolute path, first segment ""
 *   - an empty name                         -> `list` returns one for a folder
 *     placeholder in some Supabase versions, and `remove([""])` is not inert
 */
export function buildOwnedPath(
  userId: string,
  prefix: string,
  entryName: unknown,
): string | null {
  if (!isStrictUuid(userId)) return null;
  if (typeof entryName !== "string" || entryName.length === 0) return null;
  if (entryName.includes("/")) return null; // `list` returns leaf names only
  if (typeof prefix !== "string" || prefix.length === 0) return null;

  const path = `${prefix}/${entryName}`;
  const segments = path.split("/");

  // Ownership, revalidated on the RECONSTRUCTED path rather than assumed from
  // the prefix that was passed in.
  if (segments[0]?.toLowerCase() !== userId.toLowerCase()) return null;
  if (segments.length < 2 || segments.length > MAX_DEPTH + 2) return null;
  for (const segment of segments) {
    if (segment.length === 0) return null;
    if (segment === "." || segment === "..") return null;
  }
  return path;
}

/** Split into bounded batches. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One bucket's outcome. Counters and a boolean — never a path. */
export interface CategoryResult {
  found: number;
  deleted: number;
  failed: number;
  done: boolean;
}

export interface StorageBucket {
  list: (
    prefix: string,
    options: { limit: number; offset: number },
  ) => Promise<{ data: Array<{ name?: unknown; id?: unknown }> | null; error: { message: string } | null }>;
  remove: (
    paths: string[],
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface PurgeDeps {
  bucket: (name: string) => StorageBucket;
  now: () => number;
}

/**
 * Purge one bucket for one user.
 *
 * Never throws for a storage condition: an unreachable bucket must not prevent
 * the other two from being cleaned. It returns `done: false` instead, which
 * keeps the job pending and visible.
 *
 * `done: false` is also what a truncated walk returns. Claiming a bucket
 * finished when the listing was cut short by the budget or by depth is the one
 * outcome that would recreate the finding: an object left behind, and a job
 * closed as complete.
 */
export async function purgeBucketForUser(
  deps: PurgeDeps,
  bucketName: string,
  userId: string,
  deadline: number,
): Promise<{ result: CategoryResult; errorClass: string | null }> {
  const result: CategoryResult = { found: 0, deleted: 0, failed: 0, done: true };
  let errorClass: string | null = null;

  if (!isStrictUuid(userId)) {
    // Unreachable through the HTTP handler, which validates first. Kept because
    // this function is also called directly by the resume loop.
    return { result: { ...result, done: false }, errorClass: "ambiguous_ownership" };
  }

  const bucket = deps.bucket(bucketName);
  const queue: Array<{ prefix: string; depth: number }> = [{ prefix: userId, depth: 0 }];
  const toRemove: string[] = [];

  while (queue.length > 0) {
    if (deps.now() >= deadline) {
      result.done = false;
      errorClass = errorClass ?? "timeout";
      break;
    }
    const node = queue.shift()!;
    let offset = 0;

    // Paginate. A user with more than LIST_PAGE_SIZE objects is unusual but a
    // single unpaginated `list` would silently stop at the first page — and
    // "silently stopped" is the shape of this whole finding.
    for (;;) {
      if (deps.now() >= deadline) {
        result.done = false;
        errorClass = errorClass ?? "timeout";
        break;
      }

      const { data, error } = await bucket.list(node.prefix, {
        limit: LIST_PAGE_SIZE,
        offset,
      });

      if (error) {
        result.done = false;
        errorClass = errorClass ?? classifyStorageError(error.message);
        break;
      }
      const entries = data ?? [];
      if (entries.length === 0) break;

      for (const entry of entries) {
        // Supabase marks a pseudo-folder with a null `id`.
        const isFolder = entry.id === null || entry.id === undefined;
        const path = buildOwnedPath(userId, node.prefix, entry.name);

        if (path === null) {
          // Ownership not provable. Never removed, always visible.
          result.failed += 1;
          result.done = false;
          errorClass = errorClass ?? "ambiguous_ownership";
          continue;
        }

        if (isFolder) {
          if (node.depth + 1 > MAX_DEPTH) {
            // Deeper than we walk. Not an error, but not finished either.
            result.done = false;
            continue;
          }
          queue.push({ prefix: path, depth: node.depth + 1 });
          continue;
        }

        result.found += 1;
        toRemove.push(path);
      }

      if (entries.length < LIST_PAGE_SIZE) break;
      offset += entries.length;
    }
  }

  for (const batch of chunk(toRemove, REMOVE_BATCH_SIZE)) {
    // Every path in `batch` came through buildOwnedPath. Re-checking here is
    // cheap and closes the gap a future refactor would open by pushing a path
    // from somewhere else.
    if (batch.some((p) => p.split("/")[0]?.toLowerCase() !== userId.toLowerCase())) {
      result.failed += batch.length;
      result.done = false;
      errorClass = errorClass ?? "ambiguous_ownership";
      continue;
    }

    const { error } = await bucket.remove(batch);
    if (error) {
      result.failed += batch.length;
      result.done = false;
      errorClass = errorClass ?? classifyStorageError(error.message);
      continue;
    }
    // No error means every requested path is gone. An object that was ALREADY
    // absent is an idempotent success, not a failure: Supabase omits it from the
    // returned list rather than erroring, and a second purge of the same user
    // must therefore report success, not a fatal error.
    result.deleted += batch.length;
  }

  if (result.failed > 0) result.done = false;
  return { result, errorClass };
}

/** Every bucket, for one user. */
export async function purgeUserMedia(
  deps: PurgeDeps,
  userId: string,
  deadline: number,
): Promise<{
  perCategory: Record<string, CategoryResult>;
  done: boolean;
  errorClass: string | null;
}> {
  const perCategory: Record<string, CategoryResult> = {};
  let done = true;
  let errorClass: string | null = null;

  for (const bucketName of PURGE_BUCKETS) {
    const { result, errorClass: cls } = await purgeBucketForUser(
      deps,
      bucketName,
      userId,
      deadline,
    );
    perCategory[bucketName] = result;
    if (!result.done) done = false;
    // First class wins, so a later transient error cannot mask an ownership
    // refusal — the one condition that needs a human.
    if (cls && !errorClass) errorClass = cls;

    console.log(
      `[purge-user-media] bucket=${bucketName} found=${result.found} ` +
      `deleted=${result.deleted} failed=${result.failed} done=${result.done}`,
    );
  }

  return { perCategory, done, errorClass };
}

export type ParsedRequest =
  | { ok: true; mode: "purge"; userId: string; requestedBy: string }
  | { ok: true; mode: "resume"; limit: number }
  | { ok: false; error: string };

/**
 * Validate the request body. One user id, or a resume instruction — never a
 * list of paths, never a bucket name, never a prefix.
 *
 * A caller-supplied path would turn this function into a delete-anything
 * primitive, which is the same mistake `marketing-agent` avoided by choosing the
 * upload path server-side.
 */
export function parsePurgeRequest(body: unknown): ParsedRequest {
  if (body === null || typeof body !== "object") return { ok: false, error: "bad_request" };
  const raw = body as Record<string, unknown>;

  // `hasOwnProperty`, not `in`: `{"__proto__":{"mode":"resume"}}` would satisfy
  // `in` through the prototype chain.
  const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);

  const mode = has("mode") ? raw.mode : "purge";
  if (mode !== "purge" && mode !== "resume") return { ok: false, error: "bad_request" };

  if (mode === "resume") {
    let limit = RESUME_DEFAULT_LIMIT;
    if (has("limit")) {
      const value = raw.limit;
      if (typeof value !== "number" || !Number.isInteger(value) ||
          value < 1 || value > RESUME_MAX_LIMIT) {
        return { ok: false, error: "bad_request" };
      }
      limit = value;
    }
    return { ok: true, mode: "resume", limit };
  }

  if (!has("userId") || !isStrictUuid(raw.userId)) return { ok: false, error: "bad_request" };

  const requestedBy = has("requestedBy") ? raw.requestedBy : "manual";
  if (requestedBy !== "mobile_cron" && requestedBy !== "web_immediate" &&
      requestedBy !== "manual") {
    return { ok: false, error: "bad_request" };
  }

  return { ok: true, mode: "purge", userId: raw.userId as string, requestedBy };
}

export interface AuthDeps {
  configuredSecret: string;
  checkRateLimit: (
    key: string,
    max: number,
    windowSeconds: number,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Decide whether to serve. Fail-closed on every branch.
 *
 * ORDER IS DELIBERATE: the rate limit runs BEFORE the secret comparison, keyed
 * on the client address. A limiter placed after the credential check cannot
 * bound an attempt to GUESS the credential, because a failed guess never
 * reaches it.
 *
 * An unavailable limiter REFUSES (503). That is the fail-closed choice, and it
 * is the opposite of what JUNO-29 did — it logged its own failure and carried
 * on for 142 nights.
 */
export async function authorizePurgeRequest(
  deps: AuthDeps,
  providedSecret: string | null,
  clientAddress: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!deps.configuredSecret || deps.configuredSecret.length < MIN_SECRET_LENGTH) {
    console.error("[purge-user-media] secret absent or too short");
    return { ok: false, ...NOT_CONFIGURED };
  }

  const key = `purge-user-media:${clientAddress || "unknown"}`;
  const { data, error } = await deps.checkRateLimit(
    key,
    RATE_LIMIT_MAX_PER_HOUR,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (error) return { ok: false, ...RATE_LIMIT_UNAVAILABLE };
  if (data !== true) return { ok: false, ...RATE_LIMITED };

  // Compared against a same-length placeholder when absent, so a missing header
  // costs the same time as a wrong one.
  const candidate = providedSecret ?? " ".repeat(deps.configuredSecret.length);
  if (!constantTimeEqual(candidate, deps.configuredSecret)) {
    return { ok: false, ...UNAUTHORIZED };
  }
  return { ok: true };
}

export function clientAddressOf(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

function json(body: Record<string, unknown>, status: number): Response {
  // No Access-Control-Allow-Origin, on purpose. See the header.
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return json(NOT_CONFIGURED, 500);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const decision = await authorizePurgeRequest(
    {
      configuredSecret: Deno.env.get(PURGE_SECRET_ENV) || "",
      checkRateLimit: (key, max, windowSeconds) =>
        admin.rpc("check_edge_rate_limit", {
          p_key: key,
          p_max: max,
          p_window_seconds: windowSeconds,
        }),
    },
    req.headers.get(PURGE_SECRET_HEADER),
    clientAddressOf(req),
  );
  if (!decision.ok) return json({ error: decision.error }, decision.status);

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return json(BAD_REQUEST, 400);
  }

  const parsed = parsePurgeRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const deps: PurgeDeps = {
    bucket: (name: string) => admin.storage.from(name) as unknown as StorageBucket,
    now: () => Date.now(),
  };

  // -------------------------------------------------------------------------
  // Resume: only jobs already recorded. This branch CANNOT reach an account
  // that no job names, which is why the cron is pinned to it.
  // -------------------------------------------------------------------------
  if (parsed.mode === "resume") {
    const { data: claimed, error: claimError } = await admin.rpc("claim_media_purge_jobs", {
      p_limit: parsed.limit,
    });
    if (claimError) {
      console.error("[purge-user-media] claim failed");
      return json({ error: "claim_failed" }, 500);
    }

    const jobs = (claimed ?? []) as Array<{ job_id: string; user_id: string }>;
    const invocationDeadline = Date.now() + RESUME_BUDGET_MS;
    let completed = 0;
    let stillPending = 0;

    for (const job of jobs) {
      if (Date.now() >= invocationDeadline) {
        // Remaining jobs keep `claimed_at`, which the stale window releases.
        stillPending += 1;
        continue;
      }
      if (!isStrictUuid(job.user_id)) {
        // A row whose user_id is not a UUID cannot be acted on safely. Recorded,
        // never guessed at.
        await admin.rpc("record_media_purge_result", {
          p_job_id: job.job_id,
          p_per_category: {},
          p_done: false,
          p_error_class: "ambiguous_ownership",
        });
        stillPending += 1;
        continue;
      }

      const deadline = Math.min(Date.now() + USER_BUDGET_MS, invocationDeadline);
      const outcome = await purgeUserMedia(deps, job.user_id, deadline);

      const { error: recordError } = await admin.rpc("record_media_purge_result", {
        p_job_id: job.job_id,
        p_per_category: outcome.perCategory,
        p_done: outcome.done,
        p_error_class: outcome.errorClass,
      });
      if (recordError) {
        console.error("[purge-user-media] record failed during resume");
        stillPending += 1;
        continue;
      }
      if (outcome.done) completed += 1;
      else stillPending += 1;
    }

    console.log(
      `[purge-user-media] resume: claimed=${jobs.length} completed=${completed} ` +
      `still_pending=${stillPending}`,
    );
    return json(
      { ok: true, mode: "resume", claimed: jobs.length, completed, stillPending },
      200,
    );
  }

  // -------------------------------------------------------------------------
  // Purge one user.
  //
  // The job row FIRST. If this fails, the response says so and the caller MUST
  // NOT delete the account — there would be no record that media survives.
  // -------------------------------------------------------------------------
  const { data: jobId, error: jobError } = await admin.rpc("create_media_purge_job", {
    p_user_id: parsed.userId,
    p_requested_by: parsed.requestedBy,
  });

  if (jobError || typeof jobId !== "string") {
    console.error("[purge-user-media] job creation failed — caller must not delete the account");
    return json({ error: "job_not_created", jobCreated: false }, 500);
  }

  const outcome = await purgeUserMedia(deps, parsed.userId, Date.now() + USER_BUDGET_MS);

  const { error: recordError } = await admin.rpc("record_media_purge_result", {
    p_job_id: jobId,
    p_per_category: outcome.perCategory,
    p_done: outcome.done,
    p_error_class: outcome.errorClass,
  });

  // A failed record does NOT invalidate the purge, and must not block the
  // account deletion: the job row exists and stays `pending`, so the resume
  // cron will finish the work. `jobCreated` stays true, because it is.
  if (recordError) console.error("[purge-user-media] record failed after purge");

  return json(
    {
      ok: true,
      jobCreated: true,
      jobId,
      done: outcome.done,
      recorded: !recordError,
      perCategory: outcome.perCategory,
      errorClass: outcome.errorClass,
    },
    200,
  );
});
