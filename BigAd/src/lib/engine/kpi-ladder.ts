// kpi-ladder.ts — KPI Target Ladder.
//
// For each of 8 KPIs and 3 tiers (starter / healthy / scaling), emit
// two thresholds: breakeven (the floor below which a test should die)
// and scaling (the level above which budget should grow). Direction
// (higher-better / lower-better) and unit are fixed per KPI.
//
// Defaults vary by priceTier, businessModel, campaignType, and offer
// context (targetROAS, COGS %, target margin %). Deterministic.

import type {
  BusinessModel,
  KpiName,
  KpiTarget,
  KpiTargetLadder,
  LadderTier,
  ProductInput,
} from "@/types/strategy";

const TIERS: LadderTier[] = ["starter", "healthy", "scaling"];

const KPIS: { name: KpiName; direction: KpiTarget["direction"]; unit: KpiTarget["unit"] }[] = [
  { name: "ctr", direction: "higher-better", unit: "percent" },
  { name: "cpc", direction: "lower-better", unit: "currency" },
  { name: "cpm", direction: "lower-better", unit: "currency" },
  { name: "cpa", direction: "lower-better", unit: "currency" },
  { name: "cvr", direction: "higher-better", unit: "percent" },
  { name: "roas", direction: "higher-better", unit: "ratio" },
  { name: "hookRate", direction: "higher-better", unit: "percent" },
  { name: "holdRate", direction: "higher-better", unit: "percent" },
];

type PriceTier = "low" | "mid" | "high" | "unknown";

function parsePriceTier(price: string): PriceTier {
  if (!price) return "unknown";
  const lower = price.toLowerCase();
  if (lower.includes("free")) return "low";
  const match = price.match(/\d+(?:[.,]\d+)?/);
  if (!match) return "unknown";
  const value = Number(match[0].replace(",", "."));
  if (!Number.isFinite(value)) return "unknown";
  if (value < 30) return "low";
  if (value < 200) return "mid";
  return "high";
}

export function buildKpiLadder(input: ProductInput): KpiTargetLadder {
  const priceTier = parsePriceTier(input.price);
  const targets: KpiTarget[] = [];

  for (const tier of TIERS) {
    for (const k of KPIS) {
      targets.push(
        buildTarget(k.name, tier, k.direction, k.unit, input, priceTier)
      );
    }
  }

  return {
    tiers: TIERS,
    targets,
  };
}

function buildTarget(
  kpi: KpiName,
  tier: LadderTier,
  direction: KpiTarget["direction"],
  unit: KpiTarget["unit"],
  input: ProductInput,
  priceTier: PriceTier
): KpiTarget {
  const model = input.businessModel;
  const targetROAS = input.offerContext?.targetROAS;
  const cogs = input.offerContext?.cogsPercent;
  const margin = input.offerContext?.targetMarginPercent;

  // Tier multipliers — starter is the loosest, scaling is the tightest.
  const tierIdx = TIERS.indexOf(tier);

  switch (kpi) {
    case "ctr": {
      // higher-better, percent
      const base = baseCtr(model, priceTier);
      const breakeven = roundTo(base * (1 + tierIdx * 0.25), 2);
      const scaling = roundTo(breakeven * 1.6, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Link-click CTR; scale once we sustain ${scaling}% over a meaningful spend window.`,
      };
    }
    case "cpc": {
      // lower-better, currency
      const base = baseCpc(model, priceTier);
      // For lower-better: starter has the highest breakeven (most permissive),
      // scaling has the lowest. Scaling <= breakeven.
      const breakeven = roundTo(base * (1.4 - tierIdx * 0.15), 2);
      const scaling = roundTo(breakeven * 0.65, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Cost per link click. Lower at scale signals the creative + audience pair is sharpening.`,
      };
    }
    case "cpm": {
      const base = baseCpm(model, priceTier);
      const breakeven = roundTo(base * (1.5 - tierIdx * 0.15), 2);
      const scaling = roundTo(breakeven * 0.7, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Cost per thousand impressions. CPM creep across days is the first fatigue tell.`,
      };
    }
    case "cpa": {
      const base = baseCpa(input, priceTier);
      const breakeven = roundTo(base * (1.5 - tierIdx * 0.15), 2);
      const scaling = roundTo(breakeven * 0.65, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Cost per acquisition; tighten the floor as the account matures.`,
      };
    }
    case "cvr": {
      const base = baseCvr(model, priceTier);
      const breakeven = roundTo(base * (1 + tierIdx * 0.25), 2);
      const scaling = roundTo(breakeven * 1.5, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Landing → conversion. Below breakeven, the landing page or offer is the suspect, not creative.`,
      };
    }
    case "roas": {
      const base = baseRoas(targetROAS, cogs, margin);
      const breakeven = roundTo(base + tierIdx * 0.4, 2);
      const scaling = roundTo(breakeven * 1.6, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Return on ad spend. Two thresholds: hold-do-not-scale between, scale above.`,
      };
    }
    case "hookRate": {
      const breakeven = roundTo(25 + tierIdx * 5, 2);
      const scaling = roundTo(breakeven * 1.4, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Video hook rate (1-3 second retention). The first signal we look at upstream of CTR.`,
      };
    }
    case "holdRate": {
      const breakeven = roundTo(10 + tierIdx * 3, 2);
      const scaling = roundTo(breakeven * 1.6, 2);
      return {
        kpi,
        tier,
        breakeven,
        scaling,
        direction,
        unit,
        notes: `Video hold rate (15-second or full-view retention). Diagnoses mid-roll story strength.`,
      };
    }
  }
}

// ---- Per-KPI base values keyed off model / price tier ----

function baseCtr(model: BusinessModel, tier: PriceTier): number {
  // Percent.
  if (model === "subscription" || model === "freemium") return 1.0;
  if (model === "marketplace") return 0.9;
  if (tier === "high") return 0.6;
  if (tier === "low") return 1.2;
  return 0.8;
}

function baseCpc(model: BusinessModel, tier: PriceTier): number {
  // Currency (unit-agnostic; treat as USD-ish).
  if (model === "subscription" || model === "freemium") return 0.9;
  if (tier === "high") return 2.5;
  if (tier === "low") return 0.5;
  return 1.2;
}

function baseCpm(model: BusinessModel, tier: PriceTier): number {
  if (model === "subscription" || model === "freemium") return 12;
  if (tier === "high") return 22;
  if (tier === "low") return 10;
  return 15;
}

function baseCpa(input: ProductInput, tier: PriceTier): number {
  const aov = input.offerContext?.currentAOV;
  const targetROAS = input.offerContext?.targetROAS;
  if (typeof aov === "number" && typeof targetROAS === "number" && targetROAS > 0) {
    return aov / targetROAS;
  }
  if (tier === "high") return 80;
  if (tier === "low") return 12;
  return 30;
}

function baseCvr(model: BusinessModel, tier: PriceTier): number {
  if (model === "freemium" || model === "subscription") return 3.0;
  if (tier === "high") return 1.2;
  if (tier === "low") return 4.0;
  return 2.2;
}

function baseRoas(targetROAS?: number, cogs?: number, margin?: number): number {
  if (typeof targetROAS === "number" && targetROAS > 0) return targetROAS;
  if (typeof cogs === "number" && typeof margin === "number") {
    const contribution = (100 - cogs - margin) / 100;
    if (contribution > 0) return roundTo(1 / contribution, 2);
  }
  return 2.0;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
