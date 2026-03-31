/**
 * Memory Manager Extension
 *
 * Short-term: JSON file tracking recent topics, posts, and performance.
 * Prevents repetition and enables storytelling continuity.
 *
 * Long-term: Could be extended with LightRAG for semantic search
 * over historical content and marketing materials.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const MEMORY_FILE = "memory.json";
const MAX_SHORT_TERM = 50; // Keep last 50 entries

export interface ShortTermMemory {
  recentTopics: string[];
  recentPosts: Array<{
    text: string;
    topic: string;
    score: number;
    posted: boolean;
    date: string;
  }>;
  totalGenerated: number;
  totalPosted: number;
  lastPosted: string | null;
  topicFrequency: Record<string, number>;
  bestPerformingTopics: string[];  // Topics with lowest AI scores
  avoidsTopics: string[];          // Topics that consistently score high
}

export function loadMemory(): ShortTermMemory {
  if (!existsSync(MEMORY_FILE)) {
    return {
      recentTopics: [],
      recentPosts: [],
      totalGenerated: 0,
      totalPosted: 0,
      lastPosted: null,
      topicFrequency: {},
      bestPerformingTopics: [],
      avoidsTopics: [],
    };
  }
  return JSON.parse(readFileSync(MEMORY_FILE, "utf-8"));
}

export function saveMemory(memory: ShortTermMemory): void {
  // Trim to prevent bloat
  memory.recentTopics = memory.recentTopics.slice(-MAX_SHORT_TERM);
  memory.recentPosts = memory.recentPosts.slice(-MAX_SHORT_TERM);
  writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

export function recordGeneration(
  memory: ShortTermMemory,
  topic: string,
  text: string,
  score: number,
): void {
  memory.recentTopics.push(topic);
  memory.recentPosts.push({
    text,
    topic,
    score,
    posted: false,
    date: new Date().toISOString(),
  });
  memory.totalGenerated++;

  // Track topic frequency
  const normalizedTopic = topic.toLowerCase().trim();
  memory.topicFrequency[normalizedTopic] = (memory.topicFrequency[normalizedTopic] || 0) + 1;

  // Update best/worst topics
  updateTopicPerformance(memory);
}

export function recordPosted(memory: ShortTermMemory, text: string): void {
  memory.totalPosted++;
  memory.lastPosted = new Date().toISOString();

  const post = memory.recentPosts.find((p) => p.text === text);
  if (post) post.posted = true;
}

function updateTopicPerformance(memory: ShortTermMemory): void {
  const topicScores: Record<string, number[]> = {};

  for (const post of memory.recentPosts) {
    const t = post.topic.toLowerCase().trim();
    if (!topicScores[t]) topicScores[t] = [];
    topicScores[t].push(post.score);
  }

  const avgScores = Object.entries(topicScores).map(([topic, scores]) => ({
    topic,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
  }));

  avgScores.sort((a, b) => a.avg - b.avg);

  memory.bestPerformingTopics = avgScores.slice(0, 5).map((t) => t.topic);
  memory.avoidsTopics = avgScores.filter((t) => t.avg > 50).map((t) => t.topic);
}

/**
 * Check if a topic was posted recently (within last N posts).
 */
export function isTopicRecent(memory: ShortTermMemory, topic: string, windowSize = 5): boolean {
  const normalized = topic.toLowerCase().trim();
  const recent = memory.recentTopics.slice(-windowSize).map((t) => t.toLowerCase().trim());
  return recent.some((t) => t === normalized || t.includes(normalized) || normalized.includes(t));
}

/**
 * Get context string for the AI prompt to prevent repetition.
 */
export function getMemoryContext(memory: ShortTermMemory): string {
  if (memory.recentPosts.length === 0) return "";

  const recentTexts = memory.recentPosts
    .slice(-5)
    .map((p) => `- "${p.text}"`)
    .join("\n");

  let context = `\nRecent posts (DO NOT repeat similar ideas):\n${recentTexts}`;

  if (memory.avoidsTopics.length > 0) {
    context += `\n\nTopics that tend to sound AI-like (try a different angle): ${memory.avoidsTopics.join(", ")}`;
  }

  return context;
}

/**
 * Suggest topics based on what hasn't been covered recently.
 */
export function suggestTopics(memory: ShortTermMemory): string[] {
  const allTopics = [
    "aries compatibility", "taurus love style", "gemini dating",
    "cancer emotional needs", "leo relationship energy", "virgo partner standards",
    "libra balance in love", "scorpio intensity", "sagittarius freedom in dating",
    "capricorn long-term commitment", "aquarius unconventional love", "pisces soulmate search",
    "moon sign compatibility", "venus sign love language", "mercury communication style",
    "mars attraction", "rising sign first impressions", "synastry explained",
    "birth chart dating tips", "retrograde dating advice", "eclipse season love",
    "zodiac red flags", "zodiac green flags", "sign-specific date ideas",
  ];

  const recentNormalized = new Set(
    memory.recentTopics.slice(-10).map((t) => t.toLowerCase().trim())
  );

  return allTopics.filter((t) => !recentNormalized.has(t)).slice(0, 5);
}
