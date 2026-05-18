// budget-forecast.ts — Forecast / Budget Planner engine.
//
// Pure deterministic derivation. Given a Strategy (with unitEconomics,
// kpiTargetLadder, creativeTestingMatrix, campaignSetup, and
// trackingReadiness already populated), emits a `ForecastPlan` carrying:
//
//   - A budget recommendation (total test budget, daily budget,
//     duration, minimum learning budget, one-line reasoning)
//   - Three deterministic scenarios (conservative / base / aggressive)
//     with funnel math at each level
//   - A spend allocation table (campaign / ad-set / test-cell rows)
//   - Decision checkpoints (Day 1 / Day 3 / Day 5 / end-of-test)
//   - Plan-level warnings + a confidence + readiness classification
//
// Never calls `Date.now()` — every output has `derivedAt = 0`.

import type {
  BusinessModel,
  CampaignSpec,
  CreativeTestingMatrix,
  KpiTarget,
  KpiTargetLadder,
  Strategy,
  TestCell,
  TrackingReadinessScore,
  UnitEconomicsSummary,
} from "@/types/strategy";
import type {
  BudgetRecommendation,
  DecisionCheckpoint,
  ForecastOutcome,
  ForecastPlan,
  ForecastReadinessStatus,
  ForecastScenario,
  ForecastWarning,
  SpendAllocation,
} from "@/types/forecast";

// ---- Defaults ----------------------------------------------------------

const SCENARIO_MULT = {
  conservative: { ctr: 0.7, cvr: 0.7, cpm: 1.2 },
  base: { ctr: 1.0, cvr: 1.0, cpm: 1.0 },
  aggressive: { ctr: 1.3, cvr: 1.3, cpm: 0.85 },
} as const;

const DEFAULT_CTR_COLD = 0.012; // 1.2%
const DEFAULT_CTR_RETARGET = 0.025; // 2.5%

const MIN_CONVERSIONS_PER_CELL = 5;
const MIN_DAILY_PER_CELL = 10;
const MAX_DAILY_PER_CELL = 30;
const MIN_DURATION_DAYS = 3;
const MAX_DURATION_DAYS = 14;
const TRACKING_NOT_READY_FLOOR = 70;
const MIN_TEST_CELLS_FOR_HIGH_CONFIDENCE = 3;

// Fallbacks when economics / cells are entirely absent.
const FALLBACK_TOTAL_BUDGET = 500;
const FALLBACK_DAILY_BUDGET = 50;
const FALLBACK_DURATION_DAYS = 7;
const FALLBACK_MIN_LEARNING = 500;

// ---- Public API --------------------------------------------------------

export function buildForecastPlan(strategy: Strategy): ForecastPlan {
  const economics = strategy.unitEconomics;
  const tracking = strategy.trackingReadiness;
  const kpiLadder = strategy.kpiLadder;
  const testCells = strategy.creativeTestingMatrix?.recommendedFirstBatch
    ? resolveFirstBatchCells(strategy.creativeTestingMatrix)
    : [];

  const planWarnings: ForecastWarning[] = [];

  // Source signals — gather warnings about missing inputs.
  if (!economics || economics.status === "incomplete") {
    planWarnings.push(noEconomicsWarning());
  }
  if (!kpiLadder || kpiLadder.targets.length === 0) {
    planWarnings.push(noKpiTargetsWarning());
  }
  if (testCells.length === 0) {
    planWarnings.push(noTestCellsWarning());
  }
  if (tracking && tracking.score < TRACKING_NOT_READY_FLOOR) {
    planWarnings.push(trackingNotReadyWarning(tracking.score));
  }
  // Always-on info: no historical results to calibrate against.
  planWarnings.push(lowConfidenceNoHistoryWarning());

  // Build scenarios first (base outcome drives the budget calc).
  const scenarios = buildForecastScenarios(strategy);
  const baseScenario =
    scenarios.find((s) => s.kind === "base") ?? scenarios[0] ?? null;
  const baseOutcome = baseScenario?.outcome ?? null;

  // Budget recommendation — function of base scenario + economics + cells.
  const budget = computeBudgetRecommendation({
    economics,
    testCells,
    creativeTestingMatrix: strategy.creativeTestingMatrix,
    baseOutcome,
  });

  // Now that scenarios have a real spend anchor, re-fill the
  // outcome-spend-dependent fields (CPA / ROAS / breakeven). We
  // re-call the scenario builder with the resolved spend so the per-
  // scenario expectedCpa / expectedRoas reflect the recommendation.
  const scenariosResolved = scenarios.map((s) =>
    finaliseScenarioWithSpend(s, budget.totalTestBudget, budget.recommendedTestDurationDays)
  );

  // Now compute plan-level warnings that depend on the resolved
  // budget / scenario math.
  const resolvedBase = scenariosResolved.find((s) => s.kind === "base");
  const resolvedConservative = scenariosResolved.find(
    (s) => s.kind === "conservative"
  );

  // budget-below-learning-minimum
  if (budget.totalTestBudget < budget.minimumLearningBudget) {
    planWarnings.push(budgetBelowLearningWarning());
  }

  // expected-cpa-above-allowable-cac
  if (
    economics &&
    typeof economics.allowableCac === "number" &&
    resolvedBase &&
    typeof resolvedBase.outcome.expectedCpa === "number" &&
    resolvedBase.outcome.expectedCpa > economics.allowableCac
  ) {
    planWarnings.push(
      expectedCpaAboveAllowableCacWarning(
        resolvedBase.outcome.expectedCpa,
        economics.allowableCac
      )
    );
  }

  // conservative-roas-below-target
  if (
    economics &&
    typeof economics.targetRoas === "number" &&
    resolvedConservative &&
    typeof resolvedConservative.outcome.expectedRoas === "number" &&
    resolvedConservative.outcome.expectedRoas < economics.targetRoas
  ) {
    planWarnings.push(
      conservativeRoasBelowTargetWarning(
        resolvedConservative.outcome.expectedRoas,
        economics.targetRoas
      )
    );
  }

  // conservative-roas-below-breakeven (blocker)
  if (
    economics &&
    typeof economics.breakevenRoas === "number" &&
    Number.isFinite(economics.breakevenRoas) &&
    resolvedConservative &&
    typeof resolvedConservative.outcome.expectedRoas === "number" &&
    resolvedConservative.outcome.expectedRoas < economics.breakevenRoas
  ) {
    planWarnings.push(
      conservativeRoasBelowBreakevenWarning(
        resolvedConservative.outcome.expectedRoas,
        economics.breakevenRoas
      )
    );
  }

  const allocation = allocateBudgetAcrossTestCellsInternal({
    testCells,
    campaigns: strategy.campaignSetup?.campaigns ?? [],
    totalTestBudget: budget.totalTestBudget,
    recommendedTestDurationDays: budget.recommendedTestDurationDays,
  });

  const decisionCheckpoints = buildDecisionCheckpointsInternal({
    testCells,
    baseOutcome: resolvedBase?.outcome ?? null,
    economics,
    durationDays: budget.recommendedTestDurationDays,
    budget,
  });

  const confidence = classifyConfidence({
    economics,
    kpiLadder,
    tracking,
    testCells,
    warnings: planWarnings,
  });

  const plan: ForecastPlan = {
    status: "incomplete",
    confidence,
    budget,
    scenarios: scenariosResolved,
    allocation,
    decisionCheckpoints,
    warnings: planWarnings,
    derivedAt: 0,
  };

  plan.status = classifyForecastReadiness(plan);
  return plan;
}

export function buildForecastScenarios(strategy: Strategy): ForecastScenario[] {
  const economics = strategy.unitEconomics;
  const kpiLadder = strategy.kpiLadder;
  const cellCount = (strategy.creativeTestingMatrix?.recommendedFirstBatch ?? [])
    .length;

  const businessModel: BusinessModel | undefined = strategy
    .creativeTestingMatrix
    ? // creative testing matrix carries no businessModel by itself — fall
      // back to the resolved economics businessModel string when present.
      ((economics?.businessModel as BusinessModel | undefined) ?? undefined)
    : ((economics?.businessModel as BusinessModel | undefined) ?? undefined);

  const baseAssumptions = pickBaseAssumptions({
    businessModel,
    kpiLadder,
    economics,
  });

  // Pre-spend per-scenario assumption multipliers + outcome math. The
  // spend / duration aren't known yet at this point — they'll be
  // re-filled by `finaliseScenarioWithSpend` after the budget block
  // computes the recommendation. We emit zeros here so the engine
  // remains pure (no Date.now / no rng) and the resolved values
  // overwrite cleanly downstream.
  const kinds: Array<keyof typeof SCENARIO_MULT> = [
    "conservative",
    "base",
    "aggressive",
  ];

  const scenarios: ForecastScenario[] = kinds.map((kind) => {
    const mult = SCENARIO_MULT[kind];
    const cpm = roundCurrency(baseAssumptions.cpm * mult.cpm);
    const ctr = clamp01(baseAssumptions.ctr * mult.ctr);
    const cvr = clamp01(baseAssumptions.cvr * mult.cvr);
    const cpc = ctr > 0 ? roundCurrency(cpm / (ctr * 1000)) : 0;
    const aov = baseAssumptions.aov;

    // The pre-spend outcome is a placeholder — finaliseScenarioWithSpend
    // overwrites the funnel quantities.
    const outcome: ForecastOutcome = {
      scenario: kind,
      assumptions: {
        cpm,
        ctr: roundTo(ctr, 4),
        cpc,
        cvr: roundTo(cvr, 4),
        aov,
      },
      expectedImpressions: 0,
      expectedClicks: 0,
      expectedConversions: 0,
    };

    return {
      kind,
      // Spend / duration filled later via finaliseScenarioWithSpend.
      budget: 0,
      durationDays: 0,
      outcome,
      warnings: [],
    };
  });

  // When there are zero test cells, surface a per-scenario warning so
  // the caller sees the missing input even before the plan-level
  // warning shows up.
  if (cellCount === 0) {
    for (const s of scenarios) s.warnings.push(noTestCellsWarning());
  }

  return scenarios;
}

export function allocateBudgetAcrossTestCells(
  strategy: Strategy
): SpendAllocation[] {
  const testCells = strategy.creativeTestingMatrix?.recommendedFirstBatch
    ? resolveFirstBatchCells(strategy.creativeTestingMatrix)
    : [];
  const economics = strategy.unitEconomics;
  const baseOutcome = buildForecastScenarios(strategy).find(
    (s) => s.kind === "base"
  )?.outcome ?? null;
  const budget = computeBudgetRecommendation({
    economics,
    testCells,
    creativeTestingMatrix: strategy.creativeTestingMatrix,
    baseOutcome,
  });

  return allocateBudgetAcrossTestCellsInternal({
    testCells,
    campaigns: strategy.campaignSetup?.campaigns ?? [],
    totalTestBudget: budget.totalTestBudget,
    recommendedTestDurationDays: budget.recommendedTestDurationDays,
  });
}

export function buildDecisionCheckpoints(
  strategy: Strategy
): DecisionCheckpoint[] {
  const testCells = strategy.creativeTestingMatrix?.recommendedFirstBatch
    ? resolveFirstBatchCells(strategy.creativeTestingMatrix)
    : [];
  const economics = strategy.unitEconomics;
  const baseScenario = buildForecastScenarios(strategy).find(
    (s) => s.kind === "base"
  );
  const budget = computeBudgetRecommendation({
    economics,
    testCells,
    creativeTestingMatrix: strategy.creativeTestingMatrix,
    baseOutcome: baseScenario?.outcome ?? null,
  });
  return buildDecisionCheckpointsInternal({
    testCells,
    baseOutcome: baseScenario?.outcome ?? null,
    economics,
    durationDays: budget.recommendedTestDurationDays,
    budget,
  });
}

export function classifyForecastReadiness(
  plan: ForecastPlan
): ForecastReadinessStatus {
  const hasBlocker = plan.warnings.some((w) => w.severity === "blocker");
  if (hasBlocker) return "unviable";

  const hasNoEconomics = plan.warnings.some((w) => w.kind === "no-economics");
  const hasNoTestCells = plan.warnings.some((w) => w.kind === "no-test-cells");
  if (hasNoEconomics && hasNoTestCells) return "incomplete";

  const nonInfo = plan.warnings.filter(
    (w) => w.severity === "warning" || w.severity === "blocker"
  ).length;

  if (nonInfo >= 2 || plan.confidence === "low") return "tight";
  return "viable";
}

// ---- Internals ---------------------------------------------------------

function resolveFirstBatchCells(matrix: CreativeTestingMatrix): TestCell[] {
  const ids = new Set(matrix.recommendedFirstBatch);
  return matrix.testCells.filter((c) => ids.has(c.id));
}

interface BaseAssumptions {
  cpm: number;
  ctr: number;
  cvr: number;
  aov?: number;
}

function pickBaseAssumptions(args: {
  businessModel: BusinessModel | undefined;
  kpiLadder: KpiTargetLadder | undefined;
  economics: UnitEconomicsSummary | undefined;
}): BaseAssumptions {
  const { businessModel, kpiLadder, economics } = args;

  // CPM — prefer KPI starter breakeven (lower-better → starter is the
  // most permissive ceiling, which we use as the planning anchor).
  const cpmFromLadder = findKpi(kpiLadder, "cpm", "starter")?.breakeven;
  const cpm = cpmFromLadder ?? cpmDefault(businessModel);

  // CTR — KPI ladder stores CTR as a percent. Convert to fraction.
  const ctrFromLadderPct = findKpi(kpiLadder, "ctr", "starter")?.breakeven;
  const ctrFraction =
    typeof ctrFromLadderPct === "number" ? ctrFromLadderPct / 100 : undefined;
  const ctr = clamp01(ctrFraction ?? DEFAULT_CTR_COLD);

  // CVR — KPI ladder stores CVR as a percent.
  const cvrFromLadderPct = findKpi(kpiLadder, "cvr", "starter")?.breakeven;
  const cvrFraction =
    typeof cvrFromLadderPct === "number" ? cvrFromLadderPct / 100 : undefined;
  const cvr = clamp01(cvrFraction ?? cvrDefault(businessModel));

  // AOV / revenue source — economics first, then absent.
  const aov = pickRevenuePerConversion(economics);

  return {
    cpm: roundCurrency(cpm),
    ctr: roundTo(ctr, 4),
    cvr: roundTo(cvr, 4),
    aov,
  };
}

function pickRevenuePerConversion(
  economics: UnitEconomicsSummary | undefined
): number | undefined {
  if (!economics) return undefined;
  if (typeof economics.resolvedAov === "number" && economics.resolvedAov > 0) {
    return economics.resolvedAov;
  }
  if (
    economics.subscription &&
    typeof economics.subscription.trialAdjustedLtv === "number" &&
    economics.subscription.trialAdjustedLtv > 0
  ) {
    return economics.subscription.trialAdjustedLtv;
  }
  if (typeof economics.expectedLtv === "number" && economics.expectedLtv > 0) {
    return economics.expectedLtv;
  }
  return undefined;
}

function cpmDefault(model: BusinessModel | undefined): number {
  switch (model) {
    case "subscription":
    case "freemium":
      return 20;
    case "one-time":
    case "marketplace":
      return 15;
    case "services":
      return 25;
    case "ads":
    case "other":
    default:
      return 15;
  }
}

function cvrDefault(model: BusinessModel | undefined): number {
  switch (model) {
    case "subscription":
    case "freemium":
      return 0.025;
    case "one-time":
    case "marketplace":
      return 0.018;
    case "services":
      return 0.03;
    case "ads":
    case "other":
    default:
      return 0.02;
  }
}

function findKpi(
  ladder: KpiTargetLadder | undefined,
  kpi: KpiTarget["kpi"],
  tier: KpiTarget["tier"]
): KpiTarget | undefined {
  if (!ladder) return undefined;
  return ladder.targets.find((t) => t.kpi === kpi && t.tier === tier);
}

// ---- Budget recommendation --------------------------------------------

interface ComputeBudgetArgs {
  economics: UnitEconomicsSummary | undefined;
  testCells: TestCell[];
  creativeTestingMatrix: CreativeTestingMatrix | undefined;
  baseOutcome: ForecastOutcome | null;
}

function computeBudgetRecommendation(
  args: ComputeBudgetArgs
): BudgetRecommendation {
  const { economics, testCells, creativeTestingMatrix, baseOutcome } = args;
  const cellCount = testCells.length;

  // Fallback when economics OR cells are absent.
  if (!economics || cellCount === 0) {
    return {
      totalTestBudget: FALLBACK_TOTAL_BUDGET,
      recommendedDailyBudget: FALLBACK_DAILY_BUDGET,
      recommendedTestDurationDays: FALLBACK_DURATION_DAYS,
      minimumLearningBudget: FALLBACK_MIN_LEARNING,
      reasoning:
        cellCount === 0
          ? "No test cells yet — defaulting to $50/day × 7 days for a generic learning floor."
          : "No economics signal — defaulting to $50/day × 7 days for a generic learning floor.",
    };
  }

  // Expected CPA at the base scenario — pulled from baseOutcome if
  // present (pre-spend math means CPA is undefined; we re-derive from
  // assumptions). Falls back to allowable CAC × 1.0 when math fails.
  const expectedCpaBase = pickExpectedCpaBase({ economics, baseOutcome });

  // recommendedDailyBudget per cell = clamp(expectedCpa × 1.5, $10, $30).
  const dailyPerCell = clampNumber(
    expectedCpaBase * 1.5,
    MIN_DAILY_PER_CELL,
    MAX_DAILY_PER_CELL
  );
  const recommendedDailyBudget = roundCurrency(dailyPerCell * cellCount);

  // minimumLearningBudget — max(expectedCpa × minConv × cells,
  // cells × $15/day × 3 days).
  const conversionFloor =
    expectedCpaBase * MIN_CONVERSIONS_PER_CELL * cellCount;
  const dayFloor = cellCount * 15 * 3;
  const minimumLearningBudget = roundCurrency(
    Math.max(conversionFloor, dayFloor)
  );

  // recommendedTestDurationDays — clamp(max(MIN, smallestEstimated,
  // ceil(minimumLearning / dailyBudget)), MIN, MAX).
  const smallestEstimated =
    testCells.length > 0
      ? Math.min(...testCells.map((c) => c.estimatedRunDays))
      : MIN_DURATION_DAYS;
  const durationFromLearning =
    recommendedDailyBudget > 0
      ? Math.ceil(minimumLearningBudget / recommendedDailyBudget)
      : MIN_DURATION_DAYS;
  const recommendedTestDurationDays = clampNumber(
    Math.max(MIN_DURATION_DAYS, smallestEstimated, durationFromLearning),
    MIN_DURATION_DAYS,
    MAX_DURATION_DAYS
  );

  const totalTestBudget = roundCurrency(
    recommendedDailyBudget * recommendedTestDurationDays
  );

  const reasoning = `${cellCount} cells × $${roundCurrency(dailyPerCell).toFixed(0)}/day × ${recommendedTestDurationDays} days for ${MIN_CONVERSIONS_PER_CELL} conv/cell @ $${roundCurrency(expectedCpaBase).toFixed(2)} expected CPA`;

  // Avoid unused-vars lint when matrix is provided but unused here.
  void creativeTestingMatrix;

  return {
    totalTestBudget,
    recommendedDailyBudget,
    recommendedTestDurationDays,
    minimumLearningBudget,
    reasoning,
  };
}

function pickExpectedCpaBase(args: {
  economics: UnitEconomicsSummary;
  baseOutcome: ForecastOutcome | null;
}): number {
  const { economics, baseOutcome } = args;

  // Prefer breakevenCpa as the most-direct dollar anchor; falls back
  // to allowableCac × 1.5 when missing.
  if (
    typeof economics.breakevenCpa === "number" &&
    economics.breakevenCpa > 0
  ) {
    return economics.breakevenCpa;
  }
  if (
    typeof economics.allowableCac === "number" &&
    economics.allowableCac > 0
  ) {
    return economics.allowableCac;
  }
  // Worst case — try to derive from base outcome assumptions
  // (cpc / cvr). When CVR is 0 this falls back to 30.
  if (
    baseOutcome &&
    typeof baseOutcome.assumptions.cpc === "number" &&
    typeof baseOutcome.assumptions.cvr === "number" &&
    baseOutcome.assumptions.cvr > 0
  ) {
    return roundCurrency(
      baseOutcome.assumptions.cpc / baseOutcome.assumptions.cvr
    );
  }
  return 30;
}

// ---- Scenario finalisation --------------------------------------------

function finaliseScenarioWithSpend(
  scenario: ForecastScenario,
  totalTestBudget: number,
  durationDays: number
): ForecastScenario {
  const { assumptions } = scenario.outcome;
  const spend = totalTestBudget;

  // Impressions = (spend / cpm) × 1000.
  const expectedImpressions =
    assumptions.cpm > 0 ? Math.floor((spend / assumptions.cpm) * 1000) : 0;
  const expectedClicks = Math.floor(expectedImpressions * assumptions.ctr);
  const expectedConversions = Math.floor(expectedClicks * assumptions.cvr);

  const expectedCpc =
    expectedClicks > 0 ? roundCurrency(spend / expectedClicks) : undefined;
  const expectedCpa =
    expectedConversions > 0
      ? roundCurrency(spend / expectedConversions)
      : undefined;

  let expectedRevenue: number | undefined;
  let expectedRoas: number | undefined;
  let breakEvenSpend: number | undefined;
  if (typeof assumptions.aov === "number" && expectedConversions > 0) {
    expectedRevenue = roundCurrency(expectedConversions * assumptions.aov);
    expectedRoas = spend > 0 ? roundTo(expectedRevenue / spend, 4) : undefined;
    // Per-dollar revenue at this funnel; breakEvenSpend = spend such
    // that expectedRevenue === spend, i.e. expectedRoas === 1. Solving
    // analytically: spend = (cpm/1000) / (ctr × cvr × aov)^{-1}? Simpler
    // to derive from the per-dollar-spend revenue rate:
    if (assumptions.cpm > 0) {
      const impressionsPerDollar = 1000 / assumptions.cpm;
      const revenuePerDollar =
        impressionsPerDollar * assumptions.ctr * assumptions.cvr *
        assumptions.aov;
      if (revenuePerDollar > 0) {
        breakEvenSpend = roundCurrency(spend); // any spend breaks even at
        // ROAS=1; if revenuePerDollar < 1, breakEvenSpend = Infinity →
        // represent as undefined so consumers don't pretend a known
        // value.
        if (revenuePerDollar < 1) breakEvenSpend = undefined;
      }
    }
  }

  return {
    ...scenario,
    budget: roundCurrency(spend),
    durationDays,
    outcome: {
      ...scenario.outcome,
      expectedImpressions,
      expectedClicks,
      expectedConversions,
      expectedCpc,
      expectedCpa,
      expectedRevenue,
      expectedRoas,
      breakEvenSpend,
    },
  };
}

// ---- Allocation --------------------------------------------------------

interface AllocateArgs {
  testCells: TestCell[];
  campaigns: CampaignSpec[];
  totalTestBudget: number;
  recommendedTestDurationDays: number;
}

function allocateBudgetAcrossTestCellsInternal(
  args: AllocateArgs
): SpendAllocation[] {
  const { testCells, campaigns, totalTestBudget, recommendedTestDurationDays } =
    args;
  const out: SpendAllocation[] = [];

  if (testCells.length === 0) return out;

  // Campaign / ad-set rows (hints — equal split when no explicit
  // budgetSplit is provided). The test-cell rows are the authoritative
  // numeric source; campaign rows are informative.
  if (campaigns.length > 0) {
    const campaignCount = campaigns.length;
    for (let ci = 0; ci < campaigns.length; ci += 1) {
      const camp = campaigns[ci];
      const share = parseShareOrEven(camp.adSets, 1 / campaignCount);
      const budget = roundCurrency(totalTestBudget * share);
      const daily = roundCurrency(
        recommendedTestDurationDays > 0
          ? budget / recommendedTestDurationDays
          : 0
      );
      out.push({
        refKind: "campaign",
        refId: `campaign-${ci + 1}`,
        refLabel: camp.name,
        budget,
        dailyBudget: daily,
        shareOfTotal: roundTo(share, 4),
        rationale: `Campaign ${camp.name} — test cells reside here`,
      });

      // Ad-set rows inside the campaign.
      for (let ai = 0; ai < camp.adSets.length; ai += 1) {
        const adSet = camp.adSets[ai];
        const adSetShare =
          parseSinglePercent(adSet.budgetSplit) ?? 1 / camp.adSets.length;
        const adSetAbsShare = share * adSetShare;
        const adSetBudget = roundCurrency(totalTestBudget * adSetAbsShare);
        const adSetDaily = roundCurrency(
          recommendedTestDurationDays > 0
            ? adSetBudget / recommendedTestDurationDays
            : 0
        );
        out.push({
          refKind: "ad-set",
          refId: `campaign-${ci + 1}-adset-${ai + 1}`,
          refLabel: adSet.name,
          budget: adSetBudget,
          dailyBudget: adSetDaily,
          shareOfTotal: roundTo(adSetAbsShare, 4),
          rationale: `Ad set ${adSet.name} — audience ${adSet.audienceTier} (${adSet.budgetSplit})`,
        });
      }
    }
  }

  // Test-cell rows — equal split for one-variable-at-a-time discipline.
  // The sum of test-cell rows MUST equal totalTestBudget within ±$0.01.
  const cellCount = testCells.length;
  const perCellRaw = totalTestBudget / cellCount;
  const perCell = roundCurrency(perCellRaw);
  // Distribute rounding remainder across the first N cells.
  const cellBudgets = distributeBudget(totalTestBudget, cellCount);
  for (let i = 0; i < testCells.length; i += 1) {
    const cell = testCells[i];
    const cellBudget = cellBudgets[i];
    const cellDaily = roundCurrency(
      recommendedTestDurationDays > 0
        ? cellBudget / recommendedTestDurationDays
        : 0
    );
    const share = totalTestBudget > 0 ? cellBudget / totalTestBudget : 0;
    out.push({
      refKind: "test-cell",
      refId: cell.id,
      refLabel: `${cell.id} (${cell.angle} · ${cell.format} · ${cell.audienceTier})`,
      budget: cellBudget,
      dailyBudget: cellDaily,
      shareOfTotal: roundTo(share, 4),
      rationale: `Cell ${cell.id} (hook + format + tier) — equal split for one-variable testing`,
    });
  }

  // Silence unused var warning.
  void perCell;
  void perCellRaw;

  return out;
}

function distributeBudget(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / parts);
  const remainder = cents - base * parts;
  const out: number[] = new Array(parts).fill(0).map((_, i) =>
    i < remainder ? (base + 1) / 100 : base / 100
  );
  // Sum must equal total within ±$0.01. We already preserve cents
  // exactly, so this is exact by construction.
  return out;
}

function parseShareOrEven(
  adSets: CampaignSpec["adSets"],
  fallback: number
): number {
  // Sum the ad-sets' budgetSplit percents — if they parse, treat them
  // as the relative campaign share against the global pool. When all
  // ad sets are "100%" (single ad set), that's a 100% share for the
  // campaign too — but only one campaign, so the fallback handles it.
  const parsedShares = adSets
    .map((a) => parseSinglePercent(a.budgetSplit))
    .filter((v): v is number => typeof v === "number");
  if (parsedShares.length === 0) return fallback;
  const total = parsedShares.reduce((a, b) => a + b, 0);
  return clampNumber(total, 0, 1) || fallback;
}

function parseSinglePercent(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return undefined;
  const v = Number(match[1]);
  if (!Number.isFinite(v)) return undefined;
  return clamp01(v / 100);
}

// ---- Decision checkpoints ---------------------------------------------

interface CheckpointArgs {
  testCells: TestCell[];
  baseOutcome: ForecastOutcome | null;
  economics: UnitEconomicsSummary | undefined;
  durationDays: number;
  budget: BudgetRecommendation;
}

function buildDecisionCheckpointsInternal(
  args: CheckpointArgs
): DecisionCheckpoint[] {
  const { testCells, baseOutcome, economics, durationDays, budget } = args;
  const out: DecisionCheckpoint[] = [];
  const cellIds = testCells.map((c) => c.id);

  const baseCtr = baseOutcome?.assumptions.ctr ?? DEFAULT_CTR_COLD;
  const baseCvr = baseOutcome?.assumptions.cvr ?? 0.02;
  const targetRoas =
    typeof economics?.targetRoas === "number" ? economics.targetRoas : 2.0;

  const ctrLow = roundTo(baseCtr * 0.4 * 100, 2); // percent for display
  const ctrLowMid = roundTo(baseCtr * 0.7 * 100, 2);
  const ctrHigh = roundTo(baseCtr * 1.3 * 100, 2);

  const cvrLow = roundTo(baseCvr * 0.4 * 100, 2);
  const cvrLowMid = roundTo(baseCvr * 0.7 * 100, 2);
  const cvrHigh = roundTo(baseCvr * 1.3 * 100, 2);

  // Day 1 — Hook attention check.
  out.push({
    dayOffset: 1,
    label: "Day 1 — Hook attention check",
    killConditions: [`CTR < ${ctrLow.toFixed(2)}%`],
    iterateConditions: [`CTR ${ctrLow.toFixed(2)}%-${ctrLowMid.toFixed(2)}%`],
    scaleConditions: [`CTR > ${ctrHigh.toFixed(2)}%`],
    cellsAffected: cellIds.length > 0 ? cellIds.slice() : undefined,
  });

  // Day 3 — Conversion signal.
  if (durationDays >= 3) {
    out.push({
      dayOffset: 3,
      label: "Day 3 — Conversion signal",
      killConditions: [
        `CVR < ${cvrLow.toFixed(2)}% AND spend > $${(budget.minimumLearningBudget / 2).toFixed(0)}`,
      ],
      iterateConditions: [`CVR ${cvrLow.toFixed(2)}%-${cvrLowMid.toFixed(2)}%`],
      scaleConditions: [`CVR > ${cvrHigh.toFixed(2)}%`],
      cellsAffected: cellIds.length > 0 ? cellIds.slice() : undefined,
    });
  }

  // Day 5 — ROAS check.
  if (durationDays >= 5) {
    const roasLow = roundTo(targetRoas * 0.4, 2);
    const roasLowMid = roundTo(targetRoas * 0.7, 2);
    const roasHigh = roundTo(targetRoas * 1.3, 2);
    out.push({
      dayOffset: 5,
      label: "Day 5 — ROAS check",
      killConditions: [`ROAS < ${roasLow.toFixed(2)}x`],
      iterateConditions: [
        `ROAS ${roasLow.toFixed(2)}x-${roasLowMid.toFixed(2)}x`,
      ],
      scaleConditions: [`ROAS > ${roasHigh.toFixed(2)}x`],
      cellsAffected: cellIds.length > 0 ? cellIds.slice() : undefined,
    });
  }

  // End-of-test — Decision.
  const endDay = Math.max(durationDays, 1);
  out.push({
    dayOffset: endDay,
    label: `End of test (Day ${endDay}) — Decision`,
    killConditions: [
      `Pause losers (ROAS < target AND CVR < target)`,
    ],
    iterateConditions: [
      `Queue iteration plan for mid-tier cells (replay with one-axis swap)`,
    ],
    scaleConditions: [
      `Promote winners (ROAS >= ${targetRoas.toFixed(2)}x AND CVR >= ${(baseCvr * 100).toFixed(2)}%)`,
    ],
    cellsAffected: cellIds.length > 0 ? cellIds.slice() : undefined,
  });

  return out;
}

// ---- Confidence classifier --------------------------------------------

function classifyConfidence(args: {
  economics: UnitEconomicsSummary | undefined;
  kpiLadder: KpiTargetLadder | undefined;
  tracking: TrackingReadinessScore | undefined;
  testCells: TestCell[];
  warnings: ForecastWarning[];
}): ForecastPlan["confidence"] {
  const hasEconomics =
    !!args.economics &&
    args.economics.status !== "incomplete" &&
    typeof args.economics.allowableCac === "number";
  const hasKpiTargets =
    !!args.kpiLadder && args.kpiLadder.targets.length > 0;
  const trackingReady =
    !!args.tracking && args.tracking.score >= TRACKING_NOT_READY_FLOOR;
  const enoughCells =
    args.testCells.length >= MIN_TEST_CELLS_FOR_HIGH_CONFIDENCE;
  const blockerCount = args.warnings.filter(
    (w) => w.severity === "blocker"
  ).length;

  const positives = [
    hasEconomics,
    hasKpiTargets,
    trackingReady,
    enoughCells,
  ].filter(Boolean).length;

  if (positives === 4 && blockerCount === 0) return "high";
  if (positives >= 2 && blockerCount === 0) return "medium";
  return "low";
}

// ---- Warning composers ------------------------------------------------

function makeWarning(
  kind: ForecastWarning["kind"],
  severity: ForecastWarning["severity"],
  message: string,
  fix: string
): ForecastWarning {
  return { kind, severity, message, fix };
}

function budgetBelowLearningWarning(): ForecastWarning {
  return makeWarning(
    "budget-below-learning-minimum",
    "blocker",
    "Total test budget is below the statistical learning minimum — the test won't reach 5 conv/cell.",
    "Raise daily budget or extend duration so total budget clears the learning floor."
  );
}

function expectedCpaAboveAllowableCacWarning(
  expectedCpa: number,
  allowableCac: number
): ForecastWarning {
  return makeWarning(
    "expected-cpa-above-allowable-cac",
    "blocker",
    `Expected CPA $${expectedCpa.toFixed(2)} exceeds allowable CAC $${allowableCac.toFixed(2)} — base scenario doesn't pay back.`,
    "Tighten kill rules, raise CVR via offer, or reduce CPC via creative before spending."
  );
}

function conservativeRoasBelowTargetWarning(
  roas: number,
  target: number
): ForecastWarning {
  return makeWarning(
    "conservative-roas-below-target",
    "warning",
    `Conservative ROAS ${roas.toFixed(2)}x is below target ${target.toFixed(2)}x — the worst case fails the profitability bar.`,
    "Stress-test kill rules at Day 3 to catch underperformers fast."
  );
}

function conservativeRoasBelowBreakevenWarning(
  roas: number,
  breakeven: number
): ForecastWarning {
  return makeWarning(
    "conservative-roas-below-breakeven",
    "blocker",
    `Conservative ROAS ${roas.toFixed(2)}x is below breakeven ${breakeven.toFixed(2)}x — worst case loses money on every conversion.`,
    "Improve margin (price / COGS) or raise CVR before launching; the floor is unsafe."
  );
}

function trackingNotReadyWarning(score: number): ForecastWarning {
  return makeWarning(
    "tracking-not-ready",
    "warning",
    `Tracking readiness ${score}/100 — measurement gaps will distort kill / scale signals.`,
    "Clear tracking blockers on the Launch tab before reading forecast outputs as ground truth."
  );
}

function noTestCellsWarning(): ForecastWarning {
  return makeWarning(
    "no-test-cells",
    "warning",
    "No test cells in the recommended first batch — allocation defaults to a single fallback budget.",
    "Build the creative testing matrix so the planner can split budget per cell."
  );
}

function noEconomicsWarning(): ForecastWarning {
  return makeWarning(
    "no-economics",
    "info",
    "Unit economics not resolvable — forecast falls back to a generic $50/day learning floor.",
    "Provide price and commercial inputs so the planner can anchor expected CPA / ROAS."
  );
}

function noKpiTargetsWarning(): ForecastWarning {
  return makeWarning(
    "no-kpi-targets",
    "info",
    "KPI target ladder is empty — scenario assumptions fall back to business-model defaults.",
    "Build the KPI ladder so cold CTR / CVR / CPM baselines reflect this product."
  );
}

function lowConfidenceNoHistoryWarning(): ForecastWarning {
  return makeWarning(
    "low-confidence-no-history",
    "info",
    "No workspace memory results to calibrate against — confidence in projections is bounded.",
    "Save a run and import results to lift the projection confidence over time."
  );
}

// ---- Math helpers ------------------------------------------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
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
