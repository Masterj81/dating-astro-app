import type { Experiment, ProductInput } from "@/types/strategy";

// generateExperiments — 5 concrete A/B tests prioritized for early-stage
// products. Each experiment names a hypothesis, two variants, and a
// metric. Variants reference the product's actual differentiator/pain
// so the experiments are usable, not abstract.

export function generateExperiments(input: ProductInput): Experiment[] {
  const name = input.name || "the product";
  const audience = input.audience || "users";
  const pain = input.audiencePain || "the core pain";
  const differentiator = input.differentiator || "the unique mechanism";
  const category = input.category || "the category";

  return [
    {
      hypothesis: `Naming the mechanism in the hero converts ${audience} better than naming the outcome.`,
      variantA: `Hero: outcome-led — "Less ${painSummary(pain)}. More signal. That is ${name}."`,
      variantB: `Hero: mechanism-led — "${capitalize(differentiator)} — not more ${category} noise."`,
      metric: `Hero → sign-up click rate over a 7-day window.`,
    },
    {
      hypothesis: `Concrete proof beats brand assertion for solution-aware ${audience}.`,
      variantA: `Subhead: brand assertion ("Built for ${audience}").`,
      variantB: `Subhead: concrete proof ("Used by ${audience} who tried 3 ${category} apps before ${name}").`,
      metric: `Scroll depth past the fold and CTA click rate.`,
    },
    {
      hypothesis: `Onboarding that surfaces ${differentiator} on screen one increases day-7 retention.`,
      variantA: `Onboarding starts with profile/account creation.`,
      variantB: `Onboarding starts with a ${shortDiff(differentiator)} step before any account work.`,
      metric: `Day-7 retention of new signups.`,
    },
    {
      hypothesis: `Calling out competitors by category, not by name, lifts trust without legal noise.`,
      variantA: `Copy: "Unlike most ${category} apps…"`,
      variantB: `Copy: "Unlike the ${category} hamster wheel…"`,
      metric: `Time-on-page and qualitative survey ("did this feel honest?").`,
    },
    {
      hypothesis: `CTA wording aligned with awareness stage outperforms a generic "Get started."`,
      variantA: `CTA: "Get started"`,
      variantB: `CTA: "Try ${name}"  /  "Start with ${name} today" for most-aware traffic`,
      metric: `Click-through on the primary CTA, segmented by traffic source.`,
    },
  ];
}

function painSummary(pain: string): string {
  return (pain || "").replace(/\.$/, "").toLowerCase();
}

function shortDiff(s: string): string {
  const cleaned = (s || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
