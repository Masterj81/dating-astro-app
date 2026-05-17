import type {
  AwarenessLevel,
  AwarenessVariant,
  ProductInput,
} from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";
import type { CopyLabels } from "./copy-normalize";

// generateAwarenessVariants — for every awareness stage, produce
// one headline, one short ad hook, and one landing-section angle.
// All five stages always come back, regardless of the input's
// current awareness level.

const STAGES: AwarenessLevel[] = [
  "unaware",
  "problem-aware",
  "solution-aware",
  "product-aware",
  "most-aware",
];

export function generateAwarenessVariants(
  input: ProductInput,
  labels?: CopyLabels
): AwarenessVariant[] {
  const L = labels ?? deriveCopyLabels(input, []);
  return STAGES.map((stage) => variantFor(stage, input, L));
}

function variantFor(
  stage: AwarenessLevel,
  input: ProductInput,
  L: CopyLabels
): AwarenessVariant {
  const name = input.name || "the product";

  switch (stage) {
    case "unaware":
      return {
        stage,
        headline: `${capitalize(L.audienceLabel)} keep telling themselves "${L.painLabel}" is normal. It isn't — it's how ${L.categoryLabel} is built.`,
        adHook: `Three quiet signs ${L.categoryLabel} is wasting your week (most ${L.audienceLabel.toLowerCase()} miss number 2).`,
        landingAngle: `Open the page with a story or stat that names ${L.painLabel} from the inside. Do not mention ${name} above the fold. Earn the right to introduce it.`,
      };
    case "problem-aware":
      return {
        stage,
        headline: `If ${L.painLabel} is eating your week, ${L.categoryLabel} isn't broken — it's solving the wrong layer.`,
        adHook: `Why ${L.audienceLabel.toLowerCase()} keep ending up with ${L.painLabel} no matter which ${L.categoryLabel} they pick.`,
        landingAngle: `Validate the pain in the first scroll. Then list three workarounds ${L.audienceLabel.toLowerCase()} already tried (and why each fails) before introducing ${L.mechanismLabel}.`,
      };
    case "solution-aware":
      return {
        stage,
        headline: `${capitalize(L.categoryLabel)}, rebuilt around ${L.mechanismLabel} — for ${L.audienceLabel.toLowerCase()} done with ${L.painLabel}.`,
        adHook: `The reason ${L.painLabel} comes back: ${L.categoryLabel} keeps optimising the surface. Here's the layer ${name} works on instead.`,
        landingAngle: `Lead with category-vs-category comparison. Show why ${L.competitorLabel} under-deliver on ${L.painLabel}, then position ${name} as a different category, not a better feature list.`,
      };
    case "product-aware":
      return {
        stage,
        headline: `Still deciding between ${name} and ${L.competitorLabel}? Here's what only ${name} ships: ${L.mechanismLabel}.`,
        adHook: `${capitalize(name)} vs ${L.competitorLabel} — the one trade-off worth knowing before you sign up.`,
        landingAngle: `Stack the unique mechanism, proof, and risk-reversal in the first viewport. Address the comparison head-on: name the trade-off and explain how ${name} resolves it.`,
      };
    case "most-aware":
      return {
        stage,
        headline: `Start with ${name} today and ship the ${L.outcomeLabel} you came here for.`,
        adHook: `${capitalize(name)} — ${L.offerLabel}. ${capitalize(L.mechanismLabel)}, made for ${L.audienceLabel.toLowerCase()}. Open it now.`,
        landingAngle: `Offer-led. Stack value above the fold, remove risk (free tier, cancel anytime, no card up front if true), and put the CTA above the scroll.`,
      };
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
