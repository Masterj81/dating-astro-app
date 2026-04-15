import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { ensurePublicUrl } from "./upload-image.js";
import { schedulePostServer } from "./schedule-server.js";

// ── Config ──────────────────────────────────────────────────────────
const BANNED_WORDS = [
  "delve", "tapestry", "unleash", "game-changer", "game changer",
  "revolutionary", "groundbreaking", "realm", "landscape", "paradigm",
  "synergy", "leverage", "elevate", "foster", "embark", "navigate",
  "robust", "seamless", "holistic", "cutting-edge", "in today's world",
  "it's worth noting", "in conclusion", "furthermore", "moreover",
  "comprehensive", "multifaceted", "pivotal", "transformative",
  "harness", "empower", "streamline", "cutting edge",
];

// Strict ban list for viral FB long-form posts
const BANNED_WORDS_VIRAL = [
  ...BANNED_WORDS,
  "can", "may", "just", "very", "really", "literally", "actually", "certainly",
  "probably", "basically", "could", "maybe", "enlightening", "esteemed",
  "shed light", "craft", "crafting", "imagine", "game-changer", "unlock",
  "discover", "skyrocket", "abyss", "you're not alone", "in a world where",
  "revolutionize", "disruptive", "utilize", "utilizing", "dive deep",
  "illuminate", "unveil", "enrich", "intricate", "elucidate", "hence",
  "boost", "bustling", "opened up", "powerful", "inquiries", "ever-evolving",
  "remarkable", "stark", "testament", "in summary", "glimpse into",
];

const TOPICS = [
  "Zodiac compatibility — which signs match and why",
  "Birth chart education — Sun vs Moon vs Rising, Venus in love",
  "Dating tips through an astrology lens",
  "Sign-specific humor and relatable content",
  "App features — compatibility scores, tarot, horoscopes",
  "Seasonal astrology — retrogrades, eclipses, sign seasons",
  "Zodiac truth — sign-specific personality traits, superpowers, and real struggles",
  "Sign love styles — how each sign loves, what they need in a partner, dating patterns",
  "Best cosmic matches — which signs work best together and why",
  "Tarot and card readings — daily pulls, love spreads, what the cards say about your love life",
  "Planetary placements and transits — Mercury retrograde survival, Venus in signs, Mars energy, moon phases and dating",
];

const MAX_RETRIES = 5;
const ANTHROPIC_API_RETRIES = 4;
const POSTS_FILE = "posts.json";
const MEMORY_FILE = "memory.json";
const BLOTATO_API_URL = "https://backend.blotato.com/v2/posts";

// ── AI-language scorer ──────────────────────────────────────────────
interface ScoreResult {
  pass: boolean;
  score: number; // 0 = perfectly human, 100 = AI slop
  flagged: string[];
  details: {
    bannedWords: number;
    sentenceVariety: number;
    startsWithI: boolean;
    tooLong: boolean;
  };
}

function scorePost(text: string): ScoreResult {
  const lower = text.toLowerCase();
  const flagged = BANNED_WORDS.filter((w) => lower.includes(w));

  // Score components
  let score = 0;

  // Banned words: 20 pts each
  score += flagged.length * 20;

  // Sentence variety: penalize if all sentences are similar length
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgLen = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1);
  const variance = sentences.reduce((sum, s) => sum + Math.abs(s.length - avgLen), 0) / Math.max(sentences.length, 1);
  const sentenceVariety = variance < 10 ? 15 : 0; // Low variety = AI-like
  score += sentenceVariety;

  // Starts with "I" pattern (AI tends to do this)
  const startsWithI = /^(I |I'm |I've |I'll )/.test(text.trim());
  if (startsWithI) score += 5;

  // Too long for social media
  const tooLong = text.length > 300;
  if (tooLong) score += 10;

  score = Math.min(score, 100);

  return {
    pass: score < 20 && flagged.length === 0,
    score,
    flagged,
    details: { bannedWords: flagged.length, sentenceVariety, startsWithI, tooLong },
  };
}

// ── Viral FB long-form scorer ───────────────────────────────────────
function scoreViralPost(text: string): ScoreResult {
  const lower = text.toLowerCase();
  const flagged = BANNED_WORDS_VIRAL.filter((w) => {
    const pattern = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return pattern.test(lower);
  });

  let score = flagged.length * 15;

  // Must have an opening hook (5-8 words on first line)
  const firstLine = text.trim().split("\n")[0]?.trim() ?? "";
  const firstLineWords = firstLine.split(/\s+/).filter(Boolean).length;
  if (firstLineWords < 4 || firstLineWords > 12) score += 15;

  // Must contain at least 3 emoji-bullet lines
  const emojiBullets = (text.match(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}].+$/gmu) || []).length;
  if (emojiBullets < 3) score += 10;

  // Must use "you" or "your" (direct address)
  if (!/\b(you|your|you're|you've|you'll)\b/i.test(text)) score += 10;

  // Reject hashtags, asterisks, semicolons (per template rules)
  if (/#\w+/.test(text)) score += 20;
  if (/\*/.test(text)) score += 10;
  if (/;/.test(text)) score += 5;

  score = Math.min(score, 100);

  return {
    pass: score < 25 && flagged.length === 0,
    score,
    flagged,
    details: {
      bannedWords: flagged.length,
      sentenceVariety: 0,
      startsWithI: false,
      tooLong: text.length > 2200,
    },
  };
}

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
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
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

// ── Anthropic generation ────────────────────────────────────────────
async function generatePost(
  client: Anthropic,
  topic: string,
  memory: Memory,
): Promise<string> {
  const recentContext = memory.recentPosts.length > 0
    ? `\nRecent posts (DO NOT repeat similar ideas):\n${memory.recentPosts.slice(-5).map((p) => `- "${p}"`).join("\n")}`
    : "";

  const request = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are a social media copywriter for AstroDating — a dating app that uses real birth chart astrology (synastry) to match people.

Write ONE short, punchy social media post (max 280 chars) about: "${topic}"

Content themes we cover:
${TOPICS.map((t) => `- ${t}`).join("\n")}

Rules:
- Sound like a real human, not a corporation or AI
- Casual, witty tone — think Twitter/X energy
- 1-2 relevant emojis max
- No hashtags unless specifically about a trend
- NEVER use these words: ${BANNED_WORDS.join(", ")}
- Vary sentence structure — mix short and long
- Don't start with "I" or "We"
- Be specific to astrology/dating, not generic motivational
${recentContext}

Post:`,
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

      if (!isRetryableAnthropicError(err) || attempt === ANTHROPIC_API_RETRIES) {
        break;
      }

      const status = getAnthropicStatus(err);
      const delayMs = (2 ** attempt) * 1000 + Math.floor(Math.random() * 400);
      console.log(`   Anthropic temporarily unavailable (${status ?? "network"}). Retrying in ${Math.round(delayMs / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ── Viral FB long-form generation ───────────────────────────────────
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
interface BlotaToResult {
  success: boolean;
  postId?: string;
  error?: string;
}

async function postToBlotato(
  text: string,
  platforms: string[] = ["facebook", "instagram"],
  imageUrl?: string,
): Promise<BlotaToResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) {
    return { success: false, error: "BLOTATO_API_KEY not set" };
  }

  const fbPageId = process.env.BLOTATO_FB_PAGE_ID;

  // Upload local images to Supabase Storage so Blotato gets a public URL
  imageUrl = await ensurePublicUrl(imageUrl);

  try {
    const results: { platform: string; success: boolean; postId?: string; error?: string }[] = [];

    for (const platform of platforms) {
      const accountId = platform === 'instagram'
        ? process.env.BLOTATO_IG_ACCOUNT_ID
        : process.env.BLOTATO_FB_ACCOUNT_ID;
      if (!accountId) {
        results.push({ platform, success: false, error: `BLOTATO_${platform === 'instagram' ? 'IG' : 'FB'}_ACCOUNT_ID not set` });
        continue;
      }

      // Instagram requires an image — skip if text-only
      if (platform === 'instagram' && !imageUrl) {
        results.push({ platform, success: false, error: 'Instagram requires an image — skipped' });
        continue;
      }

      const target: Record<string, string> = { targetType: platform };
      if (platform === "facebook") {
        if (!fbPageId) {
          results.push({ platform, success: false, error: "BLOTATO_FB_PAGE_ID not set — required for Facebook posts" });
          continue;
        }
        target.pageId = fbPageId;
      }

      const response = await fetch(BLOTATO_API_URL, {
        method: "POST",
        headers: {
          "blotato-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post: {
            accountId,
            content: { text, mediaUrls: imageUrl ? [imageUrl] : [], platform },
            target,
          },
          useNextFreeSlot: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        results.push({ platform, success: false, error: `Blotato API ${response.status}: ${errorText}` });
        continue;
      }

      const data = await response.json();
      results.push({ platform, success: true, postId: data.postSubmissionId || data.id || data.postId || "unknown" });
    }

    const allFailed = results.every((r) => !r.success);
    const firstSuccess = results.find((r) => r.success);
    const errors = results.filter((r) => !r.success).map((r) => `${r.platform}: ${r.error}`);

    if (allFailed) {
      return { success: false, error: `All platforms failed — ${errors.join("; ")}` };
    }

    return {
      success: true,
      postId: firstSuccess?.postId,
      ...(errors.length > 0 ? { error: `Partial failure — ${errors.join("; ")}` } : {}),
    };
  } catch (err) {
    return { success: false, error: `Network error posting to Blotato: ${(err as Error).message}` };
  }
}

// ── Blotato native scheduling (no Supabase cron required) ──────────
async function scheduleToBlotato(
  text: string,
  scheduledTime: Date,
  platforms: string[] = ["facebook", "instagram"],
  imageUrl?: string,
): Promise<BlotaToResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) return { success: false, error: "BLOTATO_API_KEY not set" };

  const fbPageId = process.env.BLOTATO_FB_PAGE_ID;
  imageUrl = await ensurePublicUrl(imageUrl);

  try {
    const results: { platform: string; success: boolean; postId?: string; error?: string }[] = [];

    for (const platform of platforms) {
      const accountId = platform === 'instagram'
        ? process.env.BLOTATO_IG_ACCOUNT_ID
        : process.env.BLOTATO_FB_ACCOUNT_ID;
      if (!accountId) {
        results.push({ platform, success: false, error: `BLOTATO_${platform === 'instagram' ? 'IG' : 'FB'}_ACCOUNT_ID not set` });
        continue;
      }

      if (platform === 'instagram' && !imageUrl) {
        results.push({ platform, success: false, error: 'Instagram requires an image — skipped' });
        continue;
      }

      const target: Record<string, string> = { targetType: platform };
      if (platform === "facebook") {
        if (!fbPageId) {
          results.push({ platform, success: false, error: "BLOTATO_FB_PAGE_ID not set" });
          continue;
        }
        target.pageId = fbPageId;
      }

      const response = await fetch(BLOTATO_API_URL, {
        method: "POST",
        headers: {
          "blotato-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post: {
            accountId,
            content: { text, mediaUrls: imageUrl ? [imageUrl] : [], platform },
            target,
          },
          scheduledTime: scheduledTime.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        results.push({ platform, success: false, error: `Blotato API ${response.status}: ${errorText}` });
        continue;
      }

      const data = await response.json();
      results.push({ platform, success: true, postId: data.postSubmissionId || data.id || data.postId || "unknown" });
    }

    const allFailed = results.every((r) => !r.success);
    const firstSuccess = results.find((r) => r.success);
    const errors = results.filter((r) => !r.success).map((r) => `${r.platform}: ${r.error}`);

    if (allFailed) return { success: false, error: `All platforms failed — ${errors.join("; ")}` };

    return {
      success: true,
      postId: firstSuccess?.postId,
      ...(errors.length > 0 ? { error: `Partial failure — ${errors.join("; ")}` } : {}),
    };
  } catch (err) {
    return { success: false, error: `Network error: ${(err as Error).message}` };
  }
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
  blotato?: {
    postId?: string;
    platforms: string[];
    postedAt?: string;
    error?: string;
  };
}

function loadPosts(): SavedPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(posts: SavedPost[]): void {
  writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function savePost(topic: string, text: string, score: number): SavedPost {
  const posts = loadPosts();
  const entry: SavedPost = {
    id: posts.length + 1,
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

// ── Commands ────────────────────────────────────────────────────────

async function cmdGenerate(topic: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: Set ANTHROPIC_API_KEY environment variable");
    process.exit(1);
  }

  const client = new Anthropic();
  const memory = loadMemory();

  console.log(`\n🎯 Topic: "${topic}"\n`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`⏳ Attempt ${attempt}/${MAX_RETRIES} — generating...`);

    const text = await generatePost(client, topic, memory);
    const result = scorePost(text);

    console.log(`   📝 "${text}"`);
    console.log(`   🔍 AI score: ${result.score}/100 ${result.pass ? "✅" : "❌"}`);

    if (result.pass) {
      const saved = savePost(topic, text, result.score);
      memory.recentTopics.push(topic);
      memory.recentPosts.push(text);
      memory.totalGenerated++;
      saveMemory(memory);
      console.log(`\n✅ Approved! Saved as post #${saved.id} → ${POSTS_FILE}`);
      return saved;
    }

    if (result.flagged.length > 0) {
      console.log(`   ❌ Flagged words: [${result.flagged.join(", ")}]`);
    }
    if (result.details.sentenceVariety > 0) {
      console.log(`   ❌ Low sentence variety`);
    }
    if (result.details.tooLong) {
      console.log(`   ❌ Too long (${text.length} chars)`);
    }
  }

  console.error(`\n🚫 Failed after ${MAX_RETRIES} attempts.`);
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

  console.log(`\n📤 Publishing post #${target.id}: "${target.text}"\n`);

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
    console.log(`✅ Posted! Blotato ID: ${result.postId}`);
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
    : posts.filter((p) => p.status === "approved" && !p.imagePath).pop();

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

async function cmdViral(sourceArg: string) {
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
  const saved = await cmdViral(sourceArg);
  if (saved) {
    console.log("\n--- Auto-generating image ---");
    await cmdImage(saved.id);
    console.log("\n--- Auto-scheduling ---");
    await schedulePostServer(saved.id, "next");
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
    target.status = "scheduled";
    target.blotato = {
      postId: result.postId,
      platforms: ["facebook", "instagram"],
      postedAt: scheduledTime.toISOString(),
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
  const saved = await cmdGenerate(topic);
  if (saved) {
    console.log("\n--- Auto-generating image ---");
    await cmdImage(saved.id);
    console.log("\n--- Auto-scheduling ---");
    await schedulePostServer(saved.id, "next");
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

    default:
      // Legacy: treat first arg as topic for backward compat
      if (command) {
        await cmdGenerate(command);
      } else {
        console.log(`
AstroDating Marketing Agent

Commands:
  npm run agent -- generate "<topic>"        Generate short post (≤280 chars)
  npm run agent -- viral "<source-or-file>"  Generate long-form viral FB post
  npm run agent -- post [id]                 Publish to Blotato (latest approved or by ID)
  npm run agent -- image [id]                Generate image for a post (Gemini)
  npm run agent -- auto "<topic>"            Generate short + image + schedule
  npm run agent -- viral-auto "<source>"     Generate viral + image + schedule
  npm run agent -- blotato-schedule <id> "<when>"  Schedule directly in Blotato (no Supabase cron)
  npm run agent -- list                      Show all posts
`);
      }
  }
}

main();
