import type {
  Angle,
  AwarenessLevel,
  ChannelFit,
  ProductInput,
} from "@/types/strategy";

// generateAngles — 5 distinct campaign angles drawn from inputs.
// Each angle is named, has a hook sentence, and a one-line rationale
// explaining when to use it. V2: angles also carry score, channelFit,
// awarenessStage, objectionAddressed, and a one-line why-it-could-work.

export function generateAngles(input: ProductInput): Angle[] {
  const name = input.name || "the product";
  const audience = input.audience || "users";
  const pain = input.audiencePain || "the frustration";
  const differentiator = input.differentiator || "our approach";
  const category = input.category || "this category";
  const goal = input.goal || "make progress";

  const base: Angle[] = [
    {
      name: "The honest contrast",
      hook: `${capitalize(category)} keeps selling more of the same. ${name} flips the script with ${differentiator}.`,
      rationale: `Works best for solution-aware ${audience} who already tried the obvious options and felt let down.`,
      channelFit: "Meta",
      awarenessStage: "solution-aware",
      objectionAddressed: `"Isn't this just another ${category}?"`,
      whyItCouldWork: `Names the category fatigue ${audience} already feel, then anchors ${name} to ${shortDiff(differentiator)} instead of another promise.`,
    },
    {
      name: "The painful status quo",
      hook: `Every week ${audience} spend on ${pain.toLowerCase()} is a week they could spend on ${goalNoun(goal)}.`,
      rationale: `Cost-of-inaction framing. Strong opener for cold traffic that hasn't seen ${name} yet.`,
      channelFit: "TikTok",
      awarenessStage: "problem-aware",
      objectionAddressed: `"My current setup is fine."`,
      whyItCouldWork: `Reframes ${pain.toLowerCase()} as ongoing cost, not a one-off annoyance — strongest hook when ${audience} haven't quantified the leak.`,
    },
    {
      name: "The mechanism reveal",
      hook: `The reason ${pain.toLowerCase()} never goes away: ${category} is solving the wrong layer. Here's what ${differentiator} actually fixes.`,
      rationale: `Best when the market is amplified or skeptical and bigger promises no longer convert.`,
      channelFit: "Landing",
      awarenessStage: "solution-aware",
      objectionAddressed: `"I've already tried ${category} apps and nothing changed."`,
      whyItCouldWork: `Moves the conversation from outcome ("better results") to method (${shortDiff(differentiator)}), which is what skeptical ${audience} ask for next.`,
    },
    {
      name: "The new identity",
      hook: `${capitalize(audience)} who use ${name} stop performing in ${category} and start being themselves.`,
      rationale: `Identity-driven angle for mature markets where features look the same and stance is the wedge.`,
      channelFit: "Meta",
      awarenessStage: "most-aware",
      objectionAddressed: `"Every ${category} brand sounds the same."`,
      whyItCouldWork: `Sells a stance, not a feature — works when ${audience} have feature-fatigue and pick on belonging instead of specs.`,
    },
    {
      name: "The small specific win",
      hook: `Open ${name}, set ${shortDiff(differentiator)} once, and your next decision in ${category} actually fits.`,
      rationale: `Concrete, low-friction angle. Use for retargeting and bottom-of-funnel placements.`,
      channelFit: "App Store",
      awarenessStage: "product-aware",
      objectionAddressed: `"Setting up another ${category} sounds exhausting."`,
      whyItCouldWork: `Trades a vague promise for a concrete first action ${audience} can imagine doing in under a minute.`,
    },
  ];

  return base.map((a) => ({ ...a, score: scoreAngle(a, input) }));
}

// rankAngles — orders an array of angles by score descending. Pure;
// preserves the input array. Ties broken by original order.
export function rankAngles(angles: Angle[]): Angle[] {
  return angles
    .map((a, i) => ({ a, i }))
    .sort((x, y) => {
      const sx = x.a.score ?? 0;
      const sy = y.a.score ?? 0;
      if (sy !== sx) return sy - sx;
      return x.i - y.i;
    })
    .map(({ a }) => a);
}

// scoreAngle — deterministic 0-100 score that rewards:
//  - alignment with the user's stated awareness level
//  - alignment with sophistication (mechanism reveal for amplified/skeptical,
//    identity for mature, painful status quo for fresh/simple)
//  - hooks that actually reference the audience and the differentiator
//  - hooks of a reasonable length (not too long, not too vague)
export function scoreAngle(angle: Angle, input: ProductInput): number {
  let score = 60; // baseline
  const text = `${angle.hook} ${angle.rationale}`.toLowerCase();

  // Awareness alignment
  if (angle.awarenessStage && angle.awarenessStage === input.awareness) {
    score += 15;
  } else if (adjacentAwareness(angle.awarenessStage, input.awareness)) {
    score += 7;
  }

  // Sophistication alignment
  const soph = input.sophistication;
  if (soph === "amplified-claims" || soph === "skeptical-market") {
    if (angle.name === "The mechanism reveal") score += 10;
  }
  if (soph === "mature-market") {
    if (angle.name === "The new identity") score += 10;
  }
  if (soph === "fresh-market" || soph === "simple-claims") {
    if (angle.name === "The painful status quo") score += 8;
  }

  // Concreteness: hook should mention either differentiator or audience
  const diff = (input.differentiator || "").toLowerCase();
  const aud = (input.audience || "").toLowerCase();
  if (diff && text.includes(diff.split(/\s+/).slice(0, 3).join(" "))) {
    score += 5;
  }
  if (aud && text.includes(aud.split(/\s+/).slice(0, 3).join(" "))) {
    score += 5;
  }

  // Length penalty: extremely long hooks lose points
  const words = angle.hook.split(/\s+/).length;
  if (words > 40) score -= 8;
  if (words < 8) score -= 4;

  // Clamp
  return Math.max(0, Math.min(100, Math.round(score)));
}

function adjacentAwareness(
  a: AwarenessLevel | undefined,
  b: AwarenessLevel
): boolean {
  if (!a) return false;
  const order: AwarenessLevel[] = [
    "unaware",
    "problem-aware",
    "solution-aware",
    "product-aware",
    "most-aware",
  ];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return Math.abs(ai - bi) === 1;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function shortDiff(diff: string): string {
  const cleaned = (diff || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 5) return cleaned;
  return words.slice(0, 5).join(" ");
}

function goalNoun(goal: string): string {
  const g = (goal || "").trim().toLowerCase();
  if (!g) return "the goal that actually matters";
  if (/^(get|make|find|build|grow|reach|launch)\b/.test(g)) {
    return g.replace(/^(get|make|find|build|grow|reach|launch)\s+/, "");
  }
  return g;
}

// Re-export channel list for UI consumers.
export const CHANNEL_FITS: ChannelFit[] = [
  "TikTok",
  "Meta",
  "Landing",
  "App Store",
  "Email",
];
