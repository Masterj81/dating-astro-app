// promo-tiers.ts — deterministic per-window audience-architecture helper
// for the Campaign Calendar.
//
// Rule of thumb:
//   - Always-on campaigns: every window is single-tier (cold broad).
//   - Launch and seasonal campaigns: peak / ramp / echo windows run a
//     three-tier promo architecture (cold broad + engaged retargeting +
//     site retargeting). All other windows remain single-tier.

import type {
  CampaignArchitecture,
  CampaignType,
  CampaignWindowKind,
  RetrospectiveGate,
  RetrospectiveQuestion,
} from "@/types/strategy";

const PROMO_WINDOWS: CampaignWindowKind[] = ["peak", "ramp", "echo"];

export function recommendArchitecture(
  campaignType: CampaignType,
  kind: CampaignWindowKind
): CampaignArchitecture {
  if (campaignType === "always-on" || !PROMO_WINDOWS.includes(kind)) {
    return {
      kind: "single-tier",
      rationale:
        "Outside a promo push, the unit of work is one broad cold ad set; layering retargeting here would starve learning.",
      tiers: [
        {
          name: "Cold broad",
          intent: "prospecting",
          notes: "Single broad targeting; rely on the auction to find the buyer.",
        },
      ],
    };
  }

  // Promo three-tier
  const budget = budgetSplitFor(campaignType, kind);
  return {
    kind: "promo-3-tier",
    rationale:
      "Promo windows reward stacking: a cold tier to keep volume honest, an engagement retarget to convert the warmed pool, and a site retarget to close the ones who already showed intent.",
    tiers: [
      {
        name: "Cold broad",
        intent: "prospecting",
        notes: "Broad targeting; the engine handles segmentation.",
      },
      {
        name: "Engaged (last 60 days)",
        intent: "engagement-retargeting",
        notes: "Anyone who watched, clicked, or saved over the prior 60 days.",
      },
      {
        name: "Site visitors (last 90 days)",
        intent: "site-retargeting",
        notes: "Add-to-cart, product views, and pricing-page traffic in the last 90 days.",
      },
    ],
    budgetSplitHint: budget,
  };
}

function budgetSplitFor(
  campaignType: CampaignType,
  kind: CampaignWindowKind
): string {
  // Peak windows go heavier on retargeting; ramp and echo lean cold.
  if (kind === "peak") {
    return campaignType === "seasonal"
      ? "50/30/20 cold/engaged/site"
      : "55/25/20 cold/engaged/site";
  }
  if (kind === "ramp") {
    return "65/20/15 cold/engaged/site";
  }
  // echo
  return "45/30/25 cold/engaged/site";
}

// ---- Retrospective gate -------------------------------------------------
//
// The retrospective gate is the eight prompts a team should answer before
// a peak window opens. Populated only for the first peak window of a
// seasonal campaign (and for launch peaks where useful). One question per
// topic — eight total, no duplication.

const TOPICS_IN_ORDER: RetrospectiveQuestion["topic"][] = [
  "prior-winning-creative",
  "prior-offer-performance",
  "list-quality",
  "returning-customer-angle",
  "landing-bottleneck",
  "shipping-deadline-constraint",
  "margin-guardrail",
  "next-cycle-learning",
];

export function buildRetrospectiveGate(
  windowKind: CampaignWindowKind
): RetrospectiveGate {
  const questions: RetrospectiveQuestion[] = TOPICS_IN_ORDER.map((topic) =>
    questionFor(topic)
  );
  return { windowKind, questions };
}

function questionFor(
  topic: RetrospectiveQuestion["topic"]
): RetrospectiveQuestion {
  switch (topic) {
    case "prior-winning-creative":
      return {
        topic,
        question:
          "Which creative from the last cycle of this campaign actually paid for itself, and what made it work?",
        whyItMatters:
          "Re-cutting a proven hook is a far cheaper bet than asking new creative to carry the peak.",
      };
    case "prior-offer-performance":
      return {
        topic,
        question:
          "What was the headline offer last cycle, and how did its conversion rate compare with everyday baseline?",
        whyItMatters:
          "If last cycle's offer barely beat baseline, the same offer this cycle will not magically scale.",
      };
    case "list-quality":
      return {
        topic,
        question:
          "How fresh and how engaged is the email / SMS list compared with the same week last cycle?",
        whyItMatters:
          "Owned channels carry the peak when paid CPMs spike; a stale list quietly caps the ceiling.",
      };
    case "returning-customer-angle":
      return {
        topic,
        question:
          "What is the angle for returning customers this cycle — different reason, different bundle, or the same offer twice?",
        whyItMatters:
          "Returning buyers tune out a repeated offer; without a fresh angle, the warmest segment quietly leaves money on the table.",
      };
    case "landing-bottleneck":
      return {
        topic,
        question:
          "Where did landing-page conversion break last cycle — load speed, hero clarity, checkout step, or trust signal?",
        whyItMatters:
          "Peak traffic exposes whatever was already a leak; fix the leak before pouring traffic on top.",
      };
    case "shipping-deadline-constraint":
      return {
        topic,
        question:
          "What is the latest order date that still hits the customer's expected delivery, and is that date visible in copy?",
        whyItMatters:
          "Unstated deadlines collapse the urgency the rest of the campaign is built on.",
      };
    case "margin-guardrail":
      return {
        topic,
        question:
          "Below what blended ROAS does the strongest offer stop paying for itself once shipping and returns are netted?",
        whyItMatters:
          "Scaling without a written margin floor is how a record-revenue peak turns into a break-even quarter.",
      };
    case "next-cycle-learning":
      return {
        topic,
        question:
          "What is the one learning from this cycle we will commit to writing down before the calendar gets archived?",
        whyItMatters:
          "Without a written lesson the next cycle re-runs the same mistakes from scratch.",
      };
  }
}
