/**
 * Post scoring — detects AI-generated patterns on a 0-100 scale.
 *
 * - scorePost(text)       — short social posts (<= 280 chars). Pass threshold 20.
 * - scoreViralPost(text)  — long-form Facebook viral posts (hook + bullets + story).
 *
 * Extracted from agent.ts so tests can import the pure functions without
 * triggering the CLI's main() at module load.
 */

import { CORE_BANNED_WORDS, BANNED_WORDS_VIRAL } from "./constants.js";

export interface ScoreResult {
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

export function scorePost(text: string): ScoreResult {
  const lower = text.toLowerCase();
  const flagged = CORE_BANNED_WORDS.filter((w) => lower.includes(w));

  let score = 0;

  // Banned words: 20 pts each
  score += flagged.length * 20;

  // Sentence variety: penalize if all sentences are similar length
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgLen = sentences.reduce((sum, s) => sum + s.length, 0) / Math.max(sentences.length, 1);
  const variance = sentences.reduce((sum, s) => sum + Math.abs(s.length - avgLen), 0) / Math.max(sentences.length, 1);
  const sentenceVariety = variance < 10 ? 15 : 0;
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

export function scoreViralPost(text: string): ScoreResult {
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
