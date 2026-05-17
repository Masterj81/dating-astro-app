import type { Experiment, ProductInput } from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";
import type { CopyLabels } from "./copy-normalize";

// generateExperiments — 5 concrete A/B tests prioritised for early-stage
// products. Each experiment names a hypothesis, two variants, and a
// metric. Variants now reference normalised labels so the output never
// dumps the full audience sentence or trails into an ellipsis.

export function generateExperiments(
  input: ProductInput,
  labels?: CopyLabels
): Experiment[] {
  const L = labels ?? deriveCopyLabels(input, []);
  const name = input.name || "the product";

  return [
    {
      hypothesis: `Naming the mechanism in the hero converts ${L.audienceLabel.toLowerCase()} better than naming the outcome.`,
      variantA: `Hero: outcome-led — "Less ${L.painLabel}. More ${L.outcomeLabel}. That is ${name}."`,
      variantB: `Hero: mechanism-led — "${capitalize(L.mechanismLabel)} — not more ${L.categoryLabel} noise."`,
      metric: `Hero → sign-up click rate over a 7-day window.`,
    },
    {
      hypothesis: `Concrete proof beats brand assertion for solution-aware ${L.audienceLabel.toLowerCase()}.`,
      variantA: `Subhead: brand assertion ("Built for ${L.audienceLabel.toLowerCase()}").`,
      variantB: `Subhead: concrete proof ("Used by ${L.audienceLabel.toLowerCase()} who tried 3 ${L.categoryLabel} apps before ${name}").`,
      metric: `Scroll depth past the fold and CTA click rate.`,
    },
    {
      hypothesis: `Onboarding that surfaces ${L.mechanismLabel} on screen one increases day-7 retention.`,
      variantA: `Onboarding starts with profile/account creation.`,
      variantB: `Onboarding starts with a ${L.mechanismLabel} step before any account work.`,
      metric: `Day-7 retention of new signups.`,
    },
    {
      hypothesis: `Calling out competitors by category, not by name, lifts trust without legal noise.`,
      variantA: `Copy: "Unlike ${L.competitorLabel}"`,
      variantB: `Copy: "Unlike the ${L.categoryLabel} hamster wheel"`,
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

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
