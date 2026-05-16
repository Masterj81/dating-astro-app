// ad-review.ts — Ad Review Checklist.
//
// 15-axis pre-handoff checklist. Static-ish questions; weights vary
// with campaignType and priceTier so the operator's attention is
// steered where it matters most for the run. Deterministic, pure.

import type {
  AdReviewChecklist,
  CampaignType,
  ProductInput,
  ReviewAxis,
  ReviewAxisKind,
} from "@/types/strategy";

type PriceTier = "low" | "mid" | "high" | "unknown";

function parsePriceTier(price: string): PriceTier {
  if (!price) return "unknown";
  const lower = price.toLowerCase();
  if (lower.includes("free")) return "low";
  const match = price.match(/\d+(?:[.,]\d+)?/);
  if (!match) return "unknown";
  const value = Number(match[0].replace(",", "."));
  if (!Number.isFinite(value)) return "unknown";
  if (value < 30) return "low";
  if (value < 200) return "mid";
  return "high";
}

interface AxisSpec {
  kind: ReviewAxisKind;
  label: string;
  question: string;
  baseWeight: 1 | 2 | 3;
}

const SPECS: AxisSpec[] = [
  {
    kind: "hook-clarity",
    label: "Hook clarity",
    question: `Does the first 3 seconds name a stake the viewer recognises in their own words?`,
    baseWeight: 3,
  },
  {
    kind: "first-3s-payoff",
    label: "First-3s payoff",
    question: `Is there a concrete payoff — a number, a name, or a visual — inside the first three seconds?`,
    baseWeight: 3,
  },
  {
    kind: "claim-specificity",
    label: "Claim specificity",
    question: `Is at least one claim concrete enough that a competitor in the category could not also say it?`,
    baseWeight: 2,
  },
  {
    kind: "proof-strength",
    label: "Proof strength",
    question: `Is every claim paired with a proof type (testimonial / demo / before-after / data) in the same beat?`,
    baseWeight: 3,
  },
  {
    kind: "offer-visibility",
    label: "Offer visibility",
    question: `Is the offer surfaced once — clearly — without becoming the whole ad?`,
    baseWeight: 2,
  },
  {
    kind: "cta-clarity",
    label: "CTA clarity",
    question: `Is there exactly one ask, on camera, with the product name and the action in the same sentence?`,
    baseWeight: 3,
  },
  {
    kind: "platform-fit",
    label: "Platform fit",
    question: `Does the ad feel native to its placement (vertical-first, captions baked in, no platform watermarks)?`,
    baseWeight: 2,
  },
  {
    kind: "tone-match",
    label: "Tone match",
    question: `Does the spoken register match the audience's own — not too formal, not too jokey?`,
    baseWeight: 1,
  },
  {
    kind: "awareness-fit",
    label: "Awareness fit",
    question: `Does the opener match the audience's awareness stage — pain-first for cold, mechanism-first for warm?`,
    baseWeight: 2,
  },
  {
    kind: "pacing",
    label: "Pacing",
    question: `Are cuts dense enough in the first 10 seconds (one every 2-3 seconds) without becoming chaotic?`,
    baseWeight: 2,
  },
  {
    kind: "visual-hierarchy",
    label: "Visual hierarchy",
    question: `Is the eye guided to one focal point per beat — no competing overlays or split attention?`,
    baseWeight: 2,
  },
  {
    kind: "captions-overlay",
    label: "Captions and overlay",
    question: `Are captions burned in, legible, and matching the audio? Are overlays under 8 words per frame?`,
    baseWeight: 2,
  },
  {
    kind: "audio-quality",
    label: "Audio quality",
    question: `Is the on-camera voice clean of room reverb, with music bed sitting under the VO by at least 6 dB?`,
    baseWeight: 1,
  },
  {
    kind: "brand-presence",
    label: "Brand presence",
    question: `Does the product appear visually within the first half so the viewer recovers the brand on a mute scroll?`,
    baseWeight: 2,
  },
  {
    kind: "tracking-readiness-ref",
    label: "Tracking readiness reference",
    question: `Have the conversion events, naming convention, and UTM template been confirmed before this ad spends?`,
    baseWeight: 2,
  },
];

export function buildAdReviewChecklist(input: ProductInput): AdReviewChecklist {
  const tier = parsePriceTier(input.price);
  const campaign: CampaignType = input.campaignType ?? "always-on";

  const axes: ReviewAxis[] = SPECS.map((spec) => {
    const weight = adjustWeight(spec, tier, campaign);
    return {
      kind: spec.kind,
      label: spec.label,
      question: spec.question,
      weight,
    };
  });

  const totalWeight = axes.reduce((acc, a) => acc + a.weight, 0);
  return { axes, totalWeight };
}

function adjustWeight(
  spec: AxisSpec,
  tier: PriceTier,
  campaign: CampaignType
): 1 | 2 | 3 {
  let w: 1 | 2 | 3 = spec.baseWeight;

  // High-ticket products: proof-strength and claim-specificity matter more.
  if (tier === "high") {
    if (spec.kind === "proof-strength" || spec.kind === "claim-specificity") {
      w = 3;
    }
  }

  // Low-ticket products: pacing and first-3s-payoff carry the run.
  if (tier === "low") {
    if (spec.kind === "first-3s-payoff" || spec.kind === "pacing") {
      w = 3;
    }
  }

  // Launch campaigns: offer-visibility climbs.
  if (campaign === "launch") {
    if (spec.kind === "offer-visibility") {
      w = 3;
    }
  }
  // Seasonal: tracking-readiness-ref climbs because the window is finite.
  if (campaign === "seasonal") {
    if (spec.kind === "tracking-readiness-ref") {
      w = 3;
    }
  }
  // Always-on: brand-presence climbs.
  if (campaign === "always-on") {
    if (spec.kind === "brand-presence") {
      w = 3;
    }
  }

  return w;
}
