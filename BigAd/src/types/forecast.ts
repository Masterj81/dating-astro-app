// forecast.ts — Forecast / Budget Planner types for CampaignOS.
//
// Pure derivation from a built Strategy (the planner reads
// `unitEconomics`, `kpiTargetLadder`, `creativeTestingMatrix`, and
// `campaignSetup` after they've been computed). The forecast layer
// never calls `Date.now()`; `derivedAt` is always 0 for byte-identical
// output across calls with identical input.

export type ForecastScenarioKind = "conservative" | "base" | "aggressive";

export type ForecastReadinessStatus =
  | "viable"
  | "tight"
  | "unviable"
  | "incomplete";

export type ForecastWarningKind =
  | "budget-below-learning-minimum"
  | "expected-cpa-above-allowable-cac"
  | "conservative-roas-below-target"
  | "conservative-roas-below-breakeven"
  | "tracking-not-ready"
  | "no-test-cells"
  | "no-economics"
  | "no-kpi-targets"
  | "low-confidence-no-history";

export interface ForecastWarning {
  kind: ForecastWarningKind;
  severity: "info" | "warning" | "blocker";
  message: string;
  fix: string;
}

export interface BudgetRecommendation {
  // All USD-denominated.
  totalTestBudget: number;
  recommendedDailyBudget: number;
  recommendedTestDurationDays: number;
  // Floor below which the test cannot reach statistical significance.
  minimumLearningBudget: number;
  reasoning: string;
}

export interface ForecastOutcome {
  scenario: ForecastScenarioKind;
  assumptions: {
    // Cost per 1000 impressions, USD.
    cpm: number;
    // Click-through rate, 0-1.
    ctr: number;
    // Derived: cpm / (ctr * 1000).
    cpc: number;
    // Optional landing-page click-through (0-1) — only used when the
    // funnel includes an LP-click step. Not currently surfaced for the
    // base scenarios; reserved for funnel-aware extensions.
    landingPageCtr?: number;
    // Conversion rate from click to primary conversion, 0-1.
    cvr: number;
    // Pulled from economics (resolvedAov / trial-adjusted LTV) when
    // available; undefined when the planner can't determine revenue.
    aov?: number;
  };
  expectedImpressions: number;
  expectedClicks: number;
  expectedConversions: number;
  // Only emitted when AOV / LTV is known.
  expectedRevenue?: number;
  expectedRoas?: number;
  expectedCpa?: number;
  expectedCpc?: number;
  // Spend at which expectedRevenue === spend (for reference).
  breakEvenSpend?: number;
}

export interface ForecastScenario {
  kind: ForecastScenarioKind;
  budget: number;
  durationDays: number;
  outcome: ForecastOutcome;
  warnings: ForecastWarning[];
}

export interface SpendAllocation {
  refKind: "campaign" | "ad-set" | "test-cell";
  refId: string;
  refLabel: string;
  budget: number;
  dailyBudget: number;
  shareOfTotal: number; // 0-1
  rationale: string;
}

export interface DecisionCheckpoint {
  // 1, 3, 5, 7, end-of-test (matches recommendedTestDurationDays).
  dayOffset: number;
  label: string;
  killConditions: string[];
  iterateConditions: string[];
  scaleConditions: string[];
  // Test cell ids the checkpoint applies to.
  cellsAffected?: string[];
}

export interface ForecastPlan {
  status: ForecastReadinessStatus;
  confidence: "low" | "medium" | "high";
  budget: BudgetRecommendation;
  // Exactly 3 scenarios, ordered conservative → base → aggressive.
  scenarios: ForecastScenario[];
  // Hierarchy of campaign / ad-set / test-cell allocations. Sum of
  // every `test-cell` row equals `budget.totalTestBudget` within
  // ±$0.01 rounding tolerance.
  allocation: SpendAllocation[];
  decisionCheckpoints: DecisionCheckpoint[];
  // Plan-level warnings — per-scenario warnings live on each scenario.
  warnings: ForecastWarning[];
  // Always 0 — forecast is purely derived from a built strategy.
  // Never `Date.now()`.
  derivedAt: number;
}
