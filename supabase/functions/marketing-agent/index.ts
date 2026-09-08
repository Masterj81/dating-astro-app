import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The marketing agent's entire server surface — JUNO-04.
//
// WHY THIS FUNCTION EXISTS
// ------------------------
// `marketingagent/` is a local Node tool. It held SUPABASE_SERVICE_ROLE_KEY in
// a plaintext .env on a developer workstation: a JWT valid until 2036 that
// bypasses RLS on every table, including `profiles` (all PII and all birth
// data), `messages`, and the `auth.users` admin API.
//
// What it actually does with that key, read from its own source on 8 Sep 2026
// (cloud-scheduler.ts, upload-image.ts), is four things:
//
//   1. upload a marketing image;
//   2. insert one row into `marketing_posts`;
//   3. list the queue;
//   4. read back the status of posts it already knows the ids of.
//
// Those four are what this function exposes, and nothing else. The service-role
// key does not disappear — it MOVES, from the workstation to Supabase's secret
// store, where it already lives for fifteen other functions. The workstation
// keeps only MARKETING_AGENT_TOKEN, which can do these four things.
//
// A rotation alone would not have achieved this. It would have replaced one
// omnipotent credential with another omnipotent credential in the same file.
//
// EVERY OPERATION IS AN ALLOWLIST ENTRY
// -------------------------------------
// No parameter names a table, a column, a bucket, an operator or a role. The
// storage path is chosen HERE, never supplied by the caller — a caller-chosen
// path is how an uploader becomes an overwrite primitive. The database work
// goes through three narrow SECURITY DEFINER functions
// (20260908000001_marketing_agent_narrow_rpcs.sql) that validate their inputs
// again at the database boundary, so a careless refactor of this file cannot
// quietly widen what reaches the table.
//
// NO CORS, ON PURPOSE
// -------------------
// The only caller is a Node process. Emitting no Access-Control-Allow-Origin
// means no browser can read a response from this endpoint, whatever the origin
// — which is stricter than any allowlist and costs nothing. Do not add
// _shared/cors.ts here: it would be a widening, not a hardening.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/** The agent's own credential. Independent of every other secret. */
export const MARKETING_TOKEN_ENV = "MARKETING_AGENT_TOKEN";

/**
 * Shorter than this and the token is refused outright, at boot.
 *
 * 32 characters of `openssl rand -hex 32` output is 128 bits. The check exists
 * because the failure mode of a weak shared secret here is silent: the function
 * works perfectly, and nothing ever reports that the credential is guessable.
 */
export const MIN_TOKEN_LENGTH = 32;

export const RATE_LIMIT_MAX_PER_HOUR = 120;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;

export const MARKETING_BUCKET = "marketing-images";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Content types accepted for upload, and the extension each one gets. */
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const ALLOWED_OPERATIONS = [
  "schedule_post",
  "list_queue",
  "sync_status",
] as const;

export type Operation = (typeof ALLOWED_OPERATIONS)[number];

// Uniform refusals. The endpoint must not become an oracle for whether a token
// is close to correct, or whether the agent is configured at all.
export const UNAUTHORIZED = { status: 401, error: "unauthorized" } as const;
export const NOT_CONFIGURED = { status: 503, error: "agent_not_configured" } as const;
export const RATE_LIMITED = { status: 429, error: "rate_limited" } as const;
export const RATE_LIMIT_UNAVAILABLE = {
  status: 503,
  error: "rate_limit_unavailable",
} as const;

export type AuthDecision =
  | { ok: true }
  | { ok: false; status: number; error: string };

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface AuthDeps {
  /** The configured MARKETING_AGENT_TOKEN, or "" when unset. */
  configuredToken: string;
  /** `check_edge_rate_limit`, called as service_role. */
  checkRateLimit: (
    key: string,
    max: number,
    windowSeconds: number,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Decide whether to serve a request. Fail-closed on every branch.
 *
 * ORDER MATTERS, and the order here is deliberate: the rate limit runs BEFORE
 * the token comparison, keyed on the client address. A limiter placed after the
 * credential check cannot bound an attempt to guess the credential, because a
 * failed guess never reaches it. The cost is that a flood from one address can
 * exhaust the agent's own budget from that address — acceptable, because the
 * agent makes a handful of calls a day and runs from one machine.
 *
 * The limiter is fail-closed. Wave 1 fixed exactly this bug in
 * `get-profile-chart`, where a limiter that logged its own failure and carried
 * on turned any transient database error into an unmetered endpoint.
 */
export async function authorizeMarketingRequest(
  deps: AuthDeps,
  authHeader: string | null,
  clientAddress: string,
): Promise<AuthDecision> {
  // An unconfigured or too-short token is never "allow". It is also not
  // reported as a distinct condition to the caller — 503 says "not now", it
  // does not say "there is no password on this door".
  if (
    !deps.configuredToken ||
    deps.configuredToken.length < MIN_TOKEN_LENGTH
  ) {
    console.error(
      `[marketing-agent] ${MARKETING_TOKEN_ENV} is missing or shorter than ${MIN_TOKEN_LENGTH} characters; refusing every request`,
    );
    return { ok: false, ...NOT_CONFIGURED };
  }

  const key = `marketing_agent:${clientAddress || "unknown"}`;
  const { data: allowed, error: rateError } = await deps.checkRateLimit(
    key,
    RATE_LIMIT_MAX_PER_HOUR,
    RATE_LIMIT_WINDOW_SECONDS,
  );
  if (rateError) {
    console.error("[marketing-agent] rate limit check failed:", rateError.message);
    return { ok: false, ...RATE_LIMIT_UNAVAILABLE };
  }
  if (allowed !== true) return { ok: false, ...RATE_LIMITED };

  const presented = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return { ok: false, ...UNAUTHORIZED };
  if (!constantTimeEqual(presented, deps.configuredToken)) {
    return { ok: false, ...UNAUTHORIZED };
  }

  return { ok: true };
}

/**
 * Where an uploaded image goes.
 *
 * The caller supplies a content type and nothing else. The path is built here,
 * from a server-generated UUID, so no request can name an existing object —
 * upsert is not enabled either, but a caller-chosen path would still let one
 * upload probe or shadow another. Returns null for a type that is not on the
 * allowlist.
 */
export function buildStoragePath(
  contentType: string,
  uuid: string,
  now: Date,
): string | null {
  const ext = IMAGE_TYPES[(contentType || "").split(";")[0].trim().toLowerCase()];
  if (!ext) return null;
  return `marketing/${now.getUTCFullYear()}/${uuid}.${ext}`;
}

export type ParsedOperation =
  | { ok: true; op: Operation; body: Record<string, unknown> }
  | { ok: false; error: string };

/** Reject anything that is not one of the three named operations. */
export function parseOperation(body: unknown): ParsedOperation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const record = body as Record<string, unknown>;

  // OWN property only. `record.op` walks the prototype chain, so an object
  // whose prototype carries an `op` would have selected an operation nobody
  // sent. `JSON.parse` does not build such an object today — it materialises
  // `__proto__` as an own key rather than assigning the prototype — but the
  // guard costs one line and does not depend on that staying true.
  if (!Object.prototype.hasOwnProperty.call(record, "op")) {
    return { ok: false, error: "missing_op" };
  }
  const op = record.op;
  if (typeof op !== "string") return { ok: false, error: "missing_op" };
  if (!(ALLOWED_OPERATIONS as readonly string[]).includes(op)) {
    return { ok: false, error: "unknown_op" };
  }
  return { ok: true, op: op as Operation, body: record };
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clientAddressOf(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const decision = await authorizeMarketingRequest(
    {
      configuredToken: Deno.env.get(MARKETING_TOKEN_ENV) || "",
      checkRateLimit: (key, max, windowSeconds) =>
        admin.rpc("check_edge_rate_limit", {
          p_key: key,
          p_max: max,
          p_window_seconds: windowSeconds,
        }),
    },
    req.headers.get("authorization") ?? req.headers.get("Authorization"),
    clientAddressOf(req),
  );
  if (!decision.ok) {
    return json({ error: decision.error }, decision.status);
  }

  const url = new URL(req.url);

  // ---- Image upload (raw bytes, not JSON) ---------------------------------
  //
  // The bytes travel through the function rather than through a signed upload
  // URL. Marketing images are around a megabyte, so the simpler shape costs
  // little, and it keeps the bucket reachable only from here. If image sizes
  // grow, `createSignedUploadUrl` is the documented alternative — see the
  // runbook.
  if (url.pathname.endsWith("/upload")) {
    const contentType = req.headers.get("content-type") || "";
    const uuid = crypto.randomUUID();
    const storagePath = buildStoragePath(contentType, uuid, new Date());
    if (!storagePath) {
      return json({ error: "unsupported_content_type" }, 415);
    }

    const declared = Number(req.headers.get("content-length") || "0");
    if (declared > MAX_IMAGE_BYTES) {
      return json({ error: "image_too_large" }, 413);
    }

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.byteLength === 0) return json({ error: "empty_body" }, 400);
    // Re-checked against the actual bytes: content-length is a claim.
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return json({ error: "image_too_large" }, 413);
    }

    const { error } = await admin.storage
      .from(MARKETING_BUCKET)
      .upload(storagePath, bytes, {
        contentType: contentType.split(";")[0].trim().toLowerCase(),
        upsert: false,
      });
    if (error) {
      console.error("[marketing-agent] upload failed:", error.message);
      return json({ error: "upload_failed" }, 502);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${MARKETING_BUCKET}/${storagePath}`;
    console.log(`[marketing-agent] ok op=upload bytes=${bytes.byteLength}`);
    return json({ publicUrl, path: storagePath }, 200);
  }

  // ---- The three database operations --------------------------------------
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = parseOperation(payload);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { op, body } = parsed;

  try {
    if (op === "schedule_post") {
      const platforms = Array.isArray(body.platforms) ? body.platforms : null;
      if (!platforms || platforms.some((p) => typeof p !== "string")) {
        return json({ error: "invalid_platforms" }, 400);
      }
      const { data, error } = await admin.rpc("marketing_agent_schedule_post", {
        p_text: typeof body.text === "string" ? body.text : null,
        p_topic: typeof body.topic === "string" ? body.topic : null,
        p_ai_score: typeof body.aiScore === "number" ? Math.trunc(body.aiScore) : null,
        p_platforms: platforms,
        p_scheduled_for:
          typeof body.scheduledFor === "string" ? body.scheduledFor : null,
        p_image_url: typeof body.imageUrl === "string" ? body.imageUrl : null,
      });
      if (error) {
        // The RPC's own validation errors are short, fixed identifiers
        // (`text_too_long`, `unknown_platform`). Passing them back is useful
        // and safe; they describe the request, never the database.
        console.error("[marketing-agent] schedule_post refused:", error.message);
        return json({ error: "schedule_rejected", detail: error.message }, 400);
      }
      console.log(`[marketing-agent] ok op=${op}`);
      return json({ id: data }, 200);
    }

    if (op === "list_queue") {
      const { data, error } = await admin.rpc("marketing_agent_list_queue", {
        p_limit: typeof body.limit === "number" ? Math.trunc(body.limit) : 30,
        p_status: typeof body.status === "string" ? body.status : null,
      });
      if (error) {
        console.error("[marketing-agent] list_queue refused:", error.message);
        return json({ error: "list_rejected", detail: error.message }, 400);
      }
      console.log(`[marketing-agent] ok op=${op}`);
      return json({ rows: data ?? [] }, 200);
    }

    // sync_status
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids || ids.some((id) => typeof id !== "string" || !UUID_REGEX.test(id))) {
      return json({ error: "invalid_ids" }, 400);
    }
    const { data, error } = await admin.rpc("marketing_agent_post_statuses", {
      p_ids: ids,
    });
    if (error) {
      console.error("[marketing-agent] sync_status refused:", error.message);
      return json({ error: "sync_rejected", detail: error.message }, 400);
    }
    console.log(`[marketing-agent] ok op=${op} ids=${ids.length}`);
    return json({ rows: data ?? [] }, 200);
  } catch (err) {
    console.error("[marketing-agent] unhandled:", (err as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
