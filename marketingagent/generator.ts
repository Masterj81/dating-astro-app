/**
 * Short-post generation — shared between the CLI (`agent.ts cmdGenerate`)
 * and the dashboard's `POST /api/generate` endpoint.
 *
 * The function is deliberately "library-style": it returns a result object
 * and never calls `process.exit` or writes to stdout. Callers decide how to
 * surface the output (console logging vs JSON response).
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { atomicWriteJson } from "./lib.js";
import { CORE_BANNED_WORDS, TOPICS, POSTS_FILE, MEMORY_FILE } from "./constants.js";
import { scorePost } from "./scoring.js";

const ANTHROPIC_API_RETRIES = 4;

export interface Memory {
  recentTopics: string[];
  recentPosts: string[];
  totalGenerated: number;
  lastPosted: string | null;
}

export interface SavedPost {
  id: number;
  topic: string;
  text: string;
  aiScore: number;
  createdAt: string;
  status: "draft" | "approved" | "scheduled" | "posted" | "failed";
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

export interface GenerateAttempt {
  attempt: number;
  text: string;
  score: number;
  pass: boolean;
  flagged: string[];
}

export interface GenerateResult {
  success: boolean;
  post?: SavedPost;
  attempts: GenerateAttempt[];
  error?: string;
}

function loadMemory(): Memory {
  if (!existsSync(MEMORY_FILE)) {
    return { recentTopics: [], recentPosts: [], totalGenerated: 0, lastPosted: null };
  }
  return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
}

function saveMemory(memory: Memory): void {
  memory.recentTopics = memory.recentTopics.slice(-20);
  memory.recentPosts = memory.recentPosts.slice(-20);
  atomicWriteJson(MEMORY_FILE, memory);
}

function loadPosts(): SavedPost[] {
  if (!existsSync(POSTS_FILE)) return [];
  return JSON.parse(readFileSync(POSTS_FILE, "utf-8"));
}

function savePosts(posts: SavedPost[]): void {
  atomicWriteJson(POSTS_FILE, posts);
}

function nextPostId(posts: SavedPost[]): number {
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

function getAnthropicStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null || !("status" in err)) return undefined;
  const status = (err as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableAnthropicError(err: unknown): boolean {
  const status = getAnthropicStatus(err);
  return status === 429 || status === 529 || (status !== undefined && status >= 500);
}

async function callAnthropic(client: Anthropic, topic: string, memory: Memory): Promise<string> {
  const recentContext = memory.recentPosts.length > 0
    ? `\nRecent posts (DO NOT repeat similar ideas):\n${memory.recentPosts.slice(-5).map((p) => `- "${p}"`).join("\n")}`
    : "";

  const request = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user" as const,
        content: `You are a social media copywriter for AstroDating — a dating app that uses real birth chart astrology (synastry) to match people.

Write ONE short, punchy social media post (max 280 chars) about: "${topic}"

Content themes we cover:
${TOPICS.map((t) => `- ${t}`).join("\n")}

Rules:
- Sound like a real human, not a corporation or AI
- Casual, witty tone — think Twitter/X energy
- 1-2 relevant emojis max
- No hashtags unless specifically about a trend
- NEVER use these words: ${CORE_BANNED_WORDS.join(", ")}
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
      if (!isRetryableAnthropicError(err) || attempt === ANTHROPIC_API_RETRIES) break;
      const delayMs = (2 ** attempt) * 1000 + Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Generate one short post, retrying the scorer up to `maxRetries` times if
 * the output contains banned words or fails quality heuristics. Each attempt
 * is recorded in the returned `attempts[]` so callers can display the loop.
 *
 * On first successful pass: saves to posts.json, updates memory.json, returns
 * `{ success: true, post, attempts }`. Never throws for "failed to pass after
 * N tries" — returns `{ success: false, error, attempts }` instead.
 *
 * Does NOT push to Blotato. Callers who need that should call syncDraft after.
 */
export async function generateShortPost(
  topic: string,
  options: { maxRetries?: number } = {},
): Promise<GenerateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "ANTHROPIC_API_KEY not set", attempts: [] };
  }
  const trimmed = topic?.trim();
  if (!trimmed) {
    return { success: false, error: "Topic is required", attempts: [] };
  }

  const maxRetries = options.maxRetries ?? 5;
  const client = new Anthropic();
  const memory = loadMemory();
  const attempts: GenerateAttempt[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let text: string;
    try {
      text = await callAnthropic(client, trimmed, memory);
    } catch (err) {
      return {
        success: false,
        error: `Anthropic error: ${(err as Error).message}`,
        attempts,
      };
    }
    const result = scorePost(text);
    attempts.push({
      attempt,
      text,
      score: result.score,
      pass: result.pass,
      flagged: result.flagged,
    });

    if (result.pass) {
      const saved = savePost(trimmed, text, result.score);
      memory.recentTopics.push(trimmed);
      memory.recentPosts.push(text);
      memory.totalGenerated++;
      saveMemory(memory);
      return { success: true, post: saved, attempts };
    }
  }

  return {
    success: false,
    error: `Failed to generate a passing post after ${maxRetries} attempts`,
    attempts,
  };
}
