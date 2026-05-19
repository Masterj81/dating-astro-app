// calibration.ts — Benchmarks / Calibration Layer engine.
//
// Pure deterministic derivation. Given a built Strategy (with a
// ProductInput-shaped header and an optional forecast/economics), this
// module selects the best-fitting planning-benchmark profiles, compares
// the forecast against them, and emits recommendations + warnings.
//
// V1 is DISPLAY-ONLY: the calibration block never modifies forecast or
// simulator outputs. `recommendedAssumptions` are surfaced in the UI
// and export brief but never read by the engine. This avoids cycle
// risk and preserves engine purity.
//
// Never calls `Date.now()` — `derivedAt` is always 0. No
// `Math.random` anywhere. All ordering is stable.

import type { Strategy } from "@/types/strategy";
import type {
  BenchmarkCalibration,
  BenchmarkChannel,
  BenchmarkComparison,
  BenchmarkComparisonStatus,
  BenchmarkMetric,
  BenchmarkMetricKey,
  BenchmarkProfile,
  BenchmarkProfileFit,
  BenchmarkRange,
  BenchmarkReadinessStatus,
  BenchmarkRecommendation,
  BenchmarkWarning,
} from "@/types/benchmarks";
import type { ProductInput } from "@/types/strategy";
import { BUILT_IN_BENCHMARK_PROFILES } from "./catalog";

// The calibration engine needs the same five input dimensions that
// drive the playbook recommender (businessModel, campaignType,
// awareness, sophistication, channel signal + category). To avoid
// coupling Strategy to ProductInput, we read the input through a
// `__input` escape hatch that buildStrategy already supplies, or fall
// back to whatever signal lives on `strategy.unitEconomics` /
// `strategy.campaignCalendar`.

interface StrategyWithInput {
  __input?: ProductInput;
}

// ---- Constants --------------------------------------------------------

const HIGH_SPEND_THRESHOLD = 5000;
const FAR_FROM_RANGE_FACTOR_LOW = 0.5; // value < low * 0.5 OR (low - value)/low > 0.5
const FAR_FROM_RANGE_FACTOR_HIGH = 1.5; // value > high * 1.5 OR (value - high)/high > 0.5

// ---- Input-dimension mapping helpers ----------------------------------

type ProfileBusinessModel = NonNullable<
  BenchmarkProfile["fitRules"]["businessModels"]
>[number];
type ProfileCampaignType = NonNullable<
  BenchmarkProfile["fitRules"]["campaignTypes"]
>[number];
type ProfileSophistication = NonNullable<
  BenchmarkProfile["fitRules"]["marketSophistication"]
>[number];

function mapBusinessModel(
  input: ProductInput | undefined
): ProfileBusinessModel | undefined {
  if (!input) return undefined;
  const bm = input.businessModel;
  const category = (input.category || "").toLowerCase();
  if (bm === "subscription" || bm === "freemium") {
    if (
      category.includes("app") ||
      category.includes("mobile") ||
      category.includes("dating")
    ) {
      return "subscription-app";
    }
    return "saas";
  }
  if (bm === "one-time") {
    const haystack =
      (input.category || "") + " " + (input.description || "");
    const lower = haystack.toLowerCase();
    if (
      lower.includes("creator-led") ||
      lower.includes("creator led") ||
      lower.includes("creator drop") ||
      lower.includes(" creator ") ||
      lower.startsWith("creator ")
    ) {
      return "creator-product";
    }
    return "ecommerce";
  }
  if (bm === "services") {
    if (category.includes("local") || category.includes("service")) {
      return "local-service";
    }
    return "b2b-services";
  }
  return undefined;
}

function mapCampaignType(
  input: ProductInput | undefined
): ProfileCampaignType | undefined {
  if (!input) return undefined;
  switch (input.campaignType) {
    case "launch":
      return "launch";
    case "seasonal":
      return "seasonal";
    case "always-on":
      return "always-on";
    default:
      return undefined;
  }
}

function mapSophistication(
  input: ProductInput | undefined
): ProfileSophistication | undefined {
  if (!input) return undefined;
  switch (input.sophistication) {
    case "fresh-market":
      return "green-market";
    case "simple-claims":
    case "amplified-claims":
      return "competitive-market";
    case "skeptical-market":
      return "skeptical-market";
    case "mature-market":
      return "mature-market";
    default:
      return undefined;
  }
}

function channelSignal(input: ProductInput | undefined): BenchmarkChannel[] {
  if (!input) return [];
  const haystack = [
    input.audience,
    input.goal,
    input.description,
    input.competitors,
    input.category,
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return [];
  const probes: Record<BenchmarkChannel, string[]> = {
    meta: ["meta", "facebook", "instagram", " ig ", "ios"],
    tiktok: ["tiktok", "tik tok"],
    youtube: ["youtube", " yt "],
    "google-search": ["google search", "search ads", "adwords"],
    "google-pmax": ["pmax", "performance max"],
    reddit: ["reddit"],
    linkedin: ["linkedin"],
    x: [" x ", "twitter"],
    email: ["email", "newsletter"],
    "organic-social": ["organic social", "organic reach"],
  };
  const found: BenchmarkChannel[] = [];
  for (const channel of Object.keys(probes) as BenchmarkChannel[]) {
    if (probes[channel].some((p) => haystack.includes(p))) {
      found.push(channel);
    }
  }
  return found;
}

function categoryKeywords(input: ProductInput | undefined): string[] {
  if (!input) return [];
  const raw = `${input.category || ""} ${input.description || ""}`.toLowerCase();
  return raw
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length >= 3 && t.length <= 20);
}

// ---- Profile-fit scoring ----------------------------------------------

function scoreProfile(
  profile: BenchmarkProfile,
  input: ProductInput | undefined
): BenchmarkProfileFit {
  const matched: string[] = [];
  const missing: string[] = [];
  let score = 0;

  // businessModel +25
  const bm = mapBusinessModel(input);
  if (profile.fitRules.businessModels && profile.fitRules.businessModels.length > 0) {
    if (bm && profile.fitRules.businessModels.includes(bm)) {
      score += 25;
      matched.push(`businessModel:${bm}`);
    } else if (bm) {
      missing.push(`businessModel:${profile.fitRules.businessModels.join("/")}`);
    } else {
      missing.push("businessModel");
    }
  }

  // campaignType +20
  const ct = mapCampaignType(input);
  if (profile.fitRules.campaignTypes && profile.fitRules.campaignTypes.length > 0) {
    if (ct && profile.fitRules.campaignTypes.includes(ct)) {
      score += 20;
      matched.push(`campaignType:${ct}`);
    } else if (ct) {
      missing.push(`campaignType:${profile.fitRules.campaignTypes.join("/")}`);
    } else {
      missing.push("campaignType");
    }
  }

  // awareness +10
  if (profile.fitRules.awarenessStages && profile.fitRules.awarenessStages.length > 0) {
    const aw = input?.awareness;
    if (aw && profile.fitRules.awarenessStages.includes(aw)) {
      score += 10;
      matched.push(`awarenessStage:${aw}`);
    } else if (aw) {
      missing.push(`awarenessStage:${profile.fitRules.awarenessStages.join("/")}`);
    } else {
      missing.push("awarenessStage");
    }
  }

  // sophistication +10
  if (
    profile.fitRules.marketSophistication &&
    profile.fitRules.marketSophistication.length > 0
  ) {
    const soph = mapSophistication(input);
    if (soph && profile.fitRules.marketSophistication.includes(soph)) {
      score += 10;
      matched.push(`marketSophistication:${soph}`);
    } else if (soph) {
      missing.push(
        `marketSophistication:${profile.fitRules.marketSophistication.join("/")}`
      );
    } else {
      missing.push("marketSophistication");
    }
  }

  // channels +15 (any overlap)
  if (profile.fitRules.channels && profile.fitRules.channels.length > 0) {
    const inputChannels = channelSignal(input);
    if (inputChannels.length > 0) {
      const overlap = inputChannels.filter((c) =>
        profile.fitRules.channels!.includes(c)
      );
      if (overlap.length > 0) {
        score += 15;
        matched.push(`channel:${overlap.join(",")}`);
      } else {
        missing.push(`channel:${profile.fitRules.channels.join("/")}`);
      }
    }
    // else: no channel signal → neutral 0, do NOT mark missing
  }

  // category +10 (substring overlap)
  if (profile.fitRules.category && profile.fitRules.category.length > 0) {
    const keywords = categoryKeywords(input);
    const overlap = profile.fitRules.category.filter((c) =>
      keywords.some((k) => k.includes(c) || c.includes(k))
    );
    if (overlap.length > 0) {
      score += 10;
      matched.push(`category:${overlap.join(",")}`);
    }
  }

  // Clamp.
  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return {
    profileId: profile.id,
    profile,
    fitScore: score,
    matchedDimensions: matched,
    missingDimensions: missing,
  };
}

// ---- Public: selectBenchmarkProfiles ----------------------------------

export function selectBenchmarkProfiles(
  strategy: Strategy
): BenchmarkProfileFit[] {
  const input = (strategy as StrategyWithInput).__input;
  const ranked = BUILT_IN_BENCHMARK_PROFILES.map((p) =>
    scoreProfile(p, input)
  ).sort((a, b) => {
    if (b.fitScore !== a.fitScore) return b.fitScore - a.fitScore;
    return a.profileId < b.profileId ? -1 : a.profileId > b.profileId ? 1 : 0;
  });

  const positive = ranked.filter((r) => r.fitScore > 0);
  if (positive.length === 0) return [];
  return positive.slice(0, 3);
}

// ---- Consensus computation --------------------------------------------

function metricRangeFor(
  profile: BenchmarkProfile,
  key: BenchmarkMetricKey
): BenchmarkRange | undefined {
  const m = profile.metrics.find((mm) => mm.key === key);
  return m?.range;
}

function buildConsensusRanges(
  fits: BenchmarkProfileFit[]
): Partial<Record<BenchmarkMetricKey, BenchmarkRange>> {
  const out: Partial<Record<BenchmarkMetricKey, BenchmarkRange>> = {};
  const allKeys: BenchmarkMetricKey[] = [
    "cpm",
    "ctr",
    "cpc",
    "cvr",
    "cpa",
    "roas",
    "hookRate",
    "holdRate",
    "trialToPaidRate",
    "churnRate",
    "aov",
    "ltv",
  ];
  for (const key of allKeys) {
    const ranges: { range: BenchmarkRange; weight: number }[] = [];
    for (const fit of fits) {
      const r = metricRangeFor(fit.profile, key);
      if (r) ranges.push({ range: r, weight: Math.max(1, fit.fitScore) });
    }
    if (ranges.length === 0) continue;

    // Weighted-median approximation: take median of medians (stable + simple).
    const medians = ranges.map((r) => r.range.median).sort((a, b) => a - b);
    const median =
      medians.length % 2 === 1
        ? medians[(medians.length - 1) / 2]
        : (medians[medians.length / 2 - 1] + medians[medians.length / 2]) / 2;

    const low = Math.min(...ranges.map((r) => r.range.low));
    const high = Math.max(...ranges.map((r) => r.range.high));
    const unit = ranges[0].range.unit;

    out[key] = {
      low: roundForUnit(low, unit),
      median: roundForUnit(median, unit),
      high: roundForUnit(high, unit),
      unit,
    };
  }
  return out;
}

function roundForUnit(x: number, unit: BenchmarkRange["unit"]): number {
  if (!Number.isFinite(x)) return 0;
  if (unit === "percent") {
    // keep 4 decimals so rates like 0.0142 survive
    return Math.round(x * 10000) / 10000;
  }
  if (unit === "multiplier") {
    return Math.round(x * 100) / 100;
  }
  // usd / months → 2 decimals
  return Math.round(x * 100) / 100;
}

// ---- Forecast / economics readouts ------------------------------------

function getBaseForecast(strategy: Strategy) {
  const f = strategy.forecast;
  if (!f) return undefined;
  return f.scenarios.find((s) => s.kind === "base") ?? f.scenarios[0];
}

interface ForecastReadout {
  cpm?: number;
  ctr?: number;
  cpc?: number;
  cvr?: number;
  cpa?: number;
  roas?: number;
  aov?: number;
  trialToPaidRate?: number;
  churnRate?: number;
  ltv?: number;
}

function buildForecastReadout(strategy: Strategy): ForecastReadout {
  const out: ForecastReadout = {};
  const base = getBaseForecast(strategy);
  if (base) {
    const a = base.outcome.assumptions;
    if (typeof a.cpm === "number") out.cpm = a.cpm;
    if (typeof a.ctr === "number") out.ctr = a.ctr;
    if (typeof a.cpc === "number") out.cpc = a.cpc;
    if (typeof a.cvr === "number") out.cvr = a.cvr;
    if (typeof a.aov === "number") out.aov = a.aov;
    if (typeof base.outcome.expectedCpa === "number") out.cpa = base.outcome.expectedCpa;
    if (typeof base.outcome.expectedRoas === "number") out.roas = base.outcome.expectedRoas;
  }

  const ue = strategy.unitEconomics;
  if (ue) {
    if (typeof ue.resolvedAov === "number" && out.aov === undefined) {
      out.aov = ue.resolvedAov;
    }
    if (typeof ue.expectedLtv === "number") {
      out.ltv = ue.expectedLtv;
    }
    if (ue.subscription) {
      const sub = ue.subscription;
      // trialToPaidRate inferred from trialAdjustedLtv / expectedLtv when both present.
      if (
        typeof sub.trialAdjustedLtv === "number" &&
        typeof sub.expectedLtv === "number" &&
        sub.expectedLtv > 0
      ) {
        const ratio = sub.trialAdjustedLtv / sub.expectedLtv;
        if (ratio > 0 && ratio <= 1) {
          out.trialToPaidRate = roundForUnit(ratio, "percent");
        }
      }
      if (
        typeof sub.expectedMonthsRetained === "number" &&
        sub.expectedMonthsRetained > 0
      ) {
        out.churnRate = roundForUnit(1 / sub.expectedMonthsRetained, "percent");
      }
    }
  }
  return out;
}

// ---- Comparison -------------------------------------------------------

function classifyComparison(
  value: number,
  range: BenchmarkRange
): BenchmarkComparisonStatus {
  if (value >= range.low && value <= range.high) return "within-range";
  // FAR below
  const lowFloor = range.low * FAR_FROM_RANGE_FACTOR_LOW;
  if (value < lowFloor || (range.low > 0 && (range.low - value) / range.low > 0.5)) {
    return "far-below-range";
  }
  if (value < range.low) return "below-range";
  // FAR above
  const highCeil = range.high * FAR_FROM_RANGE_FACTOR_HIGH;
  if (value > highCeil || (range.high > 0 && (value - range.high) / range.high > 0.5)) {
    return "far-above-range";
  }
  return "above-range";
}

function buildComparison(
  metric: BenchmarkMetricKey,
  value: number | undefined,
  range: BenchmarkRange | undefined
): BenchmarkComparison {
  if (!range) {
    return {
      metric,
      forecastValue: value,
      benchmark: undefined,
      status: "no-benchmark",
    };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      metric,
      forecastValue: undefined,
      benchmark: range,
      status: "no-benchmark",
    };
  }
  const status = classifyComparison(value, range);
  const delta = roundForUnit(value - range.median, range.unit);
  const deltaPercent =
    range.median > 0 ? Math.round(((value - range.median) / range.median) * 10000) / 10000 : 0;
  return {
    metric,
    forecastValue: value,
    benchmark: range,
    status,
    delta,
    deltaPercent,
  };
}

// ---- Recommendations --------------------------------------------------

function priorityFor(
  status: BenchmarkComparisonStatus
): BenchmarkRecommendation["priority"] | null {
  switch (status) {
    case "far-below-range":
    case "far-above-range":
      return "must-do";
    case "below-range":
    case "above-range":
      return "should-do";
    default:
      return null;
  }
}

function metricLabel(key: BenchmarkMetricKey): string {
  switch (key) {
    case "cpm":
      return "CPM";
    case "ctr":
      return "CTR";
    case "cpc":
      return "CPC";
    case "cvr":
      return "CVR";
    case "cpa":
      return "CPA";
    case "roas":
      return "ROAS";
    case "hookRate":
      return "Hook rate";
    case "holdRate":
      return "Hold rate";
    case "trialToPaidRate":
      return "Trial→paid rate";
    case "churnRate":
      return "Monthly churn rate";
    case "aov":
      return "AOV";
    case "ltv":
      return "LTV";
  }
}

function buildRecommendations(
  comparisons: BenchmarkComparison[]
): BenchmarkRecommendation[] {
  const out: BenchmarkRecommendation[] = [];
  for (const c of comparisons) {
    if (!c.benchmark) continue;
    const priority = priorityFor(c.status);
    if (!priority) continue;
    const label = metricLabel(c.metric);
    const direction =
      c.status === "below-range" || c.status === "far-below-range"
        ? "raise"
        : "lower";
    out.push({
      metric: c.metric,
      currentValue: c.forecastValue,
      suggestedValue: c.benchmark.median,
      rationale: `Forecast ${label} ${formatMetricValue(
        c.forecastValue,
        c.benchmark.unit
      )} is ${c.status.replace(
        "-range",
        ""
      )} the planning range (${formatMetricValue(
        c.benchmark.low,
        c.benchmark.unit
      )}–${formatMetricValue(c.benchmark.high, c.benchmark.unit)}); ${direction} toward median ${formatMetricValue(c.benchmark.median, c.benchmark.unit)} for planning.`,
      priority,
    });
  }
  // Stable order: must-do first, then should-do; then metric key asc.
  const rank: Record<BenchmarkRecommendation["priority"], number> = {
    "must-do": 0,
    "should-do": 1,
    "nice-to-have": 2,
  };
  out.sort((a, b) => {
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    return a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0;
  });
  return out;
}

function formatMetricValue(
  v: number | undefined,
  unit: BenchmarkRange["unit"]
): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "n/a";
  if (unit === "usd") return `$${v.toFixed(2)}`;
  if (unit === "percent") return `${(v * 100).toFixed(2)}%`;
  if (unit === "multiplier") return `${v.toFixed(2)}x`;
  if (unit === "months") return `${v.toFixed(1)}mo`;
  return String(v);
}

// ---- Confidence + status ----------------------------------------------

function confidenceFromProfiles(
  fits: BenchmarkProfileFit[]
): "low" | "medium" | "high" {
  if (fits.length === 0) return "low";
  const score = (c: "low" | "medium" | "high"): number =>
    c === "high" ? 100 : c === "medium" ? 66 : 33;
  const avgConf =
    fits.reduce((s, f) => s + score(f.profile.confidence), 0) / fits.length;
  const avgFit = fits.reduce((s, f) => s + f.fitScore, 0) / fits.length;
  let bucket: "low" | "medium" | "high" =
    avgConf >= 66 ? "high" : avgConf >= 33 ? "medium" : "low";
  if (avgFit < 50) {
    bucket = bucket === "high" ? "medium" : bucket === "medium" ? "low" : "low";
  }
  return bucket;
}

function classifyStatus(
  fits: BenchmarkProfileFit[],
  comparisons: BenchmarkComparison[],
  warnings: BenchmarkWarning[],
  hasForecast: boolean,
  hasEconomics: boolean
): BenchmarkReadinessStatus {
  if (!hasForecast && !hasEconomics) return "incomplete";
  if (fits.length === 0) return "uncalibrated";
  const avgFit = fits.reduce((s, f) => s + f.fitScore, 0) / fits.length;
  const nonInfoWarnings = warnings.filter(
    (w) => w.severity === "warning" || w.severity === "blocker"
  ).length;
  const usableComparisons = comparisons.filter(
    (c) => c.status !== "no-benchmark"
  ).length;
  if (usableComparisons >= 4 && avgFit >= 60 && nonInfoWarnings === 0) {
    return "calibrated";
  }
  return "partially-calibrated";
}

// ---- Warning helpers --------------------------------------------------

function makeWarning(
  kind: BenchmarkWarning["kind"],
  severity: BenchmarkWarning["severity"],
  message: string,
  fix: string
): BenchmarkWarning {
  return { kind, severity, message, fix };
}

// ---- Public: buildBenchmarkWarnings -----------------------------------

export function buildBenchmarkWarnings(
  strategy: Strategy,
  calibration: BenchmarkCalibration
): BenchmarkWarning[] {
  const out: BenchmarkWarning[] = [];

  if (calibration.selectedProfiles.length === 0) {
    out.push(
      makeWarning(
        "no-matching-profile",
        "warning",
        "No planning-benchmark profile matched this strategy's inputs.",
        "Add channel / category / business-model signal to inputs or capture client-history benchmarks."
      )
    );
  }

  const farMetrics = calibration.comparisons.filter(
    (c) =>
      c.status === "far-below-range" || c.status === "far-above-range"
  );
  if (farMetrics.length > 0) {
    const top = farMetrics
      .slice(0, 3)
      .map((c) => `${metricLabel(c.metric)} (${c.status})`)
      .join(", ");
    out.push(
      makeWarning(
        "forecast-far-from-benchmark",
        "warning",
        `Forecast far from benchmark on: ${top}`,
        "Recalibrate the forecast assumption toward the benchmark median or set explicit kill rules."
      )
    );
  }

  if (calibration.confidence === "low") {
    out.push(
      makeWarning(
        "low-calibration-confidence",
        "warning",
        "Benchmark calibration confidence is low — selected profile fit-scores or built-in confidence are weak.",
        "Capture client-history benchmarks to override the built-in planning ranges."
      )
    );
  }

  if (!strategy.forecast) {
    out.push(
      makeWarning(
        "no-forecast-to-compare",
        "info",
        "No forecast on the strategy yet — comparisons are limited to economics-derived metrics.",
        "Build the forecast (creative testing matrix + economics) so cpm/ctr/cvr/cpa/roas can be compared."
      )
    );
  }

  const totalTestBudget = strategy.forecast?.budget?.totalTestBudget ?? 0;
  if (
    calibration.status === "uncalibrated" &&
    totalTestBudget > HIGH_SPEND_THRESHOLD
  ) {
    out.push(
      makeWarning(
        "high-spend-uncalibrated",
        "blocker",
        `High spend planned ($${totalTestBudget.toFixed(0)}) without benchmark calibration.`,
        "Add inputs (channel, business model, campaign type) so a benchmark profile can match, or capture client-history benchmarks."
      )
    );
  }

  return out;
}

// ---- Public: buildBenchmarkCalibration --------------------------------

export function buildBenchmarkCalibration(
  strategy: Strategy
): BenchmarkCalibration {
  const selectedProfiles = selectBenchmarkProfiles(strategy);
  const hasForecast = !!strategy.forecast;
  const hasEconomics =
    !!strategy.unitEconomics && strategy.unitEconomics.status !== "incomplete";

  if (selectedProfiles.length === 0) {
    const stubCalibration: BenchmarkCalibration = {
      status: hasForecast || hasEconomics ? "uncalibrated" : "incomplete",
      confidence: "low",
      selectedProfiles: [],
      comparisons: [],
      recommendations: [],
      warnings: [],
      derivedAt: 0,
    };
    const warnings = buildBenchmarkWarnings(strategy, stubCalibration);
    return { ...stubCalibration, warnings };
  }

  const consensus = buildConsensusRanges(selectedProfiles);
  const readout = buildForecastReadout(strategy);

  const orderedKeys: BenchmarkMetricKey[] = [
    "cpm",
    "ctr",
    "cpc",
    "cvr",
    "cpa",
    "roas",
    "aov",
    "ltv",
    "trialToPaidRate",
    "churnRate",
    "hookRate",
    "holdRate",
  ];
  const comparisons: BenchmarkComparison[] = [];
  const readoutLookup: Partial<Record<BenchmarkMetricKey, number>> = {
    cpm: readout.cpm,
    ctr: readout.ctr,
    cpc: readout.cpc,
    cvr: readout.cvr,
    cpa: readout.cpa,
    roas: readout.roas,
    aov: readout.aov,
    ltv: readout.ltv,
    trialToPaidRate: readout.trialToPaidRate,
    churnRate: readout.churnRate,
  };
  for (const key of orderedKeys) {
    const range = consensus[key];
    if (!range) continue;
    const value = readoutLookup[key];
    comparisons.push(buildComparison(key, value, range));
  }

  const confidence = confidenceFromProfiles(selectedProfiles);

  const stubCalibration: BenchmarkCalibration = {
    status: "partially-calibrated",
    confidence,
    selectedProfiles,
    comparisons,
    recommendations: [],
    warnings: [],
    derivedAt: 0,
  };
  const warnings = buildBenchmarkWarnings(strategy, stubCalibration);
  const status = classifyStatus(
    selectedProfiles,
    comparisons,
    warnings,
    hasForecast,
    hasEconomics
  );
  const recommendations = buildRecommendations(comparisons);

  return {
    status,
    confidence,
    selectedProfiles,
    comparisons,
    recommendations,
    warnings,
    derivedAt: 0,
  };
}

// ---- Public: calibrateForecastAssumptions -----------------------------

export interface CalibratedAssumptions {
  recommendedCpm?: number;
  recommendedCtr?: number;
  recommendedCvr?: number;
  recommendedCpa?: number;
  recommendedRoas?: number;
  recommendedAov?: number;
}

export function calibrateForecastAssumptions(
  _strategy: Strategy,
  calibration: BenchmarkCalibration
): CalibratedAssumptions {
  const out: CalibratedAssumptions = {};
  const find = (key: BenchmarkMetricKey) =>
    calibration.comparisons.find((c) => c.metric === key);

  const cpm = find("cpm");
  if (cpm?.benchmark) out.recommendedCpm = cpm.benchmark.median;
  const ctr = find("ctr");
  if (ctr?.benchmark) out.recommendedCtr = ctr.benchmark.median;
  const cvr = find("cvr");
  if (cvr?.benchmark) out.recommendedCvr = cvr.benchmark.median;
  const cpa = find("cpa");
  if (cpa?.benchmark) out.recommendedCpa = cpa.benchmark.median;
  const roas = find("roas");
  if (roas?.benchmark) out.recommendedRoas = roas.benchmark.median;
  const aov = find("aov");
  if (aov?.benchmark) out.recommendedAov = aov.benchmark.median;

  return out;
}
