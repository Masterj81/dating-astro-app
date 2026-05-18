"use client";

// ForecastPanel.tsx — Forecast / Budget Planner UI for CampaignOS.
//
// Pure derivation-only panel. Reads `strategy.forecast` (deterministically
// built by the engine) and renders seven sections:
//
//   1. Header status + confidence pills
//   2. Summary cards (6 stats — total budget / daily / duration /
//      expected conversions / expected CPA / expected ROAS)
//   3. Scenario table (conservative / base / aggressive)
//   4. Spend allocation table (campaign / ad-set / test-cell rows)
//   5. Decision checkpoints (Day 1 / Day 3 / Day 5 / end-of-test)
//   6. Warning chips
//   7. Recommended operator action
//
// Editable overrides are out of scope for v1 — every value is derived
// from the upstream engine outputs (economics, KPI ladder, testing
// matrix, campaign setup, tracking readiness).

import { useEffect, useState } from "react";
import type { Strategy } from "@/types/strategy";
import type {
  DecisionCheckpoint,
  ForecastPlan,
  ForecastReadinessStatus,
  ForecastScenario,
  ForecastWarning,
  SpendAllocation,
} from "@/types/forecast";

// ---- Pills + chips ----------------------------------------------------

function StatusPill({ status }: { status: ForecastReadinessStatus }) {
  const tone =
    status === "viable"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "tight"
      ? "border-amber-500/40 text-amber-300"
      : status === "unviable"
      ? "border-rose-500/40 text-rose-300"
      : "border-ink-600 text-ink-300";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      {status}
    </span>
  );
}

function ConfidencePill({
  confidence,
}: {
  confidence: "low" | "medium" | "high";
}) {
  const tone =
    confidence === "high"
      ? "border-emerald-500/40 text-emerald-300"
      : confidence === "medium"
      ? "border-amber-500/40 text-amber-300"
      : "border-ink-600 text-ink-300";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      confidence: {confidence}
    </span>
  );
}

function WarningChip({ warning }: { warning: ForecastWarning }) {
  const tone =
    warning.severity === "blocker"
      ? "border-rose-500/40 text-rose-300 bg-rose-950/40"
      : warning.severity === "warning"
      ? "border-amber-500/40 text-amber-300 bg-amber-950/30"
      : "border-ink-600 text-ink-300 bg-ink-800";
  return (
    <li className={`flex flex-col gap-1 rounded-sm border px-3 py-2 text-xs ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-current/40 px-1.5 py-0.5 text-xxs uppercase tracking-wide">
          {warning.severity}
        </span>
        <span className="font-medium">{warning.kind}</span>
      </div>
      <p className="text-ink-100">{warning.message}</p>
      <p className="text-ink-300">{warning.fix}</p>
    </li>
  );
}

// ---- Tab body ---------------------------------------------------------

export interface ForecastTabProps {
  strategy: Strategy | null;
}

export function ForecastTab({ strategy }: ForecastTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Forecast is loading…
      </p>
    );
  }

  if (!strategy || !strategy.forecast) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy to compute the forecast.
      </p>
    );
  }

  const plan: ForecastPlan = strategy.forecast;
  const baseScenario =
    plan.scenarios.find((s) => s.kind === "base") ?? plan.scenarios[0];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
              Forecast / Budget Planner
            </p>
            <StatusPill status={plan.status} />
            <ConfidencePill confidence={plan.confidence} />
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-300">{plan.budget.reasoning}</p>
      </section>

      {/* Summary grid (6 cards) */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Budget summary
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat
            label="Recommended test budget"
            value={formatDollars(plan.budget.totalTestBudget)}
            hint={`min ${formatDollars(plan.budget.minimumLearningBudget)}`}
          />
          <Stat
            label="Daily budget"
            value={formatDollars(plan.budget.recommendedDailyBudget)}
          />
          <Stat
            label="Duration"
            value={`${plan.budget.recommendedTestDurationDays} days`}
          />
          <Stat
            label="Expected conversions (base)"
            value={`${baseScenario?.outcome.expectedConversions ?? 0}`}
          />
          <Stat
            label="Expected CPA (base)"
            value={
              typeof baseScenario?.outcome.expectedCpa === "number"
                ? formatDollars(baseScenario.outcome.expectedCpa)
                : "—"
            }
          />
          <Stat
            label="Expected ROAS (base)"
            value={
              typeof baseScenario?.outcome.expectedRoas === "number"
                ? `${baseScenario.outcome.expectedRoas.toFixed(2)}x`
                : "—"
            }
          />
        </div>
      </section>

      {/* Scenario table */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Scenarios
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs text-ink-200">
            <thead className="text-xxs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="py-2 pr-3">Scenario</th>
                <th className="py-2 pr-3">Budget</th>
                <th className="py-2 pr-3">Duration</th>
                <th className="py-2 pr-3">Impressions</th>
                <th className="py-2 pr-3">Clicks</th>
                <th className="py-2 pr-3">Conversions</th>
                <th className="py-2 pr-3">CPA</th>
                <th className="py-2 pr-3">ROAS</th>
                <th className="py-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {plan.scenarios.map((s) => (
                <ScenarioRow key={s.kind} scenario={s} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Spend allocation */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Spend allocation
        </p>
        {plan.allocation.length === 0 ? (
          <p className="mt-3 text-xs text-ink-300">
            No allocation rows — provide test cells to allocate budget.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs text-ink-200">
              <thead className="text-xxs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="py-2 pr-3">Ref</th>
                  <th className="py-2 pr-3">Budget</th>
                  <th className="py-2 pr-3">Daily</th>
                  <th className="py-2 pr-3">Share</th>
                  <th className="py-2">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {plan.allocation.map((a) => (
                  <AllocationRow key={`${a.refKind}-${a.refId}`} allocation={a} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Decision checkpoints */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Decision checkpoints
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {plan.decisionCheckpoints.map((c) => (
            <CheckpointCard key={c.label} checkpoint={c} />
          ))}
        </div>
      </section>

      {/* Warnings */}
      {plan.warnings.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Warnings ({plan.warnings.length})
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {plan.warnings.map((w, i) => (
              <WarningChip key={`${w.kind}-${i}`} warning={w} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Recommended action */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Recommended operator action
        </p>
        <p className="mt-2 text-xs text-ink-100">{recommendedAction(plan)}</p>
      </section>
    </div>
  );
}

function ScenarioRow({ scenario }: { scenario: ForecastScenario }) {
  const o = scenario.outcome;
  const cpa =
    typeof o.expectedCpa === "number" ? formatDollars(o.expectedCpa) : "—";
  const roas =
    typeof o.expectedRoas === "number" ? `${o.expectedRoas.toFixed(2)}x` : "—";
  const rev =
    typeof o.expectedRevenue === "number"
      ? formatDollars(o.expectedRevenue)
      : "—";
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className="py-2 pr-3 text-ink-100 capitalize">{scenario.kind}</td>
      <td className="py-2 pr-3">{formatDollars(scenario.budget)}</td>
      <td className="py-2 pr-3">{scenario.durationDays}</td>
      <td className="py-2 pr-3">{o.expectedImpressions.toLocaleString()}</td>
      <td className="py-2 pr-3">{o.expectedClicks.toLocaleString()}</td>
      <td className="py-2 pr-3">{o.expectedConversions.toLocaleString()}</td>
      <td className="py-2 pr-3">{cpa}</td>
      <td className="py-2 pr-3">{roas}</td>
      <td className="py-2">{rev}</td>
    </tr>
  );
}

function AllocationRow({ allocation }: { allocation: SpendAllocation }) {
  const indent =
    allocation.refKind === "ad-set"
      ? "pl-4"
      : allocation.refKind === "test-cell"
      ? "pl-8"
      : "";
  const kindLabel =
    allocation.refKind === "campaign"
      ? "Campaign"
      : allocation.refKind === "ad-set"
      ? "Ad set"
      : "Test cell";
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className={`py-2 pr-3 ${indent}`}>
        <span className="rounded-sm border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xxs uppercase tracking-wide text-ink-300">
          {kindLabel}
        </span>
        <span className="ml-2 text-ink-100">{allocation.refLabel}</span>
      </td>
      <td className="py-2 pr-3">{formatDollars(allocation.budget)}</td>
      <td className="py-2 pr-3">{formatDollars(allocation.dailyBudget)}</td>
      <td className="py-2 pr-3">{(allocation.shareOfTotal * 100).toFixed(0)}%</td>
      <td className="py-2 text-ink-300">{allocation.rationale}</td>
    </tr>
  );
}

function CheckpointCard({ checkpoint }: { checkpoint: DecisionCheckpoint }) {
  return (
    <div className="rounded-sm border border-ink-800 bg-ink-950/40 p-3">
      <p className="text-xs font-medium text-ink-100">{checkpoint.label}</p>
      {checkpoint.cellsAffected && checkpoint.cellsAffected.length > 0 ? (
        <p className="mt-1 text-xxs text-ink-400">
          Cells: {checkpoint.cellsAffected.length}
        </p>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1 text-xxs">
        {checkpoint.killConditions.map((k, i) => (
          <li key={`kill-${i}`} className="text-rose-300">
            Kill if: {k}
          </li>
        ))}
        {checkpoint.iterateConditions.map((k, i) => (
          <li key={`iter-${i}`} className="text-amber-300">
            Iterate if: {k}
          </li>
        ))}
        {checkpoint.scaleConditions.map((k, i) => (
          <li key={`scale-${i}`} className="text-emerald-300">
            Scale if: {k}
          </li>
        ))}
      </ul>
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

function recommendedAction(plan: ForecastPlan): string {
  switch (plan.status) {
    case "unviable":
      return "Do not spend. Fix the blocker(s) first.";
    case "tight":
      return "Spend cautiously. Set kill rules at Day 1 + Day 3.";
    case "viable":
      return `Cleared for first batch. Launch at recommended daily budget for ${plan.budget.recommendedTestDurationDays} days.`;
    case "incomplete":
      return "Provide missing inputs to compute forecast.";
  }
}

function formatDollars(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "$0.00";
  if (Math.abs(n) >= 1000) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `$${n.toFixed(2)}`;
}
