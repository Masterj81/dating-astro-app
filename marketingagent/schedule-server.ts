import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

/**
 * Schedule a post for server-side publishing via Supabase + pg_cron.
 * The post will be published even if your PC is off.
 *
 * Usage:
 *   npm run schedule-server -- <post-id> "<datetime>"
 *   npm run schedule-server -- 4 "2026-04-01 11:00"
 *   npm run schedule-server -- 4 "tomorrow 19:00"
 *   npm run schedule-server -- 4 next          (next optimal slot)
 */

const POSTS_FILE = "posts.json";

interface LocalPost {
  id: number;
  text: string;
  topic: string;
  aiScore: number;
  status: string;
  imagePath?: string;
}

function loadLocalPosts(): LocalPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function getNextSlot(): Date {
  const now = new Date();
  const hours = [11, 12, 19, 20];

  for (const h of hours) {
    if (h > now.getHours()) {
      const d = new Date(now);
      d.setHours(h, 0, 0, 0);
      return d;
    }
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);
  return tomorrow;
}

function parseDateTime(input: string): Date {
  if (input === "next") return getNextSlot();

  if (input.startsWith("tomorrow")) {
    const time = input.replace("tomorrow", "").trim();
    const [h, m] = (time || "11:00").split(":").map(Number);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, m || 0, 0, 0);
    return d;
  }

  const parsed = new Date(input);
  if (isNaN(parsed.getTime())) {
    console.error(`Invalid date: "${input}"`);
    process.exit(1);
  }
  return parsed;
}

async function main() {
  const postId = parseInt(process.argv[2]);
  const dateArg = process.argv[3] || "next";

  if (!postId) {
    console.error('Usage: npm run schedule-server -- <post-id> "<datetime>"');
    console.error('       npm run schedule-server -- 4 "2026-04-01 11:00"');
    console.error('       npm run schedule-server -- 4 next');
    process.exit(1);
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
    console.error("  SUPABASE_URL=https://qtihezzbuubnyvrjdkjd.supabase.co");
    console.error("  SUPABASE_SERVICE_ROLE_KEY=your-key");
    process.exit(1);
  }

  // Find local post
  const posts = loadLocalPosts();
  const post = posts.find((p) => p.id === postId);

  if (!post) {
    console.error(`Post #${postId} not found. Run: npm run list`);
    process.exit(1);
  }

  const scheduledFor = parseDateTime(dateArg);
  console.log(`\n⏰ Scheduling post #${post.id} for server-side publishing`);
  console.log(`   Text: "${post.text.slice(0, 60)}..."`);
  console.log(`   Scheduled: ${scheduledFor.toLocaleString()}`);
  console.log(`   Platforms: Facebook, Instagram\n`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("marketing_posts")
    .insert({
      text: post.text,
      topic: post.topic,
      ai_score: post.aiScore,
      platforms: ["facebook", "instagram"],
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error(`❌ Failed to schedule: ${error.message}`);
    process.exit(1);
  }

  console.log(`✅ Scheduled! Server post ID: ${data.id}`);
  console.log(`   The post will be published automatically at ${scheduledFor.toLocaleString()}`);
  console.log(`   Even if your PC is off.\n`);
}

main();
