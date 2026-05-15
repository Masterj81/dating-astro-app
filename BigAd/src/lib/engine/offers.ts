// offers.ts — Offer Architect.
//
// Given a ProductInput, return a deterministic, ranked list of offer
// recommendations drawn from the seven canonical offer kinds. The
// ordering and the chosen subset are derived purely from the inputs:
// business model, price tier, awareness, and (when present) the
// commercial context block. No random ordering. No tie-breaking by
// object identity.
//
// Voice is BigAd's own: the rationale paraphrases industry-standard
// direct-response reasoning, never lifted phrases.

import type {
  AwarenessStage,
  OfferKind,
  OfferRecommendation,
  ProductInput,
} from "@/types/strategy";
import { computeBreakevenROAS } from "./breakeven";

// Default discount strength assumed for each kind when computing
// breakeven ROAS. These are conservative working defaults — the UI
// surfaces the value so the user can re-baseline against their own
// numbers.
const DEFAULT_DISCOUNT_BY_KIND: Record<OfferKind, number> = {
  discount: 15,
  bundle: 10,
  guarantee: 0,
  "free-shipping": 8,
  "free-gift": 7,
  "payment-plan": 0,
  "free-trial": 0,
};

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

interface OfferBlueprint {
  kind: OfferKind;
  label: string;
  rationale: string;
  stickinessRisk: "low" | "medium" | "high";
  awarenessFit: AwarenessStage[];
  notes?: string;
}

// Score each blueprint against signals from the input. Higher score =
// stronger fit. Deterministic. Ranking ties are broken by the index in
// ALL_BLUEPRINTS (stable order).
function scoreBlueprint(
  bp: OfferBlueprint,
  input: ProductInput,
  tier: PriceTier
): number {
  let score = 50;
  const model = input.businessModel;

  switch (bp.kind) {
    case "discount":
      if (model === "subscription" || model === "freemium") score -= 15;
      if (model === "one-time") score += 12;
      if (tier === "low") score += 10;
      if (tier === "high") score -= 10;
      if (input.sophistication === "mature-market" || input.sophistication === "skeptical-market") {
        score += 6; // mature markets often need a deal to break inertia
      }
      break;
    case "bundle":
      if (model === "one-time") score += 14;
      if (model === "subscription") score += 6;
      if (tier === "low") score += 8;
      if (tier === "high") score += 4;
      break;
    case "guarantee":
      if (tier === "high") score += 20;
      if (tier === "mid") score += 8;
      if (input.sophistication === "skeptical-market") score += 10;
      if (input.sophistication === "mature-market") score += 6;
      if (model === "services") score += 6;
      break;
    case "free-shipping":
      if (model === "one-time") score += 12;
      if (model === "marketplace") score += 6;
      if (tier === "low") score += 8;
      if (model === "subscription" || model === "freemium") score -= 20;
      if (model === "services" || model === "ads") score -= 20;
      break;
    case "free-gift":
      if (model === "one-time") score += 10;
      if (tier === "low") score += 6;
      if (tier === "mid") score += 4;
      if (model === "subscription" || model === "freemium") score -= 10;
      break;
    case "payment-plan":
      if (tier === "high") score += 22;
      if (tier === "mid") score += 6;
      if (tier === "low") score -= 15;
      if (model === "services") score += 8;
      if (model === "subscription") score += 4;
      break;
    case "free-trial":
      if (model === "subscription") score += 22;
      if (model === "freemium") score += 18;
      if (model === "services") score += 8;
      if (model === "one-time") score -= 15;
      if (input.awareness === "product-aware" || input.awareness === "most-aware") score += 6;
      break;
  }

  return score;
}

const ALL_BLUEPRINTS: OfferBlueprint[] = [
  {
    kind: "free-trial",
    label: "Risk-free trial window",
    rationale:
      "Recurring products convert best when the buyer can feel the value before money changes hands. A trial gives skeptics a concrete reason to start.",
    stickinessRisk: "low",
    awarenessFit: ["solution-aware", "product-aware", "most-aware"],
  },
  {
    kind: "guarantee",
    label: "Outcome-backed guarantee",
    rationale:
      "A guarantee shifts the perceived risk off the buyer. It works hardest where the price is high enough that hesitation is the real blocker.",
    stickinessRisk: "low",
    awarenessFit: ["solution-aware", "product-aware", "most-aware"],
  },
  {
    kind: "payment-plan",
    label: "Split-pay payment plan",
    rationale:
      "Breaking the headline price into installments lowers the cash-flow objection on higher-ticket purchases without touching the offer's perceived value.",
    stickinessRisk: "low",
    awarenessFit: ["problem-aware", "solution-aware", "product-aware", "most-aware"],
  },
  {
    kind: "bundle",
    label: "Named bundle with a reason",
    rationale:
      "Bundling raises average order value while letting the deal land as a curated package, not a margin giveaway. Give it a name and a story.",
    stickinessRisk: "medium",
    awarenessFit: ["solution-aware", "product-aware", "most-aware"],
  },
  {
    kind: "free-gift",
    label: "Free gift with purchase",
    rationale:
      "A free add-on increases perceived value without training the buyer to wait for a sitewide markdown — the price itself stays anchored.",
    stickinessRisk: "medium",
    awarenessFit: ["solution-aware", "product-aware", "most-aware"],
  },
  {
    kind: "free-shipping",
    label: "Free shipping threshold",
    rationale:
      "Removes the most common post-add-to-cart objection on physical goods, and a minimum-spend threshold pulls AOV up at the same time.",
    stickinessRisk: "medium",
    awarenessFit: ["product-aware", "most-aware"],
  },
  {
    kind: "discount",
    label: "Time-boxed percentage off",
    rationale:
      "The bluntest lever. Effective for moving inventory or breaking inertia, but use sparingly — buyers learn to wait for the next promo.",
    stickinessRisk: "high",
    awarenessFit: ["product-aware", "most-aware"],
  },
];

export function recommendOffers(input: ProductInput): OfferRecommendation[] {
  const tier = parsePriceTier(input.price);
  const ctx = input.offerContext;

  // Score every blueprint, then sort by (score desc, original index asc)
  // to keep the order deterministic and stable.
  const scored = ALL_BLUEPRINTS.map((bp, idx) => ({
    bp,
    idx,
    score: scoreBlueprint(bp, input, tier),
  }));
  scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

  // Keep all 7 in the output — the engine returns 3..7 and 7 is the
  // useful default. Downstream UI / calendar can still pick by kind.
  return scored.map(({ bp }) => {
    const discountPercent =
      bp.kind === "discount"
        ? DEFAULT_DISCOUNT_BY_KIND.discount
        : DEFAULT_DISCOUNT_BY_KIND[bp.kind] || 0;

    const breakeven = computeBreakevenROAS({
      cogsPercent: ctx?.cogsPercent,
      targetMarginPercent: ctx?.targetMarginPercent,
      discountPercent,
    });

    const notes = breakevenNote(bp.kind, breakeven, ctx);

    const rec: OfferRecommendation = {
      kind: bp.kind,
      label: bp.label,
      rationale: bp.rationale,
      breakevenROAS: breakeven,
      stickinessRisk: bp.stickinessRisk,
      awarenessFit: bp.awarenessFit.slice(),
      notes,
    };
    if (bp.kind === "discount") {
      rec.discountPercent = DEFAULT_DISCOUNT_BY_KIND.discount;
    }
    return rec;
  });
}

function breakevenNote(
  kind: OfferKind,
  breakeven: number | null,
  ctx: ProductInput["offerContext"]
): string {
  if (breakeven !== null) {
    const aov = ctx?.currentAOV;
    if (typeof aov === "number" && aov > 0) {
      return `At a typical ${kind === "discount" ? "discount" : "give-away"} this kind implies, every ad dollar must return at least ${breakeven.toFixed(2)}x to clear contribution; on an AOV of ${aov}, that means roughly ${Math.round(aov / breakeven)} in allowable CAC.`;
    }
    return `Hit at least ${breakeven.toFixed(2)}x ROAS to clear contribution after this offer's give-away.`;
  }
  if (!ctx || (ctx.cogsPercent === undefined && ctx.targetMarginPercent === undefined)) {
    return "Fill in COGS % and target margin % under Commercial inputs to see the breakeven ROAS for this offer.";
  }
  return "At the assumed give-away, this offer leaves no positive contribution — re-baseline the discount or the margin target before running it.";
}
