"use client";

// EconomicsPanel.tsx — Unit Economics / Offer Lab UI for CampaignOS.
//
// Pure derivation-only panel. Reads `strategy.unitEconomics` and
// `strategy.offerScenarios` (both deterministically built by the engine)
// and renders six sections:
//
//   1. Header viability pill + business model / resolved price
//   2. Summary card grid (AOV, gross margin, expected LTV, allowable
//      CAC, breakeven ROAS, target ROAS)
//   3. Subscription block (only when subscription / freemium)
//   4. Offer scenario table (one row per OfferRecommendation)
//   5. Warning chips
//   6. Recommended action
//
// Editable assumptions are out of scope for v1 — every value is derived
// from `ProductInput`. Adding editability would need a small store for
// overrides; that's an additive future enhancement.

import { useEffect, useMemo, useState } from "react";
import type { ProductInput, Strategy } from "@/types/strategy";
import type {
  EconomicsReadinessStatus,
  EconomicsWarning,
  OfferScenarioResult,
  UnitEconomicsSummary,
} from "@/types/economics";

// ---- Hook -------------------------------------------------------------

export interface UnitEconomicsState {
  summary: UnitEconomicsSummary | null;
  scenarios: OfferScenarioResult[];
}

export function useUnitEconomics(
  strategy: Strategy | null
): UnitEconomicsState {
  return useMemo<UnitEconomicsState>(() => {
    if (!strategy) return { summary: null, scenarios: [] };
    return {
      summary: strategy.unitEconomics ?? null,
      scenarios: strategy.offerScenarios ?? [],
    };
  }, [strategy]);
}

// ---- Pills + chips ----------------------------------------------------

function ViabilityPill({ status }: { status: EconomicsReadinessStatus }) {
  const tone =
    status === "viable"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "tight"
      ? "border-amber-500/40 text-amber-300"
      : status === "unviable"
      ? "border-rose-500/40 text-rose-300"
      : "border-ink-600 text-ink-300";
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}>
      {status}
    </span>
  );
}

function WarningChip({ warning }: { warning: EconomicsWarning }) {
  const tone =
    warning.severity === "blocker"
      ? "border-rose-500/40 text-rose-300 bg-rose-950/40"
      : warning.severity === "warning"
      ? "border-amber-500/40 text-amber-300 bg-amber-950/30"
      : "border-ink-600 text-ink-300 bg-ink-800";
  return (
    <li
      className={`flex flex-col gap-1 rounded-sm border px-3 py-2 text-xs ${tone}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-current/40 px-1.5 py-0.5 text-xxs uppercase tracking-wide">
          {warning.severity}
        </span>
        <span className="font-medium">{warning.kind}</span>
        {warning.field ? (
          <span className="rounded-sm border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xxs text-ink-300">
            {warning.field}
          </span>
        ) : null}
      </div>
      <p className="text-ink-100">{warning.message}</p>
      <p className="text-ink-300">{warning.fix}</p>
    </li>
  );
}

// ---- Tab body ---------------------------------------------------------

export interface EconomicsTabProps {
  input: ProductInput;
  strategy: Strategy | null;
}

export function EconomicsTab({ input, strategy }: EconomicsTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Unit economics is loading…
      </p>
    );
  }

  const hasMeaningfulInput = Boolean(
    (input.name || "").trim() ||
      (input.audience || "").trim() ||
      (input.differentiator || "").trim()
  );
  if (!strategy || !hasMeaningfulInput) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy to compute unit economics.
      </p>
    );
  }

  const summary = strategy.unitEconomics;
  const scenarios = strategy.offerScenarios ?? [];

  if (!summary) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy to compute unit economics.
      </p>
    );
  }

  const priceSuffix =
    summary.businessModel === "subscription" || summary.businessModel === "freemium"
      ? "/mo"
      : "";
  const priceStr =
    typeof summary.resolvedPrice === "number"
      ? `$${summary.resolvedPrice.toFixed(2)}${priceSuffix}`
      : "—";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
              Unit economics
            </p>
            <ViabilityPill status={summary.status} />
          </div>
          <p className="text-xxs text-ink-300">
            {summary.businessModel ? (
              <>
                <span className="text-ink-200">{summary.businessModel}</span>
                {" · "}resolved price {priceStr}
              </>
            ) : (
              <>resolved price {priceStr}</>
            )}
          </p>
        </div>
        <p className="mt-3 text-xs text-ink-300">
          {economicsActionLabel(summary.status, summary.warnings)}
        </p>
      </section>

      {/* Summary grid */}
      {summary.resolvedPrice !== undefined ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Summary
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat label="AOV" value={formatDollars(summary.resolvedAov)} />
            <Stat
              label="Gross margin"
              value={formatPercent(summary.grossMargin)}
            />
            <Stat label="Expected LTV" value={formatDollars(summary.expectedLtv)} />
            <Stat
              label="Allowable CAC"
              value={formatDollars(summary.allowableCac)}
            />
            <Stat
              label="Breakeven ROAS"
              value={
                typeof summary.breakevenRoas === "number"
                  ? `${summary.breakevenRoas.toFixed(2)}x`
                  : "—"
              }
            />
            <Stat
              label="Target ROAS"
              value={
                typeof summary.targetRoas === "number"
                  ? `${summary.targetRoas.toFixed(2)}x`
                  : "—"
              }
              hint={
                typeof summary.roasMargin === "number"
                  ? `${summary.roasMargin >= 0 ? "+" : ""}${summary.roasMargin.toFixed(2)} vs breakeven`
                  : undefined
              }
            />
          </div>
        </section>
      ) : null}

      {/* Subscription block */}
      {summary.subscription ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Subscription details
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <Stat
              label="Monthly price"
              value={formatDollars(summary.subscription.monthlyPrice)}
            />
            <Stat
              label="Months retained"
              value={summary.subscription.expectedMonthsRetained.toFixed(1)}
            />
            <Stat
              label="Expected LTV"
              value={formatDollars(summary.subscription.expectedLtv)}
            />
            <Stat
              label="Trial-adjusted LTV"
              value={formatDollars(summary.subscription.trialAdjustedLtv)}
            />
            <Stat
              label="Payback"
              value={`${summary.subscription.paybackMonths.toFixed(1)} mo`}
            />
          </div>
        </section>
      ) : null}

      {/* Offer scenarios */}
      {scenarios.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Offer scenarios
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs text-ink-200">
              <thead className="text-xxs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="py-2 pr-3">Offer</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">AOV</th>
                  <th className="py-2 pr-3">GM</th>
                  <th className="py-2 pr-3">Breakeven CPA</th>
                  <th className="py-2 pr-3">Breakeven ROAS</th>
                  <th className="py-2 pr-3">Allowable CAC</th>
                  <th className="py-2 pr-3">Viability</th>
                  <th className="py-2">Risk</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr
                    key={s.offerId}
                    className="border-t border-ink-800 align-top"
                  >
                    <td className="py-2 pr-3 text-ink-100">{s.offerName}</td>
                    <td className="py-2 pr-3">{formatDollars(s.price)}</td>
                    <td className="py-2 pr-3">{formatDollars(s.aov)}</td>
                    <td className="py-2 pr-3">{formatPercent(s.grossMargin)}</td>
                    <td className="py-2 pr-3">
                      {formatDollars(s.breakevenCpa)}
                    </td>
                    <td className="py-2 pr-3">
                      {s.breakevenRoas.toFixed(2)}x
                    </td>
                    <td className="py-2 pr-3">
                      {formatDollars(s.allowableCac)}
                    </td>
                    <td className="py-2 pr-3">
                      <ViabilityPill status={s.viability} />
                    </td>
                    <td className="py-2 text-ink-300">{s.riskNote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Warnings */}
      {summary.warnings.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Warnings ({summary.warnings.length})
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.warnings.map((w, i) => (
              <WarningChip key={`${w.kind}-${i}`} warning={w} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Recommended action */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Recommended action
        </p>
        <p className="mt-2 text-xs text-ink-100">
          {recommendedActionLabel(summary)}
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-sm border border-ink-800 bg-ink-950/40 p-3">
      <p className="text-xxs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink-50">{value}</p>
      {hint ? <p className="mt-1 text-xxs text-ink-400">{hint}</p> : null}
    </div>
  );
}

// ---- Helpers ----------------------------------------------------------

function economicsActionLabel(
  status: EconomicsReadinessStatus,
  warnings: EconomicsWarning[]
): string {
  if (status === "viable") {
    return "Cleared for testing — proceed to creative production.";
  }
  if (status === "tight") {
    return "Define kill rules tight; one-variable testing only.";
  }
  if (status === "unviable") {
    return "Reprice or reduce COGS before spend.";
  }
  const missing = collectMissing(warnings);
  return missing.length > 0
    ? `Provide missing inputs: ${missing.join(", ")}.`
    : "Provide missing commercial inputs to compute viability.";
}

function recommendedActionLabel(summary: UnitEconomicsSummary): string {
  return economicsActionLabel(summary.status, summary.warnings);
}

function collectMissing(warnings: EconomicsWarning[]): string[] {
  const out: string[] = [];
  for (const w of warnings) {
    if (w.kind === "missing-price") out.push("price");
    if (w.kind === "missing-aov") out.push("AOV");
    if (w.kind === "missing-cogs") out.push("COGS %");
    if (w.kind === "missing-target-roas") out.push("target ROAS");
    if (
      w.kind === "missing-trial-to-paid" ||
      w.kind === "subscription-without-trial-rate"
    ) {
      out.push("trial→paid rate");
    }
  }
  return Array.from(new Set(out));
}

function formatDollars(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatPercent(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}
