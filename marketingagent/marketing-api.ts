/**
 * The marketing agent's entire link to Supabase — JUNO-04.
 *
 * WHAT CHANGED, AND WHY IT IS NOT JUST A REFACTOR
 * ----------------------------------------------
 * Until 8 Sep 2026 this tool held SUPABASE_SERVICE_ROLE_KEY in a plaintext
 * .env on a workstation: a JWT valid until 2036 that bypasses RLS on every
 * table — `profiles` with all its PII and birth data, `messages`, and the
 * `auth.users` admin API. It used that key for four things:
 *
 *   1. upload a marketing image;
 *   2. insert one row into `marketing_posts`;
 *   3. list the queue;
 *   4. read back the status of posts whose ids it already has.
 *
 * It now holds MARKETING_AGENT_TOKEN instead, which can do those four things
 * and nothing else. The service-role key did not get rotated into a new file —
 * it left this project entirely, and lives in Supabase's secret store, where
 * the `marketing-agent` edge function reads it.
 *
 * That distinction is the whole finding. Rotating the key would have replaced
 * one omnipotent credential with another omnipotent credential in the same
 * plaintext file. Reducing the privilege is what actually closes it.
 *
 * FAILURE MODE
 * ------------
 * Every function here throws with a short, actionable message rather than
 * returning null. The previous code warned and returned null on a missing key,
 * which meant a misconfigured agent silently published posts with no image.
 */

import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import { fetchWithTimeout } from "./lib.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export interface CloudPostRow {
  id: string;
  text: string;
  topic: string | null;
  status: "scheduled" | "posted" | "failed";
  scheduled_for: string;
  posted_at: string | null;
  blotato_post_id: string | null;
  error: string | null;
  image_url: string | null;
  created_at: string;
}

export interface PostStatusRow {
  id: string;
  status: string;
  posted_at: string | null;
  blotato_post_id: string | null;
  error: string | null;
}

function baseUrl(): string {
  const url =
    process.env.SUPABASE_URL ||
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Set SUPABASE_URL in marketingagent/.env (the project URL, not a key).",
    );
  }
  return url.replace(/\/$/, "");
}

function agentToken(): string {
  const token = process.env.MARKETING_AGENT_TOKEN;
  if (!token) {
    throw new Error(
      "Set MARKETING_AGENT_TOKEN in marketingagent/.env.\n" +
        "It replaces SUPABASE_SERVICE_ROLE_KEY, which this tool no longer needs and\n" +
        "must no longer hold — see docs/runbooks/service-role-least-privilege-2026-09.md.",
    );
  }
  return token;
}

function endpoint(path = ""): string {
  return `${baseUrl()}/functions/v1/marketing-agent${path}`;
}

/**
 * The token is the only credential this tool carries, and it never appears in
 * an error message: a failed request prints the status and the server's short
 * error identifier, never the Authorization header.
 */
async function callOperation<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetchWithTimeout(endpoint(), {
    method: "POST",
    timeoutMs: 30_000,
    headers: {
      Authorization: `Bearer ${agentToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    // Falls through to the status-based message below.
  }

  if (!response.ok) {
    const detail = [parsed.error, parsed.detail].filter(Boolean).join(": ");
    throw new Error(
      `marketing-agent ${String(body.op)} failed (${response.status})` +
        (detail ? `: ${detail}` : ""),
    );
  }
  return parsed as T;
}

/**
 * Upload a local image and return its public URL.
 *
 * The remote path is chosen by the server, from a UUID. This tool cannot name
 * an object, which is what stops an uploader from becoming a way to overwrite
 * or probe somebody else's file.
 */
export async function uploadMarketingImage(localPath: string): Promise<string> {
  if (!existsSync(localPath)) {
    throw new Error(`Image file not found: ${localPath}`);
  }
  const ext = extname(localPath).toLowerCase();
  const mime = MIME_TYPES[ext];
  if (!mime) {
    throw new Error(
      `Unsupported image type "${ext}". Allowed: ${Object.keys(MIME_TYPES).join(", ")}`,
    );
  }

  const bytes = readFileSync(localPath);
  const response = await fetchWithTimeout(endpoint("/upload"), {
    method: "POST",
    timeoutMs: 60_000,
    headers: {
      Authorization: `Bearer ${agentToken()}`,
      "Content-Type": mime,
    },
    body: new Uint8Array(bytes),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `marketing-agent upload failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const { publicUrl } = (await response.json()) as { publicUrl: string };
  return publicUrl;
}

/** Insert one scheduled post. Returns its server id. */
export async function scheduleMarketingPost(input: {
  text: string;
  topic?: string | null;
  aiScore?: number | null;
  platforms: string[];
  scheduledFor: string;
  imageUrl?: string | null;
}): Promise<string> {
  const { id } = await callOperation<{ id: string }>({
    op: "schedule_post",
    text: input.text,
    topic: input.topic ?? null,
    aiScore: input.aiScore ?? null,
    platforms: input.platforms,
    scheduledFor: input.scheduledFor,
    imageUrl: input.imageUrl ?? null,
  });
  return id;
}

/** Read the queue, newest scheduled first. */
export async function listMarketingQueue(opts: {
  limit?: number;
  status?: CloudPostRow["status"];
} = {}): Promise<CloudPostRow[]> {
  const { rows } = await callOperation<{ rows: CloudPostRow[] }>({
    op: "list_queue",
    limit: opts.limit ?? 30,
    status: opts.status ?? null,
  });
  return rows ?? [];
}

/** Read back the status of posts this tool already knows the ids of. */
export async function fetchMarketingStatuses(
  ids: string[],
): Promise<PostStatusRow[]> {
  if (ids.length === 0) return [];
  const { rows } = await callOperation<{ rows: PostStatusRow[] }>({
    op: "sync_status",
    ids,
  });
  return rows ?? [];
}
