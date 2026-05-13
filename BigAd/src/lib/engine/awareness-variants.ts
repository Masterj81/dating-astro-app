import type {
  AwarenessLevel,
  AwarenessVariant,
  ProductInput,
} from "@/types/strategy";

// generateAwarenessVariants — for every awareness stage, produce
// one headline, one short ad hook, and one landing-section angle.
// All five stages always come back, regardless of the input's
// current awareness level. The user can use this to plan a funnel:
// the same product, copy adapted to where the prospect is.

const STAGES: AwarenessLevel[] = [
  "unaware",
  "problem-aware",
  "solution-aware",
  "product-aware",
  "most-aware",
];

export function generateAwarenessVariants(
  input: ProductInput
): AwarenessVariant[] {
  return STAGES.map((stage) => variantFor(stage, input));
}

function variantFor(stage: AwarenessLevel, input: ProductInput): AwarenessVariant {
  const name = input.name || "the product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "this frustration";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";
  const goal = input.goal || "make real progress";

  const painLow = (pain || "").replace(/\.$/, "").toLowerCase();
  const diffShort = shortDiff(differentiator);

  switch (stage) {
    case "unaware":
      return {
        stage,
        headline: `${capitalize(audience)} keep telling themselves "${painLow}" is normal. It isn't — it's how ${category} is built.`,
        adHook: `Three quiet signs ${category} is wasting your week (most ${audience} miss number 2).`,
        landingAngle: `Open the page with a story or stat that names ${painLow} from the inside. Do not mention ${name} above the fold. Earn the right to introduce it.`,
      };
    case "problem-aware":
      return {
        stage,
        headline: `If ${painLow} is eating your week, ${category} isn't broken — it's solving the wrong layer.`,
        adHook: `Why ${audience} keep ending up with ${painLow} no matter which ${category} app they pick.`,
        landingAngle: `Validate the pain in the first scroll. Then list the three workarounds ${audience} already tried (and why each fails) before introducing ${diffShort}.`,
      };
    case "solution-aware":
      return {
        stage,
        headline: `${capitalize(category)}, rebuilt around ${diffShort} — for ${audience} who are done with ${painLow}.`,
        adHook: `The reason ${painLow} comes back: ${category} keeps optimising the surface. Here's the layer ${name} works on instead.`,
        landingAngle: `Lead with category-vs-category comparison. Show why other ${category} approaches under-deliver on ${painLow}, then position ${name} as a different category, not a better feature list.`,
      };
    case "product-aware":
      return {
        stage,
        headline: `Still deciding between ${name} and the rest of ${category}? Here's what only ${name} ships: ${diffShort}.`,
        adHook: `${capitalize(name)} vs. the usual ${category} stack — the one trade-off worth knowing before you sign up.`,
        landingAngle: `Stack the unique mechanism, proof, and risk-reversal in the first viewport. Address the comparison head-on: name the trade-off and explain how ${name} resolves it.`,
      };
    case "most-aware":
      return {
        stage,
        headline: `Start with ${name} today and ship the ${normalGoal(goal)} you came here for.`,
        adHook: `${capitalize(name)} — free to start. ${capitalize(diffShort)}, made for ${audience}. Open it now.`,
        landingAngle: `Offer-led. Stack value above the fold, remove risk (free tier, cancel anytime, no card up front if true), and put the CTA above the scroll.`,
      };
  }
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function shortDiff(diff: string): string {
  const cleaned = (diff || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function normalGoal(goal: string): string {
  const g = (goal || "").trim().toLowerCase();
  if (!g) return "thing you actually came here for";
  return g.replace(/\.$/, "");
}
