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
 */

import "dotenv/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { atomicWriteJson, fetchWithTimeout } from "./lib.js";
import { POSTS_FILE } from "./constants.js";

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

function getSupabase(): SupabaseClient {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in marketingagent/.env to use the cloud scheduler.",
    );
  }
  return createClient(supabaseUrl, supabaseKey, {
    global: { fetch: fetchWithTimeout as unknown as typeof fetch },
  });
}

/**
 * True iff this local post has already been pushed to Supabase. Pure function
 * so it's testable without touching the network.
 */
export function isCloudScheduled(post: Pick<LocalPost, "scheduledServerId">): boolean {
  return Boolean(post.scheduledServerId);
}

async function uploadImageIfPresent(
  supabase: SupabaseClient,
  imagePath: string | undefined,
): Promise<string | null> {
  if (!imagePath || !existsSync(imagePath)) return null;
  const buffer = readFileSync(imagePath);
  const fileName = `marketing/${Date.now()}-${imagePath.split(/[/\\]/).pop()}`;
  const { error } = await supabase.storage.from("avatars").upload(fileName, buffer, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) {
    console.error(`   image upload failed: ${error.message}`);
    return null;
  }
  return supabase.storage.from("avatars").getPublicUrl(fileName).data.publicUrl;
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

  if (post.scheduledServerId && !opts.force) {
    throw new Error(
      `Post #${postId} is already cloud-scheduled (server id ${post.scheduledServerId}). ` +
      `Pass --force to re-queue, or run cloud-cancel first.`,
    );
  }

  const supabase = getSupabase();
  const imageUrl = await uploadImageIfPresent(supabase, post.imagePath);

  const { data, error } = await supabase
    .from("marketing_posts")
    .insert({
      text: post.text,
      topic: post.topic,
      ai_score: post.aiScore,
      platforms: ["facebook", "instagram"],
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      image_url: imageUrl,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Failed to schedule in cloud: ${error.message}`);

  post.status = "scheduled";
  post.scheduledFor = scheduledFor.toISOString();
  post.scheduledServerId = String(data.id);
  saveLocalPosts(posts);

  return { cloudId: String(data.id), scheduledFor: scheduledFor.toISOString() };
}

/**
 * SELECT marketing_posts ORDER BY scheduled_for. Returns up to `limit` rows.
 * Used by the `cloud-list` CLI command for an at-a-glance view of the queue.
 */
export async function listCloudQueue(opts: { limit?: number; status?: CloudPost["status"] } = {}): Promise<CloudPost[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("marketing_posts")
    .select("id, text, topic, status, scheduled_for, posted_at, blotato_post_id, error, image_url, created_at")
    .order("scheduled_for", { ascending: false })
    .limit(opts.limit ?? 30);
  if (opts.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to list cloud queue: ${error.message}`);
  return (data ?? []) as CloudPost[];
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

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("marketing_posts")
    .select("id, status, posted_at, blotato_post_id, error")
    .in("id", cloudIds);
  if (error) throw new Error(`Failed to fetch cloud statuses: ${error.message}`);

  const cloudById = new Map<string, { status: string; posted_at: string | null; blotato_post_id: string | null; error: string | null }>();
  for (const row of data ?? []) cloudById.set(String(row.id), row);

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
