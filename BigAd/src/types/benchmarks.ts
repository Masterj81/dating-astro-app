// benchmarks.ts — Benchmarks / Calibration Layer types for CampaignOS.
//
// Pure derivation from a built Strategy (the calibration layer reads
// `forecast`, `unitEconomics`, plus the engine's input dimensions —
// businessModel, campaignType, awareness, sophistication, category).
// The calibration layer never calls `Date.now()`; `derivedAt` is always
// 0 for byte-identical output across calls with identical input.
//
// V1 approach: Calibration **displays comparisons + recommendations**.
// It does NOT modify forecast/simulator outputs. Manual/client-history
// overrides live in a localStorage store and are surfaced in UI ONLY —
// they MUST NOT enter the pure engine.

export type BenchmarkMetricKey =
  | "cpm"
  | "ctr"
  | "cpc"
  | "cvr"
  | "cpa"
  | "roas"
  | "hookRate" // 3s view rate / impressions
  | "holdRate" // 75% view rate / impressions
  | "trialToPaidRate"
  | "churnRate"
  | "aov"
  | "ltv";

export type BenchmarkSourceKind = "built-in" | "client-history" | "manual";

export type BenchmarkChannel =
  | "meta"
  | "tiktok"
  | "youtube"
  | "google-search"
  | "google-pmax"
  | "reddit"
  | "linkedin"
  | "x"
  | "email"
  | "organic-social";

export interface BenchmarkRange {
  low: number; // 25th percentile (loose interpretation)
  median: number; // 50th
  high: number; // 75th
  unit: "usd" | "percent" | "multiplier" | "months"; // for rendering
}

export interface BenchmarkMetric {
  key: BenchmarkMetricKey;
  range: BenchmarkRange;
  caveat?: string; // short — e.g. "Cold acquisition only; ignores retargeting"
}

export interface BenchmarkFitRule {
  // Used by selectBenchmarkProfiles to decide if a profile matches a strategy.
  businessModels?: Array<
    | "subscription-app"
    | "ecommerce"
    | "saas"
    | "local-service"
    | "creator-product"
    | "b2b-services"
  >;
  campaignTypes?: Array<
    "launch" | "always-on" | "seasonal" | "evergreen" | "promo-3-tier"
  >;
  channels?: BenchmarkChannel[];
  awarenessStages?: Array<
    | "unaware"
    | "problem-aware"
    | "solution-aware"
    | "product-aware"
    | "most-aware"
  >;
  marketSophistication?: Array<
    | "green-market"
    | "competitive-market"
    | "skeptical-market"
    | "mature-market"
  >;
  category?: string[]; // e.g. ['dating', 'astrology', 'subscription-app']
}

export interface BenchmarkProfile {
  id: string; // stable kebab-case e.g. 'subscription-app-meta-launch'
  label: string; // 3-7 words
  source: BenchmarkSourceKind;
  fitRules: BenchmarkFitRule;
  metrics: BenchmarkMetric[];
  confidence: "low" | "medium" | "high";
  caveat: string; // 1-2 sentences — MUST disclose that this is a planning benchmark
}

export interface BenchmarkProfileFit {
  profileId: string;
  profile: BenchmarkProfile;
  fitScore: number; // 0-100
  matchedDimensions: string[]; // ["businessModel:subscription-app","campaignType:launch","channel:meta"]
  missingDimensions: string[]; // ["awarenessStage"]
}

export type BenchmarkComparisonStatus =
  | "within-range"
  | "below-range" // forecast value < benchmark.low
  | "above-range" // forecast value > benchmark.high
  | "far-below-range" // < benchmark.low * 0.5 OR (low - value)/low > 0.5
  | "far-above-range" // > benchmark.high * 1.5 OR (value - high)/high > 0.5
  | "no-benchmark"; // benchmark not present for this metric

export interface BenchmarkComparison {
  metric: BenchmarkMetricKey;
  forecastValue: number | undefined;
  benchmark?: BenchmarkRange;
  status: BenchmarkComparisonStatus;
  delta?: number; // forecastValue - benchmark.median (signed)
  deltaPercent?: number; // (forecastValue - median) / median
}

export interface BenchmarkRecommendation {
  // Suggestion to adjust an assumption (display only — engine does not consume)
  metric: BenchmarkMetricKey;
  currentValue: number | undefined;
  suggestedValue: number; // benchmark.median or a conservative adjustment
  rationale: string;
  priority: "must-do" | "should-do" | "nice-to-have";
}

export type BenchmarkReadinessStatus =
  | "calibrated"
  | "partially-calibrated"
  | "uncalibrated"
  | "incomplete";

export type BenchmarkWarningKind =
  | "low-calibration-confidence"
  | "forecast-far-from-benchmark"
  | "no-matching-profile"
  | "high-spend-uncalibrated" // for journey gate when applicable
  | "no-forecast-to-compare";

export interface BenchmarkWarning {
  kind: BenchmarkWarningKind;
  severity: "info" | "warning" | "blocker";
  message: string;
  fix: string;
}

export interface BenchmarkCalibration {
  status: BenchmarkReadinessStatus;
  confidence: "low" | "medium" | "high";
  selectedProfiles: BenchmarkProfileFit[]; // sorted by fitScore desc, top 1-3
  comparisons: BenchmarkComparison[]; // one per benchmark metric we can compute
  recommendations: BenchmarkRecommendation[];
  warnings: BenchmarkWarning[];
  derivedAt: number; // 0 — never Date.now()
}
