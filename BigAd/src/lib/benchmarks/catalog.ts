// catalog.ts — frozen, deterministic registry for the Benchmarks /
// Calibration Layer.
//
// Ten built-in profiles spanning subscription apps, SaaS, ecommerce,
// local services, creator products, and B2B services across Meta,
// TikTok, LinkedIn, Google Search, and Google PMax. Every entry is
// content-complete: no placeholders, no TODOs. Pure data + helper
// getters. No engine coupling. No `Date.now()`.
//
// **Honesty disclosure**: every profile's `caveat` field begins with
// "Planning benchmark, not real-time data." These ranges are sensible
// 2026 planning targets — they are NOT scraped from any live ad
// account or third-party benchmark API.

import type {
  BenchmarkMetric,
  BenchmarkProfile,
} from "@/types/benchmarks";

// ---- Metric helpers ----------------------------------------------------

function usd(low: number, median: number, high: number): BenchmarkMetric["range"] {
  return { low, median, high, unit: "usd" };
}

function percent(
  low: number,
  median: number,
  high: number
): BenchmarkMetric["range"] {
  return { low, median, high, unit: "percent" };
}

function multiplier(
  low: number,
  median: number,
  high: number
): BenchmarkMetric["range"] {
  return { low, median, high, unit: "multiplier" };
}

// ---- Registry ---------------------------------------------------------

export const BUILT_IN_BENCHMARK_PROFILES: readonly BenchmarkProfile[] = Object.freeze([
  // 1. subscription-app + Meta + launch
  {
    id: "subscription-app-meta-launch",
    label: "Subscription app · Meta · launch",
    source: "built-in",
    fitRules: {
      businessModels: ["subscription-app"],
      campaignTypes: ["launch"],
      channels: ["meta"],
      awarenessStages: ["problem-aware", "solution-aware", "product-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["app", "subscription", "mobile", "dating"],
    },
    metrics: [
      { key: "cpm", range: usd(12, 20, 32) },
      { key: "ctr", range: percent(0.008, 0.014, 0.024) },
      { key: "cpc", range: usd(0.8, 1.5, 3.0) },
      { key: "cvr", range: percent(0.08, 0.14, 0.22) },
      { key: "cpa", range: usd(35, 60, 110) },
      { key: "roas", range: multiplier(0.4, 0.8, 1.5) },
      { key: "hookRate", range: percent(0.12, 0.18, 0.28) },
      { key: "holdRate", range: percent(0.05, 0.09, 0.15) },
      { key: "trialToPaidRate", range: percent(0.22, 0.38, 0.55) },
      { key: "churnRate", range: percent(0.06, 0.11, 0.18) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. Cold Meta acquisition for subscription apps, 2026 ranges.",
  },
  // 2. subscription-app + TikTok + launch
  {
    id: "subscription-app-tiktok-launch",
    label: "Subscription app · TikTok · launch",
    source: "built-in",
    fitRules: {
      businessModels: ["subscription-app"],
      campaignTypes: ["launch"],
      channels: ["tiktok"],
      awarenessStages: ["problem-aware", "solution-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["app", "subscription", "mobile", "dating"],
    },
    metrics: [
      { key: "cpm", range: usd(8, 14, 22) },
      { key: "ctr", range: percent(0.01, 0.018, 0.03) },
      { key: "cpc", range: usd(0.6, 1.2, 2.4) },
      { key: "cvr", range: percent(0.06, 0.11, 0.18) },
      { key: "cpa", range: usd(40, 70, 130) },
      { key: "roas", range: multiplier(0.3, 0.7, 1.4) },
      { key: "hookRate", range: percent(0.16, 0.24, 0.36) },
      { key: "holdRate", range: percent(0.04, 0.07, 0.12) },
      { key: "trialToPaidRate", range: percent(0.18, 0.32, 0.48) },
      { key: "churnRate", range: percent(0.07, 0.12, 0.2) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. Cold TikTok acquisition for subscription apps, 2026 ranges — high variance week to week.",
  },
  // 3. saas-linkedin-evergreen
  {
    id: "saas-linkedin-evergreen",
    label: "SaaS · LinkedIn · evergreen",
    source: "built-in",
    fitRules: {
      businessModels: ["saas"],
      campaignTypes: ["evergreen", "always-on"],
      channels: ["linkedin"],
      awarenessStages: ["solution-aware", "product-aware", "most-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["saas", "b2b", "software"],
    },
    metrics: [
      { key: "cpm", range: usd(25, 42, 70) },
      { key: "ctr", range: percent(0.004, 0.007, 0.012) },
      { key: "cpc", range: usd(6, 12, 30) },
      { key: "cvr", range: percent(0.04, 0.08, 0.15) },
      { key: "cpa", range: usd(120, 250, 500) },
      { key: "roas", range: multiplier(0.5, 1.2, 2.5) },
      { key: "trialToPaidRate", range: percent(0.15, 0.25, 0.4) },
      { key: "churnRate", range: percent(0.03, 0.06, 0.12) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. LinkedIn B2B SaaS evergreen, long sales cycle — ROAS lags 90-180 days.",
  },
  // 4. saas-google-search-evergreen
  {
    id: "saas-google-search-evergreen",
    label: "SaaS · Google Search · evergreen",
    source: "built-in",
    fitRules: {
      businessModels: ["saas"],
      campaignTypes: ["evergreen", "always-on"],
      channels: ["google-search"],
      awarenessStages: ["solution-aware", "product-aware", "most-aware"],
      marketSophistication: ["competitive-market", "skeptical-market", "mature-market"],
      category: ["saas", "b2b", "software"],
    },
    metrics: [
      { key: "cpc", range: usd(2, 5, 12) },
      { key: "cvr", range: percent(0.05, 0.1, 0.2) },
      { key: "cpa", range: usd(80, 180, 400) },
      { key: "roas", range: multiplier(0.8, 1.6, 3.0) },
      { key: "trialToPaidRate", range: percent(0.2, 0.32, 0.5) },
      { key: "churnRate", range: percent(0.03, 0.05, 0.1) },
    ],
    confidence: "high",
    caveat:
      "Planning benchmark, not real-time data. Google Search bottom-funnel intent is the most reliable input; CPCs vary 5x by category.",
  },
  // 5. ecommerce-meta-promo
  {
    id: "ecommerce-meta-promo",
    label: "Ecommerce · Meta · promo",
    source: "built-in",
    fitRules: {
      businessModels: ["ecommerce"],
      campaignTypes: ["promo-3-tier", "seasonal", "launch"],
      channels: ["meta"],
      awarenessStages: ["solution-aware", "product-aware", "most-aware"],
      marketSophistication: ["competitive-market", "skeptical-market", "mature-market"],
      category: ["ecommerce", "dtc", "retail"],
    },
    metrics: [
      { key: "cpm", range: usd(10, 18, 30) },
      { key: "ctr", range: percent(0.01, 0.016, 0.028) },
      { key: "cpc", range: usd(0.6, 1.2, 2.5) },
      { key: "cvr", range: percent(0.015, 0.028, 0.05) },
      { key: "cpa", range: usd(15, 35, 80) },
      { key: "roas", range: multiplier(1.2, 2.0, 3.5) },
      { key: "aov", range: usd(30, 65, 140) },
      { key: "hookRate", range: percent(0.14, 0.22, 0.32) },
      { key: "holdRate", range: percent(0.04, 0.08, 0.14) },
    ],
    confidence: "high",
    caveat:
      "Planning benchmark, not real-time data. Promo-window ecommerce Meta; iOS attribution loss baked into the CVR low end.",
  },
  // 6. ecommerce-google-pmax-promo
  {
    id: "ecommerce-google-pmax-promo",
    label: "Ecommerce · Google PMax · promo",
    source: "built-in",
    fitRules: {
      businessModels: ["ecommerce"],
      campaignTypes: ["promo-3-tier", "seasonal", "always-on"],
      channels: ["google-pmax"],
      awarenessStages: ["solution-aware", "product-aware", "most-aware"],
      marketSophistication: ["competitive-market", "mature-market"],
      category: ["ecommerce", "dtc", "retail"],
    },
    metrics: [
      { key: "cpc", range: usd(0.8, 1.5, 3.0) },
      { key: "cvr", range: percent(0.02, 0.035, 0.06) },
      { key: "cpa", range: usd(12, 28, 65) },
      { key: "roas", range: multiplier(1.5, 2.5, 4.0) },
      { key: "aov", range: usd(35, 70, 150) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. PMax aggregates shopping + display + search; attribution is opaque.",
  },
  // 7. local-service-google-search-always-on
  {
    id: "local-service-google-search-always-on",
    label: "Local service · Google Search · always-on",
    source: "built-in",
    fitRules: {
      businessModels: ["local-service"],
      campaignTypes: ["always-on", "evergreen"],
      channels: ["google-search"],
      awarenessStages: ["problem-aware", "solution-aware", "most-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["local", "service", "leadgen"],
    },
    metrics: [
      { key: "cpc", range: usd(3, 7, 18) },
      { key: "cvr", range: percent(0.05, 0.12, 0.25) },
      { key: "cpa", range: usd(25, 50, 130) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. Local-service Google Search; verticals like legal/medical sit at the top of the CPC range.",
  },
  // 8. local-service-meta-always-on
  {
    id: "local-service-meta-always-on",
    label: "Local service · Meta · always-on",
    source: "built-in",
    fitRules: {
      businessModels: ["local-service"],
      campaignTypes: ["always-on", "evergreen"],
      channels: ["meta"],
      awarenessStages: ["problem-aware", "solution-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["local", "service", "leadgen"],
    },
    metrics: [
      { key: "cpm", range: usd(8, 14, 25) },
      { key: "ctr", range: percent(0.008, 0.014, 0.024) },
      { key: "cpc", range: usd(0.5, 1.1, 2.4) },
      { key: "cvr", range: percent(0.03, 0.06, 0.12) },
      { key: "cpa", range: usd(20, 45, 110) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. Local-service Meta lead-gen; conversion quality varies a lot by form length.",
  },
  // 9. creator-product-tiktok-launch
  {
    id: "creator-product-tiktok-launch",
    label: "Creator product · TikTok · launch",
    source: "built-in",
    fitRules: {
      businessModels: ["creator-product"],
      campaignTypes: ["launch", "promo-3-tier"],
      channels: ["tiktok"],
      awarenessStages: ["unaware", "problem-aware", "solution-aware"],
      marketSophistication: ["green-market", "competitive-market"],
      category: ["creator", "drop", "merch"],
    },
    metrics: [
      { key: "cpm", range: usd(6, 12, 20) },
      { key: "ctr", range: percent(0.012, 0.02, 0.035) },
      { key: "cpc", range: usd(0.3, 0.7, 1.6) },
      { key: "cvr", range: percent(0.012, 0.025, 0.05) },
      { key: "cpa", range: usd(18, 40, 90) },
      { key: "roas", range: multiplier(1.0, 1.8, 3.2) },
      { key: "aov", range: usd(25, 55, 120) },
      { key: "hookRate", range: percent(0.18, 0.28, 0.4) },
      { key: "holdRate", range: percent(0.05, 0.1, 0.18) },
    ],
    confidence: "medium",
    caveat:
      "Planning benchmark, not real-time data. Creator-led TikTok product drops; success skews bimodal — fan-base effect.",
  },
  // 10. b2b-services-linkedin-always-on
  {
    id: "b2b-services-linkedin-always-on",
    label: "B2B services · LinkedIn · always-on",
    source: "built-in",
    fitRules: {
      businessModels: ["b2b-services"],
      campaignTypes: ["always-on", "evergreen"],
      channels: ["linkedin"],
      awarenessStages: ["problem-aware", "solution-aware", "product-aware"],
      marketSophistication: ["competitive-market", "skeptical-market"],
      category: ["b2b", "service", "consulting"],
    },
    metrics: [
      { key: "cpm", range: usd(28, 48, 80) },
      { key: "ctr", range: percent(0.004, 0.008, 0.014) },
      { key: "cpc", range: usd(8, 16, 40) },
      { key: "cvr", range: percent(0.05, 0.1, 0.18) },
      { key: "cpa", range: usd(80, 180, 400) },
    ],
    confidence: "low",
    caveat:
      "Planning benchmark, not real-time data. B2B services LinkedIn has extreme variance; deal-size dominates CAC tolerance.",
  },
]);

// ---- Helpers ----------------------------------------------------------

export function getBenchmarkProfile(id: string): BenchmarkProfile | undefined {
  return BUILT_IN_BENCHMARK_PROFILES.find((p) => p.id === id);
}

export function listBenchmarkProfiles(): BenchmarkProfile[] {
  return BUILT_IN_BENCHMARK_PROFILES.slice();
}
