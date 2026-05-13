import type { AwarenessLevel, ProductInput } from "@/types/strategy";

// analyzeAwareness — returns the conversational stance and opening
// moves a writer should take for each awareness level. Notes are
// woven with the product's actual audience and pain so they remain
// concrete instead of generic.

export function analyzeAwareness(input: ProductInput): string[] {
  const { awareness, audience, audiencePain, category } = input;
  const a = audience || "your audience";
  const p = audiencePain || "their core frustration";
  const c = category || "your category";

  switch (awareness) {
    case "unaware":
      return [
        `${a} do not yet name "${p}" as a problem — start with a story or stat that makes the frustration visible.`,
        `Avoid product talk in the first 80% of the message. Lead with the world they live in.`,
        `Your job is education, not persuasion. Earn the right to mention ${input.name || "your product"}.`,
      ];
    case "problem-aware":
      return [
        `${a} already feel "${p}" but do not believe a real solution exists. Validate the pain before pitching.`,
        `Contrast every common workaround they have tried (and why each fails) before introducing your mechanism.`,
        `Use language they would use to describe ${p} — mirror, do not rephrase.`,
      ];
    case "solution-aware":
      return [
        `${a} know a class of solutions exists in ${c} — they are shopping. The fight is now category vs. category.`,
        `Lead with why other ${c} approaches under-deliver on ${p}. Position your category, not your features.`,
        `Promise a specific outcome with a believable timeline so they pick your camp.`,
      ];
    case "product-aware":
      return [
        `${a} know ${input.name || "your product"} exists. Doubt and comparison drive the decision now.`,
        `Stack your unique mechanism, proof, and risk-reversal up front. Headlines should be sharp, not abstract.`,
        `Address competitor objections directly — name the trade-off and explain how you resolve it.`,
      ];
    case "most-aware":
      return [
        `${a} are ready to buy. Friction, price, urgency, and bonuses do the work.`,
        `Offer-led copy: stack value, remove risk, add scarcity that is genuinely true.`,
        `Short headlines that name the offer beat clever headlines that re-sell the idea.`,
      ];
  }
}

export function awarenessLabel(level: AwarenessLevel): string {
  return {
    "unaware": "Unaware",
    "problem-aware": "Problem-aware",
    "solution-aware": "Solution-aware",
    "product-aware": "Product-aware",
    "most-aware": "Most-aware",
  }[level];
}
