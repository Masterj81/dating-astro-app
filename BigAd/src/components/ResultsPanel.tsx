"use client";

// ResultsPanel.tsx — Results Import / Forecast Accuracy Loop UI for
// CampaignOS.
//
// Reads `strategy.creativeTestingMatrix` for the test-cell list and
// `strategy.forecast` for the forecast snapshot. Persists per-cell
// `CampaignActualResult` rows to localStorage via
// `createBrowserResultsStore` (keyed by projectId + runId), then runs
// `analyzeCampaignResults({ strategy, actualResults })` to produce a
// `ForecastAccuracyReport` carrying per-cell metric comparisons,
// decision recommendations, and overall accuracy.
//
// SSR safety: the `useCampaignResults` hook returns null on the initial
// server render and re-hydrates from localStorage after mount, matching
// the pattern used by BenchmarkPanel.

import { useEffect, useMemo, useState } from "react";
import type { Strategy, TestCell } from "@/types/strategy";
import type {
  ActualVsForecastMetric,
  CampaignActualResult,
  ForecastAccuracyReport,
  ResultDecisionRecommendation,
  ResultImportIssue,
  ResultStatus,
} from "@/types/results";
import {
  analyzeCampaignResults,
  parseCsvResults,
} from "@/lib/results/results-analysis";
import {
  createBrowserResultsStore,
  type ResultsStore,
  type UpsertResultInput,
} from "@/lib/results/results-store";

// ---- Hook -------------------------------------------------------------

export interface UseCampaignResultsState {
  store: ResultsStore | null;
  results: CampaignActualResult[];
  refresh(): void;
  upsert(input: UpsertResultInput): void;
  remove(id: string): void;
  clearAll(): void;
}

export function useCampaignResults(args: {
  projectId: string | null;
  runId: string | null;
}): UseCampaignResultsState {
  const { projectId, runId } = args;
  const [store, setStore] = useState<ResultsStore | null>(null);
  const [results, setResults] = useState<CampaignActualResult[]>([]);

  useEffect(() => {
    const s = createBrowserResultsStore();
    setStore(s);
    if (projectId && runId) {
      setResults(s.listResults(projectId, runId));
    } else {
      setResults([]);
    }
  }, [projectId, runId]);

  function refresh(): void {
    if (!store || !projectId || !runId) return;
    setResults(store.listResults(projectId, runId));
  }

  function upsert(input: UpsertResultInput): void {
    if (!store) return;
    store.upsertResult(input);
    if (projectId && runId) {
      setResults(store.listResults(projectId, runId));
    }
  }

  function remove(id: string): void {
    if (!store) return;
    store.deleteResult(id);
    if (projectId && runId) {
      setResults(store.listResults(projectId, runId));
    }
  }

  function clearAll(): void {
    if (!store || !projectId || !runId) return;
    store.clearForRun(projectId, runId);
    setResults([]);
  }

  return { store, results, refresh, upsert, remove, clearAll };
}

// ---- Pills + chips ----------------------------------------------------

function OverallAccuracyPill({
  accuracy,
}: {
  accuracy: ForecastAccuracyReport["overallAccuracy"];
}) {
  const tone =
    accuracy === "better-than-forecast"
      ? "border-emerald-500/40 text-emerald-300"
      : accuracy === "on-target"
      ? "border-emerald-500/40 text-emerald-200"
      : accuracy === "worse-than-forecast"
      ? "border-rose-500/40 text-rose-300"
      : accuracy === "mixed"
      ? "border-amber-500/40 text-amber-300"
      : "border-ink-600 text-ink-300";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      {accuracy}
    </span>
  );
}

function MetricChip({ metric }: { metric: ActualVsForecastMetric }) {
  const tone =
    metric.status === "far-better"
      ? "border-emerald-500/40 text-emerald-200 bg-emerald-950/40"
      : metric.status === "better"
      ? "border-emerald-500/30 text-emerald-300 bg-emerald-950/20"
      : metric.status === "on-target"
      ? "border-ink-600 text-ink-200 bg-ink-900"
      : metric.status === "worse"
      ? "border-amber-500/30 text-amber-300 bg-amber-950/20"
      : metric.status === "far-worse"
      ? "border-rose-500/40 text-rose-200 bg-rose-950/40"
      : "border-ink-700 text-ink-400 bg-ink-900";
  const av = formatMetric(metric.metric, metric.actualValue);
  const fv = formatMetric(metric.metric, metric.forecastValue);
  return (
    <span
      className={`flex flex-col gap-0.5 rounded-sm border px-2 py-1 text-xxs ${tone}`}
    >
      <span className="uppercase tracking-wide opacity-80">
        {metric.metric}
      </span>
      <span className="font-medium">{av}</span>
      <span className="opacity-70">vs {fv}</span>
    </span>
  );
}

function DecisionPill({
  decision,
}: {
  decision: ResultDecisionRecommendation["decision"];
}) {
  const tone =
    decision === "scale"
      ? "border-emerald-500/40 text-emerald-200 bg-emerald-950/40"
      : decision === "pause"
      ? "border-rose-500/40 text-rose-200 bg-rose-950/40"
      : decision === "iterate"
      ? "border-amber-500/40 text-amber-200 bg-amber-950/30"
      : "border-ink-700 text-ink-300 bg-ink-900";
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      {decision}
    </span>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: ResultDecisionRecommendation["priority"];
}) {
  const tone =
    priority === "must-do"
      ? "border-rose-500/40 text-rose-200"
      : priority === "should-do"
      ? "border-amber-500/40 text-amber-200"
      : "border-ink-700 text-ink-300";
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-xxs uppercase tracking-wide ${tone}`}
    >
      {priority}
    </span>
  );
}

function IssueRow({ issue }: { issue: ResultImportIssue }) {
  return (
    <li className="flex flex-col gap-1 rounded-sm border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-sm border border-current/40 px-1.5 py-0.5 text-xxs uppercase tracking-wide">
          {issue.kind}
        </span>
        {typeof issue.rowNumber === "number" ? (
          <span className="text-xxs opacity-70">row {issue.rowNumber}</span>
        ) : null}
        {issue.cellId ? (
          <span className="text-xxs opacity-70">cell {issue.cellId}</span>
        ) : null}
      </div>
      <p className="text-amber-100">{issue.message}</p>
      <p className="text-amber-300/80">{issue.fix}</p>
    </li>
  );
}

// ---- Tab body ---------------------------------------------------------

export interface ResultsTabProps {
  strategy: Strategy | null;
  projectId: string | null;
  runId: string | null;
}

export function ResultsTab({
  strategy,
  projectId,
  runId,
}: ResultsTabProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const campaignResults = useCampaignResults({ projectId, runId });

  const report = useMemo<ForecastAccuracyReport | null>(() => {
    if (!strategy) return null;
    return analyzeCampaignResults({
      strategy,
      actualResults: campaignResults.results,
    });
  }, [strategy, campaignResults.results]);

  if (!mounted) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Results are loading…
      </p>
    );
  }

  if (!strategy) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Generate a strategy to log actual results.
      </p>
    );
  }

  if (!projectId || !runId) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Save a run first to log actual results.
      </p>
    );
  }

  const matrix = strategy.creativeTestingMatrix;
  const firstBatch = matrix
    ? matrix.testCells.filter((c) =>
        matrix.recommendedFirstBatch.includes(c.id)
      )
    : [];

  if (firstBatch.length === 0) {
    return (
      <p className="hairline rounded-lg bg-ink-900 p-4 text-xs text-ink-300">
        Build the creative testing matrix so the Results loop has cells to track.
      </p>
    );
  }

  const readyToDecide =
    report?.perCell.filter(
      (row) => row.decision && row.decision.decision !== "needs-more-data"
    ).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <section className="hairline rounded-lg bg-ink-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Results / Forecast Accuracy
          </p>
          {report ? <OverallAccuracyPill accuracy={report.overallAccuracy} /> : null}
          <span className="rounded-sm border border-ink-700 px-2 py-0.5 text-xxs uppercase tracking-wide text-ink-300">
            {readyToDecide} ready to decide
          </span>
        </div>
        <p className="mt-3 text-xs text-ink-300">
          Log actual spend / impressions / clicks / conversions per cell.
          Saved locally in this browser (<code>bigad:campaign-actuals:v1</code>) — never
          sent anywhere and never threaded into the engine.
        </p>
      </section>

      {/* Manual input table */}
      <ManualResultsForm
        firstBatch={firstBatch}
        projectId={projectId}
        runId={runId}
        results={campaignResults.results}
        onUpsert={campaignResults.upsert}
        onDelete={campaignResults.remove}
      />

      {/* CSV paste import */}
      <CsvImportPanel
        projectId={projectId}
        runId={runId}
        onApply={(rows) => {
          for (const row of rows) {
            campaignResults.upsert({
              projectId: row.projectId,
              runId: row.runId,
              cellId: row.cellId,
              spendUsd: row.spendUsd,
              impressions: row.impressions,
              clicks: row.clicks,
              conversions: row.conversions,
              revenueUsd: row.revenueUsd,
              status: row.status,
              notes: row.notes,
              daysRun: row.daysRun,
            });
          }
        }}
      />

      {/* Forecast vs Actual table */}
      {report ? <ForecastVsActualTable report={report} /> : null}

      {/* Decision recommendation cards */}
      {report && report.recommendations.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Decision recommendations ({report.recommendations.length})
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.recommendations.map((r, i) => (
              <RecommendationCard key={`${r.cellId}-${i}`} recommendation={r} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Import issues */}
      {report && report.importIssues.length > 0 ? (
        <section className="hairline rounded-lg bg-ink-900 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Import issues ({report.importIssues.length})
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {report.importIssues.map((issue, i) => (
              <IssueRow key={`${issue.kind}-${issue.cellId ?? "?"}-${i}`} issue={issue} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

// ---- Manual results form ---------------------------------------------

const STATUS_OPTIONS: ResultStatus[] = [
  "winning",
  "losing",
  "inconclusive",
  "needs-more-data",
];

interface RowDraft {
  spend: string;
  impressions: string;
  clicks: string;
  conversions: string;
  revenue: string;
  status: ResultStatus;
  notes: string;
  daysRun: string;
}

function emptyDraft(): RowDraft {
  return {
    spend: "",
    impressions: "",
    clicks: "",
    conversions: "",
    revenue: "",
    status: "inconclusive",
    notes: "",
    daysRun: "",
  };
}

function draftFromActual(actual: CampaignActualResult): RowDraft {
  return {
    spend: String(actual.spendUsd ?? ""),
    impressions: String(actual.impressions ?? ""),
    clicks: String(actual.clicks ?? ""),
    conversions: String(actual.conversions ?? ""),
    revenue:
      typeof actual.revenueUsd === "number" ? String(actual.revenueUsd) : "",
    status: actual.status,
    notes: actual.notes ?? "",
    daysRun: typeof actual.daysRun === "number" ? String(actual.daysRun) : "",
  };
}

function ManualResultsForm(props: {
  firstBatch: TestCell[];
  projectId: string;
  runId: string;
  results: CampaignActualResult[];
  onUpsert: (input: UpsertResultInput) => void;
  onDelete: (id: string) => void;
}) {
  const { firstBatch, projectId, runId, results, onUpsert, onDelete } = props;
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() => {
    const out: Record<string, RowDraft> = {};
    for (const cell of firstBatch) {
      const existing = results.find((r) => r.cellId === cell.id);
      out[cell.id] = existing ? draftFromActual(existing) : emptyDraft();
    }
    return out;
  });

  // Re-sync drafts when the persisted results change (e.g. CSV import).
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, RowDraft> = { ...prev };
      for (const cell of firstBatch) {
        const existing = results.find((r) => r.cellId === cell.id);
        if (existing) {
          next[cell.id] = draftFromActual(existing);
        } else if (!next[cell.id]) {
          next[cell.id] = emptyDraft();
        }
      }
      return next;
    });
  }, [firstBatch, results]);

  function handleSave(cellId: string): void {
    const draft = drafts[cellId] ?? emptyDraft();
    const spendUsd = parseNonNegativeNumber(draft.spend) ?? 0;
    const impressions = parseNonNegativeNumber(draft.impressions) ?? 0;
    const clicks = parseNonNegativeNumber(draft.clicks) ?? 0;
    const conversions = parseNonNegativeNumber(draft.conversions) ?? 0;
    const revenueUsd =
      draft.revenue.trim().length > 0
        ? parseNonNegativeNumber(draft.revenue)
        : undefined;
    const daysRun =
      draft.daysRun.trim().length > 0
        ? parseNonNegativeNumber(draft.daysRun)
        : undefined;
    onUpsert({
      projectId,
      runId,
      cellId,
      spendUsd,
      impressions,
      clicks,
      conversions,
      revenueUsd,
      status: draft.status,
      notes: draft.notes.trim().length > 0 ? draft.notes.trim() : undefined,
      daysRun,
    });
  }

  function updateDraft(cellId: string, patch: Partial<RowDraft>): void {
    setDrafts((prev) => ({
      ...prev,
      [cellId]: { ...(prev[cellId] ?? emptyDraft()), ...patch },
    }));
  }

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
        Log actuals per test cell ({firstBatch.length})
      </p>
      <p className="mt-1 text-xxs text-ink-400">
        Save updates a per-cell row keyed by project + run + cell.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-xs text-ink-200">
          <thead className="text-xxs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="py-2 pr-3">Cell</th>
              <th className="py-2 pr-3">Spend</th>
              <th className="py-2 pr-3">Impressions</th>
              <th className="py-2 pr-3">Clicks</th>
              <th className="py-2 pr-3">Conv.</th>
              <th className="py-2 pr-3">Revenue</th>
              <th className="py-2 pr-3">Days</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Notes</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {firstBatch.map((cell) => {
              const draft = drafts[cell.id] ?? emptyDraft();
              const existing = results.find((r) => r.cellId === cell.id);
              return (
                <tr key={cell.id} className="border-t border-ink-800 align-top">
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-ink-100">{cell.id}</span>
                      <span className="text-xxs text-ink-400">
                        {cell.angle}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.spend}
                      onChange={(v) => updateDraft(cell.id, { spend: v })}
                      onBlur={() => handleSave(cell.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.impressions}
                      onChange={(v) => updateDraft(cell.id, { impressions: v })}
                      onBlur={() => handleSave(cell.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.clicks}
                      onChange={(v) => updateDraft(cell.id, { clicks: v })}
                      onBlur={() => handleSave(cell.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.conversions}
                      onChange={(v) => updateDraft(cell.id, { conversions: v })}
                      onBlur={() => handleSave(cell.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.revenue}
                      onChange={(v) => updateDraft(cell.id, { revenue: v })}
                      onBlur={() => handleSave(cell.id)}
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.daysRun}
                      onChange={(v) => updateDraft(cell.id, { daysRun: v })}
                      onBlur={() => handleSave(cell.id)}
                      widthClass="w-16"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      value={draft.status}
                      onChange={(e) => {
                        const v = e.target.value as ResultStatus;
                        updateDraft(cell.id, { status: v });
                      }}
                      onBlur={() => handleSave(cell.id)}
                      className="rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <TableInput
                      value={draft.notes}
                      onChange={(v) => updateDraft(cell.id, { notes: v })}
                      onBlur={() => handleSave(cell.id)}
                      widthClass="w-32"
                    />
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => handleSave(cell.id)}
                        className="rounded-sm border border-ink-700 bg-ink-800 px-2 py-1 text-xxs uppercase tracking-wide text-ink-100 hover:border-accent hover:text-white"
                      >
                        Save
                      </button>
                      {existing ? (
                        <button
                          type="button"
                          onClick={() => onDelete(existing.id)}
                          className="rounded-sm border border-rose-500/40 px-2 py-1 text-xxs uppercase tracking-wide text-rose-300 hover:bg-rose-950/40"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TableInput({
  value,
  onChange,
  onBlur,
  widthClass,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  widthClass?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className={`rounded-sm border border-ink-700 bg-ink-950 px-2 py-1 text-xs text-ink-100 ${
        widthClass ?? "w-20"
      }`}
    />
  );
}

// ---- CSV import ------------------------------------------------------

function CsvImportPanel(props: {
  projectId: string;
  runId: string;
  onApply: (rows: CampaignActualResult[]) => void;
}) {
  const { projectId, runId, onApply } = props;
  const [text, setText] = useState<string>(
    "cellId,spend,impressions,clicks,conversions,revenue,status,notes,daysRun\n"
  );
  const [parsed, setParsed] = useState<{
    results: CampaignActualResult[];
    issues: ResultImportIssue[];
  } | null>(null);

  function handleParse(): void {
    const out = parseCsvResults(text, projectId, runId);
    setParsed(out);
  }

  function handleApply(): void {
    if (!parsed) return;
    onApply(parsed.results);
    setParsed(null);
  }

  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
        CSV paste import
      </p>
      <p className="mt-1 text-xxs text-ink-400">
        Header row: <code>cellId,spend,impressions,clicks,conversions,revenue,status,notes,daysRun</code>.
        Revenue / notes / daysRun are optional.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-3 h-32 w-full rounded-sm border border-ink-700 bg-ink-950 p-2 text-xs text-ink-100"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleParse}
          className="rounded-sm border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs text-ink-100 transition hover:border-accent hover:text-white"
        >
          Parse CSV
        </button>
        {parsed ? (
          <>
            <span className="text-xxs text-ink-300">
              {parsed.results.length} valid row(s), {parsed.issues.length} issue(s)
            </span>
            {parsed.results.length > 0 ? (
              <button
                type="button"
                onClick={handleApply}
                className="rounded-sm border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-200 transition hover:bg-emerald-950/50"
              >
                Apply {parsed.results.length} result(s)
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {parsed && parsed.issues.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {parsed.issues.map((issue, i) => (
            <IssueRow key={`csv-${i}`} issue={issue} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// ---- Forecast vs Actual table ----------------------------------------

function ForecastVsActualTable({ report }: { report: ForecastAccuracyReport }) {
  return (
    <section className="hairline rounded-lg bg-ink-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-300">
        Forecast vs Actual ({report.perCell.length} cells)
      </p>
      <div className="mt-3 flex flex-wrap gap-3 text-xxs text-ink-300">
        <span>
          Total spend: <strong className="text-ink-100">${report.totals.totalSpendUsd.toFixed(2)}</strong>
        </span>
        <span>
          Conversions: <strong className="text-ink-100">{report.totals.totalConversions}</strong>
        </span>
        {typeof report.totals.totalRevenueUsd === "number" ? (
          <span>
            Revenue: <strong className="text-ink-100">${report.totals.totalRevenueUsd.toFixed(2)}</strong>
          </span>
        ) : null}
        {typeof report.totals.weightedCpa === "number" ? (
          <span>
            Weighted CPA: <strong className="text-ink-100">${report.totals.weightedCpa.toFixed(2)}</strong>
          </span>
        ) : null}
        {typeof report.totals.weightedRoas === "number" ? (
          <span>
            Weighted ROAS: <strong className="text-ink-100">{report.totals.weightedRoas.toFixed(2)}x</strong>
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {report.perCell.map((row) => (
          <div
            key={row.cellId}
            className="rounded-sm border border-ink-700 bg-ink-950/40 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink-100">{row.cellLabel}</p>
              {row.decision ? <DecisionPill decision={row.decision.decision} /> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.metrics.map((m) => (
                <MetricChip key={`${row.cellId}-${m.metric}`} metric={m} />
              ))}
            </div>
            {row.decision ? (
              <p className="mt-3 text-xxs text-ink-300">
                {row.decision.rationale}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: ResultDecisionRecommendation;
}) {
  const tone =
    recommendation.decision === "scale"
      ? "border-emerald-500/40 text-emerald-200"
      : recommendation.decision === "pause"
      ? "border-rose-500/40 text-rose-200"
      : recommendation.decision === "iterate"
      ? "border-amber-500/40 text-amber-200"
      : "border-ink-700 text-ink-300";
  return (
    <div className={`rounded-sm border bg-ink-950/40 p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <DecisionPill decision={recommendation.decision} />
        <PriorityBadge priority={recommendation.priority} />
        <p className="text-sm font-medium text-ink-100">
          {recommendation.cellId}
        </p>
      </div>
      <p className="mt-2 text-xs text-ink-200">{recommendation.rationale}</p>
    </div>
  );
}

// ---- Helpers ---------------------------------------------------------

function parseNonNegativeNumber(raw: string): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const cleaned = String(raw).trim().replace(/^[$£€]/, "").replace(/,/g, "");
  if (cleaned.length === 0) return undefined;
  const v = Number(cleaned);
  if (!Number.isFinite(v) || v < 0) return undefined;
  return v;
}

function formatMetric(
  metric: ActualVsForecastMetric["metric"],
  v: number | undefined
): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  if (metric === "cpm" || metric === "cpc" || metric === "cpa") {
    return `$${v.toFixed(2)}`;
  }
  if (metric === "ctr" || metric === "cvr") {
    return `${(v * 100).toFixed(2)}%`;
  }
  if (metric === "roas") {
    return `${v.toFixed(2)}x`;
  }
  return String(v);
}
