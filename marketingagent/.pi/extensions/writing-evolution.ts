/**
 * Writing Evolution Extension
 *
 * Iteratively improves content by:
 * 1. Generating a draft
 * 2. Scoring it against quality benchmarks
 * 3. If score improves, keep the new version
 * 4. If not, revert to previous best
 * 5. Repeat for N iterations
 *
 * The system prompt evolves based on what works:
 * - Tracks which instructions produce lower AI scores
 * - Adds successful patterns to future prompts
 * - Removes instructions that don't help
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

const EVOLUTION_FILE = "evolution-state.json";

interface EvolutionRule {
  instruction: string;
  addedAt: number;      // iteration when added
  avgScoreWith: number; // average score when this rule is active
  avgScoreWithout: number; // average score without it
  active: boolean;
}

interface EvolutionState {
  iteration: number;
  bestPrompt: string;
  bestScore: number;
  rules: EvolutionRule[];
  history: Array<{
    iteration: number;
    score: number;
    kept: boolean;
    text: string;
  }>;
}

const DEFAULT_RULES: EvolutionRule[] = [
  { instruction: "Use short sentences mixed with longer ones", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
  { instruction: "Start with a question or bold statement, not 'I' or 'We'", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
  { instruction: "Include one specific astrology detail (a sign, planet, or aspect)", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
  { instruction: "End with something the reader wants to respond to", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
  { instruction: "Use contractions (don't, won't, you're) like a real person", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
  { instruction: "Be opinionated — take a stance, don't hedge", addedAt: 0, avgScoreWith: 50, avgScoreWithout: 50, active: true },
];

export function loadEvolution(): EvolutionState {
  if (!existsSync(EVOLUTION_FILE)) {
    return {
      iteration: 0,
      bestPrompt: "",
      bestScore: 100,
      rules: [...DEFAULT_RULES],
      history: [],
    };
  }
  return JSON.parse(readFileSync(EVOLUTION_FILE, "utf-8"));
}

export function saveEvolution(state: EvolutionState): void {
  writeFileSync(EVOLUTION_FILE, JSON.stringify(state, null, 2));
}

export function getActiveRules(state: EvolutionState): string {
  return state.rules
    .filter((r) => r.active)
    .map((r) => `- ${r.instruction}`)
    .join("\n");
}

export function recordResult(
  state: EvolutionState,
  score: number,
  text: string,
  kept: boolean,
): void {
  state.iteration++;
  state.history.push({ iteration: state.iteration, score, kept, text });

  // Keep history manageable
  if (state.history.length > 500) {
    state.history = state.history.slice(-200);
  }

  if (kept && score < state.bestScore) {
    state.bestScore = score;
  }

  // Update rule effectiveness every 10 iterations
  if (state.iteration % 10 === 0) {
    evolveRules(state);
  }
}

function evolveRules(state: EvolutionState): void {
  const recent = state.history.slice(-50);
  if (recent.length < 10) return;

  const avgScore = recent.reduce((sum, h) => sum + h.score, 0) / recent.length;

  // Deactivate rules that aren't helping (score not improving)
  for (const rule of state.rules) {
    if (rule.active && rule.avgScoreWith > avgScore + 10) {
      rule.active = false;
    }
  }

  // Introduce a new rule based on patterns in successful posts
  const successful = recent.filter((h) => h.kept && h.score < 15);
  if (successful.length >= 3) {
    const avgLength = successful.reduce((sum, h) => sum + h.text.length, 0) / successful.length;

    if (avgLength < 150 && !state.rules.some((r) => r.instruction.includes("under 150"))) {
      state.rules.push({
        instruction: "Keep it under 150 characters when possible",
        addedAt: state.iteration,
        avgScoreWith: 0,
        avgScoreWithout: avgScore,
        active: true,
      });
    }
  }
}

export function buildEvolvingPrompt(topic: string, rules: string, memory: string): string {
  return `You are a social media copywriter for AstroDating — a dating app using real birth chart astrology.

Write ONE short social media post (max 280 chars) about: "${topic}"

Writing rules (evolved from ${rules ? "testing" : "defaults"}):
${rules}

Content rules:
- Sound human, not corporate or AI-generated
- 1-2 emojis max, no hashtags
- Be specific to astrology and dating
${memory}

Post:`;
}
