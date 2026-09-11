import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// JUNO-09 phase C — the historical catch-up, behind four gates.
//
// WHAT THIS IS FOR
// ---------------------------------------------------------------------------
// Phase B stopped new orphans from being created. It deliberately did not touch
// the historical ones: no `media_purge_jobs` row names them, the resume cron is
// pinned to `resume`, and the detector has no destructive mode.
//
// Five objects remain — 4 in `avatars`, 1 in `verifications` (a video of
// someone's face), the oldest from 1 February 2026. They are the only reason
// JUNO-09 is still open.
//
// WHAT MUST NEVER BE TOUCHED, WHICH IS THE HALF THAT MATTERS
// ---------------------------------------------------------------------------
// Storage holds 90 objects. Five are to be deleted; 85 are not, and nothing in a
// path distinguishes them by eye:
//
//   60  `seed-{uuid}.jpg` AT THE BUCKET ROOT — scripts/seed-profile-photos.js.
//       The UUID is in the FILENAME, not a folder. A `path.includes(uuid)` test
//       would delete every one of them.
//    6  `marketing/…` — a non-UUID prefix, written by service_role which
//       bypasses RLS. No provable owner, therefore no provable orphanhood.
//   21  objects whose owner still exists in auth.users.
//
// Ownership is the FIRST FOLDER SEGMENT equal to the UUID in full. Never a
// substring, never an inclusion.
//
// WHY THIS IS AN EDGE FUNCTION AND NOT A SCRIPT HOLDING THE SERVICE KEY
// ---------------------------------------------------------------------------
// Deleting storage objects needs administrative power. A CLI would need the
// service-role key on the workstation — exactly what JUNO-04 just removed from
// it. Keeping that key in Supabase's secret store, where JUNO-04 put it, is the
// whole reason this lives here. The workstation holds only ORPHAN_PURGE_SECRET,
// whose power is limited to these three modes.
//
// The risk that introduces — an endpoint that can delete — is bounded by a
// structural property: the server RE-CLASSIFIES every entry itself and deletes
// only the intersection with the manifest. A manifest can therefore NARROW, never
// WIDEN. No caller can make this function delete an object the server does not
// independently classify as a proven orphan.
//
// "RE-VERIFICATION" IS NOT "DYNAMIC DISCOVERY"
// ---------------------------------------------------------------------------
// The execution path NEVER iterates over a bucket. It iterates over manifest
// entries, and re-verification can only REMOVE an entry, never add one.
// `scripts/validate-orphan-purge.mjs` asserts there is no listing call in the
// destructive branch.
//
// FOUR GATES, THREE MODES
// ---------------------------------------------------------------------------
//   discover  read-only. Classifies everything, returns counters and opaque
//             object ids. No path, no owner UUID, ever.
//   approve   read-only. Re-verifies, checks the caps, and SIGNS an approval with
//             a key that never leaves this function — so the operator cannot
//             forge one, and a hand-edited manifest is irrecoverably unapproved.
//   execute   destructive. Requires the manifest, the signed approval, matching
//             hashes, the volume cap, the expected project, a fresh owner-absence
//             check per entry, and a confirmation carrying the exact count.
//
// NOTHING SENSITIVE LEAVES THIS FUNCTION
// ---------------------------------------------------------------------------
// No path, no filename, no signed URL, no owner UUID, no Error.message. Storage
// errors are reduced to one of twelve CLOSED classes, and the audit table's CHECK
// constraint makes writing anything else impossible rather than discouraged.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

/** The workstation's credential. Its only power is these three modes. */
export const ORPHAN_SECRET_ENV = "ORPHAN_PURGE_SECRET";
export const ORPHAN_SECRET_HEADER = "x-orphan-purge-secret";

/**
 * The approval signing key. SERVER-ONLY, and that is the point of gate C.
 *
 * It never leaves this function's environment, so the operator cannot sign an
 * approval. A manifest edited after validation produces a different hash, the
 * stored signature no longer verifies, and no amount of local filesystem access
 * fixes that.
 */
export const ORPHAN_APPROVAL_KEY_ENV = "ORPHAN_APPROVAL_KEY";

export const MIN_SECRET_LENGTH = 32;

export const RATE_LIMIT_MAX_PER_HOUR = 60;
export const RATE_LIMIT_WINDOW_SECONDS = 3600;

/** The only project this function will act on. */
export const EXPECTED_PROJECT_REF = "qtihezzbuubnyvrjdkjd";

export const TOOL_VERSION = "1.1.0";
export const MANIFEST_SCHEMA = "juno09-orphan-manifest/2";
export const APPROVAL_SCHEMA = "juno09-orphan-approval/1";

/** Hard-coded, never derived from input. */
export const ORPHAN_BUCKETS = ["avatars", "voice-intros", "verifications"] as const;

/**
 * The first campaign's expected shape, and its absolute ceiling.
 *
 * `totalExact` is not a suggestion: finding four or six objects stops the
 * procedure. An automatic adjustment would defeat the only cheap check that
 * catches a classification bug — the count you already knew.
 */
export const CAMPAIGN_CAPS = {
  totalExact: 5,
  absoluteMax: 5,
  byBucket: { avatars: 4, "voice-intros": 0, verifications: 1 },
} as const;

/** Approval lifetime. Long enough to review, short enough not to be replayed. */
export const APPROVAL_TTL_MS = 60 * 60 * 1000;

/** Per-invocation time budget for the destructive pass. */
export const EXECUTE_BUDGET_MS = 30_000;
/** Request body ceiling. A five-entry manifest is ~2 KB; a path list is not a manifest. */
export const MAX_BODY_BYTES = 65_536;

export const ORPHAN_CATEGORIES = [
  "orphan_proven",
  "auth_owner_exists",
  "ambiguous_ownership",
  "unknown_path_shape",
] as const;

export const ORPHAN_ERROR_CLASSES = [
  "deleted",
  "already_absent",
  "auth_owner_exists",
  "ambiguous_ownership",
  "unknown_path_shape",
  "storage_unavailable",
  "permission_denied",
  "timeout",
  "manifest_mismatch",
  "approval_mismatch",
  "volume_limit_exceeded",
  // Registry classes. Answered to the caller, never persisted: the audit row's
  // last_error_class is only ever written from a storage outcome.
  "campaign_unknown",
  "campaign_closed",
  "registry_unavailable",
  "registry_mismatch",
  "unknown",
] as const;

export const UNAUTHORIZED = { status: 401, error: "unauthorized" };
export const NOT_CONFIGURED = { status: 500, error: "server_misconfigured" };
export const RATE_LIMITED = { status: 429, error: "rate_limited" };
export const RATE_LIMIT_UNAVAILABLE = { status: 503, error: "rate_limit_unavailable" };
export const BAD_REQUEST = { status: 400, error: "bad_request" };
export const REFUSED = { status: 409, error: "refused" };

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A canonical UUID, anchored at both ends.
 *
 * Anchoring is the security property: without `^` and `$`,
 * `"../../x/00000000-0000-0000-0000-000000000000"` matches, and the value then
 * builds a storage prefix. The version nibble is not constrained — a v1 or v7
 * account id must remain purgeable.
 */
export function isStrictUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * The first folder segment of an object name, or null when there is none.
 *
 * `storage.foldername('file.jpg')` returns an EMPTY array, so `[1]` is NULL and
 * `NOT NULL` is NULL — never TRUE. That defect silently lost 62 of 89 objects in
 * the first version of the phase A diagnostic. Here the root case is explicit and
 * gets its own class.
 */
export function firstSegment(name: unknown): string | null {
  if (typeof name !== "string" || name.length === 0) return null;
  const at = name.indexOf("/");
  if (at <= 0) return null;            // no folder, or a leading slash
  return name.slice(0, at);
}

/**
 * The shape of a path, before any owner lookup.
 *
 * Exhaustive by construction: every name falls into exactly one of three shapes,
 * and the caller then splits `uuid` by owner existence. The sum of the four
 * resulting classes must equal the total — the diagnostic asserts it.
 */
export function pathShapeOf(name: unknown): "uuid" | "non_uuid_prefix" | "root" {
  const segment = firstSegment(name);
  if (segment === null) return "root";
  if (!isStrictUuid(segment)) return "non_uuid_prefix";
  // A path deeper than `{uuid}/…/file` is still owned, but a traversal segment
  // is not: `{uuid}/../other/x` would leave the folder.
  const parts = (name as string).split("/");
  if (parts.some((p) => p.length === 0 || p === "." || p === "..")) {
    return "non_uuid_prefix";
  }
  return "uuid";
}

export interface RawObject {
  id: string;
  bucket_id: string;
  name: string;
  created_at: string;
  size_bytes: number;
}

export interface ClassifiedObject {
  objectId: string;
  bucket: string;
  sizeBytes: number;
  createdAt: string;
  category: string;
  reason: string;
  /** Present only for the `uuid` shape. NEVER leaves this function. */
  ownerUuid: string | null;
}

/**
 * Classify every object. Pure, and exhaustive.
 *
 * `existingOwners` is the set of first-segment UUIDs that DO exist in
 * auth.users. Passing the set of existing owners rather than all user ids is
 * deliberate: the caller queries auth.users for the candidate UUIDs only, so no
 * list of accounts is ever assembled in memory.
 */
export function classifyObjects(
  rows: readonly RawObject[],
  existingOwners: ReadonlySet<string>,
): ClassifiedObject[] {
  return rows.map((row) => {
    const shape = pathShapeOf(row.name);
    const base = {
      objectId: row.id,
      bucket: row.bucket_id,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    };

    if (shape === "root") {
      return {
        ...base,
        category: "unknown_path_shape",
        reason: "object_at_bucket_root_no_folder_segment",
        ownerUuid: null,
      };
    }
    if (shape === "non_uuid_prefix") {
      return {
        ...base,
        category: "ambiguous_ownership",
        reason: "first_segment_is_not_a_uuid",
        ownerUuid: null,
      };
    }

    const owner = firstSegment(row.name) as string;
    if (existingOwners.has(owner.toLowerCase())) {
      return {
        ...base,
        category: "auth_owner_exists",
        reason: "first_segment_uuid_present_in_auth_users",
        ownerUuid: owner,
      };
    }
    return {
      ...base,
      category: "orphan_proven",
      reason: "first_segment_uuid_absent_from_auth_users",
      ownerUuid: owner,
    };
  });
}

/** Counters, from a classification. The only thing standard output ever shows. */
export function summarizeClassification(objects: readonly ClassifiedObject[]): {
  objects: number;
  byBucket: Record<string, number>;
  byCategory: Record<string, number>;
} {
  const byBucket: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const category of ORPHAN_CATEGORIES) byCategory[category] = 0;
  for (const object of objects) {
    byBucket[object.bucket] = (byBucket[object.bucket] ?? 0) + 1;
    byCategory[object.category] = (byCategory[object.category] ?? 0) + 1;
  }
  return { objects: objects.length, byBucket, byCategory };
}

/**
 * Deterministic JSON: object keys sorted, no incidental whitespace.
 *
 * Two runs over the same data must produce byte-identical output, or the
 * manifest hash is meaningless.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>).sort();
  return `{${entries
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(message));
  return toHex(signature);
}

/**
 * A blinded owner reference, so a human reviewer can count DISTINCT owners
 * without learning who they are.
 *
 * Salted with the campaign id and truncated. Not reversible in practice: the UUID
 * space is 2^122, and these owners are by definition ABSENT from auth.users, so
 * there is no candidate list to test against.
 */
export async function ownerGroupOf(campaignId: string, ownerUuid: string): Promise<string> {
  const full = await sha256Hex(`${campaignId}:${ownerUuid.toLowerCase()}`);
  return full.slice(0, 12);
}

export async function entryHashOf(
  campaignId: string,
  bucket: string,
  objectId: string,
  category: string,
): Promise<string> {
  return await sha256Hex(`${campaignId}|${bucket}|${objectId}|${category}`);
}

/** The manifest's hash covers everything except the hash field itself. */
export async function manifestHashOf(manifest: Record<string, unknown>): Promise<string> {
  const copy = { ...manifest };
  delete copy.manifestHash;
  return await sha256Hex(canonicalJson(copy));
}

/**
 * The exact string the approval signature covers.
 *
 * Every field that must not drift between gates C and D is in here: the campaign,
 * the manifest hash, the project, the total and the per-bucket distribution, and
 * the expiry. Anything left out could be changed after approval without
 * invalidating it.
 */
export function approvalPayload(a: {
  campaignId: string;
  manifestHash: string;
  projectRef: string;
  total: number;
  byBucket: Record<string, number>;
  expiresAt: number;
}): string {
  const buckets = Object.keys(a.byBucket).sort()
    .map((k) => `${k}=${a.byBucket[k]}`).join(",");
  return [
    APPROVAL_SCHEMA,
    a.campaignId,
    a.manifestHash,
    a.projectRef,
    String(a.total),
    buckets,
    String(a.expiresAt),
  ].join("|");
}

/**
 * Do the counters match this campaign's declared shape?
 *
 * Returns a closed error class, never a message. `volume_limit_exceeded` covers
 * both directions: more than expected AND fewer. Fewer is not "safe" — it means
 * the classification changed, and a changed classification invalidates the human
 * review that the manifest rests on.
 */
export function checkCampaignCaps(counts: {
  objects: number;
  byBucket: Record<string, number>;
}): { ok: true } | { ok: false; errorClass: string; detail: string } {
  if (counts.objects > CAMPAIGN_CAPS.absoluteMax) {
    return {
      ok: false,
      errorClass: "volume_limit_exceeded",
      detail: `above absolute cap: ${counts.objects} > ${CAMPAIGN_CAPS.absoluteMax}`,
    };
  }
  if (counts.objects !== CAMPAIGN_CAPS.totalExact) {
    return {
      ok: false,
      errorClass: "volume_limit_exceeded",
      detail: `expected exactly ${CAMPAIGN_CAPS.totalExact}, found ${counts.objects}`,
    };
  }
  for (const bucket of ORPHAN_BUCKETS) {
    const expected = CAMPAIGN_CAPS.byBucket[bucket];
    const actual = counts.byBucket[bucket] ?? 0;
    if (actual !== expected) {
      return {
        ok: false,
        errorClass: "volume_limit_exceeded",
        detail: `${bucket}: expected ${expected}, found ${actual}`,
      };
    }
  }
  return { ok: true };
}

export interface OrphanDeps {
  /** Discovery only. Never called from the destructive branch. */
  fetchObjects: (buckets: readonly string[]) => Promise<{
    rows: RawObject[] | null;
    error: { message: string } | null;
  }>;
  /** Existing accounts among the given candidates — never a full user list. */
  existingOwners: (uuids: readonly string[]) => Promise<{
    present: Set<string> | null;
    error: { message: string } | null;
  }>;
  countAuthUsers: () => Promise<number | null>;
  /** Re-resolve manifest entries by opaque id. Returns nothing for an absent id. */
  lookupObjects: (objectIds: readonly string[]) => Promise<{
    rows: RawObject[] | null;
    error: { message: string } | null;
  }>;
  removeObject: (bucket: string, path: string) => Promise<{ error: { message: string } | null }>;
  now: () => number;
}

/** One row of the campaign registry, as the gates read it back. */
export interface CampaignRow {
  status: string;
  manifestHash: string;
  approvalHash: string | null;
  volumeCap: number;
}

/**
 * The campaign registry — `orphan_purge_campaigns`, behind its three SECURITY
 * DEFINER RPCs (20260911000001) and one SELECT.
 *
 * Every gate WRITES to it, and every gate READS it back before going further:
 * discovery is proved by reading the row it just wrote; approval requires that
 * row, with the same manifest hash; execution requires it approved, with the
 * same approval hash — BEFORE the first deletion, not after.
 *
 * The first production run, 11 Sep 2026, reached gate C with this registry
 * empty. Discovery had assembled the manifest on the workstation and recorded
 * nothing, so approval was refused as `manifest_mismatch` for a campaign the
 * database had never heard of. Every gate had been tested alone, against a
 * double; none had been tested after the one before it. `handleOrphanRequest`
 * exists so the chain is tested as a chain.
 */
export interface OrphanRegistry {
  recordDiscovery: (r: {
    campaignId: string;
    projectRef: string;
    toolVersion: string;
    manifestHash: string;
    counts: { objects: number; byBucket: Record<string, number>; byCategory: Record<string, number> };
    volumeCap: number;
    authUsers: number;
  }) => Promise<{ error: { message: string } | null }>;
  readCampaign: (campaignId: string) => Promise<{
    row: CampaignRow | null;
    error: { message: string } | null;
  }>;
  recordApproval: (r: {
    campaignId: string;
    manifestHash: string;
    approvalHash: string;
  }) => Promise<{ error: { message: string } | null }>;
  recordExecution: (r: {
    campaignId: string;
    manifestHash: string;
    approvalHash: string;
    deleted: number;
    alreadyAbsent: number;
    failed: number;
    errorClass: string | null;
  }) => Promise<{ error: { message: string } | null }>;
}

/** What a gate answers: a status and a JSON body. `Deno.serve` only serialises it. */
export interface OrphanResponse {
  status: number;
  body: Record<string, unknown>;
}

export function refuse(
  status: number,
  errorClass: string,
  extra: Record<string, unknown> = {},
): OrphanResponse {
  return { status, body: { error: "refused", errorClass, ...extra } };
}

/** Storage error → one of the closed classes. The message is DISCARDED. */
export function classifyOrphanError(message: unknown): string {
  const text = typeof message === "string" ? message.toLowerCase() : "";
  if (!text) return "unknown";
  if (text.includes("permission") || text.includes("forbidden") ||
      text.includes("not authorized") || text.includes("unauthorized")) {
    return "permission_denied";
  }
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("network") || text.includes("unavailable") || text.includes("econn") ||
      text.includes("fetch failed") || text.includes("bucket not found") ||
      text.includes("503") || text.includes("502")) {
    return "storage_unavailable";
  }
  return "unknown";
}

export interface EntryVerdict {
  objectId: string;
  /** `eligible` is the only value the destructive branch acts on. */
  outcome: "eligible" | "already_absent" | "auth_owner_exists" |
           "ambiguous_ownership" | "unknown_path_shape" | "manifest_mismatch";
  bucket: string | null;
  /** Server-derived. Never returned to the caller, never logged. */
  path: string | null;
}

/**
 * Re-verify manifest entries. NARROWS ONLY.
 *
 * It resolves each opaque id, re-derives the path server-side, re-classifies the
 * shape, and re-checks that the owner is still absent. It never enumerates a
 * bucket, so it cannot introduce an object the manifest did not name — that is
 * the difference between re-verification and dynamic discovery.
 *
 * An id absent from storage yields `already_absent`, which is a SUCCESS, not a
 * fatal error: an object can vanish between approval and execution (a second
 * deleter, a manual removal), and the campaign must still account for it
 * rather than abort. Note that this is idempotence WITHIN one pass — a campaign
 * gets exactly one destructive pass, and the registry refuses a second one as
 * `campaign_closed` before anything is touched.
 */
export async function verifyManifestEntries(
  deps: OrphanDeps,
  entries: readonly { objectId: string; bucket: string; category: string }[],
): Promise<{ verdicts: EntryVerdict[]; errorClass: string | null }> {
  const ids = entries.map((e) => e.objectId);
  const { rows, error } = await deps.lookupObjects(ids);
  if (error) {
    return { verdicts: [], errorClass: classifyOrphanError(error.message) };
  }

  const byId = new Map<string, RawObject>();
  for (const row of rows ?? []) byId.set(row.id, row);

  // Candidate owners, for a single narrow auth lookup.
  const candidates: string[] = [];
  for (const row of rows ?? []) {
    if (pathShapeOf(row.name) !== "uuid") continue;
    const owner = firstSegment(row.name);
    if (owner) candidates.push(owner.toLowerCase());
  }

  let present = new Set<string>();
  if (candidates.length > 0) {
    const lookup = await deps.existingOwners([...new Set(candidates)]);
    if (lookup.error || lookup.present === null) {
      // Cannot prove absence → refuse everything. Fail-closed.
      return { verdicts: [], errorClass: classifyOrphanError(lookup.error?.message) };
    }
    present = lookup.present;
  }

  const verdicts: EntryVerdict[] = entries.map((entry) => {
    const row = byId.get(entry.objectId);
    if (!row) {
      return { objectId: entry.objectId, outcome: "already_absent", bucket: null, path: null };
    }
    // The manifest said which bucket. A mismatch means the manifest does not
    // describe reality, and nothing is deleted on a guess.
    if (row.bucket_id !== entry.bucket) {
      return { objectId: entry.objectId, outcome: "manifest_mismatch", bucket: null, path: null };
    }
    if (!ORPHAN_BUCKETS.includes(row.bucket_id as typeof ORPHAN_BUCKETS[number])) {
      return { objectId: entry.objectId, outcome: "manifest_mismatch", bucket: null, path: null };
    }

    const shape = pathShapeOf(row.name);
    if (shape === "root") {
      return { objectId: entry.objectId, outcome: "unknown_path_shape", bucket: null, path: null };
    }
    if (shape === "non_uuid_prefix") {
      return { objectId: entry.objectId, outcome: "ambiguous_ownership", bucket: null, path: null };
    }

    const owner = firstSegment(row.name) as string;
    if (present.has(owner.toLowerCase())) {
      // The account came back between discovery and now. This is the check that
      // makes a stale manifest harmless.
      return { objectId: entry.objectId, outcome: "auth_owner_exists", bucket: null, path: null };
    }
    if (entry.category !== "orphan_proven") {
      return { objectId: entry.objectId, outcome: "manifest_mismatch", bucket: null, path: null };
    }
    return {
      objectId: entry.objectId,
      outcome: "eligible",
      bucket: row.bucket_id,
      path: row.name,
    };
  });

  return { verdicts, errorClass: null };
}

/**
 * Delete the eligible entries, one at a time.
 *
 * One at a time on purpose: five objects do not need batching, and a per-object
 * call means a failure names exactly one object rather than voiding a batch. The
 * path is re-checked against its owner segment immediately before the call —
 * cheap, and it closes the gap a future refactor would open.
 */
export async function executeDeletions(
  deps: OrphanDeps,
  verdicts: readonly EntryVerdict[],
  deadline: number,
): Promise<{
  deleted: number;
  alreadyAbsent: number;
  failed: number;
  errorClass: string | null;
  perOutcome: Record<string, number>;
}> {
  const perOutcome: Record<string, number> = {};
  const bump = (k: string) => { perOutcome[k] = (perOutcome[k] ?? 0) + 1; };

  let deleted = 0;
  let alreadyAbsent = 0;
  let failed = 0;
  let errorClass: string | null = null;

  for (const verdict of verdicts) {
    if (verdict.outcome === "already_absent") {
      alreadyAbsent += 1;
      bump("already_absent");
      continue;
    }
    if (verdict.outcome !== "eligible") {
      failed += 1;
      bump(verdict.outcome);
      errorClass = errorClass ?? verdict.outcome;
      continue;
    }
    if (deps.now() >= deadline) {
      // Stop cleanly, and report the rest as `timeout`. The campaign is then
      // recorded and CLOSED — one pass, never replayed. What remains is a new
      // campaign, whose caps will not match and which therefore needs a reviewed
      // change: a partial catch-up is an event to understand, not to retry.
      failed += 1;
      bump("timeout");
      errorClass = errorClass ?? "timeout";
      continue;
    }

    const bucket = verdict.bucket as string;
    const path = verdict.path as string;
    const owner = firstSegment(path);
    if (!owner || !isStrictUuid(owner)) {
      failed += 1;
      bump("ambiguous_ownership");
      errorClass = errorClass ?? "ambiguous_ownership";
      continue;
    }

    const { error } = await deps.removeObject(bucket, path);
    if (error) {
      failed += 1;
      const cls = classifyOrphanError(error.message);
      bump(cls);
      errorClass = errorClass ?? cls;
      continue;
    }
    deleted += 1;
    bump("deleted");
    console.log(`[purge-orphan-media] bucket=${bucket} outcome=deleted`);
  }

  return { deleted, alreadyAbsent, failed, errorClass, perOutcome };
}

export type OrphanRequest =
  | { ok: true; mode: "discover"; campaignId: string }
  | {
      ok: true; mode: "approve"; campaignId: string; manifestHash: string;
      manifest: Record<string, unknown>;
      entries: { objectId: string; bucket: string; category: string }[];
    }
  | {
      ok: true; mode: "execute"; campaignId: string; manifestHash: string;
      manifest: Record<string, unknown>;
      entries: { objectId: string; bucket: string; category: string }[];
      approval: {
        schema: string; campaignId: string; manifestHash: string; projectRef: string;
        total: number; byBucket: Record<string, number>;
        issuedAt: number; expiresAt: number; signature: string;
      };
      confirmObjectCount: number;
      execute: true;
    }
  | { ok: false; error: string };

/**
 * Validate the request. No path, no bucket prefix, no filename is ever a
 * parameter — only opaque ids and hashes.
 *
 * `execute` demands `execute: true` explicitly. A mode string alone would make a
 * typo destructive; the redundant flag means the destructive path cannot be
 * reached by getting one field slightly wrong.
 */
export function parseOrphanRequest(body: unknown): OrphanRequest {
  // Locales, et non au niveau du module : le harnais qui charge ce fichier
  // sous vitest extrait les declarations par comptage d accolades, et un
  // quantificateur de regex lui ressemble a un bloc.
  const CAMPAIGN_ID = /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{6}$/;
  const HEX64 = /^[0-9a-f]{64}$/;
  if (body === null || typeof body !== "object") return { ok: false, error: "bad_request" };
  const raw = body as Record<string, unknown>;
  // hasOwnProperty, not `in`: `{"__proto__":{"mode":"execute"}}` satisfies `in`.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);

  if (!has("campaignId") || typeof raw.campaignId !== "string" ||
      !CAMPAIGN_ID.test(raw.campaignId)) {
    return { ok: false, error: "bad_request" };
  }
  const campaignId = raw.campaignId;

  const mode = has("mode") ? raw.mode : null;
  if (mode !== "discover" && mode !== "approve" && mode !== "execute") {
    return { ok: false, error: "bad_request" };
  }
  if (mode === "discover") return { ok: true, mode, campaignId };

  // Gates C and D receive the WHOLE manifest, and the server hashes it itself.
  // A claimed hash beside a list of ids bound the approval to nothing: the ids
  // could differ from the manifest the registry had seen while the hash still
  // matched. Hashing what was received binds the approval to this exact content.
  if (!has("manifest") || raw.manifest === null || typeof raw.manifest !== "object" ||
      Array.isArray(raw.manifest)) {
    return { ok: false, error: "bad_request" };
  }
  const manifest = raw.manifest as Record<string, unknown>;
  const mhas = (k: string) => Object.prototype.hasOwnProperty.call(manifest, k);
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.campaignId !== campaignId ||
      manifest.projectRef !== EXPECTED_PROJECT_REF) {
    return { ok: false, error: "bad_request" };
  }
  if (!mhas("manifestHash") || typeof manifest.manifestHash !== "string" ||
      !HEX64.test(manifest.manifestHash)) {
    return { ok: false, error: "bad_request" };
  }
  const manifestHash = manifest.manifestHash;
  if (!mhas("entries") || !Array.isArray(manifest.entries) || manifest.entries.length === 0 ||
      manifest.entries.length > CAMPAIGN_CAPS.absoluteMax) {
    return { ok: false, error: "bad_request" };
  }

  const entries: { objectId: string; bucket: string; category: string }[] = [];
  const seen = new Set<string>();
  for (const item of manifest.entries) {
    if (item === null || typeof item !== "object") return { ok: false, error: "bad_request" };
    const e = item as Record<string, unknown>;
    if (!isStrictUuid(e.objectId)) return { ok: false, error: "bad_request" };
    if (typeof e.bucket !== "string" ||
        !ORPHAN_BUCKETS.includes(e.bucket as typeof ORPHAN_BUCKETS[number])) {
      return { ok: false, error: "bad_request" };
    }
    if (e.category !== "orphan_proven") return { ok: false, error: "bad_request" };
    const id = (e.objectId as string).toLowerCase();
    if (seen.has(id)) return { ok: false, error: "bad_request" };  // no duplicate
    seen.add(id);
    entries.push({ objectId: e.objectId as string, bucket: e.bucket, category: e.category });
  }

  if (mode === "approve") {
    return { ok: true, mode, campaignId, manifestHash, manifest, entries };
  }

  // execute
  if (raw.execute !== true) return { ok: false, error: "bad_request" };
  if (typeof raw.confirmObjectCount !== "number" ||
      raw.confirmObjectCount !== entries.length) {
    return { ok: false, error: "bad_request" };
  }
  if (!has("approval") || raw.approval === null || typeof raw.approval !== "object") {
    return { ok: false, error: "bad_request" };
  }
  const a = raw.approval as Record<string, unknown>;
  if (a.schema !== APPROVAL_SCHEMA ||
      typeof a.campaignId !== "string" || typeof a.manifestHash !== "string" ||
      typeof a.projectRef !== "string" || typeof a.total !== "number" ||
      typeof a.issuedAt !== "number" || typeof a.expiresAt !== "number" ||
      typeof a.signature !== "string" ||
      !HEX64.test(a.signature) || a.byBucket === null || typeof a.byBucket !== "object") {
    return { ok: false, error: "bad_request" };
  }

  return {
    ok: true,
    mode,
    campaignId,
    manifestHash,
    manifest,
    entries,
    approval: {
      schema: a.schema as string,
      campaignId: a.campaignId,
      manifestHash: a.manifestHash,
      projectRef: a.projectRef,
      total: a.total,
      byBucket: a.byBucket as Record<string, number>,
      issuedAt: a.issuedAt,
      expiresAt: a.expiresAt,
      signature: a.signature,
    },
    confirmObjectCount: raw.confirmObjectCount,
    execute: true,
  };
}

/**
 * Every condition gate D requires, checked before a single deletion.
 *
 * Returns a closed error class on the first failure. The order is deliberate:
 * cheap structural checks first, so a wrong project or a stale approval never
 * reaches the signature verification and never touches storage.
 */
export async function authorizeExecution(
  approvalKey: string,
  request: {
    campaignId: string; manifestHash: string;
    entries: readonly { objectId: string }[];
    approval: {
      schema: string; campaignId: string; manifestHash: string; projectRef: string;
      total: number; byBucket: Record<string, number>;
      issuedAt: number; expiresAt: number; signature: string;
    };
    confirmObjectCount: number;
  },
  nowMs: number,
): Promise<{ ok: true } | { ok: false; errorClass: string; detail: string }> {
  const a = request.approval;

  if (a.campaignId !== request.campaignId) {
    return { ok: false, errorClass: "approval_mismatch", detail: "campaign differs" };
  }
  if (a.manifestHash !== request.manifestHash) {
    return { ok: false, errorClass: "manifest_mismatch", detail: "manifest hash differs" };
  }
  if (a.projectRef !== EXPECTED_PROJECT_REF) {
    return { ok: false, errorClass: "approval_mismatch", detail: "project differs" };
  }
  if (a.total !== request.entries.length) {
    return { ok: false, errorClass: "manifest_mismatch", detail: "entry count differs" };
  }
  if (request.confirmObjectCount !== request.entries.length) {
    return { ok: false, errorClass: "approval_mismatch", detail: "confirmation count differs" };
  }
  if (!Number.isFinite(a.expiresAt) || nowMs >= a.expiresAt) {
    return { ok: false, errorClass: "approval_mismatch", detail: "approval expired" };
  }

  const caps = checkCampaignCaps({ objects: a.total, byBucket: a.byBucket });
  if (!caps.ok) return { ok: false, errorClass: caps.errorClass, detail: caps.detail };

  const expected = await hmacSha256Hex(
    approvalKey,
    approvalPayload({
      campaignId: a.campaignId,
      manifestHash: a.manifestHash,
      projectRef: a.projectRef,
      total: a.total,
      byBucket: a.byBucket,
      expiresAt: a.expiresAt,
    }),
  );
  if (!constantTimeEqual(a.signature, expected)) {
    return { ok: false, errorClass: "approval_mismatch", detail: "signature invalid" };
  }
  return { ok: true };
}

export interface AuthDeps {
  configuredSecret: string;
  checkRateLimit: (
    key: string, max: number, windowSeconds: number,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Fail-closed on every branch, and the rate limit runs BEFORE the comparison: a
 * limiter placed after the credential check cannot bound an attempt to GUESS the
 * credential, because a failed guess never reaches it.
 */
export async function authorizeOrphanRequest(
  deps: AuthDeps,
  providedSecret: string | null,
  clientAddress: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!deps.configuredSecret || deps.configuredSecret.length < MIN_SECRET_LENGTH) {
    console.error("[purge-orphan-media] secret absent or too short");
    return { ok: false, ...NOT_CONFIGURED };
  }
  const key = `purge-orphan-media:${clientAddress || "unknown"}`;
  const { data, error } = await deps.checkRateLimit(
    key, RATE_LIMIT_MAX_PER_HOUR, RATE_LIMIT_WINDOW_SECONDS,
  );
  if (error) return { ok: false, ...RATE_LIMIT_UNAVAILABLE };
  if (data !== true) return { ok: false, ...RATE_LIMITED };

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

/** Une ligne de RPC vers la forme interne. Le chemin ne quitte jamais ce module. */
function rowOf(r: Record<string, unknown>): RawObject {
  return {
    id: String(r.object_id),
    bucket_id: String(r.bucket),
    name: String(r.path),
    created_at: String(r.created_at),
    size_bytes: Number(r.size_bytes ?? 0),
  };
}

function json(body: Record<string, unknown>, status: number): Response {
  // No Access-Control-Allow-Origin, on purpose: the only caller is a CLI.
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// The three gates, as functions — so the CHAIN is testable, not only each link.
//
// Order matters to the static validator: the destructive function is the last
// of the three, and everything it contains is scoped by name.
// ---------------------------------------------------------------------------

/**
 * GATE A — discovery. Read-only on storage; ONE registry write, then read back.
 *
 * The manifest is assembled HERE, on the server, and hashed here. The registry
 * can only refuse "a hash it never saw at discovery" if it is the server that
 * saw it: a manifest assembled on the workstation, as the first version did,
 * gave the registry nothing to see, and gate C refused every campaign.
 */
export async function gateDiscover(
  parsed: { campaignId: string },
  deps: OrphanDeps,
  registry: OrphanRegistry,
): Promise<OrphanResponse> {
  const { rows, error } = await deps.fetchObjects(ORPHAN_BUCKETS);
  if (error || rows === null) {
    return refuse(503, classifyOrphanError(error?.message));
  }

  const candidates = [...new Set(
    rows.filter((r) => pathShapeOf(r.name) === "uuid")
      .map((r) => (firstSegment(r.name) as string).toLowerCase()),
  )];
  const owners = candidates.length
    ? await deps.existingOwners(candidates)
    : { present: new Set<string>(), error: null };
  if (owners.error || owners.present === null) {
    // Cannot prove absence → classify nothing. Fail-closed.
    return refuse(503, classifyOrphanError(owners.error?.message));
  }

  const classified = classifyObjects(rows, owners.present);
  const counts = summarizeClassification(classified);

  // The registry requires the account total, and a discovery the registry
  // cannot hold is not a discovery.
  const authUsers = await deps.countAuthUsers();
  if (authUsers === null) {
    console.error("[purge-orphan-media] discover refused: account total unavailable");
    return refuse(503, "registry_unavailable", { allCounts: counts });
  }

  const orphans = classified.filter((o) => o.category === "orphan_proven");
  const orphanCounts = summarizeClassification(orphans);
  const caps = checkCampaignCaps(orphanCounts);

  console.log(
    `[purge-orphan-media] discover: objects=${counts.objects} ` +
    `orphan_proven=${counts.byCategory.orphan_proven} ` +
    `auth_owner_exists=${counts.byCategory.auth_owner_exists} ` +
    `ambiguous=${counts.byCategory.ambiguous_ownership} ` +
    `unknown_shape=${counts.byCategory.unknown_path_shape} ` +
    `caps=${caps.ok ? "ok" : "refused"}`,
  );

  if (!caps.ok) {
    // No manifest for a campaign that can never be approved. One would only be
    // a temptation to adjust the cap to it, which the runbook forbids.
    return refuse(409, caps.errorClass, { detail: caps.detail, allCounts: counts, orphanCounts });
  }

  const entries = [];
  for (const o of orphans) {
    entries.push({
      objectId: o.objectId,
      bucket: o.bucket,
      sizeBytes: o.sizeBytes,
      createdAt: o.createdAt,
      ownerGroup: o.ownerUuid
        ? await ownerGroupOf(parsed.campaignId, o.ownerUuid)
        : null,
      category: o.category,
      reason: o.reason,
      entryHash: await entryHashOf(parsed.campaignId, o.bucket, o.objectId, o.category),
    });
  }
  entries.sort((x, y) => (x.objectId < y.objectId ? -1 : x.objectId > y.objectId ? 1 : 0));

  const manifest: Record<string, unknown> = {
    schema: MANIFEST_SCHEMA,
    campaignId: parsed.campaignId,
    generatedAt: new Date(deps.now()).toISOString(),
    toolVersion: TOOL_VERSION,
    projectRef: EXPECTED_PROJECT_REF,
    authUsersAtDiscovery: authUsers,
    volumeCap: CAMPAIGN_CAPS.absoluteMax,
    totals: orphanCounts,
    entries,
  };
  const manifestHash = await manifestHashOf(manifest);
  manifest.manifestHash = manifestHash;

  const recorded = await registry.recordDiscovery({
    campaignId: parsed.campaignId,
    projectRef: EXPECTED_PROJECT_REF,
    toolVersion: TOOL_VERSION,
    manifestHash,
    counts: orphanCounts,
    volumeCap: CAMPAIGN_CAPS.absoluteMax,
    authUsers,
  });
  if (recorded.error) {
    // Nothing is returned that could be approved later: an unrecorded manifest
    // is the exact artefact that stranded the first run.
    console.error("[purge-orphan-media] discovery not recorded — refusing, no manifest issued");
    return refuse(503, "registry_unavailable", { allCounts: counts, orphanCounts });
  }

  // Read it back. The absence of an error is not the presence of a row.
  const back = await registry.readCampaign(parsed.campaignId);
  if (back.error || back.row === null) {
    console.error("[purge-orphan-media] discovery recorded but unreadable — refusing");
    return refuse(503, "registry_unavailable", { allCounts: counts, orphanCounts });
  }
  if (back.row.status !== "discovered" || back.row.manifestHash !== manifestHash) {
    // A re-used campaign id that was already approved keeps its status through
    // the upsert. That is not a state to hand a manifest to: use a new id.
    console.error(
      `[purge-orphan-media] registry disagrees after discovery: status=${back.row.status}`,
    );
    return refuse(409, "registry_mismatch", { allCounts: counts, orphanCounts });
  }

  return {
    status: 200,
    body: {
      ok: true,
      mode: "discover",
      manifest,
      registry: {
        status: back.row.status,
        manifestHash: back.row.manifestHash,
        volumeCap: back.row.volumeCap,
      },
      allCounts: counts,
      orphanCounts,
    },
  };
}

/**
 * GATE C — approval. Read-only on storage. The server signs; the operator cannot.
 */
export async function gateApprove(
  parsed: Extract<OrphanRequest, { mode: "approve" }>,
  deps: OrphanDeps,
  registry: OrphanRegistry,
  approvalKey: string,
): Promise<OrphanResponse> {
  // Hashed HERE, over what was received. The claimed hash is only compared.
  const recomputed = await manifestHashOf(parsed.manifest);
  if (recomputed !== parsed.manifestHash) {
    console.error("[purge-orphan-media] approve refused: manifest hash does not match its content");
    return refuse(409, "manifest_mismatch");
  }

  // The registry must already hold this campaign, with this hash. Discovery is
  // the only writer of that row, so this is the proof that gate A ran — on the
  // server, for this manifest.
  const known = await registry.readCampaign(parsed.campaignId);
  if (known.error) return refuse(503, "registry_unavailable");
  if (known.row === null) {
    console.error("[purge-orphan-media] approve refused: campaign unknown to the registry");
    return refuse(409, "campaign_unknown");
  }
  if (known.row.status === "executed") return refuse(409, "campaign_closed");
  if (known.row.manifestHash !== recomputed) {
    console.error("[purge-orphan-media] approve refused: manifest differs from the one discovered");
    return refuse(409, "manifest_mismatch");
  }

  const byBucket: Record<string, number> = {};
  for (const bucket of ORPHAN_BUCKETS) byBucket[bucket] = 0;
  for (const entry of parsed.entries) byBucket[entry.bucket] += 1;

  const caps = checkCampaignCaps({ objects: parsed.entries.length, byBucket });
  if (!caps.ok) {
    console.error(`[purge-orphan-media] approve refused: ${caps.errorClass}`);
    return refuse(409, caps.errorClass, { detail: caps.detail });
  }

  const { verdicts, errorClass } = await verifyManifestEntries(deps, parsed.entries);
  if (errorClass) {
    return refuse(503, errorClass);
  }
  const bad = verdicts.filter((v) => v.outcome !== "eligible");
  if (bad.length > 0) {
    const counts: Record<string, number> = {};
    for (const v of bad) counts[v.outcome] = (counts[v.outcome] ?? 0) + 1;
    console.error(`[purge-orphan-media] approve refused: ${JSON.stringify(counts)}`);
    return refuse(409, bad[0].outcome, { outcomes: counts });
  }

  // UN SEUL appel a now(). Deux appels separes pouvaient differer d une
  // milliseconde entre issuedAt et expiresAt, et la porte D n aurait alors
  // pas pu recomposer la meme empreinte d approbation.
  const issuedAt = deps.now();
  const expiresAt = issuedAt + APPROVAL_TTL_MS;
  const payload = approvalPayload({
    campaignId: parsed.campaignId,
    manifestHash: recomputed,
    projectRef: EXPECTED_PROJECT_REF,
    total: parsed.entries.length,
    byBucket,
    expiresAt,
  });
  const signature = await hmacSha256Hex(approvalKey, payload);
  const approval = {
    schema: APPROVAL_SCHEMA,
    campaignId: parsed.campaignId,
    manifestHash: recomputed,
    projectRef: EXPECTED_PROJECT_REF,
    total: parsed.entries.length,
    byBucket,
    issuedAt,
    expiresAt,
    signature,
  };
  const approvalHash = await sha256Hex(canonicalJson(approval));

  const recorded = await registry.recordApproval({
    campaignId: parsed.campaignId,
    manifestHash: recomputed,
    approvalHash,
  });
  if (recorded.error) {
    // Everything the RPC checks was checked above, so this is infrastructure or
    // a race. Either way the signature is not handed out.
    console.error("[purge-orphan-media] approval not recorded — refusing");
    return refuse(503, "registry_unavailable");
  }
  const back = await registry.readCampaign(parsed.campaignId);
  if (back.error || back.row === null) return refuse(503, "registry_unavailable");
  if (back.row.status !== "approved" || back.row.approvalHash !== approvalHash) {
    console.error("[purge-orphan-media] registry disagrees after approval — refusing");
    return refuse(409, "registry_mismatch");
  }

  console.log(`[purge-orphan-media] approve: total=${approval.total} signed and recorded`);
  return {
    status: 200,
    body: {
      ok: true,
      mode: "approve",
      approval,
      approvalHash,
      registry: { status: back.row.status, manifestHash: back.row.manifestHash },
    },
  };
}

/**
 * GATE D — execution. Destructive. Every condition, or nothing.
 */
export async function gateExecute(
  parsed: Extract<OrphanRequest, { mode: "execute" }>,
  deps: OrphanDeps,
  registry: OrphanRegistry,
  approvalKey: string,
): Promise<OrphanResponse> {
  const gate = await authorizeExecution(approvalKey, parsed, deps.now());
  if (!gate.ok) {
    console.error(`[purge-orphan-media] execute refused: ${gate.errorClass} (${gate.detail})`);
    return refuse(409, gate.errorClass, { detail: gate.detail });
  }

  const recomputed = await manifestHashOf(parsed.manifest);
  if (recomputed !== parsed.manifestHash) return refuse(409, "manifest_mismatch");

  // L objet RECU, hache tel quel. Le recomposer en devinant issuedAt depuis
  // expiresAt produisait une empreinte differente des que les deux appels a
  // now() de la porte C divergeaient d une milliseconde.
  const approvalHash = await sha256Hex(canonicalJson(parsed.approval));

  // The registry, BEFORE the first deletion. It used to be consulted only when
  // recording the result — after the objects were gone.
  const known = await registry.readCampaign(parsed.campaignId);
  if (known.error) return refuse(503, "registry_unavailable");
  if (known.row === null) return refuse(409, "campaign_unknown");
  if (known.row.status === "executed") {
    // One pass per campaign. A partial result closes it; what remains needs a
    // NEW campaign — and, because caps are never adjusted, a reviewed change.
    console.error("[purge-orphan-media] execute refused: campaign already executed");
    return refuse(409, "campaign_closed");
  }
  if (known.row.status !== "approved") return refuse(409, "approval_mismatch");
  if (known.row.manifestHash !== recomputed) return refuse(409, "manifest_mismatch");
  if (known.row.approvalHash !== approvalHash) return refuse(409, "approval_mismatch");

  const { verdicts, errorClass: verifyError } = await verifyManifestEntries(deps, parsed.entries);
  if (verifyError) {
    return refuse(503, verifyError);
  }

  // Anything that is neither eligible nor already absent stops the campaign
  // BEFORE the first deletion. A partial campaign on a contested manifest is
  // worse than no campaign.
  const blocking = verdicts.filter(
    (v) => v.outcome !== "eligible" && v.outcome !== "already_absent",
  );
  if (blocking.length > 0) {
    const counts: Record<string, number> = {};
    for (const v of blocking) counts[v.outcome] = (counts[v.outcome] ?? 0) + 1;
    console.error(`[purge-orphan-media] execute refused: ${JSON.stringify(counts)}`);
    return refuse(409, blocking[0].outcome, { outcomes: counts });
  }

  const result = await executeDeletions(deps, verdicts, deps.now() + EXECUTE_BUDGET_MS);

  const recorded = await registry.recordExecution({
    campaignId: parsed.campaignId,
    manifestHash: recomputed,
    approvalHash,
    deleted: result.deleted,
    alreadyAbsent: result.alreadyAbsent,
    failed: result.failed,
    errorClass: result.errorClass,
  });
  if (recorded.error) console.error("[purge-orphan-media] execution not recorded");

  console.log(
    `[purge-orphan-media] execute: deleted=${result.deleted} ` +
    `already_absent=${result.alreadyAbsent} failed=${result.failed}`,
  );

  return {
    status: 200,
    body: {
      ok: true,
      mode: "execute",
      deleted: result.deleted,
      alreadyAbsent: result.alreadyAbsent,
      failed: result.failed,
      perOutcome: result.perOutcome,
      errorClass: result.errorClass,
      recorded: !recorded.error,
    },
  };
}

/** The dispatcher. `Deno.serve` authenticates, parses, wires, and calls this. */
export async function handleOrphanRequest(
  parsed: Exclude<OrphanRequest, { ok: false }>,
  deps: OrphanDeps,
  registry: OrphanRegistry,
  approvalKey: string,
): Promise<OrphanResponse> {
  if (parsed.mode === "discover") return await gateDiscover(parsed, deps, registry);
  if (parsed.mode === "approve") return await gateApprove(parsed, deps, registry, approvalKey);
  return await gateExecute(parsed, deps, registry, approvalKey);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) return json(NOT_CONFIGURED, 500);

  const approvalKey = Deno.env.get(ORPHAN_APPROVAL_KEY_ENV) || "";
  if (approvalKey.length < MIN_SECRET_LENGTH) {
    console.error("[purge-orphan-media] approval key absent or too short");
    return json(NOT_CONFIGURED, 500);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const decision = await authorizeOrphanRequest(
    {
      configuredSecret: Deno.env.get(ORPHAN_SECRET_ENV) || "",
      checkRateLimit: (key, max, windowSeconds) =>
        admin.rpc("check_edge_rate_limit", {
          p_key: key, p_max: max, p_window_seconds: windowSeconds,
        }),
    },
    req.headers.get(ORPHAN_SECRET_HEADER),
    clientAddressOf(req),
  );
  if (!decision.ok) return json({ error: decision.error }, decision.status);

  let body: unknown = {};
  try {
    const text = await req.text();
    // A manifest of five entries is about two kilobytes. Anything larger is not
    // one, and is not parsed.
    if (text.length > MAX_BODY_BYTES) return json(BAD_REQUEST, 413);
    body = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    return json(BAD_REQUEST, 400);
  }

  const parsed = parseOrphanRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const deps: OrphanDeps = {
    // config.toml:13 n expose que "public" et "graphql_public". Ni
    // storage.objects ni auth.users ne sont donc atteignables par PostgREST :
    // ces lectures passent par des RPC SECURITY DEFINER (20260911000001), ce
    // qui les borne aussi — le balayage ne prend aucun parametre de bucket, et
    // auth_users_present ne rend que ce qu on lui demande.
    fetchObjects: async () => {
      const { data, error } = await admin.rpc("orphan_scan_objects");
      if (error) return { rows: null, error };
      return { rows: (data ?? []).map(rowOf), error: null };
    },
    existingOwners: async (uuids) => {
      const { data, error } = await admin.rpc("auth_users_present", {
        p_ids: uuids as string[],
      });
      if (error) return { present: null, error };
      return {
        present: new Set((data ?? []).map((r: Record<string, unknown>) =>
          String(r.user_id).toLowerCase())),
        error: null,
      };
    },
    countAuthUsers: async () => {
      const { data, error } = await admin.rpc("auth_users_total");
      return error ? null : (typeof data === "number" ? data : null);
    },
    lookupObjects: async (objectIds) => {
      const { data, error } = await admin.rpc("orphan_lookup_objects", {
        p_ids: objectIds as string[],
      });
      if (error) return { rows: null, error };
      return { rows: (data ?? []).map(rowOf), error: null };
    },
    removeObject: async (bucket, path) => {
      const { error } = await admin.storage.from(bucket).remove([path]);
      return { error };
    },
    now: () => Date.now(),
  };

  const registry: OrphanRegistry = {
    recordDiscovery: async (r) => {
      const { error } = await admin.rpc("record_orphan_discovery", {
        p_campaign_id: r.campaignId,
        p_project_ref: r.projectRef,
        p_tool_version: r.toolVersion,
        p_manifest_hash: r.manifestHash,
        p_counts: r.counts,
        p_volume_cap: r.volumeCap,
        p_auth_users: r.authUsers,
      });
      return { error };
    },
    // The one direct table read. `service_role` holds SELECT on the registry for
    // exactly this, and the registry holds counters and hashes — never a path.
    readCampaign: async (campaignId) => {
      const { data, error } = await admin
        .from("orphan_purge_campaigns")
        .select("status, manifest_hash, approval_hash, volume_cap")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (error) return { row: null, error };
      if (!data) return { row: null, error: null };
      return {
        row: {
          status: String(data.status),
          manifestHash: String(data.manifest_hash),
          approvalHash: data.approval_hash === null ? null : String(data.approval_hash),
          volumeCap: Number(data.volume_cap),
        },
        error: null,
      };
    },
    recordApproval: async (r) => {
      const { error } = await admin.rpc("record_orphan_approval", {
        p_campaign_id: r.campaignId,
        p_manifest_hash: r.manifestHash,
        p_approval_hash: r.approvalHash,
      });
      return { error };
    },
    recordExecution: async (r) => {
      const { error } = await admin.rpc("record_orphan_execution", {
        p_campaign_id: r.campaignId,
        p_manifest_hash: r.manifestHash,
        p_approval_hash: r.approvalHash,
        p_deleted: r.deleted,
        p_already_absent: r.alreadyAbsent,
        p_failed: r.failed,
        p_error_class: r.errorClass,
      });
      return { error };
    },
  };

  const answer = await handleOrphanRequest(parsed, deps, registry, approvalKey);
  return json(answer.body, answer.status);
});
