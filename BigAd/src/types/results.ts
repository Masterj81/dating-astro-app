// results.ts — Results Import / Forecast Accuracy Loop types.
//
// Pure data model for the local Results layer. Actual campaign results
// are captured per test cell, compared against the forecast snapshot
// derived from `strategy.forecast`, and turned into per-cell decision
// recommendations (scale / iterate / pause / needs-more-data). The
// analysis pass NEVER calls `Date.now()` — `derivedAt` is always 0 so
// identical input always yields byte-identical output. The store
// (results-store.ts) is the only layer allowed to stamp `createdAt` /
// `updatedAt` from `Date.now()`.

export type ResultStatus =
  | "winning"
  | "losing"
  | "inconclusive"
  | "needs-more-data";

export type ResultImportIssueKind =
  | "missing-cell-id"
  | "cell-id-not-in-strategy"
  | "invalid-number"
  | "inconsistent-totals"
  | "no-spend-no-data"
  | "duplicate-cell-id";

export interface ResultImportIssue {
  kind: ResultImportIssueKind;
  cellId?: string;
  // 1-based row number when the issue came from a CSV parse.
  rowNumber?: number;
  message: string;
  fix: string;
}

// Actual campaign result for a single test cell. Persisted locally
// (results-store.ts) under `bigad:campaign-actuals:v1`. The id is
// derived deterministically — `${projectId}:${runId}:${cellId}` — so
// an upsert keyed by the same project / run / cell overwrites the
// previous reading instead of duplicating.
export interface CampaignActualResult {
  id: string;
  projectId: string;
  runId: string;
  // References a `testCell.id` from the run's
  // `strategy.creativeTestingMatrix.testCells`.
  cellId: string;
  spendUsd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  // Optional — present for subscription / lead-gen funnels where
  // revenue is attributable post-launch.
  revenueUsd?: number;
  status: ResultStatus;
  notes?: string;
  daysRun?: number;
  // Stamped by the store at write time. Pure analysis never reads
  // these; they're informational for UI sorting only.
  createdAt: number;
  updatedAt: number;
}

// Per-metric comparison of actual vs forecast. `far-better` / `far-worse`
// emit when |deltaPercent| > 0.3 (30%). `no-forecast` / `no-actual` mean
// one side is missing.
export interface ActualVsForecastMetric {
  metric: "cpm" | "ctr" | "cpc" | "cvr" | "cpa" | "roas";
  actualValue?: number;
  forecastValue?: number;
  // actual - forecast — signed, in the metric's native unit.
  delta?: number;
  // (actual - forecast) / forecast — signed, fractional (e.g. 0.25 = +25%).
  deltaPercent?: number;
  status:
    | "on-target"
    | "better"
    | "worse"
    | "far-better"
    | "far-worse"
    | "no-forecast"
    | "no-actual";
}

export interface ResultDecisionRecommendation {
  cellId: string;
  decision: "scale" | "iterate" | "pause" | "needs-more-data";
  // 1 sentence — paraphrases the rule that triggered the decision.
  rationale: string;
  priority: "must-do" | "should-do" | "nice-to-have";
}

export interface ForecastAccuracyReport {
  runId: string;
  perCell: Array<{
    cellId: string;
    cellLabel: string;
    actual?: CampaignActualResult;
    forecastSnapshot?: {
      expectedCpa?: number;
      expectedRoas?: number;
      expectedConversions?: number;
      expectedCpc?: number;
      expectedCtr?: number;
      expectedCvr?: number;
      expectedCpm?: number;
    };
    metrics: ActualVsForecastMetric[];
    decision?: ResultDecisionRecommendation;
  }>;
  totals: {
    totalSpendUsd: number;
    totalConversions: number;
    totalRevenueUsd?: number;
    weightedCpa?: number;
    weightedRoas?: number;
    forecastWeightedCpa?: number;
    forecastWeightedRoas?: number;
  };
  overallAccuracy:
    | "on-target"
    | "better-than-forecast"
    | "worse-than-forecast"
    | "mixed"
    | "insufficient-data";
  recommendations: ResultDecisionRecommendation[];
  importIssues: ResultImportIssue[];
  // Always 0 — results analysis is purely derived from inputs. Never
  // `Date.now()`.
  derivedAt: number;
}
