/**
 * Cloud scheduling helpers — push posts into the Supabase `marketing_posts`
 * table so the existing pg_cron + `publish-scheduled-posts` edge function picks
 * them up every 5 minutes. The PC can be off; publication still happens.
 *
 * This module ONLY talks to Supabase. It does not call Blotato, does not run
 * the dashboard scheduler, and does not touch `schedule.json`. The local
 * publishing path stays untouched as a fallback.
 *
 * Safety-rails:
 *   - We mark each cloud-scheduled local post with `scheduledServerId` so the
 *     dashboard can disable its local "Publier maintenant"/"Planifier" buttons
 *     and avoid double-publication.
 *   - `scheduleInCloud` refuses to re-queue a post that already has
 *     `scheduledServerId` set, unless `force` is passed.
 *
 * JUNO-04 (8 Sep 2026): this module used to build a Supabase client with
 * SUPABASE_SERVICE_ROLE_KEY — a credential that bypasses RLS on every table,
 * including `profiles` and `messages`, for the sake of one INSERT and two
 * SELECTs on `marketing_posts`. It now goes through ./marketing-api.js, which
 * calls an edge function that exposes exactly the four operations this file
 * needs. The behaviour of every function below is unchanged.
 */

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { atomicWriteJson } from "./lib.js";
import { POSTS_FILE } from "./constants.js";
import {
  fetchMarketingStatuses,
  listMarketingQueue,
  scheduleMarketingPost,
  uploadMarketingImage,
} from "./marketing-api.js";

export interface CloudPost {
  id: string;                    // Supabase UUID
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

interface LocalPost {
  id: number;
  text: string;
  topic: string;
  aiScore: number;
  status: string;
  imagePath?: string;
  scheduledFor?: string;
  scheduledServerId?: string;
  blotato?: {
    postId?: string;
    platforms: string[];
    postedAt?: string;
    error?: string;
  };
}

function loadLocalPosts(): LocalPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function saveLocalPosts(posts: LocalPost[]): void {
  atomicWriteJson(POSTS_FILE, posts);
}

/**
 * True iff this local post has already been pushed to Supabase. Pure function
 * so it's testable without touching the network.
 */
export function isCloudScheduled(post: Pick<LocalPost, "scheduledServerId">): boolean {
  return Boolean(post.scheduledServerId);
}

/**
 * Upload the post's image and return its public URL.
 *
 * Two changes from the service-role version, both deliberate:
 *
 *   * the object lands in the `marketing-images` bucket rather than in
 *     `avatars`, which holds users' profile photos and had no business
 *     carrying promotional material;
 *   * the remote filename is chosen by the SERVER, from a UUID. It used to be
 *     `marketing/${Date.now()}-${basename}` with `upsert: true`, so two posts
 *     generated in the same millisecond overwrote each other, and a crafted
 *     local filename could name any object in the bucket.
 *
 * Still returns null rather than throwing when there is no image to upload, so
 * a post without one schedules exactly as before. A REAL failure now throws:
 * the previous version logged and returned null, which published the post with
 * no image and no indication anything had gone wrong.
 */
async function uploadImageIfPresent(
  imagePath: string | undefined,
): Promise<string | null> {
  if (!imagePath || !existsSync(imagePath)) return null;
  return await uploadMarketingImage(imagePath);
}

/**
 * Push a local post into the Supabase queue. Idempotent within a session: if
 * the local post already has `scheduledServerId`, this throws unless
 * `opts.force` is true (used when re-scheduling a previously-cloud-scheduled
 * post to a different time).
 */
export async function scheduleInCloud(
  postId: number,
  scheduledFor: Date,
  opts: { force?: boolean } = {},
): Promise<{ cloudId: string; scheduledFor: string }> {
  const posts = loadLocalPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error(`Post #${postId} not found locally. Run: npm run list`);
  if (post.status !== "approved") {
    throw new Error(`Post #${postId} must be approved before cloud scheduling.`);
  }
  if (!post.imagePath || !existsSync(post.imagePath)) {
    throw new Error(`Post #${postId} needs a generated image before cloud scheduling.`);
  }

  if (post.scheduledServerId && !opts.force) {
    throw new Error(
      `Post #${postId} is already cloud-scheduled (server id ${post.scheduledServerId}). ` +
      `Pass --force to re-queue, or run cloud-cancel first.`,
    );
  }

  const imageUrl = await uploadImageIfPresent(post.imagePath);

  const cloudId = await scheduleMarketingPost({
    text: post.text,
    topic: post.topic,
    aiScore: post.aiScore,
    platforms: ["facebook", "instagram"],
    scheduledFor: scheduledFor.toISOString(),
    imageUrl,
  });

  post.status = "scheduled";
  post.scheduledFor = scheduledFor.toISOString();
  post.scheduledServerId = cloudId;
  saveLocalPosts(posts);

  return { cloudId, scheduledFor: scheduledFor.toISOString() };
}

/**
 * SELECT marketing_posts ORDER BY scheduled_for. Returns up to `limit` rows.
 * Used by the `cloud-list` CLI command for an at-a-glance view of the queue.
 */
export async function listCloudQueue(opts: { limit?: number; status?: CloudPost["status"] } = {}): Promise<CloudPost[]> {
  // Columns, ordering and the status allowlist now live in
  // `marketing_agent_list_queue`, so no parameter from here can name a column
  // or an operator. The limit is clamped to 100 server-side.
  return (await listMarketingQueue({
    limit: opts.limit ?? 30,
    status: opts.status,
  })) as CloudPost[];
}

/**
 * For each local post that has `scheduledServerId`, fetch the matching Supabase
 * row and update the local status (`posted`, `failed`) so the dashboard reflects
 * the truth. Posts without `scheduledServerId` are untouched.
 *
 * Returns a small report so the CLI can print "synced N, posted N, failed N".
 */
export async function syncCloudBackToLocal(): Promise<{ checked: number; updated: number; postedNow: number; failedNow: number }> {
  const posts = loadLocalPosts();
  const cloudIds = posts
    .filter((p) => p.scheduledServerId)
    .map((p) => p.scheduledServerId!) as string[];
  if (cloudIds.length === 0) return { checked: 0, updated: 0, postedNow: 0, failedNow: 0 };

  const data = await fetchMarketingStatuses(cloudIds);

  const cloudById = new Map<string, { status: string; posted_at: string | null; blotato_post_id: string | null; error: string | null }>();
  for (const row of data) cloudById.set(String(row.id), row);

  let updated = 0;
  let postedNow = 0;
  let failedNow = 0;

  for (const post of posts) {
    if (!post.scheduledServerId) continue;
    const cloud = cloudById.get(post.scheduledServerId);
    if (!cloud) continue;
    const wasPosted = post.status === "posted";
    const wasFailed = post.status === "failed";
    if (cloud.status === "posted" && !wasPosted) {
      post.status = "posted";
      post.blotato = {
        postId: cloud.blotato_post_id ?? undefined,
        platforms: ["facebook", "instagram"],
        postedAt: cloud.posted_at ?? new Date().toISOString(),
        ...(cloud.error ? { error: cloud.error } : {}),
      };
      postedNow++;
      updated++;
    } else if (cloud.status === "failed" && !wasFailed) {
      post.status = "failed";
      post.blotato = {
        platforms: ["facebook", "instagram"],
        error: cloud.error ?? "unknown",
      };
      failedNow++;
      updated++;
    }
  }

  if (updated > 0) saveLocalPosts(posts);
  return { checked: cloudIds.length, updated, postedNow, failedNow };
}
