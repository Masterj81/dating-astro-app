// scenario-simulator.ts — Scenario Simulator / What-if Lab engine.
//
// Pure deterministic derivation. Given a Strategy (with unitEconomics +
// forecast already populated by the engine), emits a
// `ScenarioSimulatorPlan` carrying:
//
//   - Base assumptions resolved from forecast + economics
//   - Exactly 5 scenarios — base, higher-cpm, lower-cvr,
//     (better-trial OR better-cvr depending on funnel), higher-aov-annual
//   - One sensitivity row per numeric lever (-20% / -10% / +10% / +20%)
//     plus a qualitative `offerKind` row, ranked by sensitivity score
//   - Up to 5 deterministic recommendations
//   - Plan-level warnings and a status classification
//
// Never calls `Date.now()` — every output has `derivedAt = 0`. No
// `Math.random` anywhere. All ordering is stable, so identical Strategy
// in → byte-identical plan out.

import type {
  OfferRecommendation,
  Strategy,
  UnitEconomicsSummary,
} from "@/types/strategy";
import type {
  ScenarioSimulatorPlan,
  SimulatorAssumptionSet,
  SimulatorLever,
  SimulatorOutcome,
  SimulatorRecommendation,
  SimulatorRecommendationPriority,
  SimulatorScenarioResult,
  SimulatorSensitivityResult,
  SimulatorSensitivityStep,
  SimulatorViability,
  SimulatorWarning,
  SimulatorWarningKind,
} from "@/types/simulator";

// ---- Defaults ----------------------------------------------------------

const FALLBACK_CPM = 20;
const FALLBACK_CTR = 0.012;
const FALLBACK_CVR = 0.025;
const FALLBACK_AOV = 30;
const FALLBACK_GROSS_MARGIN = 0.7;
const FALLBACK_TARGET_ROAS = 2.0;
const FALLBACK_TOTAL_BUDGET = 500;
const FALLBACK_DURATION_DAYS = 7;
const FALLBACK_TRIAL_TO_PAID = 0.4;
const FALLBACK_MONTHLY_CHURN = 0.1;

const TRIAL_RATE_CAP = 0.65;
const MIN_FRACTION = 0.01;
const MAX_FRACTION = 0.95;

const NUMERIC_LEVERS: SimulatorLever[] = [
  "price",
  "currentAov",
  "grossMargin",
  "targetRoas",
  "trialToPaidRate",
  "monthlyChurnRate",
  "cpm",
  "ctr",
  "cvr",
  "totalBudget",
  "durationDays",
];

const SENSITIVITY_STEPS: Array<{ label: string; multiplier: number }> = [
  { label: "-20%", multiplier: 0.8 },
  { label: "-10%", multiplier: 0.9 },
  { label: "+10%", multiplier: 1.1 },
  { label: "+20%", multiplier: 1.2 },
];

const QUALITATIVE_OFFERS: string[] = [
  "free-trial-7d",
  "free-trial-14d",
  "annual-plan-discount",
];

// ---- Public API --------------------------------------------------------

export function buildScenarioSimulatorPlan(
  strategy: Strategy
): ScenarioSimulatorPlan {
  const planWarnings: SimulatorWarning[] = [];

  const economics = strategy.unitEconomics;
  const forecast = strategy.forecast;

  if (!economics || economics.status === "incomplete") {
    planWarnings.push(noEconomicsWarning());
  }
  if (!forecast) {
    planWarnings.push(noForecastWarning());
  }

  // When neither economics nor forecast give us anything to anchor to,
  // emit an incomplete plan with a blocker warning and stop.
  if (!economics && !forecast) {
    planWarnings.push(noBaseAssumptionsWarning());
    return {
      status: "incomplete",
      baseAssumptions: emptyAssumptionSet(),
      scenarios: [],
      sensitivities: [],
      recommendations: [],
      warnings: planWarnings,
      derivedAt: 0,
    };
  }

  const baseAssumptions = buildDefaultAssumptionSet(strategy);

  // Build exactly 5 scenarios in spec order. The 4th scenario varies
  // by funnel (better-trial when subscription+trial, else better-cvr).
  const base = simulateScenario(strategy, baseAssumptions);
  base.scenarioId = "base";
  base.label = "Base";
  base.description = "Base plan — assumptions from forecast + economics";

  const higherCpm = simulateScenario(strategy, {
    ...baseAssumptions,
    cpm: roundCurrency(baseAssumptions.cpm * 1.3),
  });
  higherCpm.scenarioId = "higher-cpm";
  higherCpm.label = "Higher CPM (+30%)";
  higherCpm.description = "Tests resilience to a 30% CPM rise";

  const lowerCvr = simulateScenario(strategy, {
    ...baseAssumptions,
    cvr: clamp01(baseAssumptions.cvr * 0.7),
  });
  lowerCvr.scenarioId = "lower-cvr";
  lowerCvr.label = "Lower CVR (-30%)";
  lowerCvr.description = "Tests resilience to a 30% CVR drop";

  // Slot 4 — better-trial OR better-cvr depending on funnel.
  let slot4: SimulatorScenarioResult;
  if (
    baseAssumptions.hasFreeTrial &&
    typeof baseAssumptions.trialToPaidRate === "number"
  ) {
    const liftedTrial = clampFraction(
      Math.min(TRIAL_RATE_CAP, baseAssumptions.trialToPaidRate * 1.4)
    );
    slot4 = simulateScenario(strategy, {
      ...baseAssumptions,
      trialToPaidRate: liftedTrial,
    });
    slot4.scenarioId = "better-trial";
    slot4.label = "Better trial (+40%)";
    slot4.description = "Lifts trial-to-paid rate 40% (capped at 65%)";
  } else {
    slot4 = simulateScenario(strategy, {
      ...baseAssumptions,
      cvr: clamp01(baseAssumptions.cvr * 1.3),
    });
    slot4.scenarioId = "better-cvr";
    slot4.label = "Better CVR (+30%)";
    slot4.description = "Tests upside when CVR lifts 30%";
  }

  // Slot 5 — higher AOV + annual plan
  const annualAov = roundCurrency(baseAssumptions.currentAov * 1.4);
  const annualPrice =
    typeof baseAssumptions.price === "number"
      ? roundCurrency(baseAssumptions.price * 1.4)
      : undefined;
  const annualChurn =
    typeof baseAssumptions.monthlyChurnRate === "number"
      ? clampFraction(baseAssumptions.monthlyChurnRate * 0.85)
      : undefined;
  const annualAssumptions: SimulatorAssumptionSet = {
    ...baseAssumptions,
    currentAov: annualAov,
    price: annualPrice,
    hasFreeTrial: false,
    offerKind: "annual-plan-discount",
    monthlyChurnRate: annualChurn,
  };
  const higherAovAnnual = simulateScenario(strategy, annualAssumptions);
  higherAovAnnual.scenarioId = "higher-aov-annual";
  higherAovAnnual.label = "Higher AOV + annual";
  higherAovAnnual.description =
    "Raises AOV 40% via annual plan; lowers churn 15% (annual lock-in)";

  const scenarios: SimulatorScenarioResult[] = [
    base,
    higherCpm,
    lowerCvr,
    slot4,
    higherAovAnnual,
  ];

  // ---- Plan-level warnings ---------------------------------------------

  const nonBase = scenarios.slice(1);
  const tightOrUnviableCount = nonBase.filter(
    (s) => s.viability === "tight" || s.viability === "unviable"
  ).length;
  if (base.viability === "viable" && tightOrUnviableCount >= 3) {
    planWarnings.push(onlyBaseViableWarning());
  }
  if (lowerCvr.viability === "unviable") {
    planWarnings.push(fragileToCvrDropWarning());
  }
  if (higherCpm.viability === "unviable") {
    planWarnings.push(fragileToCpmRiseWarning());
  }

  if (
    baseAssumptions.hasFreeTrial &&
    typeof baseAssumptions.trialToPaidRate === "number"
  ) {
    const trialDropAssumptions: SimulatorAssumptionSet = {
      ...baseAssumptions,
      trialToPaidRate: clampFraction(baseAssumptions.trialToPaidRate * 0.9),
    };
    const trialDropResult = simulateScenario(strategy, trialDropAssumptions);
    if (trialDropResult.viability === "unviable") {
      planWarnings.push(fragileToTrialDropWarning());
    }
  }

  // ---- Sensitivities ---------------------------------------------------

  const sensitivities = buildSensitivityResults(strategy, baseAssumptions);

  // ---- Recommendations -------------------------------------------------

  const recommendations = buildSimulatorRecommendations({
    base,
    scenarios,
    sensitivities,
  });

  // ---- Status classification ------------------------------------------

  const status = classifyPlanStatus({
    base,
    warnings: planWarnings,
  });

  return {
    status,
    baseAssumptions,
    scenarios,
    sensitivities,
    recommendations,
    warnings: planWarnings,
    derivedAt: 0,
  };
}

export function buildDefaultAssumptionSet(
  strategy: Strategy
): SimulatorAssumptionSet {
  const economics = strategy.unitEconomics;
  const forecast = strategy.forecast;

  const baseForecast = forecast
    ? forecast.scenarios.find((s) => s.kind === "base") ?? forecast.scenarios[0]
    : undefined;

  const fAssumptions = baseForecast?.outcome.assumptions;

  const cpm = roundCurrency(
    typeof fAssumptions?.cpm === "number" && fAssumptions.cpm > 0
      ? fAssumptions.cpm
      : FALLBACK_CPM
  );
  const ctr = clamp01(
    typeof fAssumptions?.ctr === "number" ? fAssumptions.ctr : FALLBACK_CTR
  );
  const cvr = clamp01(
    typeof fAssumptions?.cvr === "number" ? fAssumptions.cvr : FALLBACK_CVR
  );

  const totalBudget = roundCurrency(
    typeof forecast?.budget.totalTestBudget === "number" &&
      forecast.budget.totalTestBudget > 0
      ? forecast.budget.totalTestBudget
      : FALLBACK_TOTAL_BUDGET
  );
  const durationDays =
    typeof forecast?.budget.recommendedTestDurationDays === "number" &&
    forecast.budget.recommendedTestDurationDays > 0
      ? forecast.budget.recommendedTestDurationDays
      : FALLBACK_DURATION_DAYS;

  const grossMargin =
    typeof economics?.grossMargin === "number"
      ? clampFraction(economics.grossMargin)
      : FALLBACK_GROSS_MARGIN;

  const targetRoas =
    typeof economics?.targetRoas === "number" && economics.targetRoas > 0
      ? roundTo(economics.targetRoas, 2)
      : FALLBACK_TARGET_ROAS;

  const price =
    typeof economics?.resolvedPrice === "number" && economics.resolvedPrice > 0
      ? roundCurrency(economics.resolvedPrice)
      : undefined;

  const aov =
    typeof economics?.resolvedAov === "number" && economics.resolvedAov > 0
      ? roundCurrency(economics.resolvedAov)
      : typeof fAssumptions?.aov === "number" && fAssumptions.aov > 0
      ? roundCurrency(fAssumptions.aov)
      : typeof price === "number"
      ? price
      : FALLBACK_AOV;

  const isSubscription =
    economics?.businessModel === "subscription" ||
    economics?.businessModel === "freemium";

  // hasFreeTrial — subscription / freemium where the economics block
  // computed a trial-adjusted LTV (== resolvedPrice * trialToPaidRate
  // when adjusted) OR the economics warnings flag a missing trial rate.
  const hasFreeTrial = isSubscription && economicsHasFreeTrial(economics);

  // trialToPaidRate — derive from economics.subscription block when
  // present (trialAdjustedLtv / expectedLtv == trialToPaidRate when
  // hasFreeTrial). Else default.
  let trialToPaidRate: number | undefined;
  if (hasFreeTrial && economics?.subscription) {
    const sub = economics.subscription;
    if (
      typeof sub.trialAdjustedLtv === "number" &&
      typeof sub.expectedLtv === "number" &&
      sub.expectedLtv > 0
    ) {
      const ratio = sub.trialAdjustedLtv / sub.expectedLtv;
      if (ratio > 0 && ratio <= 1) {
        trialToPaidRate = clampFraction(ratio);
      }
    }
  }
  if (hasFreeTrial && trialToPaidRate === undefined) {
    trialToPaidRate = FALLBACK_TRIAL_TO_PAID;
  }

  // monthlyChurnRate — derive from subscription.expectedMonthsRetained.
  let monthlyChurnRate: number | undefined;
  if (isSubscription && economics?.subscription) {
    const months = economics.subscription.expectedMonthsRetained;
    if (typeof months === "number" && months > 0) {
      monthlyChurnRate = clampFraction(1 / months);
    }
  }
  if (isSubscription && monthlyChurnRate === undefined) {
    monthlyChurnRate = FALLBACK_MONTHLY_CHURN;
  }

  const offerKind = pickDefaultOfferKind(strategy.offers, isSubscription);

  return {
    price,
    currentAov: aov,
    grossMargin: roundTo(grossMargin, 4),
    targetRoas,
    trialToPaidRate:
      typeof trialToPaidRate === "number"
        ? roundTo(trialToPaidRate, 4)
        : undefined,
    monthlyChurnRate:
      typeof monthlyChurnRate === "number"
        ? roundTo(monthlyChurnRate, 4)
        : undefined,
    hasFreeTrial,
    cpm,
    ctr: roundTo(ctr, 4),
    cvr: roundTo(cvr, 4),
    totalBudget,
    durationDays,
    offerKind,
  };
}

export function simulateScenario(
  strategy: Strategy,
  assumptions: SimulatorAssumptionSet
): SimulatorScenarioResult {
  const spend = Math.max(0, assumptions.totalBudget);
  const expectedImpressions =
    assumptions.cpm > 0 ? Math.floor((spend / assumptions.cpm) * 1000) : 0;
  const expectedClicks = Math.floor(expectedImpressions * assumptions.ctr);
  const expectedConversions = Math.floor(expectedClicks * assumptions.cvr);

  const isSubscription = isSubscriptionFunnel(strategy);

  let revenue: number;
  let trialStarts: number | undefined;
  let paidConversions: number | undefined;
  let ltv: number | undefined;
  let paybackMonths: number | undefined;

  if (
    isSubscription &&
    assumptions.hasFreeTrial &&
    typeof assumptions.trialToPaidRate === "number"
  ) {
    // Subscription with free trial: conversions === trial starts.
    trialStarts = expectedConversions;
    const paid = trialStarts * assumptions.trialToPaidRate;
    paidConversions = Math.floor(paid);
    const monthlyPrice = assumptions.price ?? assumptions.currentAov;
    const expectedMonthsRetained = subscriptionMonthsRetained(
      assumptions.monthlyChurnRate
    );
    const monthlyContribution = monthlyPrice * assumptions.grossMargin;
    ltv = roundCurrency(monthlyContribution * expectedMonthsRetained);
    revenue = roundCurrency(paid * (ltv ?? 0));
    if (monthlyContribution > 0) {
      paybackMonths = computePaybackMonths(
        paidConversions > 0 ? spend / paidConversions : Infinity,
        monthlyContribution
      );
    }
  } else if (isSubscription) {
    // Subscription without trial: conversions === paid conversions.
    paidConversions = expectedConversions;
    const monthlyPrice = assumptions.price ?? assumptions.currentAov;
    const expectedMonthsRetained = subscriptionMonthsRetained(
      assumptions.monthlyChurnRate
    );
    const monthlyContribution = monthlyPrice * assumptions.grossMargin;
    ltv = roundCurrency(monthlyContribution * expectedMonthsRetained);
    revenue = roundCurrency(paidConversions * (ltv ?? 0));
    if (monthlyContribution > 0) {
      paybackMonths = computePaybackMonths(
        paidConversions > 0 ? spend / paidConversions : Infinity,
        monthlyContribution
      );
    }
  } else {
    // One-time / services / etc.
    revenue = roundCurrency(expectedConversions * assumptions.currentAov);
    // LTV for one-time === contribution margin per purchase.
    ltv = roundCurrency(assumptions.currentAov * assumptions.grossMargin);
  }

  const grossProfit = roundCurrency(revenue * assumptions.grossMargin);

  const cpa =
    expectedConversions > 0
      ? roundCurrency(spend / expectedConversions)
      : Infinity;

  const paidCac =
    typeof paidConversions === "number" && paidConversions > 0
      ? roundCurrency(spend / paidConversions)
      : typeof paidConversions === "number"
      ? Infinity
      : undefined;

  const roas = spend > 0 ? roundTo(revenue / spend, 4) : 0;

  let ltvToCacRatio: number | undefined;
  if (typeof ltv === "number" && ltv > 0) {
    const denom = typeof paidCac === "number" ? paidCac : cpa;
    if (typeof denom === "number" && Number.isFinite(denom) && denom > 0) {
      ltvToCacRatio = roundTo(ltv / denom, 4);
    } else if (denom === Infinity) {
      ltvToCacRatio = 0;
    }
  }

  const outcome: SimulatorOutcome = {
    expectedImpressions,
    expectedClicks,
    expectedConversions,
    trialStarts,
    paidConversions,
    revenue,
    grossProfit,
    cpa,
    paidCac,
    roas,
    ltv,
    ltvToCacRatio,
    paybackMonths,
  };

  const economics = strategy.unitEconomics;
  const breakevenRoas =
    typeof economics?.breakevenRoas === "number" &&
    Number.isFinite(economics.breakevenRoas)
      ? economics.breakevenRoas
      : assumptions.grossMargin > 0
      ? 1 / assumptions.grossMargin
      : Infinity;

  const viability = classifyScenarioViability({
    roas,
    breakevenRoas,
    targetRoas: assumptions.targetRoas,
    paidCac,
    cpa,
    ltv,
    ltvToCacRatio,
    paybackMonths,
  });

  const riskNote = composeRiskNote({
    viability,
    roas,
    targetRoas: assumptions.targetRoas,
    ltvToCacRatio,
    paybackMonths,
  });

  return {
    scenarioId: "base",
    label: "Base",
    description: "",
    assumptions,
    outcome,
    viability,
    riskNote,
    warnings: [],
  };
}

export function buildSensitivityResults(
  strategy: Strategy,
  base: SimulatorAssumptionSet
): SimulatorSensitivityResult[] {
  const baseResult = simulateScenario(strategy, base);
  const baseCpa = baseResult.outcome.cpa;
  const baseRoas = baseResult.outcome.roas;
  const basePayback = baseResult.outcome.paybackMonths;

  const results: SimulatorSensitivityResult[] = [];

  for (const lever of NUMERIC_LEVERS) {
    if (!isLeverApplicable(lever, base)) continue;
    const steps: SimulatorSensitivityStep[] = [];
    let maxNormalized = 0;
    for (const step of SENSITIVITY_STEPS) {
      const adjusted = applyLeverMultiplier(base, lever, step.multiplier);
      const r = simulateScenario(strategy, adjusted);
      const deltaCac = finiteDelta(r.outcome.cpa, baseCpa);
      const deltaRoas = finiteDelta(r.outcome.roas, baseRoas);
      const deltaPaybackMonths =
        typeof r.outcome.paybackMonths === "number" &&
        typeof basePayback === "number"
          ? roundTo(r.outcome.paybackMonths - basePayback, 4)
          : undefined;
      const norm = normalizeStep({
        deltaCac,
        baseCpa,
        deltaRoas,
        baseRoas,
        deltaPaybackMonths,
        basePayback,
      });
      if (norm > maxNormalized) maxNormalized = norm;
      steps.push({
        label: step.label,
        multiplier: step.multiplier,
        deltaCac,
        deltaRoas,
        deltaPaybackMonths,
        viabilityAtThisStep: r.viability,
      });
    }
    const sensitivityScore = clampNumber(
      Math.round(maxNormalized * 100),
      0,
      100
    );
    results.push({
      lever,
      steps,
      sensitivityScore,
    });
  }

  // Qualitative `offerKind` row — 3 candidate offers.
  const offerSteps: SimulatorSensitivityStep[] = [];
  let qualMax = 0;
  for (const offer of QUALITATIVE_OFFERS) {
    const adjusted = applyOfferKindShift(base, offer);
    const r = simulateScenario(strategy, adjusted);
    const deltaCac = finiteDelta(r.outcome.cpa, baseCpa);
    const deltaRoas = finiteDelta(r.outcome.roas, baseRoas);
    const deltaPaybackMonths =
      typeof r.outcome.paybackMonths === "number" &&
      typeof basePayback === "number"
        ? roundTo(r.outcome.paybackMonths - basePayback, 4)
        : undefined;
    const norm = normalizeStep({
      deltaCac,
      baseCpa,
      deltaRoas,
      baseRoas,
      deltaPaybackMonths,
      basePayback,
    });
    if (norm > qualMax) qualMax = norm;
    offerSteps.push({
      label: offer,
      multiplier: undefined,
      deltaCac,
      deltaRoas,
      deltaPaybackMonths,
      viabilityAtThisStep: r.viability,
    });
  }
  results.push({
    lever: "offerKind",
    steps: offerSteps,
    sensitivityScore: clampNumber(Math.round(qualMax * 100), 0, 100),
  });

  // Sort by sensitivityScore desc, then lever name asc for stability.
  results.sort((a, b) => {
    if (b.sensitivityScore !== a.sensitivityScore) {
      return b.sensitivityScore - a.sensitivityScore;
    }
    return a.lever < b.lever ? -1 : a.lever > b.lever ? 1 : 0;
  });

  return results;
}

export function buildSimulatorRecommendations(plan: {
  base: SimulatorScenarioResult;
  scenarios: SimulatorScenarioResult[];
  sensitivities: SimulatorSensitivityResult[];
}): SimulatorRecommendation[] {
  const { base, scenarios, sensitivities } = plan;
  const out: SimulatorRecommendation[] = [];

  const baseAssumptions = base.assumptions;
  const isSubscription = baseAssumptions.hasFreeTrial; // proxy for subscription+trial funnel
  const lowerCvr = scenarios.find((s) => s.scenarioId === "lower-cvr");

  const findSensitivity = (lever: SimulatorLever) =>
    sensitivities.find((s) => s.lever === lever);

  const priceSens = findSensitivity("price");
  const trialSens = findSensitivity("trialToPaidRate");
  const ltvToCac = base.outcome.ltvToCacRatio;

  // Rule 1 — Raise price 10-15%
  if (
    priceSens &&
    priceSens.sensitivityScore > 30 &&
    typeof ltvToCac === "number" &&
    ltvToCac > 4
  ) {
    out.push({
      id: "raise-price",
      title: "Raise price 10-15%",
      rationale: `LTV:CAC of ${ltvToCac.toFixed(2)}:1 leaves room to lift price without breaking payback.`,
      expectedImpact:
        "Improves contribution margin per conversion without proportional CAC rise.",
      priority: "should-do",
    });
  }

  // Rule 2 — Test 14-day trial
  if (
    isSubscription &&
    trialSens &&
    trialSens.sensitivityScore > 25 &&
    typeof baseAssumptions.trialToPaidRate === "number" &&
    baseAssumptions.trialToPaidRate < 0.3
  ) {
    out.push({
      id: "test-14-day-trial",
      title: "Test 14-day trial / better onboarding",
      rationale:
        "Trial-to-paid rate is below 30% and the lever moves outcomes — a longer trial or onboarding push pays back fast.",
      expectedImpact: "Pushes plan to viable across most scenarios.",
      priority: "must-do",
    });
  }

  // Rule 3 — Refresh creative when CPM or CTR is top sensitivity
  const top = sensitivities[0];
  if (top && (top.lever === "cpm" || top.lever === "ctr")) {
    out.push({
      id: "refresh-creative",
      title: "Refresh creative — CPM/CTR is your dominant risk",
      rationale: `${top.lever.toUpperCase()} is the highest-sensitivity lever (score ${top.sensitivityScore}).`,
      expectedImpact: "Cuts expected CPA by 15-25% when the new hook holds.",
      priority: "must-do",
    });
  }

  // Rule 4 — Lock conservative budget when fragile to CVR drop
  if (lowerCvr && lowerCvr.viability === "unviable") {
    out.push({
      id: "lock-conservative-budget",
      title: "Lock conservative budget at 70% of forecast",
      rationale:
        "A 30% CVR drop pushes the plan to unviable — start conservative until CVR holds.",
      expectedImpact:
        "Caps downside spend during the learning window without giving up upside.",
      priority: "must-do",
    });
  }

  // Rule 5 — Annual plan when subscription + payback > 9 months
  if (
    isSubscription &&
    typeof base.outcome.paybackMonths === "number" &&
    base.outcome.paybackMonths > 9
  ) {
    out.push({
      id: "annual-plan-discount",
      title: "Offer annual plan with discount",
      rationale: `Subscription payback ${base.outcome.paybackMonths.toFixed(1)}mo is above the 9-month cap.`,
      expectedImpact:
        "Shortens payback via upfront revenue and lowers churn through annual lock-in.",
      priority: "should-do",
    });
  }

  // Stable priority ordering: must-do → should-do → nice-to-have.
  const priorityRank: Record<SimulatorRecommendationPriority, number> = {
    "must-do": 0,
    "should-do": 1,
    "nice-to-have": 2,
  };
  out.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);

  return out.slice(0, 5);
}

// ---- Internals ---------------------------------------------------------

function emptyAssumptionSet(): SimulatorAssumptionSet {
  return {
    price: undefined,
    currentAov: 0,
    grossMargin: FALLBACK_GROSS_MARGIN,
    targetRoas: FALLBACK_TARGET_ROAS,
    trialToPaidRate: undefined,
    monthlyChurnRate: undefined,
    hasFreeTrial: false,
    cpm: FALLBACK_CPM,
    ctr: FALLBACK_CTR,
    cvr: FALLBACK_CVR,
    totalBudget: 0,
    durationDays: 0,
    offerKind: "none",
  };
}

function isSubscriptionFunnel(strategy: Strategy): boolean {
  const bm = strategy.unitEconomics?.businessModel;
  return bm === "subscription" || bm === "freemium";
}

function economicsHasFreeTrial(
  economics: UnitEconomicsSummary | undefined
): boolean {
  if (!economics || !economics.subscription) return false;
  const sub = economics.subscription;
  // Trial signal: trialAdjustedLtv differs from expectedLtv (i.e. the
  // calculator multiplied by trialToPaidRate < 1).
  if (
    typeof sub.trialAdjustedLtv === "number" &&
    typeof sub.expectedLtv === "number" &&
    sub.expectedLtv > 0 &&
    sub.trialAdjustedLtv < sub.expectedLtv
  ) {
    return true;
  }
  // Or: an economics warning surfaced the missing trial rate.
  return economics.warnings.some(
    (w) =>
      w.kind === "missing-trial-to-paid" ||
      w.kind === "subscription-without-trial-rate"
  );
}

function pickDefaultOfferKind(
  offers: OfferRecommendation[] | undefined,
  isSubscription: boolean
): string {
  if (offers && offers.length > 0) {
    const first = offers[0];
    if (first.kind === "free-trial") return "free-trial-7d";
    if (first.kind === "discount") {
      const pct =
        typeof first.discountPercent === "number" ? first.discountPercent : 20;
      return `discount-${pct}`;
    }
    return first.kind;
  }
  return isSubscription ? "free-trial-7d" : "discount-default";
}

function subscriptionMonthsRetained(churn: number | undefined): number {
  const c = typeof churn === "number" && churn > 0 ? churn : FALLBACK_MONTHLY_CHURN;
  const months = 1 / c;
  return clampNumber(months, 1, 48);
}

function computePaybackMonths(
  cac: number,
  monthlyContribution: number
): number | undefined {
  if (!Number.isFinite(cac)) return undefined;
  if (monthlyContribution <= 0) return undefined;
  const raw = cac / monthlyContribution;
  if (!Number.isFinite(raw) || raw < 0) return undefined;
  return roundTo(clampNumber(raw, 0.1, 96), 2);
}

interface ClassifyArgs {
  roas: number;
  breakevenRoas: number;
  targetRoas: number;
  paidCac?: number;
  cpa: number;
  ltv?: number;
  ltvToCacRatio?: number;
  paybackMonths?: number;
}

function classifyScenarioViability(args: ClassifyArgs): SimulatorViability {
  const {
    roas,
    breakevenRoas,
    targetRoas,
    paidCac,
    cpa,
    ltv,
    ltvToCacRatio,
    paybackMonths,
  } = args;

  // Unviable conditions
  if (Number.isFinite(breakevenRoas) && roas < breakevenRoas) return "unviable";
  if (
    typeof paidCac === "number" &&
    Number.isFinite(paidCac) &&
    typeof ltv === "number" &&
    paidCac > ltv
  ) {
    return "unviable";
  }
  if (typeof ltvToCacRatio === "number" && ltvToCacRatio < 1.0) {
    return "unviable";
  }
  // Zero conversions → unviable.
  if (!Number.isFinite(cpa)) return "unviable";

  // Tight conditions
  if (Number.isFinite(targetRoas) && roas < targetRoas) return "tight";
  if (typeof ltvToCacRatio === "number" && ltvToCacRatio < 3) return "tight";
  if (typeof paybackMonths === "number" && paybackMonths > 12) return "tight";

  return "viable";
}

function composeRiskNote(args: {
  viability: SimulatorViability;
  roas: number;
  targetRoas: number;
  ltvToCacRatio?: number;
  paybackMonths?: number;
}): string {
  const { viability, roas, targetRoas, ltvToCacRatio, paybackMonths } = args;
  switch (viability) {
    case "viable":
      return `ROAS ${roas.toFixed(2)}x clears target ${targetRoas.toFixed(2)}x with room to spare.`;
    case "tight": {
      if (typeof paybackMonths === "number" && paybackMonths > 12) {
        return `Payback ${paybackMonths.toFixed(1)}mo above the 12-month cap — cash will be tight.`;
      }
      if (typeof ltvToCacRatio === "number" && ltvToCacRatio < 3) {
        return `LTV:CAC ${ltvToCacRatio.toFixed(2)}:1 is below 3:1 — efficient creative non-negotiable.`;
      }
      return `ROAS ${roas.toFixed(2)}x is below target ${targetRoas.toFixed(2)}x — set kill rules early.`;
    }
    case "unviable":
      return `ROAS ${roas.toFixed(2)}x cannot pay back the spend — fix the funnel before launching.`;
    case "incomplete":
      return "Cannot classify viability — missing inputs.";
  }
}

function classifyPlanStatus(args: {
  base: SimulatorScenarioResult;
  warnings: SimulatorWarning[];
}): SimulatorViability {
  const { base, warnings } = args;
  const hasBlocker = warnings.some((w) => w.severity === "blocker");
  if (hasBlocker) return "unviable";
  if (base.viability === "unviable") return "unviable";
  const nonInfo = warnings.filter(
    (w) => w.severity === "warning" || w.severity === "blocker"
  ).length;
  if (base.viability === "tight" || nonInfo >= 2) return "tight";
  return "viable";
}

function isLeverApplicable(
  lever: SimulatorLever,
  base: SimulatorAssumptionSet
): boolean {
  switch (lever) {
    case "price":
      return typeof base.price === "number" && base.price > 0;
    case "trialToPaidRate":
      return (
        base.hasFreeTrial && typeof base.trialToPaidRate === "number"
      );
    case "monthlyChurnRate":
      return typeof base.monthlyChurnRate === "number";
    default:
      return true;
  }
}

function applyLeverMultiplier(
  base: SimulatorAssumptionSet,
  lever: SimulatorLever,
  multiplier: number
): SimulatorAssumptionSet {
  const next: SimulatorAssumptionSet = { ...base };
  switch (lever) {
    case "price":
      if (typeof next.price === "number") {
        next.price = roundCurrency(next.price * multiplier);
        // AOV moves with price when the price equals AOV (subscription) —
        // keep them tracking unless they explicitly diverge.
        if (next.currentAov === base.price) {
          next.currentAov = next.price;
        }
      }
      break;
    case "currentAov":
      next.currentAov = roundCurrency(next.currentAov * multiplier);
      break;
    case "grossMargin":
      next.grossMargin = clampFraction(next.grossMargin * multiplier);
      break;
    case "targetRoas":
      next.targetRoas = roundTo(next.targetRoas * multiplier, 4);
      break;
    case "trialToPaidRate":
      if (typeof next.trialToPaidRate === "number") {
        next.trialToPaidRate = clampFraction(
          next.trialToPaidRate * multiplier
        );
      }
      break;
    case "monthlyChurnRate":
      if (typeof next.monthlyChurnRate === "number") {
        next.monthlyChurnRate = clampFraction(
          next.monthlyChurnRate * multiplier
        );
      }
      break;
    case "cpm":
      next.cpm = roundCurrency(next.cpm * multiplier);
      break;
    case "ctr":
      next.ctr = clamp01(next.ctr * multiplier);
      break;
    case "cvr":
      next.cvr = clamp01(next.cvr * multiplier);
      break;
    case "totalBudget":
      next.totalBudget = roundCurrency(next.totalBudget * multiplier);
      break;
    case "durationDays":
      next.durationDays = Math.max(1, Math.round(next.durationDays * multiplier));
      break;
    case "offerKind":
      // No-op for numeric multiplier on qualitative lever.
      break;
  }
  return next;
}

function applyOfferKindShift(
  base: SimulatorAssumptionSet,
  offerKind: string
): SimulatorAssumptionSet {
  const next: SimulatorAssumptionSet = { ...base, offerKind };
  switch (offerKind) {
    case "free-trial-7d":
      next.hasFreeTrial = true;
      if (typeof next.trialToPaidRate !== "number") {
        next.trialToPaidRate = FALLBACK_TRIAL_TO_PAID;
      }
      break;
    case "free-trial-14d":
      next.hasFreeTrial = true;
      // 14-day trials trade lower trial-to-paid for higher signups —
      // model as a 10% lift to trial-to-paid (deterministic constant).
      if (typeof next.trialToPaidRate === "number") {
        next.trialToPaidRate = clampFraction(next.trialToPaidRate * 1.1);
      } else {
        next.trialToPaidRate = FALLBACK_TRIAL_TO_PAID;
      }
      break;
    case "annual-plan-discount":
      next.hasFreeTrial = false;
      next.currentAov = roundCurrency(next.currentAov * 1.4);
      if (typeof next.price === "number") {
        next.price = roundCurrency(next.price * 1.4);
      }
      if (typeof next.monthlyChurnRate === "number") {
        next.monthlyChurnRate = clampFraction(next.monthlyChurnRate * 0.85);
      }
      break;
  }
  return next;
}

function finiteDelta(value: number, baseValue: number): number | undefined {
  if (!Number.isFinite(value) || !Number.isFinite(baseValue)) return undefined;
  return roundTo(value - baseValue, 4);
}

function normalizeStep(args: {
  deltaCac?: number;
  baseCpa: number;
  deltaRoas?: number;
  baseRoas: number;
  deltaPaybackMonths?: number;
  basePayback: number | undefined;
}): number {
  const cacNorm =
    typeof args.deltaCac === "number" &&
    Number.isFinite(args.baseCpa) &&
    args.baseCpa > 0
      ? Math.abs(args.deltaCac) / args.baseCpa
      : 0;
  const roasNorm =
    typeof args.deltaRoas === "number" && args.baseRoas > 0
      ? Math.abs(args.deltaRoas) / args.baseRoas
      : 0;
  const paybackNorm =
    typeof args.deltaPaybackMonths === "number" &&
    typeof args.basePayback === "number" &&
    args.basePayback > 0
      ? Math.abs(args.deltaPaybackMonths) / args.basePayback
      : 0;
  return Math.max(cacNorm, roasNorm, paybackNorm);
}

// ---- Math helpers ------------------------------------------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clampFraction(x: number): number {
  if (!Number.isFinite(x)) return MIN_FRACTION;
  if (x < MIN_FRACTION) return MIN_FRACTION;
  if (x > MAX_FRACTION) return MAX_FRACTION;
  return x;
}

function clampNumber(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function roundCurrency(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function roundTo(x: number, decimals: number): number {
  if (!Number.isFinite(x)) return 0;
  const f = Math.pow(10, decimals);
  return Math.round(x * f) / f;
}

// ---- Warning composers -------------------------------------------------

function makeWarning(
  kind: SimulatorWarningKind,
  severity: SimulatorWarning["severity"],
  message: string,
  fix: string
): SimulatorWarning {
  return { kind, severity, message, fix };
}

function onlyBaseViableWarning(): SimulatorWarning {
  return makeWarning(
    "only-base-viable",
    "warning",
    "Plan only viable in base scenario — fragile to one negative lever.",
    "Tighten kill rules and stress-test the riskiest lever before scaling."
  );
}

function fragileToCvrDropWarning(): SimulatorWarning {
  return makeWarning(
    "fragile-to-cvr-drop",
    "warning",
    "A 30% CVR drop pushes the plan to unviable.",
    "Set a CVR kill rule at Day 3 and pre-build a stronger LP variant."
  );
}

function fragileToCpmRiseWarning(): SimulatorWarning {
  return makeWarning(
    "fragile-to-cpm-rise",
    "warning",
    "A 30% CPM rise pushes the plan to unviable.",
    "Refresh creative cadence and broaden audience to keep CPMs flat."
  );
}

function fragileToTrialDropWarning(): SimulatorWarning {
  return makeWarning(
    "fragile-to-trial-drop",
    "warning",
    "A 10% drop in trial-to-paid rate pushes the plan to unviable.",
    "Strengthen onboarding and add a paywall trigger inside the trial."
  );
}

function noEconomicsWarning(): SimulatorWarning {
  return makeWarning(
    "no-economics",
    "info",
    "Unit economics not resolvable — simulator falls back to defaults.",
    "Provide price and commercial inputs so scenarios reflect this product."
  );
}

function noForecastWarning(): SimulatorWarning {
  return makeWarning(
    "no-forecast",
    "info",
    "Forecast plan missing — simulator uses default cpm/ctr/cvr baselines.",
    "Build the creative testing matrix so forecast assumptions exist."
  );
}

function noBaseAssumptionsWarning(): SimulatorWarning {
  return makeWarning(
    "no-base-assumptions",
    "blocker",
    "Cannot derive base assumptions — neither economics nor forecast is present.",
    "Provide commercial inputs and a test matrix before running the simulator."
  );
}

