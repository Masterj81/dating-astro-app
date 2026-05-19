"use client";

// BenchmarkPanel.tsx — Benchmarks / Calibration Layer UI for CampaignOS.
//
// Reads `strategy.benchmarkCalibration` (built deterministically by the
// engine). The hook `useBenchmarkProfiles()` reads manual / client-history
// profiles from the localStorage-backed `benchmark-store` and merges them
// with the built-in catalog FOR DISPLAY ONLY — manual profiles never
// enter the pure engine.
//
// Renders six sections:
//   1. Header — status pill + confidence pill
//   2. Selected profiles — top-3 cards (label, fit score, confidence, caveat)
//   3. Metric comparison table — forecast vs benchmark low/median/high
//   4. Recommended assumption adjustments — priority + rationale
//   5. Warnings list — severity chips
//   6. Manual benchmark form + list of manual overrides
//
// SSR safety: the manual-profiles hook returns an empty list on the
// initial render and re-hydrates from localStorage after mount, matching
// the pattern used by SimulatorPanel.

import { useEffect, useMemo, useState } from "react";
import type { Strategy } from "@/types/strategy";
import type {
  BenchmarkCalibration,
  BenchmarkComparison,
  BenchmarkComparisonStatus,
  BenchmarkMetricKey,
  BenchmarkProfile,
  BenchmarkProfileFit,
  BenchmarkReadinessStatus,
  BenchmarkRecommendation,
  BenchmarkWarning,
} from "@/types/benchmarks";
import {
  BUILT_IN_BENCHMARK_PROFILES,
} from "@/lib/benchmarks/catalog";
import {
  createBrowserBenchmarkStore,
  type BenchmarkStore,
} from "@/lib/benchmarks/benchmark-store";

// ---- Hook -------------------------------------------------------------

export interface UseBenchmarkProfilesState {
  builtIn: BenchmarkProfile[];
  manual: BenchmarkProfile[];
  all: BenchmarkProfile[];
  refresh(): void;
  saveManual(profile: BenchmarkProfile): void;
  deleteManual(id: string): void;
}

export function useBenchmarkProfiles(): UseBenchmarkProfilesState {
  const [store, setStore] = useState<BenchmarkStore | null>(null);
  const [manual, setManual] = useState<BenchmarkProfile[]>([]);

  useEffect(() => {
    // SSR-safe: only construct the browser store after mount.
    const s = createBrowserBenchmarkStore();
    setStore(s);
    setManual(s.listManualProfiles());
  }, []);

  const builtIn = useMemo(
    () => BUILT_IN_BENCHMARK_PROFILES.slice(),
    []
  );

  function refresh(): void {
    if (!store) return;
    setManual(store.listManualProfiles());
  }

  function saveManual(profile: BenchmarkProfile): void {
    if (!store) return;
    store.upsertManualProfile(profile);
    setManual(store.listManualProfiles());
  }

  function deleteManual(id: string): void {
    if (!store) return;
    store.deleteManualProfile(id);
    setManual(store.listManualProfiles());
  }

  const all = useMemo(
    () => [...builtIn, ...manual],
    [builtIn, manual]
  );

  return { builtIn, manual, all, refresh, saveManual, deleteManual };
}

// ---- Pills ------------------------------------------------------------

function StatusPill({ status }: { status: BenchmarkReadinessStatus }) {
  const tone =
    status === "calibrated"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "partially-calibrated"
      ? "border-amber-500/40 text-amber-300"
      : status === "uncalibrated"
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
  label,
}: {
  confidence: "low" | "medium" | "high";
  label?: string;
}) {
  const tone =
    confidence === "high"
      ? "border-emerald-500/40 text-emerald-300"
      : confidence === "medium"
      ? "border-amber-500/40 text-amber-300"
      : "border-rose-500/40 text-rose-300";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      {label ? `${label}: ` : ""}
      {confidence}
    </span>
  );
}

function ComparisonStatusPill({
  status,
}: {
  status: BenchmarkComparisonStatus;
}) {
  const tone =
    status === "within-range"
      ? "border-emerald-500/40 text-emerald-300"
      : status === "below-range" || status === "above-range"
      ? "border-amber-500/40 text-amber-300"
      : status === "far-below-range" || status === "far-above-range"
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

function WarningChip({ warning }: { warning: BenchmarkWarning }) {
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

export interface BenchmarkTabProps {
  strategy: Strategy | null;
}

export function BenchmarkTab({ strategy }: BenchmarkTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const profiles = useBenchmarkProfiles();

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Benchmark calibration is loading…
      </p>
    );
  }

  if (!strategy || !strategy.benchmarkCalibration) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy to compute benchmark calibration.
      </p>
    );
  }

  const cal: BenchmarkCalibration = strategy.benchmarkCalibration;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Benchmarks / Calibration
          </p>
          <StatusPill status={cal.status} />
          <ConfidencePill confidence={cal.confidence} label="confidence" />
        </div>
        <p className="mt-3 text-xs text-ink-300">
          Built-in ranges are <strong>planning benchmarks, not real-time
          data</strong>. Capture client-history overrides below to refine
          calibration locally — manual profiles never enter the engine.
        </p>
      </section>

      {/* Selected profiles */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Selected planning benchmarks ({cal.selectedProfiles.length})
        </p>
        {cal.selectedProfiles.length === 0 ? (
          <p className="mt-3 text-xs text-ink-300">
            No matching planning benchmark — add channel / category /
            business-model signal to inputs.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {cal.selectedProfiles.map((fit) => (
              <ProfileCard key={fit.profileId} fit={fit} />
            ))}
          </div>
        )}
      </section>

      {/* Metric comparison table */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
          Metric comparison (forecast vs benchmark)
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs text-ink-200">
            <thead className="text-xxs uppercase tracking-wide text-ink-400">
              <tr>
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 pr-3">Forecast</th>
                <th className="py-2 pr-3">Low</th>
                <th className="py-2 pr-3">Median</th>
                <th className="py-2 pr-3">High</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2">Δ%</th>
              </tr>
            </thead>
            <tbody>
              {cal.comparisons.map((c) => (
                <ComparisonRow key={c.metric} comparison={c} />
              ))}
              {cal.comparisons.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-ink-400">
                    No comparisons available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recommendations */}
      {cal.recommendations.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Recommended assumption adjustments ({cal.recommendations.length})
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {cal.recommendations.map((r, i) => (
              <RecommendationCard
                key={`${r.metric}-${i}`}
                recommendation={r}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Warnings */}
      {cal.warnings.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Warnings ({cal.warnings.length})
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {cal.warnings.map((w, i) => (
              <WarningChip key={`${w.kind}-${i}`} warning={w} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* Manual benchmark form */}
      <ManualBenchmarkPanel profiles={profiles} />
    </div>
  );
}

function ProfileCard({ fit }: { fit: BenchmarkProfileFit }) {
  return (
    <div className="rounded-sm border border-ink-700 bg-ink-950/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-ink-100">{fit.profile.label}</p>
        <span className="rounded-sm border border-accent/50 px-1.5 py-0.5 text-xxs uppercase tracking-wide text-accent">
          fit {fit.fitScore}
        </span>
        <ConfidencePill confidence={fit.profile.confidence} />
      </div>
      <p className="mt-2 text-xxs text-ink-300">
        Source: {fit.profile.source}  ·  id: {fit.profileId}
      </p>
      {fit.matchedDimensions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {fit.matchedDimensions.map((d) => (
            <span
              key={d}
              className="rounded-sm border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xxs text-ink-300"
            >
              {d}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-3 text-xxs text-ink-400">{fit.profile.caveat}</p>
    </div>
  );
}

function ComparisonRow({ comparison }: { comparison: BenchmarkComparison }) {
  const unit = comparison.benchmark?.unit ?? "usd";
  const fv = formatValue(comparison.forecastValue, unit);
  const lo = comparison.benchmark
    ? formatValue(comparison.benchmark.low, unit)
    : "—";
  const md = comparison.benchmark
    ? formatValue(comparison.benchmark.median, unit)
    : "—";
  const hi = comparison.benchmark
    ? formatValue(comparison.benchmark.high, unit)
    : "—";
  const dPct =
    typeof comparison.deltaPercent === "number"
      ? `${(comparison.deltaPercent * 100).toFixed(1)}%`
      : "—";
  return (
    <tr className="border-t border-ink-800 align-top">
      <td className="py-2 pr-3 text-ink-100">{comparison.metric}</td>
      <td className="py-2 pr-3">{fv}</td>
      <td className="py-2 pr-3">{lo}</td>
      <td className="py-2 pr-3">{md}</td>
      <td className="py-2 pr-3">{hi}</td>
      <td className="py-2 pr-3">
        <ComparisonStatusPill status={comparison.status} />
      </td>
      <td className="py-2">{dPct}</td>
    </tr>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: BenchmarkRecommendation;
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
          {recommendation.metric}
        </p>
      </div>
      <p className="mt-2 text-xs text-ink-200">{recommendation.rationale}</p>
      <p className="mt-1 text-xxs text-ink-400">
        Suggested value: {recommendation.suggestedValue}
      </p>
    </div>
  );
}

// ---- Manual benchmark form -------------------------------------------

const MANUAL_METRIC_KEYS: BenchmarkMetricKey[] = [
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

function unitForMetric(
  key: BenchmarkMetricKey
): "usd" | "percent" | "multiplier" | "months" {
  switch (key) {
    case "cpm":
    case "cpc":
    case "cpa":
    case "aov":
    case "ltv":
      return "usd";
    case "roas":
      return "multiplier";
    default:
      return "percent";
  }
}

function ManualBenchmarkPanel({
  profiles,
}: {
  profiles: UseBenchmarkProfilesState;
}) {
  const [metric, setMetric] = useState<BenchmarkMetricKey>("cpm");
  const [low, setLow] = useState<number>(0);
  const [median, setMedian] = useState<number>(0);
  const [high, setHigh] = useState<number>(0);
  const [source, setSource] = useState<string>("Client account history");
  const [error, setError] = useState<string | null>(null);

  function handleSave(): void {
    if (!(low < median && median < high)) {
      setError("Range must satisfy low < median < high.");
      return;
    }
    const id = `manual-${metric}-${Date.now()}`;
    const profile: BenchmarkProfile = {
      id,
      label: `${source} · ${metric}`,
      source: "manual",
      fitRules: {},
      metrics: [
        {
          key: metric,
          range: {
            low,
            median,
            high,
            unit: unitForMetric(metric),
          },
        },
      ],
      confidence: "medium",
      caveat: `Manual override captured from ${source}. Used for display only — does not enter the deterministic engine.`,
    };
    profiles.saveManual(profile);
    setError(null);
    setLow(0);
    setMedian(0);
    setHigh(0);
  }

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
        Manual benchmark override
      </p>
      <p className="mt-1 text-xxs text-ink-400">
        Capture a client-history or platform-benchmark range. Stored
        locally in this browser; never sent anywhere and never threaded
        into the engine.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="text-xxs uppercase tracking-wide text-ink-400">
            Metric
          </span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as BenchmarkMetricKey)}
            className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-sm text-ink-100"
          >
            {MANUAL_METRIC_KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Low" value={low} step={0.01} onChange={setLow} />
        <NumberField
          label="Median"
          value={median}
          step={0.01}
          onChange={setMedian}
        />
        <NumberField label="High" value={high} step={0.01} onChange={setHigh} />
        <label className="flex flex-col gap-1">
          <span className="text-xxs uppercase tracking-wide text-ink-400">
            Source
          </span>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-sm text-ink-100"
          />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xxs text-rose-300">{error}</p>
      ) : null}
      <button
        type="button"
        onClick={handleSave}
        className="mt-3 rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:border-accent hover:text-white"
      >
        Save local override
      </button>

      {profiles.manual.length > 0 ? (
        <div className="mt-4">
          <p className="text-xxs uppercase tracking-wide text-ink-400">
            Manual overrides ({profiles.manual.length})
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {profiles.manual.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-ink-700 bg-ink-950/40 p-2 text-xs"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-ink-100">{p.label}</span>
                  <span className="text-xxs text-ink-400">
                    {p.metrics
                      .map(
                        (m) =>
                          `${m.key}: ${m.range.low} / ${m.range.median} / ${m.range.high}`
                      )
                      .join("  ·  ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => profiles.deleteManual(p.id)}
                  className="rounded-sm border border-rose-500/40 px-2 py-1 text-xxs uppercase tracking-wide text-rose-300 hover:bg-rose-950/40"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
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
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-sm text-ink-100"
      />
    </label>
  );
}

// ---- Helpers ----------------------------------------------------------

function formatValue(
  v: number | undefined,
  unit: "usd" | "percent" | "multiplier" | "months"
): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (unit === "usd") return `$${v.toFixed(2)}`;
  if (unit === "percent") return `${(v * 100).toFixed(2)}%`;
  if (unit === "multiplier") return `${v.toFixed(2)}x`;
  if (unit === "months") return `${v.toFixed(1)}mo`;
  return String(v);
}
