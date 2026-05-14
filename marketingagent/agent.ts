import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { atomicWriteJson } from "./lib.js";
import {
  BANNED_WORDS_VIRAL,
  POSTS_FILE,
  MEMORY_FILE,
} from "./constants.js";
import { scoreViralPost } from "./scoring.js";
import { submitToBlotato, type BlotatoResult } from "./blotato.js";

const MAX_RETRIES = 5;
const ANTHROPIC_API_RETRIES = 4;

// ── Short-term memory ───────────────────────────────────────────────
interface Memory {
  recentTopics: string[];
  recentPosts: string[];
  totalGenerated: number;
  lastPosted: string | null;
}

function loadMemory(): Memory {
  if (!existsSync(MEMORY_FILE)) {
    return { recentTopics: [], recentPosts: [], totalGenerated: 0, lastPosted: null };
  }
  return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
}

function saveMemory(memory: Memory): void {
  // Keep only last 20 entries to prevent bloat
  memory.recentTopics = memory.recentTopics.slice(-20);
  memory.recentPosts = memory.recentPosts.slice(-20);
  atomicWriteJson(MEMORY_FILE, memory);
}

function getAnthropicStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) {
    return undefined;
  }

  const status = (err as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableAnthropicError(err: unknown): boolean {
  const status = getAnthropicStatus(err);
  return status === 429 || status === 529 || (status !== undefined && status >= 500);
}

// ── Viral FB long-form generation ───────────────────────────────────
// Short-post generation lives in ./generator.ts (generateShortPost), shared
// with the dashboard. Only the viral long-form path stays inline here.
async function generateViralPost(
  client: Anthropic,
  source: string,
  memory: Memory,
): Promise<string> {
  const recentContext = memory.recentPosts.length > 0
    ? `\nRecent posts (DO NOT repeat ideas or openings):\n${memory.recentPosts.slice(-3).map((p) => `- "${p.slice(0, 100)}"`).join("\n")}`
    : "";

  const request = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user" as const,
        content: `You are an expert Facebook marketer for AstroDating — a dating app that matches people via real birth chart astrology (synastry).

Write ONE viral Facebook post based on the source below. Follow this exact structure:

1. OPENING HOOK (5-8 words, no emoji): challenge a belief, share a surprising fact, ask a direct question, or give a bold opinion. Use clear imagery, specific numbers, or timeframes. Do NOT give away the answer.
2. Blank line
3. 4-6 emoji-bullet lines (each starts with a relevant emoji, then a short benefit/symptom/insight)
4. Blank line
5. 3-5 short paragraphs telling a personal-feeling story or explanation. Use "you" and "your". Use frequent line breaks.
6. Soft CTA at the end pointing to the AstroDating app or a free reading.

WRITING STYLE (strict):
- Spartan, informative, clear
- Short impactful sentences
- Active voice only
- Use "you" and "your" to address the reader directly
- Specific examples, no generalizations
- No metaphors or clichés
- No hashtags
- No asterisks
- No semicolons
- No setup phrases ("in conclusion", "in closing")
- No adjectives or adverbs unless absolutely necessary
- NEVER use these words: ${BANNED_WORDS_VIRAL.slice(0, 40).join(", ")}

CONTENT RULES:
- Must be specific to astrology/dating/AstroDating
- Casual, witty, human (not corporate)
- Total length: 800-1800 chars
${recentContext}

SOURCE:
"""
${source}
"""

Output ONLY the post text, no preamble, no explanation, no quotes around it.`,
      },
    ],
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= ANTHROPIC_API_RETRIES; attempt++) {
    try {
      const msg = await client.messages.create(request);
      const block = msg.content[0];
      if (block.type !== "text") throw new Error("Unexpected response type");
      return block.text.trim().replace(/^["']|["']$/g, "");
    } catch (err) {
      lastError = err;
      if (!isRetryableAnthropicError(err) || attempt === ANTHROPIC_API_RETRIES) break;
      const delayMs = (2 ** attempt) * 1000 + Math.floor(Math.random() * 400);
      console.log(`   Anthropic temporarily unavailable. Retrying in ${Math.round(delayMs / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── Blotato API ─────────────────────────────────────────────────────
// All three flavours below delegate to ./blotato.ts so the per-platform loop,
// env-var handling, and error aggregation live in one place.

async function postToBlotato(
  text: string,
  platforms: string[] = ["facebook", "instagram"],
  imageUrl?: string,
): Promise<BlotatoResult> {
  return submitToBlotato(text, platforms, imageUrl);
}

async function sendDraftToBlotato(
  text: string,
  platforms: string[] = ["facebook", "instagram"],
  imageUrl?: string,
): Promise<BlotatoResult> {
  return submitToBlotato(text, platforms, imageUrl, { useNextFreeSlot: true });
}

async function scheduleToBlotato(
  text: string,
  scheduledTime: Date,
  platforms: string[] = ["facebook", "instagram"],
  imageUrl?: string,
): Promise<BlotatoResult> {
  return submitToBlotato(text, platforms, imageUrl, { scheduledTime });
}

// ── Persistence ─────────────────────────────────────────────────────
interface SavedPost {
  id: number;
  topic: string;
  text: string;
  aiScore: number;
  createdAt: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed";
  imagePath?: string;
  scheduledFor?: string;
  blotato?: {
    postId?: string;
    platforms: string[];
    postedAt?: string;
    queueMode?: "scheduled-time" | "next-free-slot";
    error?: string;
  };
}

function loadPosts(): SavedPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(posts: SavedPost[]): void {
  atomicWriteJson(POSTS_FILE, posts);
}

function nextPostId(posts: SavedPost[]): number {
  // posts.length+1 collides if any post was deleted; use max(id)+1 instead.
  return posts.reduce((max, p) => (p.id > max ? p.id : max), 0) + 1;
}

function savePost(topic: string, text: string, score: number): SavedPost {
  const posts = loadPosts();
  const entry: SavedPost = {
    id: nextPostId(posts),
    topic,
    text,
    aiScore: score,
    createdAt: new Date().toISOString(),
    status: "approved",
  };
  posts.push(entry);
  savePosts(posts);
  return entry;
}

async function syncDraftToBlotatoNextSlot(
  postId: number,
  platforms?: string[],
): Promise<SavedPost | undefined> {
  const posts = loadPosts();
  const target = posts.find((p) => p.id === postId);

  if (!target) {
    console.error(`Post #${postId} not found for Blotato sync.`);
    return undefined;
  }

  if (!process.env.BLOTATO_API_KEY) {
    console.log("⚠️  BLOTATO_API_KEY not set — keeping draft only in posts.json");
    return target;
  }

  const draftPlatforms = platforms ?? (target.imagePath ? ["facebook", "instagram"] : ["facebook"]);

  console.log(`\n🗂️ Sending draft #${target.id} to Blotato (next free slot)`);
  console.log(`   Platforms: ${draftPlatforms.join(", ")}`);
  if (!target.imagePath && draftPlatforms.includes("instagram")) {
    console.log("   ⚠️  No image attached — Instagram may be skipped by Blotato");
  }

  const result = await sendDraftToBlotato(target.text, draftPlatforms, target.imagePath);

  if (!result.success) {
    console.log(`   ⚠️  Blotato sync skipped: ${result.error}`);
    return target;
  }

  target.status = "scheduled";
  if (result.scheduledTime) {
    target.scheduledFor = result.scheduledTime;
  } else {
    delete target.scheduledFor;
  }
  target.blotato = {
    postId: result.postId,
    platforms: draftPlatforms,
    queueMode: "next-free-slot",
    ...(result.error ? { error: result.error } : {}),
  };
  savePosts(posts);

  console.log(`   ✅ Draft queued in Blotato. Submission ID: ${result.postId}`);
  if (result.error) {
    console.log(`   ⚠️  ${result.error}`);
  }

  return target;
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdGenerate(
  topic: string,
  options?: { syncDraftToBlotato?: boolean },
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: Set ANTHROPIC_API_KEY environment variable");
    process.exit(1);
  }

  console.log(`\n🎯 Topic: "${topic}"\n`);

  const { generateShortPost } = await import("./generator.js");
  const result = await generateShortPost(topic, { maxRetries: MAX_RETRIES });

  // Replay the attempts in the same console-UX shape as before so external
  // wrappers / screenshots stay stable.
  for (const a of result.attempts) {
    console.log(`⏳ Attempt ${a.attempt}/${MAX_RETRIES} — generating...`);
    console.log(`   📝 "${a.text}"`);
    console.log(`   🔍 AI score: ${a.score}/100 ${a.pass ? "✅" : "❌"}`);
    if (a.flagged.length > 0) {
      console.log(`   ❌ Flagged words: [${a.flagged.join(", ")}]`);
    }
  }

  if (result.success && result.post) {
    console.log(`\n✅ Approved! Saved as post #${result.post.id} → ${POSTS_FILE}`);
    if (options?.syncDraftToBlotato !== false) {
      return await syncDraftToBlotatoNextSlot(result.post.id) ?? result.post;
    }
    return result.post;
  }

  console.error(`\n🚫 ${result.error ?? `Failed after ${MAX_RETRIES} attempts.`}`);
  process.exit(1);
}

async function cmdPost(postId?: number) {
  const posts = loadPosts();
  const target = postId
    ? posts.find((p) => p.id === postId)
    : posts.filter((p) => p.status === "approved").pop();

  if (!target) {
    console.error("No approved post found to publish.");
    process.exit(1);
  }

  console.log(`\n📤 Publishing immediately for post #${target.id}: "${target.text}"\n`);

  const result = await postToBlotato(target.text, ["facebook", "instagram"], target.imagePath);

  if (result.success) {
    target.status = "posted";
    target.blotato = {
      postId: result.postId,
      platforms: ["facebook", "instagram"],
      postedAt: new Date().toISOString(),
    };
    savePosts(posts);
    const memory = loadMemory();
    memory.lastPosted = new Date().toISOString();
    saveMemory(memory);
    console.log(`✅ Published now! Blotato ID: ${result.postId}`);
    return target;
  } else {
    target.status = "failed";
    target.blotato = {
      platforms: ["facebook", "instagram"],
      error: result.error,
    };
    savePosts(posts);
    console.error(`❌ Failed: ${result.error}`);
  }
}

async function cmdList() {
  const posts = loadPosts();
  if (posts.length === 0) {
    console.log("No posts yet. Run: npm run generate -- \"<topic>\"");
    return;
  }

  console.log(`\n📋 ${posts.length} posts:\n`);
  for (const p of posts) {
    const status = {
      draft: "📝",
      approved: "✅",
      scheduled: "⏰",
      posted: "📤",
      failed: "❌",
    }[p.status];
    console.log(`  ${status} #${p.id} [${p.aiScore}/100] ${p.text.slice(0, 60)}...`);
  }
}

async function cmdImage(postId?: number, variantCount?: number): Promise<SavedPost | undefined> {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.log("⚠️  GEMINI_API_KEY not set — will use Pollinations.ai fallback");
  }

  const posts = loadPosts();
  const target = postId
    ? posts.find((p) => p.id === postId)
    : posts.filter((p) => ["approved", "scheduled"].includes(p.status) && !p.imagePath).pop();

  if (!target) {
    console.error("No approved post without image found.");
    process.exit(1);
  }

  // Detect post type from topic prefix added by cmdViral
  const isViral = target.topic.startsWith("[viral-fb]");
  const postType: "short" | "viral" = isViral ? "viral" : "short";
  const count = variantCount ?? (isViral ? 3 : 2);

  console.log(`\n🎨 Generating image for post #${target.id} (${postType}, ${count} variants)`);
  console.log(`   "${target.text.slice(0, 50)}..."\n`);

  const { generateBestVariant, detectSignFromText } = await import("./.pi/extensions/image-generator.js");
  const detectedSign = detectSignFromText(target.text);
  if (detectedSign) console.log(`   ♈ Detected sign: ${detectedSign}\n`);

  const result = await generateBestVariant(target.text, {
    count,
    postType,
    signContext: detectedSign,
  });

  if (result.success && result.filePath) {
    target.imagePath = result.filePath;
    savePosts(posts);
    console.log(`\n✅ Image saved: ${result.filePath}`);
    return target;
  }
  console.error(`❌ Failed: ${result.error}`);
  return undefined;
}

async function cmdViral(
  sourceArg: string,
  options?: { syncDraftToBlotato?: boolean },
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: Set ANTHROPIC_API_KEY environment variable");
    process.exit(1);
  }

  // sourceArg can be a file path or raw text. If it ends with .md/.txt and exists, read it.
  let source = sourceArg;
  if (/\.(md|txt)$/i.test(sourceArg) && existsSync(sourceArg)) {
    source = readFileSync(sourceArg, "utf-8");
    console.log(`\n📖 Source loaded from: ${sourceArg} (${source.length} chars)\n`);
  } else {
    console.log(`\n📖 Source: inline text (${source.length} chars)\n`);
  }

  const client = new Anthropic();
  const memory = loadMemory();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`⏳ Attempt ${attempt}/${MAX_RETRIES} — generating viral FB post...`);

    const text = await generateViralPost(client, source, memory);
    const result = scoreViralPost(text);

    console.log(`\n   📝 Preview:\n${text.split("\n").map((l) => `      ${l}`).join("\n")}\n`);
    console.log(`   📏 Length: ${text.length} chars`);
    console.log(`   🔍 Score: ${result.score}/100 ${result.pass ? "✅" : "❌"}`);

    if (result.pass) {
      const topic = `[viral-fb] ${source.slice(0, 80).replace(/\s+/g, " ")}`;
      const saved = savePost(topic, text, result.score);
      memory.recentTopics.push(topic);
      memory.recentPosts.push(text);
      memory.totalGenerated++;
      saveMemory(memory);
      console.log(`\n✅ Approved! Saved as post #${saved.id} → ${POSTS_FILE}`);
      if (options?.syncDraftToBlotato !== false) {
        return await syncDraftToBlotatoNextSlot(saved.id) ?? saved;
      }
      return saved;
    }

    if (result.flagged.length > 0) {
      console.log(`   ❌ Flagged words: [${result.flagged.join(", ")}]`);
    }
  }

  console.error(`\n🚫 Failed after ${MAX_RETRIES} attempts.`);
  process.exit(1);
}

async function cmdViralAndPost(sourceArg: string) {
  const saved = await cmdViral(sourceArg, { syncDraftToBlotato: false });
  if (saved) {
    console.log("\n--- Auto-generating image ---");
    await cmdImage(saved.id);
    console.log("\n--- Syncing full draft to Blotato ---");
    await syncDraftToBlotatoNextSlot(saved.id, ["facebook", "instagram"]);
  }
}

async function cmdBlotatoSchedule(postId?: number, dateArg: string = "next") {
  const posts = loadPosts();
  const target = postId
    ? posts.find((p) => p.id === postId)
    : posts.filter((p) => p.status === "approved").pop();

  if (!target) {
    console.error("No approved post found to schedule.");
    process.exit(1);
  }

  // Reuse parseDateTime from schedule-server
  const { parseDateTime } = await import("./schedule-server.js");
  const scheduledTime = parseDateTime(dateArg);

  console.log(`\n📅 Scheduling post #${target.id} directly via Blotato`);
  console.log(`   Text: "${target.text.slice(0, 60)}..."`);
  console.log(`   When: ${scheduledTime.toLocaleString()}`);
  console.log(`   Platforms: facebook, instagram`);

  // Upload local image to a public URL if needed
  let imageUrl: string | undefined = target.imagePath;

  const result = await scheduleToBlotato(
    target.text,
    scheduledTime,
    ["facebook", "instagram"],
    imageUrl,
  );

  if (result.success) {
    const scheduledFor = result.scheduledTime || scheduledTime.toISOString();
    target.status = "scheduled";
    target.scheduledFor = scheduledFor;
    target.blotato = {
      postId: result.postId,
      platforms: ["facebook", "instagram"],
      queueMode: "scheduled-time",
      ...(result.error ? { error: result.error } : {}),
    };
    savePosts(posts);
    console.log(`\n✅ Scheduled in Blotato! Submission ID: ${result.postId}`);
    if (result.error) console.log(`   ⚠️  ${result.error}`);
  } else {
    target.status = "failed";
    target.blotato = {
      platforms: ["facebook", "instagram"],
      error: result.error,
    };
    savePosts(posts);
    console.error(`\n❌ Failed: ${result.error}`);
  }
}

async function cmdGenerateAndPost(topic: string) {
  const saved = await cmdGenerate(topic, { syncDraftToBlotato: false });
  if (saved) {
    console.log("\n--- Auto-generating image ---");
    await cmdImage(saved.id);
    console.log("\n--- Syncing full draft to Blotato ---");
    await syncDraftToBlotatoNextSlot(saved.id, ["facebook", "instagram"]);
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];

  switch (command) {
    case "generate":
      if (!arg) {
        console.error('Usage: npm run agent -- generate "<topic>"');
        process.exit(1);
      }
      await cmdGenerate(arg);
      break;

    case "post":
      await cmdPost(arg ? parseInt(arg) : undefined);
      break;

    case "list":
      await cmdList();
      break;

    case "auto":
      if (!arg) {
        console.error('Usage: npm run agent -- auto "<topic>"');
        process.exit(1);
      }
      await cmdGenerateAndPost(arg);
      break;

    case "image": {
      // Usage: npm run agent -- image [id] [variant-count]
      const variantArg = process.argv[4];
      const variantCount = variantArg ? parseInt(variantArg) : undefined;
      await cmdImage(arg ? parseInt(arg) : undefined, variantCount);
      break;
    }

    case "viral":
      if (!arg) {
        console.error('Usage: npm run agent -- viral "<source-text-or-file.md>"');
        process.exit(1);
      }
      await cmdViral(arg);
      break;

    case "viral-auto":
      if (!arg) {
        console.error('Usage: npm run agent -- viral-auto "<source-text-or-file.md>"');
        process.exit(1);
      }
      await cmdViralAndPost(arg);
      break;

    case "blotato-schedule": {
      // Usage: npm run agent -- blotato-schedule <id> "<when>"
      //        npm run agent -- blotato-schedule 21 "tomorrow 19:00"
      //        npm run agent -- blotato-schedule 21 next
      const postId = arg ? parseInt(arg) : undefined;
      const when = process.argv[4] || "next";
      await cmdBlotatoSchedule(postId, when);
      break;
    }

    case "cloud-schedule": {
      // Usage: npm run agent -- cloud-schedule <id> "<when>"
      // Pushes the post into Supabase marketing_posts. The publish-scheduled-posts
      // edge function (pg_cron every 5 min) will publish it — even if your PC is off.
      if (!arg) {
        console.error('Usage: npm run agent -- cloud-schedule <id> "<when>"');
        console.error('       npm run agent -- cloud-schedule 21 "tomorrow 19:00"');
        process.exit(1);
      }
      const { schedulePostServer } = await import("./schedule-server.js");
      await schedulePostServer(parseInt(arg), process.argv[4] || "next");
      break;
    }

    case "cloud-list": {
      // Usage: npm run agent -- cloud-list [scheduled|posted|failed]
      const { listCloudQueue } = await import("./cloud-scheduler.js");
      const status = (arg as "scheduled" | "posted" | "failed" | undefined);
      const rows = await listCloudQueue({ status });
      if (rows.length === 0) {
        console.log("Cloud queue is empty.");
      } else {
        console.log(`\n☁️ ${rows.length} cloud posts (most recent first):\n`);
        for (const r of rows) {
          const icon = r.status === "posted" ? "📤" : r.status === "failed" ? "❌" : "⏰";
          const when = new Date(r.scheduled_for).toLocaleString();
          console.log(`  ${icon} [${r.status}] ${when}  ${r.text.slice(0, 60)}...`);
          if (r.error) console.log(`       └─ ${r.error.slice(0, 100)}`);
        }
      }
      break;
    }

    case "cloud-sync": {
      // Pull cloud statuses back into posts.json so the dashboard reflects reality.
      const { syncCloudBackToLocal } = await import("./cloud-scheduler.js");
      const report = await syncCloudBackToLocal();
      console.log(
        `Cloud sync: checked ${report.checked} posts, updated ${report.updated} ` +
        `(${report.postedNow} newly posted, ${report.failedNow} newly failed).`,
      );
      break;
    }

    default:
      // Legacy: treat first arg as topic for backward compat
      if (command) {
        await cmdGenerate(command);
      } else {
        console.log(`
AstroDating Marketing Agent

Generation / local publishing:
  npm run agent -- generate "<topic>"        Generate short post (≤280 chars)
  npm run agent -- viral "<source-or-file>"  Generate long-form viral FB post
  npm run agent -- post [id]                 Publish immediately to Blotato (latest approved or by ID)
  npm run agent -- image [id]                Generate image for a post (Gemini)
  npm run agent -- auto "<topic>"            Generate short + image + send draft to next Blotato slot
  npm run agent -- viral-auto "<source>"     Generate viral + image + send draft to next Blotato slot
  npm run agent -- blotato-schedule <id> "<when>"  Schedule directly in Blotato (no Supabase cron)
  npm run agent -- list                      Show all posts (local view)

Cloud-scheduled (PC off OK — uses Supabase pg_cron + edge function):
  npm run agent -- cloud-schedule <id> "<when>"   Queue a post for server-side publication
  npm run agent -- cloud-list [status]            Show cloud queue (status = scheduled|posted|failed)
  npm run agent -- cloud-sync                     Pull cloud status back into posts.json
`);
      }
  }
}

main();
