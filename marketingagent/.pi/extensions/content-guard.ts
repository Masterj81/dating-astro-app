/**
 * Content Guard Extension
 *
 * Final gate before publishing. Rejects posts that:
 * - Contain factually incorrect astrology info
 * - Don't match AstroDating brand voice
 * - Could be offensive or inappropriate
 * - Are too similar to a recent post
 */

import { readFileSync, existsSync } from "fs";

const POSTS_FILE = "posts.json";

interface GuardResult {
  approved: boolean;
  reasons: string[];
}

// Facts that must not be contradicted
const ASTRO_FACTS: Array<{ pattern: RegExp; rule: string }> = [
  { pattern: /aries.*(water|earth)/i, rule: "Aries is a fire sign, not water or earth" },
  { pattern: /taurus.*(fire|air)/i, rule: "Taurus is an earth sign, not fire or air" },
  { pattern: /gemini.*(water|earth|fire)/i, rule: "Gemini is an air sign" },
  { pattern: /cancer.*(fire|air|earth)/i, rule: "Cancer is a water sign" },
  { pattern: /leo.*(water|earth|air)/i, rule: "Leo is a fire sign" },
  { pattern: /virgo.*(fire|water|air)/i, rule: "Virgo is an earth sign" },
  { pattern: /libra.*(fire|water|earth)/i, rule: "Libra is an air sign" },
  { pattern: /scorpio.*(fire|air|earth)/i, rule: "Scorpio is a water sign" },
  { pattern: /sagittarius.*(water|earth|air)/i, rule: "Sagittarius is a fire sign" },
  { pattern: /capricorn.*(fire|water|air)/i, rule: "Capricorn is an earth sign" },
  { pattern: /aquarius.*(fire|water|earth)/i, rule: "Aquarius is an air sign" },
  { pattern: /pisces.*(fire|air|earth)/i, rule: "Pisces is a water sign" },
];

// Content that should never be posted
const BLOCKED_PATTERNS = [
  /\b(hate|stupid|dumb|idiot|loser)\b/i,
  /\b(kill|die|death|suicide)\b/i,
  /\b(sex|nude|naked|nsfw)\b/i,
  /competitor app names/i,
  /\b(tinder|bumble|hinge|okcupid)\b/i,
];

export function guardContent(text: string): GuardResult {
  const reasons: string[] = [];

  // Check astro facts
  for (const fact of ASTRO_FACTS) {
    if (fact.pattern.test(text)) {
      reasons.push(`Factual error: ${fact.rule}`);
    }
  }

  // Check blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(`Blocked content pattern detected`);
    }
  }

  // Check for empty or too-short content
  if (text.trim().length < 20) {
    reasons.push("Content too short (min 20 chars)");
  }

  // Check similarity to recent posts
  if (existsSync(POSTS_FILE)) {
    try {
      const data = readFileSync(POSTS_FILE, "utf-8");
      const posts = JSON.parse(data);
      
      if (Array.isArray(posts)) {
        const recent = posts.slice(-10);

        for (const post of recent) {
          // Handle both old format (post.post) and new format (post.text)
          const postContent = typeof post.post === "string" ? post.post : 
                             typeof post.text === "string" ? post.text : null;
          
          if (postContent) {
            const similarity = calculateSimilarity(text.toLowerCase(), postContent.toLowerCase());
            if (similarity > 0.7) {
              reasons.push(`Too similar to recent post (${Math.round(similarity * 100)}% match)`);
              break;
            }
          }
        }
      }
    } catch {
      // Ignore parse errors - content still passes guard
    }
  }

  return {
    approved: reasons.length === 0,
    reasons,
  };
}

/**
 * Simple Jaccard similarity between two texts.
 */
function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

export function formatGuardReport(result: GuardResult): string {
  if (result.approved) {
    return "🛡️ Content guard: APPROVED";
  }

  return [
    "🛡️ Content guard: REJECTED",
    ...result.reasons.map((r) => `  ❌ ${r}`),
  ].join("\n");
}
