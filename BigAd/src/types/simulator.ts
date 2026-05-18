// simulator.ts — Scenario Simulator / What-if Lab types for CampaignOS.
//
// Pure derivation from a built Strategy (the simulator reads the same
// upstream as Forecast: `unitEconomics` + `forecast`, plus the offer
// recommendations). The simulator layer never calls `Date.now()`;
// `derivedAt` is always 0 for byte-identical output across calls with
// identical input.

export type SimulatorLever =
  | "price"
  | "currentAov"
  | "grossMargin"
  | "targetRoas"
  | "trialToPaidRate"
  | "monthlyChurnRate"
  | "cpm"
  | "ctr"
  | "cvr"
  | "totalBudget"
  | "durationDays"
  | "offerKind";

export type SimulatorViability =
  | "viable"
  | "tight"
  | "unviable"
  | "incomplete";

export type SimulatorWarningKind =
  | "only-base-viable"
  | "fragile-to-cvr-drop"
  | "fragile-to-cpm-rise"
  | "fragile-to-trial-drop"
  | "no-economics"
  | "no-forecast"
  | "no-base-assumptions";

export type SimulatorWarningSeverity = "info" | "warning" | "blocker";

export interface SimulatorWarning {
  kind: SimulatorWarningKind;
  severity: SimulatorWarningSeverity;
  message: string;
  fix: string;
}

export interface SimulatorAssumptionSet {
  // USD-denominated price (subscription = monthly price, one-time = unit price).
  price?: number;
  // Resolved AOV (USD). For subscription with trial this is the monthly price.
  currentAov: number;
  // Gross margin, 0-1.
  grossMargin: number;
  // Target ROAS multiplier.
  targetRoas: number;
  // Trial-to-paid conversion rate, 0-1. Only present when applicable.
  trialToPaidRate?: number;
  // Monthly churn rate, 0-1. Only present for subscription / freemium.
  monthlyChurnRate?: number;
  hasFreeTrial: boolean;
  // Cost per 1000 impressions (USD).
  cpm: number;
  // Click-through rate, 0-1.
  ctr: number;
  // Conversion rate, 0-1.
  cvr: number;
  // Total test budget (USD).
  totalBudget: number;
  durationDays: number;
  // Offer kind label — keyed but not constrained to OfferKind so simulator
  // can express "annual-plan-discount" etc. for what-if scenarios.
  offerKind: string;
}

export interface SimulatorOutcome {
  expectedImpressions: number;
  expectedClicks: number;
  // Primary conversions: trial_start for subscription+trial, purchase
  // for one-time / subscription-without-trial.
  expectedConversions: number;
  // Only for subscription + free trial funnels.
  trialStarts?: number;
  // Only when applicable (subscription with trial).
  paidConversions?: number;
  // USD.
  revenue: number;
  // USD (revenue * grossMargin).
  grossProfit: number;
  // USD — spend / expectedConversions. Infinity when no conversions.
  cpa: number;
  // USD — spend / paidConversions (subscription with trial).
  paidCac?: number;
  // Multiplier — revenue / spend.
  roas: number;
  // USD — subscription LTV (when applicable) else contributionMargin per
  // purchase for one-time / single-transaction funnels.
  ltv?: number;
  // ltv / paidCac (subscription with trial), else ltv / cpa.
  ltvToCacRatio?: number;
  // Months — only when subscription. breakevenCpa / monthlyContribution.
  paybackMonths?: number;
}

export interface SimulatorScenarioResult {
  scenarioId: string;
  label: string;
  description: string;
  assumptions: SimulatorAssumptionSet;
  outcome: SimulatorOutcome;
  viability: SimulatorViability;
  riskNote: string;
  warnings: SimulatorWarning[];
}

export interface SimulatorSensitivityStep {
  label: string;
  // For numeric levers — multiplier applied to base. Undefined for qualitative.
  multiplier?: number;
  // Delta vs. base scenario.
  deltaCac?: number;
  deltaRoas?: number;
  deltaPaybackMonths?: number;
  viabilityAtThisStep: SimulatorViability;
}

export interface SimulatorSensitivityResult {
  lever: SimulatorLever;
  steps: SimulatorSensitivityStep[];
  // 0-100 — max abs delta normalized across cac / roas / payback.
  sensitivityScore: number;
}

export type SimulatorRecommendationPriority =
  | "must-do"
  | "should-do"
  | "nice-to-have";

export interface SimulatorRecommendation {
  id: string;
  title: string;
  rationale: string;
  expectedImpact: string;
  priority: SimulatorRecommendationPriority;
}

export interface ScenarioSimulatorPlan {
  status: SimulatorViability;
  baseAssumptions: SimulatorAssumptionSet;
  scenarios: SimulatorScenarioResult[];
  sensitivities: SimulatorSensitivityResult[];
  recommendations: SimulatorRecommendation[];
  warnings: SimulatorWarning[];
  // Always 0 — simulator is purely derived. Never Date.now().
  derivedAt: number;
}
