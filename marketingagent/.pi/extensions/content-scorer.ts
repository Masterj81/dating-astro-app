/**
 * Content Scorer Extension
 *
 * Multi-dimensional scoring system that catches AI-generated patterns.
 * Score 0 = perfectly human, 100 = obvious AI slop.
 * Posts must score < 20 to pass.
 */

const BANNED_WORDS = [
  // Classic AI-speak
  "delve", "tapestry", "unleash", "game-changer", "game changer",
  "revolutionary", "groundbreaking", "realm", "landscape", "paradigm",
  "synergy", "leverage", "elevate", "foster", "embark", "navigate",
  "robust", "seamless", "holistic", "cutting-edge", "cutting edge",
  // Filler phrases
  "in today's world", "it's worth noting", "in conclusion",
  "furthermore", "moreover", "comprehensive", "multifaceted",
  "pivotal", "transformative", "harness", "empower", "streamline",
  // Overly polished
  "curate", "resonate", "align", "optimize", "ecosystem",
  "deep dive", "double down", "circle back", "move the needle",
  "at the end of the day", "it goes without saying",
];

const FILLER_PATTERNS = [
  /^(in a world|imagine a|picture this|let's talk about)/i,
  /^(here's the thing|the truth is|fun fact)/i,
  /(and that's|and honestly|and frankly) (okay|fine|beautiful|amazing)/i,
  /!(\.{3}|!!+)/,  // Excessive punctuation
];

export interface ScoreBreakdown {
  total: number;
  pass: boolean;
  components: {
    bannedWords: { score: number; flagged: string[] };
    fillerPatterns: { score: number; matched: string[] };
    sentenceVariety: { score: number; detail: string };
    length: { score: number; charCount: number };
    openingPattern: { score: number; detail: string };
    emojiOveruse: { score: number; count: number };
    exclamationOveruse: { score: number; count: number };
  };
}

export function scoreContent(text: string): ScoreBreakdown {
  const lower = text.toLowerCase();

  // 1. Banned words (20 pts each, max 60)
  const flaggedWords = BANNED_WORDS.filter((w) => lower.includes(w));
  const bannedScore = Math.min(flaggedWords.length * 20, 60);

  // 2. Filler patterns (15 pts each, max 30)
  const matchedPatterns = FILLER_PATTERNS
    .filter((p) => p.test(text))
    .map((p) => p.source);
  const fillerScore = Math.min(matchedPatterns.length * 15, 30);

  // 3. Sentence variety (0-15 pts)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const lengths = sentences.map((s) => s.trim().length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  const variance = lengths.reduce((sum, l) => sum + Math.abs(l - avgLen), 0) / Math.max(lengths.length, 1);
  const varietyScore = variance < 8 ? 15 : variance < 15 ? 5 : 0;
  const varietyDetail = `avg=${Math.round(avgLen)}, variance=${Math.round(variance)}`;

  // 4. Length (0-10 pts)
  const charCount = text.length;
  const lengthScore = charCount > 300 ? 10 : charCount > 280 ? 5 : 0;

  // 5. Opening pattern (0-10 pts)
  const startsAI = /^(I |We |Our |In |The |This |It |Are you |Do you |Have you )/.test(text.trim());
  const openingScore = startsAI ? 10 : 0;
  const openingDetail = startsAI ? `Starts with: "${text.slice(0, 15)}..."` : "Good opening";

  // 6. Emoji overuse (0-10 pts)
  const emojiCount = (text.match(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
  const emojiScore = emojiCount > 3 ? 10 : emojiCount > 2 ? 5 : 0;

  // 7. Exclamation overuse (0-10 pts)
  const exclamationCount = (text.match(/!/g) || []).length;
  const exclamationScore = exclamationCount > 2 ? 10 : exclamationCount > 1 ? 3 : 0;

  const total = Math.min(
    bannedScore + fillerScore + varietyScore + lengthScore + openingScore + emojiScore + exclamationScore,
    100
  );

  return {
    total,
    pass: total < 20 && flaggedWords.length === 0,
    components: {
      bannedWords: { score: bannedScore, flagged: flaggedWords },
      fillerPatterns: { score: fillerScore, matched: matchedPatterns },
      sentenceVariety: { score: varietyScore, detail: varietyDetail },
      length: { score: lengthScore, charCount },
      openingPattern: { score: openingScore, detail: openingDetail },
      emojiOveruse: { score: emojiScore, count: emojiCount },
      exclamationOveruse: { score: exclamationScore, count: exclamationCount },
    },
  };
}

export function formatScoreReport(breakdown: ScoreBreakdown): string {
  const lines = [`Score: ${breakdown.total}/100 ${breakdown.pass ? "✅ PASS" : "❌ FAIL"}`];

  const c = breakdown.components;
  if (c.bannedWords.score > 0) lines.push(`  ❌ Banned words (${c.bannedWords.score}pts): ${c.bannedWords.flagged.join(", ")}`);
  if (c.fillerPatterns.score > 0) lines.push(`  ❌ Filler patterns (${c.fillerPatterns.score}pts)`);
  if (c.sentenceVariety.score > 0) lines.push(`  ⚠️ Low sentence variety (${c.sentenceVariety.score}pts): ${c.sentenceVariety.detail}`);
  if (c.length.score > 0) lines.push(`  ⚠️ Too long (${c.length.score}pts): ${c.length.charCount} chars`);
  if (c.openingPattern.score > 0) lines.push(`  ⚠️ AI opening (${c.openingPattern.score}pts): ${c.openingPattern.detail}`);
  if (c.emojiOveruse.score > 0) lines.push(`  ⚠️ Too many emojis (${c.emojiOveruse.score}pts): ${c.emojiOveruse.count} found`);
  if (c.exclamationOveruse.score > 0) lines.push(`  ⚠️ Exclamation overuse (${c.exclamationOveruse.score}pts): ${c.exclamationOveruse.count} found`);

  if (breakdown.pass) lines.push("  ✅ All checks passed");

  return lines.join("\n");
}
