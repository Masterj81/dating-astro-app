import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { atomicWriteJson } from "./lib.js";

/**
 * Schedule a post for server-side publishing via Supabase + pg_cron.
 * The post will be published even if your PC is off.
 *
 * Usage:
 *   npm run schedule-server -- <post-id> "<datetime>"
 *   npm run schedule-server -- 4 "2026-04-01 11:00"
 *   npm run schedule-server -- 4 "tomorrow 19:00"
 *   npm run schedule-server -- 4 next
 */

const POSTS_FILE = "posts.json";

interface LocalPost {
  id: number;
  text: string;
  topic: string;
  aiScore: number;
  status: string;
  imagePath?: string;
  scheduledFor?: string;
  scheduledServerId?: string;
}

function loadLocalPosts(): LocalPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function saveLocalPosts(posts: LocalPost[]): void {
  atomicWriteJson(POSTS_FILE, posts);
}

export function getNextSlot(): Date {
  const now = new Date();
  const hours = [11, 12, 19, 20];

  for (const hour of hours) {
    if (hour > now.getHours()) {
      const next = new Date(now);
      next.setHours(hour, 0, 0, 0);
      return next;
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  return tomorrow;
}

export function parseDateTime(input: string): Date {
  if (input === "next") return getNextSlot();

  if (input.startsWith("tomorrow")) {
    const time = input.replace("tomorrow", "").trim();
    const [hours, minutes] = (time || "11:00").split(":").map(Number);
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes || 0, 0, 0);
    return next;
  }

  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${input}"`);
  }
  // Catch typos like "2025-..." (past year) before they queue an instant publish.
  if (parsed.getTime() < Date.now() - 60_000) {
    throw new Error(`Refusing to schedule in the past: "${input}" -> ${parsed.toISOString()}`);
  }
  return parsed;
}

export async function schedulePostServer(postId: number, dateArg: string = "next"): Promise<void> {
  if (!postId) {
    throw new Error('Usage: npm run schedule-server -- <post-id> "<datetime>"');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  }

  const posts = loadLocalPosts();
  const post = posts.find((entry) => entry.id === postId);

  if (!post) {
    throw new Error(`Post #${postId} not found. Run: npm run list`);
  }

  const scheduledFor = parseDateTime(dateArg);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let imageUrl: string | null = null;
  if (post.imagePath && existsSync(post.imagePath)) {
    console.log(`\nUploading image: ${post.imagePath}`);
    const imageBuffer = readFileSync(post.imagePath);
    const fileName = `marketing/${Date.now()}-${post.imagePath.split(/[/\\]/).pop()}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error(`   Image upload failed: ${uploadError.message}`);
    } else {
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
      console.log(`   Image uploaded: ${imageUrl}`);
    }
  }

  console.log(`\nScheduling post #${post.id} for server-side publishing`);
  console.log(`   Text: "${post.text.slice(0, 60)}..."`);
  console.log(`   Scheduled: ${scheduledFor.toLocaleString()}`);
  console.log("   Platforms: Facebook, Instagram");
  if (imageUrl) console.log("   Image: attached");
  console.log();

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

  if (error) {
    throw new Error(`Failed to schedule: ${error.message}`);
  }

  post.status = "scheduled";
  post.scheduledFor = scheduledFor.toISOString();
  post.scheduledServerId = String(data.id);
  saveLocalPosts(posts);

  console.log(`Scheduled! Server post ID: ${data.id}`);
  console.log(`   The post will be published automatically at ${scheduledFor.toLocaleString()}`);
  console.log("   Even if your PC is off.\n");
}

async function main() {
  const postId = parseInt(process.argv[2]);
  const dateArg = process.argv[3] || "next";

  if (!postId) {
    console.error('Usage: npm run schedule-server -- <post-id> "<datetime>"');
    console.error('       npm run schedule-server -- 4 "2026-04-01 11:00"');
    console.error("       npm run schedule-server -- 4 next");
    process.exit(1);
  }

  try {
    await schedulePostServer(postId, dateArg);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("schedule-server.ts")) {
  main();
}
