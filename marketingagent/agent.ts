import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";

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

const MAX_RETRIES = 5;
const POSTS_FILE = "posts.json";
const MEMORY_FILE = "memory.json";
const BLOTATO_API_URL = "https://api.blotato.com/v1/posts";

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

// ── Anthropic generation ────────────────────────────────────────────
async function generatePost(
  client: Anthropic,
  topic: string,
  memory: Memory,
): Promise<string> {
  const recentContext = memory.recentPosts.length > 0
    ? `\nRecent posts (DO NOT repeat similar ideas):\n${memory.recentPosts.slice(-5).map((p) => `- "${p}"`).join("\n")}`
    : "";

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are a social media copywriter for AstroDating — a dating app that uses real birth chart astrology (synastry) to match people.

Write ONE short, punchy social media post (max 280 chars) about: "${topic}"

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
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return block.text.trim().replace(/^["']|["']$/g, ""); // Strip wrapping quotes
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
): Promise<BlotaToResult> {
  const apiKey = process.env.BLOTATO_API_KEY;
  if (!apiKey) {
    return { success: false, error: "BLOTATO_API_KEY not set" };
  }

  try {
    const response = await fetch(BLOTATO_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: text,
        platforms,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Blotato API ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, postId: data.id || data.postId || "unknown" };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ── Persistence ─────────────────────────────────────────────────────
interface SavedPost {
  id: number;
  topic: string;
  text: string;
  aiScore: number;
  createdAt: string;
  status: "draft" | "approved" | "posted" | "failed";
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

  const result = await postToBlotato(target.text);

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
      posted: "📤",
      failed: "❌",
    }[p.status];
    console.log(`  ${status} #${p.id} [${p.aiScore}/100] ${p.text.slice(0, 60)}...`);
  }
}

async function cmdGenerateAndPost(topic: string) {
  const saved = await cmdGenerate(topic);
  if (saved) {
    console.log("\n--- Auto-posting ---");
    await cmdPost(saved.id);
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

    default:
      // Legacy: treat first arg as topic for backward compat
      if (command) {
        await cmdGenerate(command);
      } else {
        console.log(`
AstroDating Marketing Agent

Commands:
  npm run agent -- generate "<topic>"   Generate a post
  npm run agent -- post [id]            Publish to Blotato (latest approved or by ID)
  npm run agent -- auto "<topic>"       Generate + publish in one step
  npm run agent -- list                 Show all posts
`);
      }
  }
}

main();
