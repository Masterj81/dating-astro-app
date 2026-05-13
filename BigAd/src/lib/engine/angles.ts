import type { Angle, ProductInput } from "@/types/strategy";

// generateAngles — 5 distinct campaign angles drawn from inputs.
// Each angle is named, has a hook sentence, and a one-line rationale
// explaining when to use it.

export function generateAngles(input: ProductInput): Angle[] {
  const name = input.name || "the product";
  const audience = input.audience || "users";
  const pain = input.audiencePain || "the frustration";
  const differentiator = input.differentiator || "our approach";
  const category = input.category || "this category";
  const goal = input.goal || "make progress";

  return [
    {
      name: "The honest contrast",
      hook: `${capitalize(category)} keeps selling more of the same. ${name} flips the script with ${differentiator}.`,
      rationale: `Works best for solution-aware ${audience} who already tried the obvious options and felt let down.`,
    },
    {
      name: "The painful status quo",
      hook: `Every week ${audience} spend on ${pain.toLowerCase()} is a week they could spend on ${goalNoun(goal)}.`,
      rationale: `Cost-of-inaction framing. Strong opener for cold traffic that hasn't seen ${name} yet.`,
    },
    {
      name: "The mechanism reveal",
      hook: `The reason ${pain.toLowerCase()} never goes away: ${category} is solving the wrong layer. Here's what ${differentiator} actually fixes.`,
      rationale: `Best when the market is amplified or skeptical and bigger promises no longer convert.`,
    },
    {
      name: "The new identity",
      hook: `${capitalize(audience)} who use ${name} stop performing in ${category} and start being themselves.`,
      rationale: `Identity-driven angle for mature markets where features look the same and stance is the wedge.`,
    },
    {
      name: "The small specific win",
      hook: `Open ${name}, set ${differentiator.split(" ").slice(0, 4).join(" ")} once, and your next decision in ${category} actually fits.`,
      rationale: `Concrete, low-friction angle. Use for retargeting and bottom-of-funnel placements.`,
    },
  ];
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function goalNoun(goal: string): string {
  const g = (goal || "").trim().toLowerCase();
  if (!g) return "the goal that actually matters";
  if (/^(get|make|find|build|grow|reach|launch)\b/.test(g)) {
    return g.replace(/^(get|make|find|build|grow|reach|launch)\s+/, "");
  }
  return g;
}
