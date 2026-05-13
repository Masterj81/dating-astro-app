import type {
  OfferDiagnosis,
  ProductInput,
  ProofAsset,
} from "@/types/strategy";

// diagnoseOffer — answers five practical questions about the current
// offer:
//   - What is the strongest promise to lead with?
//   - Where is the weakest claim (the part most likely to be doubted)?
//   - What proof is missing right now?
//   - What is the single biggest objection a buyer will raise?
//   - Which proof asset would move the needle most?
//
// All outputs reference the user's actual category / audience / pain /
// differentiator so the diagnosis can never read as boilerplate.

export function diagnoseOffer(input: ProductInput): OfferDiagnosis {
  const name = input.name || "the product";
  const category = input.category || "this category";
  const audience = input.audience || "your audience";
  const pain = input.audiencePain || "the core frustration";
  const differentiator = input.differentiator || "your mechanism";
  const competitors = input.competitors || "the alternatives";

  const strongestPromise =
    `${capitalize(audience)} stop ${painNoun(pain)} and start moving toward ${goalNoun(input.goal)} — using ${differentiator}.`;

  const weakestClaim = pickWeakestClaim(input);
  const missingProof = pickMissingProof(input);
  const biggestObjection = pickBiggestObjection(input, competitors);
  const { asset, reason } = pickRecommendedAsset(input);

  return {
    strongestPromise,
    weakestClaim,
    missingProof,
    biggestObjection,
    recommendedAsset: asset,
    recommendedAssetReason: reason,
  };
}

function pickWeakestClaim(input: ProductInput): string {
  const diff = (input.differentiator || "").toLowerCase();
  const category = input.category || "this category";

  // If differentiator is short/adjectival, that's the weak link.
  if (!diff || diff.split(/\s+/).length < 4) {
    return `The differentiator is currently described in too few words — buyers will read it as "another ${category}" until you name the mechanism in noun form.`;
  }

  // If sophistication is amplified/skeptical, an outcome-led promise is weakest.
  if (
    input.sophistication === "amplified-claims" ||
    input.sophistication === "skeptical-market"
  ) {
    return `The outcome promise (better ${category} experience) is the weakest claim — the market has heard it from ${input.competitors || "every competitor"}. The mechanism, not the outcome, has to lead.`;
  }

  // Mature markets: feature claims are weakest because features look the same.
  if (input.sophistication === "mature-market") {
    return `Feature-level claims are the weakest part of the offer — every ${category} can list the same features. Identity and stance carry weight here, not specs.`;
  }

  return `The weakest claim is the implied "this will actually work for you" — without proof from ${input.audience || "your audience"}, it's a believability gap.`;
}

function pickMissingProof(input: ProductInput): string {
  const audience = input.audience || "your audience";
  const differentiator = input.differentiator || "your mechanism";
  const pain = input.audiencePain || "the pain";

  // Skeptical/mature markets need named-case proof.
  if (input.sophistication === "skeptical-market") {
    return `What's missing: named cases — three ${audience} who used ${name(input)} and can describe, in their own words, the shift in ${painNoun(pain)}.`;
  }
  if (input.sophistication === "mature-market") {
    return `What's missing: identity proof — visible signal that the ${audience} who pick ${name(input)} are a recognisable tribe, not random users.`;
  }
  if (input.sophistication === "amplified-claims") {
    return `What's missing: a demo of the mechanism (${shortDiff(differentiator)}) in action, so the claim becomes inspectable instead of asserted.`;
  }
  if (input.awareness === "unaware" || input.awareness === "problem-aware") {
    return `What's missing: a story or stat that names ${painNoun(pain)} the way ${audience} already feel it, before any product claim is made.`;
  }
  return `What's missing: a single screenshot or short clip showing ${shortDiff(differentiator)} in the first 10 seconds of using ${name(input)}.`;
}

function pickBiggestObjection(input: ProductInput, competitors: string): string {
  const category = input.category || "this category";
  const competitorList = competitors
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const competitorHint =
    competitorList.length > 0
      ? `${competitorList[0]}${competitorList[1] ? `, ${competitorList[1]}` : ""}`
      : `the obvious alternatives`;

  if (input.sophistication === "mature-market") {
    return `"How is ${name(input)} actually different from ${competitorHint}? They all promise the same thing."`;
  }
  if (input.sophistication === "skeptical-market") {
    return `"I've tried ${competitorHint} and nothing changed. Why would this be different?"`;
  }
  if (input.awareness === "unaware" || input.awareness === "problem-aware") {
    return `"This isn't a real problem for me / I don't have time to add another ${category} app to my life."`;
  }
  return `"Is ${name(input)} worth setting up right now, instead of staying with ${competitorHint}?"`;
}

function pickRecommendedAsset(
  input: ProductInput
): { asset: ProofAsset; reason: string } {
  const soph = input.sophistication;
  const aware = input.awareness;
  const audience = input.audience || "your audience";
  const differentiator = input.differentiator || "your mechanism";

  if (soph === "skeptical-market") {
    return {
      asset: "customer quote",
      reason: `Skeptical ${audience} discount asserted claims — a named quote from a peer is the single highest-leverage proof you can ship.`,
    };
  }
  if (soph === "mature-market") {
    return {
      asset: "founder story",
      reason: `In a mature ${input.category || "category"}, identity wins. A founder story makes the brand legible as a stance, not another feature stack.`,
    };
  }
  if (soph === "amplified-claims") {
    return {
      asset: "demo video",
      reason: `Promises got loud — showing ${shortDiff(differentiator)} in motion is the fastest way to make the mechanism inspectable.`,
    };
  }
  if (aware === "unaware" || aware === "problem-aware") {
    return {
      asset: "before/after",
      reason: `${capitalize(audience)} need to see the problem named before they accept a solution — a before/after frame does both at once.`,
    };
  }
  if (aware === "most-aware") {
    return {
      asset: "app store reviews",
      reason: `Buyers who are this close to deciding look at ratings and recent reviews — make sure those are populated and visible in your ad and landing.`,
    };
  }
  // product-aware default
  return {
    asset: "screenshots",
    reason: `${capitalize(audience)} are comparing. Screenshots that highlight ${shortDiff(differentiator)} let them validate the claim without leaving the page.`,
  };
}

// --- helpers ---

function name(input: ProductInput): string {
  return input.name || "the product";
}

function painNoun(pain: string): string {
  return (pain || "the frustration").replace(/\.$/, "").toLowerCase();
}

function goalNoun(goal: string): string {
  const g = (goal || "").trim().toLowerCase();
  if (!g) return "what they actually came here for";
  return g.replace(/\.$/, "");
}

function shortDiff(diff: string): string {
  const cleaned = (diff || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
