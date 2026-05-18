// unit-economics.ts — Unit Economics / Offer Lab engine.
//
// Pure deterministic derivation. Given a `ProductInput` (and, optionally,
// the engine's offer recommendations), emits a `UnitEconomicsSummary`
// covering gross margin, expected LTV, allowable CAC, breakeven CPA,
// breakeven ROAS, and (when subscription / freemium) a payback-months
// block. Never calls `Date.now()` — every output has `derivedAt = 0`.
//
// Sits alongside the engine's existing `breakeven.ts` helper. That helper
// is per-offer at the percent-points level (cogs / margin / discount);
// this module composes the same primitive into a dollar-denominated
// summary plus offer-by-offer scenario rows.

import type {
  OfferRecommendation,
  ProductInput,
} from "@/types/strategy";
import type {
  EconomicsField,
  EconomicsReadinessStatus,
  EconomicsWarning,
  EconomicsWarningKind,
  EconomicsWarningSeverity,
  OfferScenarioResult,
  SubscriptionEconomics,
  UnitEconomicsInput,
  UnitEconomicsSummary,
} from "@/types/economics";

// ---- Defaults ----------------------------------------------------------

const DEFAULT_COGS = 0.3; // 30% — used when offerContext.cogsPercent missing
const DEFAULT_TARGET_MARGIN = 0.3; // 30%
const DEFAULT_MONTHLY_CHURN = 0.1; // 10%/mo
const DEFAULT_TRIAL_TO_PAID = 0.4; // 40%
const RETENTION_FLOOR = 1;
const RETENTION_CAP = 48;
const PAYBACK_FLOOR = 0.5;
const PAYBACK_CAP = 48;
const TARGET_ROAS_FALLBACK_MULT = 1.4;

// ---- Public API: per-product LTV / CAC primitives ----------------------

export interface SubscriptionLtvArgs {
  monthlyPrice: number;
  cogsPercent: number; // 0-1
  monthlyChurnRate?: number; // 0-1
  averageMonthsRetained?: number;
}

export function calculateSubscriptionLtv(args: SubscriptionLtvArgs): {
  expectedLtv: number;
  expectedMonthsRetained: number;
  grossMargin: number;
} {
  const { monthlyPrice, cogsPercent } = args;
  const grossMargin = clamp01(1 - cogsPercent);

  let expectedMonthsRetained: number;
  if (typeof args.averageMonthsRetained === "number") {
    expectedMonthsRetained = args.averageMonthsRetained;
  } else if (
    typeof args.monthlyChurnRate === "number" &&
    args.monthlyChurnRate > 0
  ) {
    expectedMonthsRetained = 1 / args.monthlyChurnRate;
  } else {
    expectedMonthsRetained = 1 / DEFAULT_MONTHLY_CHURN;
  }
  expectedMonthsRetained = clampNumber(
    expectedMonthsRetained,
    RETENTION_FLOOR,
    RETENTION_CAP
  );

  const expectedLtv = monthlyPrice * grossMargin * expectedMonthsRetained;
  return {
    expectedLtv: roundCurrency(expectedLtv),
    expectedMonthsRetained: roundTo(expectedMonthsRetained, 2),
    grossMargin: roundTo(grossMargin, 4),
  };
}

export interface AllowableCacArgs {
  expectedLtv: number;
  targetMarginPercent: number; // 0-1
  trialToPaidRate?: number; // 0-1
  hasFreeTrial?: boolean;
}

export function calculateAllowableCac(args: AllowableCacArgs): {
  allowableCac: number;
  trialAdjustedLtv: number;
} {
  const trialAdjustedLtv = args.hasFreeTrial
    ? args.expectedLtv * (args.trialToPaidRate ?? DEFAULT_TRIAL_TO_PAID)
    : args.expectedLtv;
  const allowableCac = trialAdjustedLtv * args.targetMarginPercent;
  return {
    allowableCac: roundCurrency(allowableCac),
    trialAdjustedLtv: roundCurrency(trialAdjustedLtv),
  };
}

// ---- buildUnitEconomics -----------------------------------------------

export function buildUnitEconomics(input: ProductInput): UnitEconomicsSummary {
  const normalized = normalizeInput(input);
  const warnings: EconomicsWarning[] = [];

  const businessModel = normalized.businessModel;
  const resolvedPrice = normalized.price;
  const resolvedAov = normalized.currentAov ?? resolvedPrice;

  // Blocker: no price resolvable. Status decided after assembling warnings.
  if (resolvedPrice === undefined || resolvedPrice <= 0) {
    warnings.push(missingPriceWarning());
    return {
      status: "incomplete",
      businessModel,
      warnings,
      derivedAt: 0,
    };
  }

  // missing-aov info — fallback to price.
  if (normalized.currentAov === undefined) {
    warnings.push(missingAovWarning());
  }

  // missing-cogs — when no value provided, use the default and flag it.
  let cogsPercent = normalized.cogsPercent;
  if (cogsPercent === undefined) {
    cogsPercent = DEFAULT_COGS;
    warnings.push(missingCogsWarning(DEFAULT_COGS));
  }

  const grossMargin = clamp01(1 - cogsPercent);
  const targetMarginPercent =
    normalized.targetMarginPercent ?? DEFAULT_TARGET_MARGIN;

  if (grossMargin < 0.3) {
    warnings.push(grossMarginTooLowWarning(grossMargin));
  }

  const breakevenRoas = grossMargin > 0 ? 1 / grossMargin : Infinity;

  // Incoherent price vs. business model — only when price provided.
  if (
    (businessModel === "subscription" || businessModel === "freemium") &&
    resolvedPrice > 200
  ) {
    warnings.push(incoherentPriceBusinessModelWarning(resolvedPrice, "high"));
  }
  if (businessModel === "one-time" && resolvedPrice < 5) {
    warnings.push(incoherentPriceBusinessModelWarning(resolvedPrice, "low"));
  }

  let subscription: SubscriptionEconomics | undefined;
  let expectedLtv: number;
  let contributionMargin: number;
  let allowableCac: number;
  let breakevenCpa: number;
  let paybackMonths: number | undefined;

  if (businessModel === "subscription" || businessModel === "freemium") {
    // Subscription / freemium path.
    if (normalized.monthlyChurnRate === undefined) {
      warnings.push(missingChurnRateWarning());
    }

    const ltvBlock = calculateSubscriptionLtv({
      monthlyPrice: resolvedPrice,
      cogsPercent,
      monthlyChurnRate: normalized.monthlyChurnRate,
      averageMonthsRetained: normalized.averageMonthsRetained,
    });

    const hasFreeTrial = !!normalized.hasFreeTrial;
    const trialToPaidRate = normalized.trialToPaidRate;
    if (hasFreeTrial && trialToPaidRate === undefined) {
      warnings.push(missingTrialToPaidWarning());
    }

    const cacBlock = calculateAllowableCac({
      expectedLtv: ltvBlock.expectedLtv,
      targetMarginPercent,
      trialToPaidRate,
      hasFreeTrial,
    });

    contributionMargin = roundCurrency(resolvedPrice * grossMargin);
    expectedLtv = ltvBlock.expectedLtv;
    allowableCac = cacBlock.allowableCac;
    breakevenCpa = cacBlock.trialAdjustedLtv;

    // Payback months = breakeven CPA / monthly contribution.
    const monthlyContribution = resolvedPrice * grossMargin;
    if (monthlyContribution > 0) {
      const raw = breakevenCpa / monthlyContribution;
      paybackMonths = roundTo(
        clampNumber(raw, PAYBACK_FLOOR, PAYBACK_CAP),
        2
      );
    } else {
      paybackMonths = PAYBACK_CAP;
    }

    subscription = {
      monthlyPrice: roundCurrency(resolvedPrice),
      expectedMonthsRetained: ltvBlock.expectedMonthsRetained,
      grossMargin: ltvBlock.grossMargin,
      expectedLtv: ltvBlock.expectedLtv,
      trialAdjustedLtv: cacBlock.trialAdjustedLtv,
      paybackMonths,
    };

    if (paybackMonths !== undefined && paybackMonths > 12) {
      warnings.push(paybackTooLongWarning(paybackMonths));
    }

    if (allowableCac < 5 || allowableCac < breakevenCpa * 0.15) {
      warnings.push(cacWindowTightWarning(allowableCac));
    }
  } else {
    // one-time / services / lead-gen — single-purchase contribution.
    contributionMargin = roundCurrency(resolvedAov! * grossMargin);
    expectedLtv = contributionMargin;
    allowableCac = roundCurrency(expectedLtv * targetMarginPercent);
    breakevenCpa = contributionMargin;

    if (allowableCac < 5 || allowableCac < breakevenCpa * 0.15) {
      warnings.push(cacWindowTightWarning(allowableCac));
    }
  }

  // Target ROAS: explicit > derived (breakevenRoas × 1.4).
  let targetRoas = normalized.targetRoas;
  if (targetRoas === undefined) {
    targetRoas = roundTo(breakevenRoas * TARGET_ROAS_FALLBACK_MULT, 2);
    warnings.push(missingTargetRoasWarning(targetRoas));
  }

  if (
    Number.isFinite(breakevenRoas) &&
    Number.isFinite(targetRoas) &&
    targetRoas < breakevenRoas
  ) {
    warnings.push(targetRoasBelowBreakevenWarning(targetRoas, breakevenRoas));
  }

  const roasMargin =
    Number.isFinite(targetRoas) && Number.isFinite(breakevenRoas)
      ? roundTo(targetRoas - breakevenRoas, 2)
      : 0;

  const summary: UnitEconomicsSummary = {
    status: "viable",
    businessModel,
    resolvedPrice: roundCurrency(resolvedPrice),
    resolvedAov: roundCurrency(resolvedAov!),
    grossMargin: roundTo(grossMargin, 4),
    contributionMargin: roundCurrency(contributionMargin),
    expectedLtv: roundCurrency(expectedLtv),
    allowableCac: roundCurrency(allowableCac),
    breakevenCpa: roundCurrency(breakevenCpa),
    breakevenRoas: Number.isFinite(breakevenRoas)
      ? roundTo(breakevenRoas, 4)
      : 9999,
    targetRoas: roundTo(targetRoas, 2),
    roasMargin,
    paybackMonths,
    subscription,
    warnings,
    derivedAt: 0,
  };

  summary.status = classifyEconomicsReadiness(summary);
  return summary;
}

// ---- classifyEconomicsReadiness ---------------------------------------

export function classifyEconomicsReadiness(
  summary: UnitEconomicsSummary
): EconomicsReadinessStatus {
  const hasBlocker = summary.warnings.some((w) => w.severity === "blocker");
  if (hasBlocker) return "unviable";

  // Incomplete iff no resolvedPrice — already returned early in
  // buildUnitEconomics, but defended here too for direct callers.
  if (summary.resolvedPrice === undefined || summary.resolvedPrice <= 0) {
    return "incomplete";
  }

  const warningCount = summary.warnings.filter(
    (w) => w.severity === "warning"
  ).length;

  const isTightSubscription =
    summary.businessModel === "subscription" ||
    summary.businessModel === "freemium";

  const tight =
    warningCount >= 2 ||
    (typeof summary.roasMargin === "number" && summary.roasMargin < 0.3) ||
    (typeof summary.paybackMonths === "number" && summary.paybackMonths > 12) ||
    (isTightSubscription &&
      typeof summary.allowableCac === "number" &&
      summary.allowableCac < 10);

  return tight ? "tight" : "viable";
}

// ---- buildOfferScenarioResults ----------------------------------------

export function buildOfferScenarioResults(
  input: ProductInput,
  offers: OfferRecommendation[]
): OfferScenarioResult[] {
  if (!offers || offers.length === 0) return [];
  const baseline = buildUnitEconomics(input);
  const baseGrossMargin = baseline.grossMargin ?? 1 - DEFAULT_COGS;
  const baseTargetRoas =
    baseline.targetRoas ??
    (baseGrossMargin > 0
      ? (1 / baseGrossMargin) * TARGET_ROAS_FALLBACK_MULT
      : 0);
  const baseBreakevenRoas =
    baseline.breakevenRoas ??
    (baseGrossMargin > 0 ? 1 / baseGrossMargin : Infinity);

  const results: OfferScenarioResult[] = offers.map((offer) => {
    const baselinePrice = baseline.resolvedPrice ?? 0;
    const baselineAov = baseline.resolvedAov ?? baselinePrice;
    const discountFraction =
      typeof offer.discountPercent === "number"
        ? clamp01(offer.discountPercent / 100)
        : 0;

    // Price for the offer = baseline price minus discount (if discount
    // offer) or baseline AOV minus discount (when AOV present). Other
    // offer kinds carry no price change — they shift contribution via
    // their notes only.
    const aov = roundCurrency(
      Math.max(0, baselineAov * (1 - discountFraction))
    );
    const price = roundCurrency(
      Math.max(0, baselinePrice * (1 - discountFraction))
    );

    const grossMargin = baseGrossMargin;
    const contributionMargin = roundCurrency(aov * grossMargin);
    const breakevenCpa = contributionMargin;
    const breakevenRoas = Number.isFinite(baseBreakevenRoas)
      ? baseBreakevenRoas / Math.max(0.01, 1 - discountFraction)
      : Infinity;
    const targetMarginPercent =
      baseline.allowableCac && baseline.expectedLtv && baseline.expectedLtv > 0
        ? baseline.allowableCac / baseline.expectedLtv
        : DEFAULT_TARGET_MARGIN;
    const allowableCac = roundCurrency(
      Math.max(0, contributionMargin * targetMarginPercent)
    );

    const offerWarnings: EconomicsWarning[] = [];
    if (
      Number.isFinite(breakevenRoas) &&
      Number.isFinite(baseTargetRoas) &&
      baseTargetRoas < breakevenRoas
    ) {
      offerWarnings.push(
        targetRoasBelowBreakevenWarning(baseTargetRoas, breakevenRoas)
      );
    }
    if (grossMargin < 0.3) {
      offerWarnings.push(grossMarginTooLowWarning(grossMargin));
    }
    if (allowableCac < 5 || allowableCac < breakevenCpa * 0.15) {
      offerWarnings.push(cacWindowTightWarning(allowableCac));
    }

    const viability = classifyOfferViability({
      baselineStatus: baseline.status,
      offerWarnings,
      breakevenRoas,
      targetRoas: baseTargetRoas,
      allowableCac,
      paybackMonths: baseline.paybackMonths,
    });

    const riskNote = composeRiskNote({
      viability,
      breakevenRoas,
      targetRoas: baseTargetRoas,
      missingFields: collectMissingFields(baseline),
    });

    return {
      offerId: offer.kind,
      offerName: offer.label,
      offerKind: offer.kind,
      price,
      aov,
      grossMargin: roundTo(grossMargin, 4),
      contributionMargin,
      breakevenCpa,
      breakevenRoas: Number.isFinite(breakevenRoas)
        ? roundTo(breakevenRoas, 4)
        : 9999,
      allowableCac,
      paybackMonths: baseline.paybackMonths,
      viability,
      riskNote,
      warnings: offerWarnings,
    };
  });

  return results;
}

// ---- Internals ---------------------------------------------------------

function normalizeInput(input: ProductInput): UnitEconomicsInput {
  const ctx = input.offerContext;
  const price = parsePriceFromString(input.price);
  const cogsPercent =
    ctx && typeof ctx.cogsPercent === "number"
      ? clamp01(ctx.cogsPercent / 100)
      : undefined;
  const targetMarginPercent =
    ctx && typeof ctx.targetMarginPercent === "number"
      ? clamp01(ctx.targetMarginPercent / 100)
      : undefined;
  const currentAov =
    ctx && typeof ctx.currentAOV === "number" ? ctx.currentAOV : undefined;
  const targetRoas =
    ctx && typeof ctx.targetROAS === "number" ? ctx.targetROAS : undefined;

  // Map the broader `BusinessModel` union into the economics narrower union.
  // marketplace / ads / other are treated as 'services' for the purposes
  // of the economics calculation — a single per-transaction contribution.
  let economicsModel: UnitEconomicsInput["businessModel"];
  switch (input.businessModel) {
    case "subscription":
    case "freemium":
    case "one-time":
    case "services":
      economicsModel = input.businessModel;
      break;
    case "marketplace":
    case "ads":
    case "other":
      economicsModel = "services";
      break;
    default:
      economicsModel = undefined;
      break;
  }

  // Freemium with the word "trial" or "premium" in the description /
  // price string is treated as having a free trial. Subscription is
  // a free-trial candidate by default unless the offerContext says
  // otherwise. (Conservative: we only mark `hasFreeTrial` when the
  // signal is strong.)
  const lowerPrice = (input.price || "").toLowerCase();
  const lowerDescription = (input.description || "").toLowerCase();
  const hasFreeTrial =
    (economicsModel === "subscription" || economicsModel === "freemium") &&
    (lowerPrice.includes("free") ||
      lowerPrice.includes("trial") ||
      lowerDescription.includes("free trial") ||
      lowerDescription.includes("7-day") ||
      lowerDescription.includes("14-day") ||
      economicsModel === "freemium");

  return {
    businessModel: economicsModel,
    price,
    currentAov,
    cogsPercent,
    targetMarginPercent,
    targetRoas,
    hasFreeTrial,
  };
}

function parsePriceFromString(price: string | undefined): number | undefined {
  if (!price) return undefined;
  const lower = price.toLowerCase();
  // Match the first $X.Y or X.Y or X numeric. "Free with $9/month" → 9.
  // "$48 per 12oz bag" → 48. "$12/month" → 12.
  const match = price.match(/\$?\s*(\d+(?:[.,]\d+)?)/);
  if (!match) {
    if (lower.includes("free")) return undefined;
    return undefined;
  }
  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return value;
}

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

// ---- Warning composers -------------------------------------------------

function makeWarning(
  kind: EconomicsWarningKind,
  severity: EconomicsWarningSeverity,
  message: string,
  fix: string,
  field?: EconomicsField
): EconomicsWarning {
  const w: EconomicsWarning = { kind, severity, message, fix };
  if (field) w.field = field;
  return w;
}

function missingPriceWarning(): EconomicsWarning {
  return makeWarning(
    "missing-price",
    "blocker",
    "No price resolvable from the input — unit economics cannot run.",
    "Enter a numeric price (e.g. $9/month or $48 per unit) on the product card.",
    "price"
  );
}

function missingAovWarning(): EconomicsWarning {
  return makeWarning(
    "missing-aov",
    "info",
    "AOV not provided — using price as a single-transaction baseline.",
    "Fill in current AOV under Commercial inputs to model multi-item baskets.",
    "aov"
  );
}

function missingCogsWarning(fallback: number): EconomicsWarning {
  return makeWarning(
    "missing-cogs",
    "warning",
    `COGS not provided — using a ${(fallback * 100).toFixed(0)}% default.`,
    "Fill in COGS % under Commercial inputs to refine the contribution math.",
    "cogs"
  );
}

function missingTrialToPaidWarning(): EconomicsWarning {
  return makeWarning(
    "missing-trial-to-paid",
    "warning",
    "Free-trial product without a trial-to-paid conversion rate — allowable CAC can drift.",
    "Provide a measured trial-to-paid rate or accept the 40% industry default.",
    "trialToPaidRate"
  );
}

function missingChurnRateWarning(): EconomicsWarning {
  return makeWarning(
    "missing-churn-rate",
    "info",
    "Monthly churn rate not provided — assuming 10%/mo (≈10 expected months retained).",
    "Provide a measured monthly churn rate to anchor LTV.",
    "churnRate"
  );
}

function missingTargetRoasWarning(derived: number): EconomicsWarning {
  return makeWarning(
    "missing-target-roas",
    "info",
    `Target ROAS not provided — derived ${derived.toFixed(2)}x from breakeven × 1.4.`,
    "Set a target ROAS that reflects the campaign's profitability bar.",
    "targetRoas"
  );
}

function targetRoasBelowBreakevenWarning(
  target: number,
  breakeven: number
): EconomicsWarning {
  return makeWarning(
    "target-roas-below-breakeven",
    "blocker",
    `Target ROAS ${target.toFixed(2)} is below breakeven ${breakeven.toFixed(2)} — no path to profit at the assumed margin.`,
    "Raise target ROAS above breakeven, reduce COGS, or revisit pricing.",
    "targetRoas"
  );
}

function incoherentPriceBusinessModelWarning(
  price: number,
  direction: "high" | "low"
): EconomicsWarning {
  const message =
    direction === "high"
      ? `Subscription price $${price.toFixed(2)}/mo is unusually high — confirm willingness to pay.`
      : `One-time price $${price.toFixed(2)} is unusually low — margin will be thin.`;
  return makeWarning(
    "incoherent-price-business-model",
    "warning",
    message,
    direction === "high"
      ? "Confirm the price tier with a willingness-to-pay test before committing budget."
      : "Bundle the unit or raise price; sub-$5 single units rarely cover ad cost.",
    "price"
  );
}

function grossMarginTooLowWarning(grossMargin: number): EconomicsWarning {
  return makeWarning(
    "gross-margin-too-low",
    "warning",
    `Gross margin ${(grossMargin * 100).toFixed(0)}% is below 30% — breakeven ROAS is steep.`,
    "Reduce COGS, raise price, or bundle higher-margin units.",
    "cogs"
  );
}

function paybackTooLongWarning(months: number): EconomicsWarning {
  return makeWarning(
    "payback-too-long",
    "warning",
    `Payback window ${months.toFixed(1)} months is over the 12-month cap — cash will be tight.`,
    "Shorten payback via annual upfront billing, lower CAC, or higher trial-to-paid rate.",
    "trialToPaidRate"
  );
}

function cacWindowTightWarning(allowable: number): EconomicsWarning {
  return makeWarning(
    "cac-window-tight",
    "warning",
    `Allowable CAC $${allowable.toFixed(2)} leaves little headroom — efficient creative is non-negotiable.`,
    "Tighten kill rules to single-variable testing only; do not duplicate winners until they hold.",
    "targetMargin"
  );
}

// ---- Offer viability classification + risk note -----------------------

function classifyOfferViability(args: {
  baselineStatus: EconomicsReadinessStatus;
  offerWarnings: EconomicsWarning[];
  breakevenRoas: number;
  targetRoas: number;
  allowableCac: number;
  paybackMonths?: number;
}): EconomicsReadinessStatus {
  if (args.baselineStatus === "incomplete") return "incomplete";
  if (args.offerWarnings.some((w) => w.severity === "blocker")) {
    return "unviable";
  }
  const warningCount = args.offerWarnings.filter(
    (w) => w.severity === "warning"
  ).length;
  const margin = args.targetRoas - args.breakevenRoas;
  if (
    warningCount >= 2 ||
    margin < 0.3 ||
    (typeof args.paybackMonths === "number" && args.paybackMonths > 12)
  ) {
    return "tight";
  }
  return "viable";
}

function composeRiskNote(args: {
  viability: EconomicsReadinessStatus;
  breakevenRoas: number;
  targetRoas: number;
  missingFields: string[];
}): string {
  const b = Number.isFinite(args.breakevenRoas)
    ? args.breakevenRoas.toFixed(2)
    : "n/a";
  const t = Number.isFinite(args.targetRoas)
    ? args.targetRoas.toFixed(2)
    : "n/a";
  switch (args.viability) {
    case "viable": {
      const cushion =
        Number.isFinite(args.targetRoas) && Number.isFinite(args.breakevenRoas)
          ? (args.targetRoas - args.breakevenRoas).toFixed(2)
          : "0.00";
      return `Breakeven ROAS ${b} with target ${t} leaves ${cushion}x cushion.`;
    }
    case "tight":
      return `Breakeven ROAS ${b} only slightly above target ${t}; one-variable kill rules critical.`;
    case "unviable":
      return `Target ROAS ${t} is below breakeven ${b} — repricing or COGS reduction required.`;
    case "incomplete":
      return args.missingFields.length > 0
        ? `Cannot compute viability without ${args.missingFields.join(", ")}.`
        : "Cannot compute viability without the missing commercial inputs.";
  }
}

function collectMissingFields(baseline: UnitEconomicsSummary): string[] {
  const out: string[] = [];
  for (const w of baseline.warnings) {
    switch (w.kind) {
      case "missing-price":
        out.push("price");
        break;
      case "missing-aov":
        out.push("AOV");
        break;
      case "missing-cogs":
        out.push("COGS %");
        break;
      case "missing-trial-to-paid":
      case "subscription-without-trial-rate":
        out.push("trial→paid rate");
        break;
      case "missing-churn-rate":
        out.push("monthly churn");
        break;
      case "missing-target-roas":
        out.push("target ROAS");
        break;
      default:
        break;
    }
  }
  return Array.from(new Set(out));
}

// Re-export for callers that want the missing-fields summary.
export { collectMissingFields as listMissingEconomicsFields };
