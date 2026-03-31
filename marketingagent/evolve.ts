import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, execSync } from "child_process";
import { readFileSync as readFS, writeFileSync as writeFS, existsSync as existsFS } from "fs";

/**
 * Writing Evolution Engine
 *
 * Runs N iterations of content generation, scoring each against
 * quality benchmarks. If a new prompt produces better results,
 * it's kept. If not, it reverts via git.
 *
 * Usage:
 *   npm run evolve -- <iterations> "<topic>"
 *   npm run evolve -- 100 "zodiac compatibility"
 *   npm run evolve -- 500 "moon sign dating"
 */

// ── Config ──
const EVOLUTION_FILE = "evolution-state.json";
const DEFAULT_ITERATIONS = 50;

const BANNED_WORDS = [
  "delve", "tapestry", "unleash", "game-changer", "game changer",
  "revolutionary", "groundbreaking", "realm", "landscape", "paradigm",
  "synergy", "leverage", "elevate", "foster", "embark", "navigate",
  "robust", "seamless", "holistic", "cutting-edge", "cutting edge",
  "in today's world", "it's worth noting", "in conclusion",
  "furthermore", "moreover", "comprehensive", "multifaceted",
  "pivotal", "transformative", "harness", "empower", "streamline",
  "curate", "resonate", "align", "optimize", "ecosystem",
  "deep dive", "double down", "circle back",
];

// ── Types ──
interface EvolutionRule {
  instruction: string;
  weight: number; // How much this rule helps (positive = good)
  uses: number;
  totalScore: number;
}

interface EvolutionState {
  iteration: number;
  bestScore: number;
  bestText: string;
  rules: EvolutionRule[];
  promptTemplate: string;
  history: Array<{
    iteration: number;
    score: number;
    kept: boolean;
    rulesUsed: string[];
  }>;
  stats: {
    totalKept: number;
    totalRejected: number;
    avgScore: number;
    bestEver: number;
    worstKept: number;
  };
}

// ── Scorer ──
function scoreText(text: string): { score: number; details: string[] } {
  const lower = text.toLowerCase();
  const details: string[] = [];
  let score = 0;

  // Banned words (20 pts each)
  const flagged = BANNED_WORDS.filter((w) => lower.includes(w));
  if (flagged.length > 0) {
    score += flagged.length * 20;
    details.push(`Banned: ${flagged.join(", ")}`);
  }

  // Sentence variety
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const lengths = sentences.map((s) => s.trim().length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / Math.max(lengths.length, 1);
  const variance = lengths.reduce((s, l) => s + Math.abs(l - avgLen), 0) / Math.max(lengths.length, 1);
  if (variance < 8) { score += 15; details.push("Low sentence variety"); }

  // AI opening patterns
  if (/^(I |We |Our |In |The |This |It |Are you |Do you )/.test(text.trim())) {
    score += 10;
    details.push("AI-like opening");
  }

  // Length
  if (text.length > 300) { score += 10; details.push(`Too long: ${text.length} chars`); }
  if (text.length < 30) { score += 10; details.push(`Too short: ${text.length} chars`); }

  // Emoji count
  const emojis = (text.match(/[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
  if (emojis > 3) { score += 10; details.push(`Too many emojis: ${emojis}`); }

  // Exclamation overuse
  const excl = (text.match(/!/g) || []).length;
  if (excl > 2) { score += 8; details.push(`Exclamation overuse: ${excl}`); }

  // Filler patterns
  if (/^(in a world|imagine a|picture this|let's talk|here's the thing)/i.test(text)) {
    score += 15;
    details.push("Filler opening pattern");
  }

  return { score: Math.min(score, 100), details };
}

// ── Evolution State ──
function loadState(): EvolutionState {
  if (existsFS(EVOLUTION_FILE)) {
    return JSON.parse(readFS(EVOLUTION_FILE, "utf-8"));
  }
  return {
    iteration: 0,
    bestScore: 100,
    bestText: "",
    rules: getDefaultRules(),
    promptTemplate: "",
    history: [],
    stats: { totalKept: 0, totalRejected: 0, avgScore: 50, bestEver: 100, worstKept: 0 },
  };
}

function saveState(state: EvolutionState): void {
  // Trim history to last 200
  if (state.history.length > 200) state.history = state.history.slice(-200);
  writeFS(EVOLUTION_FILE, JSON.stringify(state, null, 2));
}

function getDefaultRules(): EvolutionRule[] {
  return [
    { instruction: "Use short sentences mixed with longer ones for rhythm", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Start with a question or bold claim, never 'I' or 'We'", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Include one specific zodiac sign, planet, or aspect", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "End with something the reader wants to reply to", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Use contractions like a real person (don't, won't, you're)", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Take an opinionated stance, don't hedge", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Reference a real dating scenario, not abstract concepts", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Keep under 200 characters if possible", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Use one unexpected comparison or metaphor", weight: 0, uses: 0, totalScore: 0 },
    { instruction: "Sound like you're texting a friend, not writing an ad", weight: 0, uses: 0, totalScore: 0 },
  ];
}

// ── Rule Selection ──
function selectRules(rules: EvolutionRule[], count: number): EvolutionRule[] {
  // Sort by weight (best performing first), then pick top N with some randomness
  const sorted = [...rules].sort((a, b) => {
    const aAvg = a.uses > 0 ? a.totalScore / a.uses : 50;
    const bAvg = b.uses > 0 ? b.totalScore / b.uses : 50;
    return aAvg - bAvg; // Lower score = better
  });

  // Take top performers + 1-2 random ones for exploration
  const top = sorted.slice(0, count - 1);
  const rest = sorted.slice(count - 1);
  const random = rest.length > 0 ? [rest[Math.floor(Math.random() * rest.length)]] : [];

  return [...top, ...random];
}

function mutateRules(state: EvolutionState): void {
  // Every 50 iterations, try adding a new rule based on patterns
  if (state.iteration % 50 !== 0 || state.iteration === 0) return;

  const newRuleIdeas = [
    "Use a dash — for dramatic pauses",
    "Ask a rhetorical question that hits home",
    "Name a specific zodiac pairing (not just one sign)",
    "Use lowercase for casual energy",
    "Reference a specific planet placement (Venus in Scorpio, etc.)",
    "Make it sound like gossip about the zodiac",
    "Use 'your' to make it personal",
    "Keep it to one sentence only",
    "Start with an emoji",
    "Use a '...' for suspense",
    "Mention a specific dating scenario (first date, texting, ghosting)",
    "Sound slightly chaotic or unhinged (in a fun way)",
  ];

  // Add one that doesn't exist yet
  const existing = new Set(state.rules.map((r) => r.instruction));
  const fresh = newRuleIdeas.filter((r) => !existing.has(r));
  if (fresh.length > 0) {
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    state.rules.push({ instruction: pick, weight: 0, uses: 0, totalScore: 0 });
    console.log(`   🧬 Mutation: added new rule "${pick}"`);
  }

  // Remove worst performing rule if we have too many (>15)
  if (state.rules.length > 15) {
    const worst = state.rules
      .filter((r) => r.uses >= 5)
      .sort((a, b) => {
        const aAvg = a.totalScore / a.uses;
        const bAvg = b.totalScore / b.uses;
        return bAvg - aAvg; // Highest avg score = worst
      })[0];

    if (worst) {
      state.rules = state.rules.filter((r) => r !== worst);
      console.log(`   🗑️ Removed underperforming rule: "${worst.instruction}"`);
    }
  }
}

// ── Generation ──
async function generateWithRules(
  client: Anthropic,
  topic: string,
  rules: EvolutionRule[],
): Promise<string> {
  const rulesText = rules.map((r) => `- ${r.instruction}`).join("\n");

  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `You are a social media copywriter for AstroDating — a dating app using real birth chart astrology.

Write ONE short social media post (max 280 chars) about: "${topic}"

Writing rules (follow these carefully):
${rulesText}

Content rules:
- Sound human, not corporate or AI
- 1-2 emojis max, no hashtags
- Be specific to astrology and dating
- NEVER use: ${BANNED_WORDS.slice(0, 15).join(", ")}

Post:`,
    }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Unexpected response");
  return block.text.trim().replace(/^["']|["']$/g, "");
}

// ── Main Evolution Loop ──
async function main() {
  const iterations = parseInt(process.argv[2]) || DEFAULT_ITERATIONS;
  const topic = process.argv[3];

  if (!topic) {
    console.error('Usage: npm run evolve -- <iterations> "<topic>"');
    console.error('Example: npm run evolve -- 100 "zodiac compatibility"');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: Set ANTHROPIC_API_KEY in .env");
    process.exit(1);
  }

  const client = new Anthropic();
  const state = loadState();

  console.log(`\n🧬 WRITING EVOLUTION ENGINE`);
  console.log(`   Topic: "${topic}"`);
  console.log(`   Iterations: ${iterations}`);
  console.log(`   Starting from iteration: ${state.iteration}`);
  console.log(`   Current best score: ${state.bestScore}/100`);
  console.log(`   Rules pool: ${state.rules.length}\n`);

  let consecutiveGood = 0;

  for (let i = 0; i < iterations; i++) {
    const iterNum = state.iteration + 1;

    // Select rules for this iteration
    const selectedRules = selectRules(state.rules, 5);
    const ruleNames = selectedRules.map((r) => r.instruction);

    // Generate
    let text: string;
    try {
      text = await generateWithRules(client, topic, selectedRules);
    } catch (err) {
      console.error(`   ⚠️ Generation error, skipping: ${(err as Error).message}`);
      continue;
    }

    // Score
    const { score, details } = scoreText(text);

    // Update rule stats
    for (const rule of selectedRules) {
      rule.uses++;
      rule.totalScore += score;
    }

    // Decision: keep or reject
    const kept = score < state.bestScore || (score === state.bestScore && text.length < state.bestText.length);

    if (kept) {
      state.bestScore = score;
      state.bestText = text;
      state.stats.totalKept++;
      if (score < state.stats.bestEver) state.stats.bestEver = score;
      consecutiveGood++;
    } else {
      state.stats.totalRejected++;
      consecutiveGood = 0;
    }

    state.iteration = iterNum;
    state.history.push({ iteration: iterNum, score, kept, rulesUsed: ruleNames });

    // Update avg score
    const recentScores = state.history.slice(-50).map((h) => h.score);
    state.stats.avgScore = Math.round(recentScores.reduce((a, b) => a + b, 0) / recentScores.length);

    // Mutate rules periodically
    mutateRules(state);

    // Log progress
    const icon = kept ? "✅" : "·";
    const scoreStr = String(score).padStart(3);
    const detailStr = details.length > 0 ? ` [${details[0]}]` : "";

    if (kept || i % 10 === 0) {
      console.log(`${icon} #${String(iterNum).padStart(4)} score:${scoreStr} best:${state.bestScore} avg:${state.stats.avgScore}${kept ? ` "${text.slice(0, 50)}..."` : ""}${detailStr}`);
    }

    // Save periodically
    if (i % 10 === 0) saveState(state);

    // Small delay to avoid API rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  // Final save
  saveState(state);

  // Summary
  console.log(`\n${"─".repeat(60)}`);
  console.log(`🏆 EVOLUTION COMPLETE`);
  console.log(`   Iterations: ${state.iteration}`);
  console.log(`   Best score: ${state.stats.bestEver}/100`);
  console.log(`   Average score: ${state.stats.avgScore}/100`);
  console.log(`   Kept: ${state.stats.totalKept} / Rejected: ${state.stats.totalRejected}`);
  console.log(`   Keep rate: ${Math.round((state.stats.totalKept / (state.stats.totalKept + state.stats.totalRejected)) * 100)}%`);
  console.log(`\n   📝 Best post:`);
  console.log(`   "${state.bestText}"\n`);

  // Show rule performance
  console.log(`   📊 Rule performance (lower avg = better):`);
  const ranked = [...state.rules]
    .filter((r) => r.uses >= 3)
    .sort((a, b) => (a.totalScore / a.uses) - (b.totalScore / b.uses));

  for (const rule of ranked.slice(0, 8)) {
    const avg = Math.round(rule.totalScore / rule.uses);
    const bar = "█".repeat(Math.max(1, Math.round((100 - avg) / 10)));
    console.log(`   ${bar} ${avg}/100 (${rule.uses}x) ${rule.instruction}`);
  }
}

main();
