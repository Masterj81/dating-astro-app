// calendar.ts — Campaign Calendar generator.
//
// Branches on ProductInput.campaignType (default "always-on") and emits
// a deterministic phased plan with named windows. Every window names
// the KPI to watch, the readiness gate before it can open, the offer
// kind that fits, and whether a soft window is forecast inside it.
//
// The shapes here are first-principles direct-response patterns: build
// a warmed audience before you ask for the sale, peak when readiness
// is highest, expect a hangover after a peak, and never run a single
// offer indefinitely without an evergreen test track underneath it.

import type {
  CampaignCalendar,
  CampaignType,
  CampaignWindow,
  CampaignWindowKind,
  OfferKind,
  ProductInput,
} from "@/types/strategy";

export function buildCalendar(input: ProductInput): CampaignCalendar {
  const campaignType: CampaignType = input.campaignType ?? "always-on";
  const offerForPeak = pickPeakOffer(input);
  const offerForWarmup = pickWarmupOffer(input);
  const offerForRamp = pickRampOffer(input);
  const offerForTail = pickTailOffer(input);

  if (campaignType === "launch") {
    const windows: CampaignWindow[] = [
      mkWindow({
        kind: "warmup",
        label: "Pre-launch: warm the list and prove the message",
        startOffsetDays: -14,
        durationDays: 12,
        primaryKPI: "CTR >= 1.2% on the top-ranked angle; opt-in rate >= 25% on lead pages",
        readinessGate: "Landing page live; lead capture confirmed end-to-end; at least one angle drafted.",
        recommendedOfferKind: offerForWarmup,
        expectedDip: false,
        notes:
          "Spend on attention, not conversion. Lock the hook before Launch Day; if CTR is below the floor here, the offer will not save it on the anchor day.",
      }),
      mkWindow({
        kind: "ramp",
        label: "Ramp: scale the winners",
        startOffsetDays: -2,
        durationDays: 2,
        primaryKPI: "ROAS within 80% of target at 2x baseline spend",
        readinessGate: "At least one creative has cleared the warm-up CTR floor at 1x spend.",
        recommendedOfferKind: offerForRamp,
        expectedDip: true,
        notes:
          "Expect a soft window as fresh creative re-enters the auction at higher spend. Hold nerve unless ROAS drops below breakeven for two consecutive days.",
      }),
      mkWindow({
        kind: "peak",
        label: "Launch Day peak",
        startOffsetDays: 0,
        durationDays: 3,
        primaryKPI: "ROAS >= target ROAS; CPA <= target CPA",
        readinessGate: "Inventory / capacity confirmed; support staffed; tracking validated.",
        recommendedOfferKind: offerForPeak,
        expectedDip: false,
        notes:
          "Strongest offer goes live here. Concentrate spend on the proven angles, not on testing.",
      }),
      mkWindow({
        kind: "echo",
        label: "Echo: catch the late deciders",
        startOffsetDays: 3,
        durationDays: 4,
        primaryKPI: "Conversion rate on retargeting >= 2x cold",
        readinessGate: "Peak windows hit at least 70% of their volume target.",
        recommendedOfferKind: offerForPeak,
        expectedDip: true,
        notes:
          "Forecast a dip immediately after the peak as the warmest cohort empties. Lean on retargeting and last-call language, not on new acquisition.",
      }),
      mkWindow({
        kind: "tail",
        label: "Tail: convert the holdouts",
        startOffsetDays: 7,
        durationDays: 14,
        primaryKPI: "CPA <= 1.1x target CPA on retargeting",
        readinessGate: "Echo window's conversion rate has fallen to within 20% of cold baseline.",
        recommendedOfferKind: offerForTail,
        expectedDip: false,
        notes:
          "Pull back on acquisition spend; let evergreen funnels carry the rest. This is also where you should plan the next angle pivot.",
      }),
    ];
    return { campaignType, anchorLabel: "Launch Day", windows };
  }

  if (campaignType === "seasonal") {
    const windows: CampaignWindow[] = [
      mkWindow({
        kind: "lead-in",
        label: "Lead-in: early bird capture",
        startOffsetDays: -28,
        durationDays: 14,
        primaryKPI: "Cost per lead <= 60% of target CPA",
        readinessGate:
          "Previous season's retrospective complete — top creatives, top angles, top SKUs documented.",
        recommendedOfferKind: "free-gift",
        expectedDip: false,
        notes:
          "Acquire and warm a list well ahead of the peak. Early-bird incentives should be soft so they do not anchor the buyer to a deeper discount later.",
      }),
      mkWindow({
        kind: "warmup",
        label: "Warm-up: tease the offer",
        startOffsetDays: -14,
        durationDays: 7,
        primaryKPI: "Add-to-cart rate >= 4% on warm traffic",
        readinessGate: "Final creative approved; offer terms locked.",
        recommendedOfferKind: offerForWarmup,
        expectedDip: false,
        notes:
          "Surface the offer in soft form (early access, member-only preview). Save the strongest framing for peak.",
      }),
      mkWindow({
        kind: "ramp",
        label: "Ramp: pre-peak push",
        startOffsetDays: -3,
        durationDays: 3,
        primaryKPI: "ROAS >= 0.9x target at 1.5x baseline spend",
        readinessGate: "Warm-up CTR baseline holds at >= 1.0%.",
        recommendedOfferKind: offerForRamp,
        expectedDip: true,
        notes:
          "Forecast a soft window the day before peak as buyers hold spend for the announced anchor day. This is expected, not a failure signal.",
      }),
      mkWindow({
        kind: "peak",
        label: "Peak day(s)",
        startOffsetDays: 0,
        durationDays: 3,
        primaryKPI: "ROAS >= target; revenue >= 30% of total campaign target",
        readinessGate: "Inventory confirmed; fulfilment SLAs reviewed; support coverage scheduled.",
        recommendedOfferKind: offerForPeak,
        expectedDip: false,
        notes:
          "Hardest offer of the calendar. Concentrate spend on proven creative; resist the urge to test new angles here.",
      }),
      mkWindow({
        kind: "echo",
        label: "Echo: post-peak last call",
        startOffsetDays: 3,
        durationDays: 4,
        primaryKPI: "Retargeting CPA <= 1.2x target",
        readinessGate: "Peak revenue cleared at least 70% of plan.",
        recommendedOfferKind: offerForPeak,
        expectedDip: true,
        notes:
          "Hangover dip is normal here. Lead with scarcity language, not deeper discount — discounting twice trains the audience for next year.",
      }),
      mkWindow({
        kind: "tail",
        label: "Tail: extended sale + angle pivot",
        startOffsetDays: 7,
        durationDays: 21,
        primaryKPI: "CPA holding within 110% of target on warm traffic",
        readinessGate: "Echo window's conversion rate has decayed to baseline.",
        recommendedOfferKind: offerForTail,
        expectedDip: false,
        notes:
          "Pivot the angle (new-year framing, fresh-start framing) so the same audience sees a new reason rather than the same offer twice.",
      }),
    ];
    return { campaignType, anchorLabel: "Peak Day", windows };
  }

  // always-on
  const windows: CampaignWindow[] = [
    mkWindow({
      kind: "evergreen-test",
      label: "Test cohort A",
      startOffsetDays: 0,
      durationDays: 14,
      primaryKPI: "CTR >= 1.0% and CPA within 130% of target on new creative",
      readinessGate: "Baseline ROAS on the existing scale ad set is logged.",
      recommendedOfferKind: offerForWarmup,
      expectedDip: false,
      notes:
        "Small spend, broad audience, fresh hooks. Goal is to graduate at least one ad to the scale track per cycle.",
    }),
    mkWindow({
      kind: "evergreen-scale",
      label: "Scale cohort A",
      startOffsetDays: 14,
      durationDays: 14,
      primaryKPI: "ROAS >= target at 2x test-cohort spend",
      readinessGate: "At least one creative in the previous test window has cleared the CTR floor.",
      recommendedOfferKind: offerForPeak,
      expectedDip: true,
      notes:
        "Expect CPL drift up and CVR drift down as spend grows — re-baseline the target before assuming the offer is broken.",
    }),
    mkWindow({
      kind: "warmup",
      label: "Refresh: rotate creative",
      startOffsetDays: 28,
      durationDays: 7,
      primaryKPI: "Frequency on top ad sets <= 3.0",
      readinessGate: "Frequency on the leading creative has exceeded 3.0 or CTR has decayed 20%.",
      recommendedOfferKind: offerForWarmup,
      expectedDip: false,
      notes:
        "Rotate fatigued creative into rest; bring two new hooks per format into the test slot.",
    }),
    mkWindow({
      kind: "evergreen-test",
      label: "Test cohort B",
      startOffsetDays: 35,
      durationDays: 14,
      primaryKPI: "CTR >= 1.0% on the new cohort",
      readinessGate: "Refresh window complete; new creative live in test slot.",
      recommendedOfferKind: offerForWarmup,
      expectedDip: false,
      notes:
        "Second test cycle keeps the funnel honest — without it, scale eventually starves on stale hooks.",
    }),
    mkWindow({
      kind: "evergreen-scale",
      label: "Scale cohort B",
      startOffsetDays: 49,
      durationDays: 14,
      primaryKPI: "ROAS >= target",
      readinessGate: "Test cohort B has graduated at least one creative.",
      recommendedOfferKind: offerForPeak,
      expectedDip: true,
      notes:
        "Forecast a soft window as the auction re-prices the new winners; hold nerve until the second week.",
    }),
    mkWindow({
      kind: "peak",
      label: "Quarterly peak push",
      startOffsetDays: 63,
      durationDays: 7,
      primaryKPI: "Revenue >= 2x baseline weekly revenue",
      readinessGate: "At least two creatives have cleared the scale ROAS target for a full week.",
      recommendedOfferKind: offerForPeak,
      expectedDip: false,
      notes:
        "Quarterly tentpole. Bring the strongest offer of the quarter; reuse winning creative with offer overlay rather than testing new hooks here.",
    }),
    mkWindow({
      kind: "tail",
      label: "Recover: post-push tail",
      startOffsetDays: 70,
      durationDays: 14,
      primaryKPI: "ROAS recovers to within 90% of baseline target",
      readinessGate: "Peak push complete; revenue debrief logged.",
      recommendedOfferKind: offerForTail,
      expectedDip: true,
      notes:
        "Pull spend back to baseline; expect a hangover week as the auction settles.",
    }),
  ];
  return { campaignType, anchorLabel: "Always-On Start", windows };
}

function mkWindow(w: CampaignWindow): CampaignWindow {
  return w;
}

// --- offer pickers ----------------------------------------------------
// Selecting a coherent offer kind for each role in the calendar. Choices
// echo the ranking signals in offers.ts so the calendar and the Offer
// Architect agree on which lever fits which moment.

function pickPeakOffer(input: ProductInput): OfferKind {
  const model = input.businessModel;
  if (model === "subscription" || model === "freemium") return "free-trial";
  if (model === "services") return "guarantee";
  if (model === "marketplace") return "free-shipping";
  // one-time / ads / other → strongest commercial lever
  return "discount";
}

function pickWarmupOffer(input: ProductInput): OfferKind {
  const model = input.businessModel;
  if (model === "subscription" || model === "freemium") return "free-trial";
  if (model === "services") return "guarantee";
  // Warmup leans on perceived value, not on the strongest discount.
  return "free-gift";
}

function pickRampOffer(input: ProductInput): OfferKind {
  const model = input.businessModel;
  if (model === "subscription" || model === "freemium") return "free-trial";
  if (model === "services") return "payment-plan";
  return "bundle";
}

function pickTailOffer(input: ProductInput): OfferKind {
  const model = input.businessModel;
  if (model === "subscription" || model === "freemium") return "free-trial";
  if (model === "services") return "guarantee";
  return "bundle";
}

// kind labels are emitted as-is in the CampaignWindow.kind field; this
// helper is exported only for the export-brief and UI to render them
// consistently.
export function windowKindLabel(kind: CampaignWindowKind): string {
  return (
    {
      "lead-in": "Lead-in",
      warmup: "Warm-up",
      ramp: "Ramp",
      peak: "Peak",
      echo: "Echo",
      tail: "Tail",
      "evergreen-test": "Evergreen test",
      "evergreen-scale": "Evergreen scale",
    }[kind] ?? kind
  );
}
