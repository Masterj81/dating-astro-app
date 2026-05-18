"use client";

// SimulatorPanel.tsx — Scenario Simulator / What-if Lab UI for CampaignOS.
//
// Reads `strategy.scenarioSimulator` (built deterministically by the
// engine). Allows the operator to edit base assumptions in component
// state (no Strategy mutation, no localStorage) and re-compute scenarios
// + sensitivities locally for display. Renders six sections:
//
//   1. Header — plan status + base viability pills
//   2. Base assumptions table (editable in local state)
//   3. Scenario comparison table (≥5 rows)
//   4. Sensitivity table (sorted by sensitivityScore desc)
//   5. Recommendation cards
//   6. Warnings list

import { useEffect, useMemo, useState } from "react";
import type { Strategy } from "@/types/strategy";
import type {
  ScenarioSimulatorPlan,
  SimulatorAssumptionSet,
  SimulatorRecommendation,
  SimulatorScenarioResult,
  SimulatorSensitivityResult,
  SimulatorViability,
  SimulatorWarning,
} from "@/types/simulator";
import {
  buildSensitivityResults,
  simulateScenario,
} from "@/lib/simulator/scenario-simulator";

// ---- Pills + chips ----------------------------------------------------

function ViabilityPill({
  status,
  label,
}: {
  status: SimulatorViability;
  label?: string;
}) {
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
      {label ? `${label}: ` : ""}
      {status}
    </span>
  );
}

function WarningChip({ warning }: { warning: SimulatorWarning }) {
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

export interface SimulatorTabProps {
  strategy: Strategy | null;
}

export function SimulatorTab({ strategy }: SimulatorTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const initial = strategy?.scenarioSimulator?.baseAssumptions ?? null;
  const [edited, setEdited] = useState<SimulatorAssumptionSet | null>(null);

  // Recompute the local scenario + sensitivities when edited is set.
  const local = useMemo(() => {
    if (!strategy || !edited) return null;
    const baseResult = simulateScenario(strategy, edited);
    const sens = buildSensitivityResults(strategy, edited);
    return { baseResult, sensitivities: sens };
  }, [strategy, edited]);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Scenario simulator is loading…
      </p>
    );
  }

  if (!strategy || !strategy.scenarioSimulator) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy with Economics + Forecast to run scenarios.
      </p>
    );
  }

  const plan: ScenarioSimulatorPlan = strategy.scenarioSimulator;
  const baseScenario = plan.scenarios.find((s) => s.scenarioId === "base");
  const isEdited = edited !== null;

  // Pull whichever scenario set to display — when edited, only the base
  // scenario is recomputed; the named comparison scenarios remain the
  // strategy's deterministic output for clarity.
  const displayedBase = local ? local.baseResult : baseScenario ?? null;
  const displayedSensitivities = local ? local.sensitivities : plan.sensitivities;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
              Scenario Simulator / What-if Lab
            </p>
            <ViabilityPill status={plan.status} />
            {baseScenario ? (
              <ViabilityPill status={baseScenario.viability} label="base" />
            ) : null}
            {isEdited ? (
              <span className="rounded-sm border border-amber-500/40 bg-amber-950/30 px-2 py-0.5 text-xxs uppercase tracking-wide text-amber-300">
                Edited (local only)
              </span>
            ) : null}
          </div>
          {isEdited ? (
            <button
              type="button"
              onClick={() => setEdited(null)}
              className="rounded-sm border border-ink-700 px-2 py-1 text-xxs uppercase tracking-wide text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              Reset to forecast assumptions
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-ink-300">
          Stress-tests the base plan across 5 scenarios and ranks lever
          sensitivities. Editable inputs are local-only — they don&apos;t
          mutate the engine output.
        </p>
      </section>

      {/* Base assumptions table */}
      <BaseAssumptionsCard
        initial={initial}
        edited={edited}
        setEdited={setEdited}
      />

      {/* Scenario comparison */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Scenarios
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs text-ink-200">
            <thead className="text-xxs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="py-2 pr-3">Scenario</th>
                <th className="py-2 pr-3">Viability</th>
                <th className="py-2 pr-3">Conv.</th>
                <th className="py-2 pr-3">Rev.</th>
                <th className="py-2 pr-3">CPA</th>
                <th className="py-2 pr-3">ROAS</th>
                <th className="py-2 pr-3">LTV:CAC</th>
                <th className="py-2 pr-3">Payback</th>
                <th className="py-2">Risk note</th>
              </tr>
            </thead>
            <tbody>
              {plan.scenarios.map((s) => (
                <ScenarioRow key={s.scenarioId} scenario={s} />
              ))}
            </tbody>
          </table>
        </div>
        {isEdited && displayedBase ? (
          <p className="mt-3 text-xxs text-amber-300">
            Edited base outcome: CPA{" "}
            {Number.isFinite(displayedBase.outcome.cpa)
              ? formatDollars(displayedBase.outcome.cpa)
              : "—"}
            , ROAS {displayedBase.outcome.roas.toFixed(2)}x.
          </p>
        ) : null}
      </section>

      {/* Sensitivities */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Sensitivities {isEdited ? "(recomputed for edits)" : ""}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs text-ink-200">
            <thead className="text-xxs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="py-2 pr-3">Lever</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">-20%</th>
                <th className="py-2 pr-3">-10%</th>
                <th className="py-2 pr-3">+10%</th>
                <th className="py-2">+20%</th>
              </tr>
            </thead>
            <tbody>
              {displayedSensitivities.map((s) => (
                <SensitivityRow key={s.lever} sensitivity={s} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recommendations */}
      {plan.recommendations.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Recommendations ({plan.recommendations.length})
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {plan.recommendations.map((r) => (
              <RecommendationCard key={r.id} recommendation={r} />
            ))}
          </div>
        </section>
      ) : null}

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
    </div>
  );
}

function BaseAssumptionsCard({
  initial,
  edited,
  setEdited,
}: {
  initial: SimulatorAssumptionSet | null;
  edited: SimulatorAssumptionSet | null;
  setEdited: (next: SimulatorAssumptionSet | null) => void;
}) {
  if (!initial) {
    return (
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs text-ink-300">No base assumptions to display.</p>
      </section>
    );
  }
  const active = edited ?? initial;

  function update<K extends keyof SimulatorAssumptionSet>(
    key: K,
    value: SimulatorAssumptionSet[K]
  ) {
    setEdited({ ...(edited ?? initial), [key]: value } as SimulatorAssumptionSet);
  }

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
        Base assumptions
      </p>
      <p className="mt-1 text-xxs text-ink-400">
        Edit inline to re-run scenarios locally. Changes never mutate the
        engine output.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        <NumericInput
          label="Price (USD)"
          value={active.price ?? 0}
          step={0.5}
          onChange={(v) => update("price", v)}
        />
        <NumericInput
          label="Current AOV"
          value={active.currentAov}
          step={0.5}
          onChange={(v) => update("currentAov", v)}
        />
        <NumericInput
          label="Gross margin (0-1)"
          value={active.grossMargin}
          step={0.01}
          onChange={(v) => update("grossMargin", v)}
        />
        <NumericInput
          label="Target ROAS"
          value={active.targetRoas}
          step={0.1}
          onChange={(v) => update("targetRoas", v)}
        />
        <NumericInput
          label="Trial→paid (0-1)"
          value={active.trialToPaidRate ?? 0}
          step={0.01}
          onChange={(v) => update("trialToPaidRate", v)}
          disabled={!active.hasFreeTrial}
        />
        <NumericInput
          label="Monthly churn (0-1)"
          value={active.monthlyChurnRate ?? 0}
          step={0.01}
          onChange={(v) => update("monthlyChurnRate", v)}
        />
        <NumericInput
          label="CPM"
          value={active.cpm}
          step={1}
          onChange={(v) => update("cpm", v)}
        />
        <NumericInput
          label="CTR (0-1)"
          value={active.ctr}
          step={0.001}
          onChange={(v) => update("ctr", v)}
        />
        <NumericInput
          label="CVR (0-1)"
          value={active.cvr}
          step={0.001}
          onChange={(v) => update("cvr", v)}
        />
        <NumericInput
          label="Total budget"
          value={active.totalBudget}
          step={50}
          onChange={(v) => update("totalBudget", v)}
        />
        <NumericInput
          label="Duration (days)"
          value={active.durationDays}
          step={1}
          onChange={(v) => update("durationDays", Math.max(1, Math.round(v)))}
        />
        <SelectInput
          label="Offer kind"
          value={active.offerKind}
          options={[
            "free-trial-7d",
            "free-trial-14d",
            "annual-plan-discount",
            "discount-default",
            active.offerKind,
          ]}
          onChange={(v) => update("offerKind", v)}
        />
      </div>
    </section>
  );
}

function ScenarioRow({ scenario }: { scenario: SimulatorScenarioResult }) {
  const o = scenario.outcome;
  const cpa = Number.isFinite(o.cpa) ? formatDollars(o.cpa) : "—";
  const roas = `${o.roas.toFixed(2)}x`;
  const ltvCac =
    typeof o.ltvToCacRatio === "number" ? o.ltvToCacRatio.toFixed(2) : "—";
  const payback =
    typeof o.paybackMonths === "number"
      ? `${o.paybackMonths.toFixed(1)}mo`
      : "—";
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className="py-2 pr-3 text-ink-100">{scenario.label}</td>
      <td className="py-2 pr-3">
        <ViabilityPill status={scenario.viability} />
      </td>
      <td className="py-2 pr-3">{o.expectedConversions}</td>
      <td className="py-2 pr-3">{formatDollars(o.revenue)}</td>
      <td className="py-2 pr-3">{cpa}</td>
      <td className="py-2 pr-3">{roas}</td>
      <td className="py-2 pr-3">{ltvCac}</td>
      <td className="py-2 pr-3">{payback}</td>
      <td className="py-2 text-ink-300">
        {scenario.riskNote.length > 80
          ? scenario.riskNote.slice(0, 77) + "…"
          : scenario.riskNote}
      </td>
    </tr>
  );
}

function SensitivityRow({
  sensitivity,
}: {
  sensitivity: SimulatorSensitivityResult;
}) {
  const stepLookup: Record<string, string> = {};
  for (const step of sensitivity.steps) {
    stepLookup[step.label] = simulatorViabilityShort(step.viabilityAtThisStep);
  }
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className="py-2 pr-3 text-ink-100">{sensitivity.lever}</td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-ink-100">{sensitivity.sensitivityScore}</span>
          <div className="h-1.5 w-20 rounded-sm bg-ink-800">
            <div
              className="h-1.5 rounded-sm bg-accent"
              style={{ width: `${sensitivity.sensitivityScore}%` }}
            />
          </div>
        </div>
      </td>
      <td className="py-2 pr-3">{stepLookup["-20%"] ?? "—"}</td>
      <td className="py-2 pr-3">{stepLookup["-10%"] ?? "—"}</td>
      <td className="py-2 pr-3">{stepLookup["+10%"] ?? "—"}</td>
      <td className="py-2">{stepLookup["+20%"] ?? "—"}</td>
    </tr>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: SimulatorRecommendation;
}) {
  const tone =
    recommendation.priority === "must-do"
      ? "border-rose-500/40 text-rose-200"
      : recommendation.priority === "should-do"
      ? "border-amber-500/40 text-amber-200"
      : "border-emerald-500/40 text-emerald-200";
  return (
    <div className={`rounded-sm border bg-ink-950/40 p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-current/40 px-1.5 py-0.5 text-xxs uppercase tracking-wide">
          {recommendation.priority}
        </span>
        <p className="text-sm font-medium text-ink-100">
          {recommendation.title}
        </p>
      </div>
      <p className="mt-2 text-xs text-ink-200">{recommendation.rationale}</p>
      <p className="mt-1 text-xxs text-ink-400">
        {recommendation.expectedImpact}
      </p>
    </div>
  );
}

function NumericInput({
  label,
  value,
  step,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xxs uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-sm text-ink-100 disabled:opacity-50"
      />
    </label>
  );
}

function SelectInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const dedup = Array.from(new Set(options));
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xxs uppercase tracking-wide text-ink-400">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-sm text-ink-100"
      >
        {dedup.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- Helpers ----------------------------------------------------------

function simulatorViabilityShort(v: SimulatorViability): string {
  switch (v) {
    case "viable":
      return "✓";
    case "tight":
      return "~";
    case "unviable":
      return "x";
    case "incomplete":
      return "?";
  }
}

function formatDollars(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "$0.00";
  if (Math.abs(n) >= 1000) {
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  return `$${n.toFixed(2)}`;
}
