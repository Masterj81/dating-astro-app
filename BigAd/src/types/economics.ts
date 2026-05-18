// economics.ts — Unit Economics / Offer Lab types for CampaignOS.
//
// Pure derivation from ProductInput + the engine's offer recommendations.
// The economics layer never calls `Date.now()`; `derivedAt` is always 0
// for byte-identical output across calls with identical input.

import type { OfferKind } from "./strategy";

export type EconomicsReadinessStatus =
  | "viable"
  | "tight"
  | "unviable"
  | "incomplete";

export type EconomicsWarningKind =
  | "missing-price"
  | "missing-aov"
  | "missing-cogs"
  | "missing-trial-to-paid"
  | "missing-churn-rate"
  | "target-roas-below-breakeven"
  | "incoherent-price-business-model"
  | "gross-margin-too-low"
  | "payback-too-long"
  | "cac-window-tight"
  | "subscription-without-trial-rate"
  | "missing-target-roas";

export type EconomicsWarningSeverity = "info" | "warning" | "blocker";

export type EconomicsField =
  | "price"
  | "aov"
  | "cogs"
  | "targetMargin"
  | "targetRoas"
  | "trialToPaidRate"
  | "churnRate"
  | "businessModel";

export interface EconomicsWarning {
  kind: EconomicsWarningKind;
  severity: EconomicsWarningSeverity;
  field?: EconomicsField;
  message: string;
  fix: string;
}

// A small DTO mirroring the relevant slice of ProductInput. The engine
// builds one of these from input before running the calculation.
export interface UnitEconomicsInput {
  businessModel?:
    | "subscription"
    | "one-time"
    | "freemium"
    | "services"
    | "lead-gen";
  price?: number;
  currentAov?: number;
  cogsPercent?: number; // 0-1 fraction (0.25 = 25% COGS)
  targetMarginPercent?: number; // 0-1 fraction
  targetRoas?: number; // multiplier (2.5 = 2.5x)
  trialToPaidRate?: number; // 0-1 fraction
  monthlyChurnRate?: number; // 0-1 fraction
  hasFreeTrial?: boolean;
  trialLengthDays?: number;
  averageMonthsRetained?: number; // override; else derived from churn
}

export interface SubscriptionEconomics {
  monthlyPrice: number;
  expectedMonthsRetained: number;
  grossMargin: number; // 0-1
  expectedLtv: number;
  trialAdjustedLtv: number;
  paybackMonths: number;
}

export interface UnitEconomicsSummary {
  status: EconomicsReadinessStatus;
  businessModel?: UnitEconomicsInput["businessModel"];
  resolvedPrice?: number;
  resolvedAov?: number;
  grossMargin?: number; // 0-1
  contributionMargin?: number;
  expectedLtv?: number;
  allowableCac?: number;
  breakevenCpa?: number;
  breakevenRoas?: number;
  targetRoas?: number;
  roasMargin?: number;
  paybackMonths?: number;
  subscription?: SubscriptionEconomics;
  warnings: EconomicsWarning[];
  // Always 0 — economics is purely derived from input. Never `Date.now()`.
  derivedAt: number;
}

export interface OfferScenario {
  offerId: string;
  offerName: string;
  price: number;
  aov: number;
  trialAdjustment?: number;
}

export interface OfferScenarioResult {
  // Stable id — `OfferRecommendation.kind` (engine uses kind as id).
  offerId: string;
  offerName: string;
  // Offer kind kept for downstream consumers (UI / export).
  offerKind: OfferKind;
  price: number;
  aov: number;
  grossMargin: number;
  contributionMargin: number;
  breakevenCpa: number;
  breakevenRoas: number;
  allowableCac: number;
  paybackMonths?: number;
  viability: EconomicsReadinessStatus;
  riskNote: string;
  warnings: EconomicsWarning[];
}
