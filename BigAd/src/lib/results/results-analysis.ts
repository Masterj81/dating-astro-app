// results-analysis.ts — Results Import / Forecast Accuracy Loop engine.
//
// Pure deterministic derivation. Given a built Strategy plus a list of
// per-cell `CampaignActualResult` rows, this module:
//
//   - Builds a per-cell forecast snapshot (split equally across the
//     test cells in `creativeTestingMatrix.recommendedFirstBatch`,
//     matching the Forecast layer's equal-split allocation) and
//     compares the actuals against it across cpm / ctr / cpc / cvr /
//     cpa / roas
//   - Emits a per-cell decision recommendation (scale / iterate /
//     pause / needs-more-data) using deterministic thresholds against
//     the forecast and `forecast.budget.minimumLearningBudget`
//   - Classifies the overall accuracy (on-target / better-than /
//     worse-than / mixed / insufficient-data) from the weighted
//     totals
//   - Surfaces import issues (cell-id-not-in-strategy /
//     inconsistent-totals / no-spend-no-data) so the operator sees
//     bad inputs before they trust the report
//
// `derivedAt` is always 0. No `Date.now()` is ever called in this
// module. No `Math.random`. All ordering is stable.

import type { Strategy } from "@/types/strategy";
import type {
  ActualVsForecastMetric,
  CampaignActualResult,
  ForecastAccuracyReport,
  ResultDecisionRecommendation,
  ResultImportIssue,
} from "@/types/results";

// ---- Constants --------------------------------------------------------

// Threshold above which a metric delta counts as "far". 30% on either
// side mirrors the Benchmarks layer's far-from-range threshold so the
// two surfaces tell the same story.
const FAR_DELTA = 0.3;

// Decision thresholds against forecast ROAS.
const SCALE_ROAS_MULT = 1.2;
const SCALE_MIN_CONVERSIONS = 5;
const ITERATE_LOW_MULT = 0.7;
const ITERATE_HIGH_MULT = 1.2;
const PAUSE_ROAS_MULT = 0.6;

// Spend gate against the forecast's minimum learning budget. Below
// this fraction the cell hasn't accumulated enough signal to draw a
// scale / pause conclusion.
const LEARNING_SPEND_GATE_FRACTION = 0.4;

// Overall accuracy thresholds against the forecast-weighted ROAS.
const OVERALL_BETTER_MULT = 1.1;
const OVERALL_WORSE_MULT = 0.9;

// CSV header — order matters, all required except `revenue` / `notes` /
// `daysRun`. Kept in lower-case to make parsing case-insensitive.
const REQUIRED_CSV_COLUMNS = [
  "cellId",
  "spend",
  "impressions",
  "clicks",
  "conversions",
] as const;

const ALL_CSV_COLUMNS = [
  "cellId",
  "spend",
  "impressions",
  "clicks",
  "conversions",
  "revenue",
  "status",
  "notes",
  "daysRun",
] as const;

// ---- Public API --------------------------------------------------------

export interface AnalyzeCampaignResultsInput {
  strategy: Strategy;
  actualResults: CampaignActualResult[];
}

export function analyzeCampaignResults(
  input: AnalyzeCampaignResultsInput
): ForecastAccuracyReport {
  const { strategy, actualResults } = input;

  const matrix = strategy.creativeTestingMatrix;
  const firstBatchIds: string[] = matrix?.recommendedFirstBatch ?? [];
  const firstBatchCells = matrix
    ? matrix.testCells.filter((c) => firstBatchIds.includes(c.id))
    : [];
  const cellCount = firstBatchCells.length;

  // Forecast snapshot — pulled from base scenario (cell-agnostic
  // ratios) + total budget / conversions divided by cell count for the
  // per-cell anchor. Mirrors the Forecast allocation pattern (equal
  // split for one-variable-at-a-time discipline).
  const baseScenario =
    strategy.forecast?.scenarios.find((s) => s.kind === "base") ??
    strategy.forecast?.scenarios[0];
  const baseOutcome = baseScenario?.outcome;
  const forecastPerCellSnapshot = baseOutcome
    ? {
        expectedCpm: baseOutcome.assumptions.cpm,
        expectedCtr: baseOutcome.assumptions.ctr,
        expectedCpc: baseOutcome.assumptions.cpc,
        expectedCvr: baseOutcome.assumptions.cvr,
        expectedCpa: baseOutcome.expectedCpa,
        expectedRoas: baseOutcome.expectedRoas,
        expectedConversions:
          cellCount > 0 && typeof baseOutcome.expectedConversions === "number"
            ? Math.max(
                0,
                Math.floor(baseOutcome.expectedConversions / cellCount)
              )
            : baseOutcome.expectedConversions,
      }
    : undefined;

  const minLearning =
    strategy.forecast?.budget?.minimumLearningBudget ?? 0;
  const perCellMinLearning =
    cellCount > 0 && minLearning > 0 ? minLearning / cellCount : 0;
  const spendGate = perCellMinLearning * LEARNING_SPEND_GATE_FRACTION;

  // Detect parser-time issues against the strategy. CSV-parse-time
  // issues (invalid-number / duplicate-cell-id / inconsistent-totals
  // before the actuals reach us) come from `parseCsvResults`.
  const importIssues: ResultImportIssue[] = [];

  // Sort actuals by cellId asc, then by updatedAt desc (newest first)
  // so the latest reading wins when duplicates leak in.
  const sortedActuals = actualResults.slice().sort((a, b) => {
    if (a.cellId !== b.cellId) {
      return a.cellId < b.cellId ? -1 : 1;
    }
    return b.updatedAt - a.updatedAt;
  });

  // Index per cell id — first occurrence wins (which is the newest
  // updatedAt thanks to the sort above).
  const actualByCellId = new Map<string, CampaignActualResult>();
  for (const a of sortedActuals) {
    if (!actualByCellId.has(a.cellId)) {
      actualByCellId.set(a.cellId, a);
    }
  }

  // Validate each actual against the strategy.
  const knownCellIds = new Set(
    matrix ? matrix.testCells.map((c) => c.id) : []
  );
  for (const actual of sortedActuals) {
    if (knownCellIds.size > 0 && !knownCellIds.has(actual.cellId)) {
      importIssues.push({
        kind: "cell-id-not-in-strategy",
        cellId: actual.cellId,
        message: `Cell id '${actual.cellId}' not found in latest run`,
        fix: "Verify cell id matches recommendedFirstBatch",
      });
    }
    if (actual.clicks > actual.impressions) {
      importIssues.push({
        kind: "inconsistent-totals",
        cellId: actual.cellId,
        message: `Clicks (${actual.clicks}) exceed impressions (${actual.impressions}) for ${actual.cellId}`,
        fix: "Re-check the source export — clicks cannot exceed impressions.",
      });
    }
    if (actual.conversions > actual.clicks) {
      importIssues.push({
        kind: "inconsistent-totals",
        cellId: actual.cellId,
        message: `Conversions (${actual.conversions}) exceed clicks (${actual.clicks}) for ${actual.cellId}`,
        fix: "Re-check the source export — conversions cannot exceed clicks.",
      });
    }
    if (
      actual.spendUsd === 0 &&
      actual.impressions === 0 &&
      actual.clicks === 0 &&
      actual.conversions === 0
    ) {
      importIssues.push({
        kind: "no-spend-no-data",
        cellId: actual.cellId,
        message: `No spend and no data for ${actual.cellId}`,
        fix: "Remove the row or wait until the cell has spent.",
      });
    }
  }

  // Build per-cell rows. Order: every cell in firstBatchIds first (in
  // their first-batch order), then any actuals whose cellId is not in
  // the first batch but did make it through (so the operator still
  // sees orphan rows). Within orphan rows the order is the sortedActuals
  // order.
  const perCellRows: ForecastAccuracyReport["perCell"] = [];
  const usedActualCellIds = new Set<string>();

  for (const cell of firstBatchCells) {
    const actual = actualByCellId.get(cell.id);
    if (actual) usedActualCellIds.add(cell.id);
    const metrics = compareActualsToForecast(
      actual ?? null,
      forecastPerCellSnapshot
    );
    const decision = actual
      ? buildPerCellDecision({
          cellId: cell.id,
          actual,
          forecastSnapshot: forecastPerCellSnapshot,
          spendGate,
        })
      : {
          cellId: cell.id,
          decision: "needs-more-data" as const,
          rationale: "No results logged yet for this cell.",
          priority: "should-do" as const,
        };
    perCellRows.push({
      cellId: cell.id,
      cellLabel: cellLabelFor(cell.id, cell.angle, cell.format),
      actual,
      forecastSnapshot: forecastPerCellSnapshot,
      metrics,
      decision,
    });
  }

  // Orphan actuals — cellId did not match the first batch but we still
  // surface a row so the operator can see / fix the discrepancy.
  for (const actual of sortedActuals) {
    if (usedActualCellIds.has(actual.cellId)) continue;
    if (firstBatchCells.some((c) => c.id === actual.cellId)) continue;
    usedActualCellIds.add(actual.cellId);
    const metrics = compareActualsToForecast(actual, forecastPerCellSnapshot);
    const decision = buildPerCellDecision({
      cellId: actual.cellId,
      actual,
      forecastSnapshot: forecastPerCellSnapshot,
      spendGate,
    });
    perCellRows.push({
      cellId: actual.cellId,
      cellLabel: `${actual.cellId} (unmatched)`,
      actual,
      forecastSnapshot: forecastPerCellSnapshot,
      metrics,
      decision,
    });
  }

  // Totals — weighted CPA and ROAS roll up across every row that
  // has an actual.
  let totalSpendUsd = 0;
  let totalConversions = 0;
  let totalRevenueUsd = 0;
  let hasAnyRevenue = false;
  for (const row of perCellRows) {
    if (!row.actual) continue;
    totalSpendUsd += row.actual.spendUsd;
    totalConversions += row.actual.conversions;
    if (typeof row.actual.revenueUsd === "number") {
      totalRevenueUsd += row.actual.revenueUsd;
      hasAnyRevenue = true;
    }
  }
  const weightedCpa =
    totalConversions > 0
      ? roundCurrency(totalSpendUsd / totalConversions)
      : undefined;
  const weightedRoas =
    totalSpendUsd > 0 && hasAnyRevenue
      ? roundTo(totalRevenueUsd / totalSpendUsd, 4)
      : undefined;

  // Forecast-weighted totals — combine the per-cell snapshot scaled by
  // cellCount. Used so the operator can read "forecast was 1.8x, you
  // landed 2.1x" without needing to do mental math.
  const forecastWeightedCpa = forecastPerCellSnapshot?.expectedCpa;
  const forecastWeightedRoas = forecastPerCellSnapshot?.expectedRoas;

  // Overall accuracy classification.
  const overallAccuracy = classifyOverallAccuracy({
    weightedRoas,
    forecastWeightedRoas,
    weightedCpa,
    forecastWeightedCpa,
    totalSpendUsd,
    minLearning,
  });

  const report: ForecastAccuracyReport = {
    runId: "",
    perCell: perCellRows,
    totals: {
      totalSpendUsd: roundCurrency(totalSpendUsd),
      totalConversions,
      totalRevenueUsd: hasAnyRevenue ? roundCurrency(totalRevenueUsd) : undefined,
      weightedCpa,
      weightedRoas,
      forecastWeightedCpa,
      forecastWeightedRoas,
    },
    overallAccuracy,
    recommendations: [],
    importIssues,
    derivedAt: 0,
  };

  report.recommendations = buildResultDecisionRecommendations(report);

  // Set runId from the first actual when present (helps the report
  // stay traceable when serialised). Falls back to empty string.
  const firstActualRun = sortedActuals[0]?.runId;
  if (typeof firstActualRun === "string" && firstActualRun.length > 0) {
    report.runId = firstActualRun;
  }

  return report;
}

export function compareActualsToForecast(
  actual: CampaignActualResult | null | undefined,
  forecastSnapshot:
    | ForecastAccuracyReport["perCell"][number]["forecastSnapshot"]
    | undefined
): ActualVsForecastMetric[] {
  const metrics: ActualVsForecastMetric[] = [];
  const order: ActualVsForecastMetric["metric"][] = [
    "cpm",
    "ctr",
    "cpc",
    "cvr",
    "cpa",
    "roas",
  ];
  for (const metric of order) {
    const actualValue = actual ? deriveActualMetric(actual, metric) : undefined;
    const forecastValue = forecastSnapshot
      ? deriveForecastMetric(forecastSnapshot, metric)
      : undefined;
    metrics.push(
      buildMetricComparison(metric, actualValue, forecastValue)
    );
  }
  return metrics;
}

export function buildResultDecisionRecommendations(
  report: ForecastAccuracyReport
): ResultDecisionRecommendation[] {
  // Collect the per-cell decisions, dedupe by cellId+decision, order by
  // priority then by cellId for stable output.
  const seen = new Set<string>();
  const collected: ResultDecisionRecommendation[] = [];
  for (const row of report.perCell) {
    if (!row.decision) continue;
    const key = `${row.decision.cellId}:${row.decision.decision}`;
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push(row.decision);
  }
  const rank: Record<ResultDecisionRecommendation["priority"], number> = {
    "must-do": 0,
    "should-do": 1,
    "nice-to-have": 2,
  };
  collected.sort((a, b) => {
    if (rank[a.priority] !== rank[b.priority]) {
      return rank[a.priority] - rank[b.priority];
    }
    return a.cellId < b.cellId ? -1 : a.cellId > b.cellId ? 1 : 0;
  });
  return collected;
}

export interface ParseCsvResultsOutput {
  results: CampaignActualResult[];
  issues: ResultImportIssue[];
}

export function parseCsvResults(
  csvText: string,
  projectId: string,
  runId: string
): ParseCsvResultsOutput {
  const issues: ResultImportIssue[] = [];
  const results: CampaignActualResult[] = [];

  if (!csvText || csvText.trim().length === 0) {
    return { results, issues };
  }

  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { results, issues };

  const header = splitCsvLine(lines[0]).map((c) => c.trim());
  const headerLower = header.map((h) => h.toLowerCase());
  const colIndex: Record<string, number> = {};
  for (const col of ALL_CSV_COLUMNS) {
    colIndex[col] = headerLower.indexOf(col.toLowerCase());
  }
  for (const required of REQUIRED_CSV_COLUMNS) {
    if (colIndex[required] === -1) {
      issues.push({
        kind: "missing-cell-id",
        rowNumber: 1,
        message: `Required header column '${required}' is missing.`,
        fix: `Add a '${required}' column to the CSV.`,
      });
    }
  }
  // If the cellId column itself is missing, we cannot meaningfully
  // parse the rest — return early.
  if (colIndex.cellId === -1) {
    return { results, issues };
  }

  const seenCellIds = new Set<string>();

  for (let li = 1; li < lines.length; li += 1) {
    const rowNumber = li + 1; // 1-based, including the header line.
    const cells = splitCsvLine(lines[li]);
    if (cells.every((c) => c.trim().length === 0)) continue;

    const cellId = (cells[colIndex.cellId] ?? "").trim();
    if (cellId.length === 0) {
      issues.push({
        kind: "missing-cell-id",
        rowNumber,
        message: "Row is missing a cellId.",
        fix: "Add the test cell id (e.g. test-1) to the cellId column.",
      });
      continue;
    }
    if (seenCellIds.has(cellId)) {
      issues.push({
        kind: "duplicate-cell-id",
        cellId,
        rowNumber,
        message: `Duplicate cellId '${cellId}' on row ${rowNumber}.`,
        fix: "Merge the duplicate row into the first occurrence.",
      });
      continue;
    }
    seenCellIds.add(cellId);

    const spendUsd = parseCsvNumber({
      raw: cells[colIndex.spend],
      field: "spend",
      cellId,
      rowNumber,
      issues,
      required: true,
    });
    const impressions = parseCsvNumber({
      raw: cells[colIndex.impressions],
      field: "impressions",
      cellId,
      rowNumber,
      issues,
      required: true,
    });
    const clicks = parseCsvNumber({
      raw: cells[colIndex.clicks],
      field: "clicks",
      cellId,
      rowNumber,
      issues,
      required: true,
    });
    const conversions = parseCsvNumber({
      raw: cells[colIndex.conversions],
      field: "conversions",
      cellId,
      rowNumber,
      issues,
      required: true,
    });
    if (
      spendUsd === undefined ||
      impressions === undefined ||
      clicks === undefined ||
      conversions === undefined
    ) {
      continue;
    }

    const revenueRaw =
      colIndex.revenue >= 0 ? cells[colIndex.revenue] : undefined;
    const revenueUsd =
      revenueRaw !== undefined && revenueRaw.trim().length > 0
        ? parseCsvNumber({
            raw: revenueRaw,
            field: "revenue",
            cellId,
            rowNumber,
            issues,
            required: false,
          })
        : undefined;
    const statusRaw =
      colIndex.status >= 0
        ? (cells[colIndex.status] ?? "").trim().toLowerCase()
        : "";
    const status = normaliseStatus(statusRaw);
    const notes =
      colIndex.notes >= 0 ? (cells[colIndex.notes] ?? "").trim() : "";
    const daysRunRaw =
      colIndex.daysRun >= 0 ? cells[colIndex.daysRun] : undefined;
    const daysRun =
      daysRunRaw !== undefined && daysRunRaw.trim().length > 0
        ? parseCsvNumber({
            raw: daysRunRaw,
            field: "daysRun",
            cellId,
            rowNumber,
            issues,
            required: false,
          })
        : undefined;

    if (clicks > impressions) {
      issues.push({
        kind: "inconsistent-totals",
        cellId,
        rowNumber,
        message: `Clicks (${clicks}) exceed impressions (${impressions}) on row ${rowNumber}.`,
        fix: "Re-check the source export — clicks cannot exceed impressions.",
      });
    }
    if (conversions > clicks) {
      issues.push({
        kind: "inconsistent-totals",
        cellId,
        rowNumber,
        message: `Conversions (${conversions}) exceed clicks (${clicks}) on row ${rowNumber}.`,
        fix: "Re-check the source export — conversions cannot exceed clicks.",
      });
    }
    if (
      spendUsd === 0 &&
      impressions === 0 &&
      clicks === 0 &&
      conversions === 0
    ) {
      issues.push({
        kind: "no-spend-no-data",
        cellId,
        rowNumber,
        message: `No spend and no data for ${cellId} on row ${rowNumber}.`,
        fix: "Remove the row or wait until the cell has spent.",
      });
    }

    results.push({
      id: `${projectId}:${runId}:${cellId}`,
      projectId,
      runId,
      cellId,
      spendUsd,
      impressions,
      clicks,
      conversions,
      revenueUsd,
      status,
      notes: notes.length > 0 ? notes : undefined,
      daysRun,
      // CSV parse never stamps timestamps — the store owns that
      // responsibility. 0/0 here mark "never written through the
      // store" and let the store overwrite cleanly on upsert.
      createdAt: 0,
      updatedAt: 0,
    });
  }

  return { results, issues };
}

// ---- Internals ---------------------------------------------------------

function deriveActualMetric(
  actual: CampaignActualResult,
  metric: ActualVsForecastMetric["metric"]
): number | undefined {
  switch (metric) {
    case "cpm":
      return actual.impressions > 0
        ? roundCurrency((actual.spendUsd / actual.impressions) * 1000)
        : undefined;
    case "ctr":
      return actual.impressions > 0
        ? roundTo(actual.clicks / actual.impressions, 4)
        : undefined;
    case "cpc":
      return actual.clicks > 0
        ? roundCurrency(actual.spendUsd / actual.clicks)
        : undefined;
    case "cvr":
      return actual.clicks > 0
        ? roundTo(actual.conversions / actual.clicks, 4)
        : undefined;
    case "cpa":
      return actual.conversions > 0
        ? roundCurrency(actual.spendUsd / actual.conversions)
        : undefined;
    case "roas":
      return typeof actual.revenueUsd === "number" && actual.spendUsd > 0
        ? roundTo(actual.revenueUsd / actual.spendUsd, 4)
        : undefined;
  }
}

function deriveForecastMetric(
  snapshot: NonNullable<
    ForecastAccuracyReport["perCell"][number]["forecastSnapshot"]
  >,
  metric: ActualVsForecastMetric["metric"]
): number | undefined {
  switch (metric) {
    case "cpm":
      return snapshot.expectedCpm;
    case "ctr":
      return snapshot.expectedCtr;
    case "cpc":
      return snapshot.expectedCpc;
    case "cvr":
      return snapshot.expectedCvr;
    case "cpa":
      return snapshot.expectedCpa;
    case "roas":
      return snapshot.expectedRoas;
  }
}

function buildMetricComparison(
  metric: ActualVsForecastMetric["metric"],
  actualValue: number | undefined,
  forecastValue: number | undefined
): ActualVsForecastMetric {
  if (typeof actualValue !== "number" && typeof forecastValue !== "number") {
    return { metric, status: "no-actual" };
  }
  if (typeof actualValue !== "number") {
    return { metric, forecastValue, status: "no-actual" };
  }
  if (typeof forecastValue !== "number" || forecastValue === 0) {
    return { metric, actualValue, status: "no-forecast" };
  }

  const delta = roundCurrencyOrRatio(metric, actualValue - forecastValue);
  const deltaPercent = roundTo(
    (actualValue - forecastValue) / forecastValue,
    4
  );

  // Direction-aware classification. Lower-better metrics (cpm / cpc /
  // cpa) flip the polarity so "actual lower than forecast" reads as
  // better.
  const lowerIsBetter = metric === "cpm" || metric === "cpc" || metric === "cpa";
  const effectivePct = lowerIsBetter ? -deltaPercent : deltaPercent;

  let status: ActualVsForecastMetric["status"] = "on-target";
  if (effectivePct > FAR_DELTA) status = "far-better";
  else if (effectivePct > 0.05) status = "better";
  else if (effectivePct < -FAR_DELTA) status = "far-worse";
  else if (effectivePct < -0.05) status = "worse";

  return {
    metric,
    actualValue,
    forecastValue,
    delta,
    deltaPercent,
    status,
  };
}

function buildPerCellDecision(args: {
  cellId: string;
  actual: CampaignActualResult;
  forecastSnapshot:
    | ForecastAccuracyReport["perCell"][number]["forecastSnapshot"]
    | undefined;
  spendGate: number;
}): ResultDecisionRecommendation {
  const { cellId, actual, forecastSnapshot, spendGate } = args;
  const actualRoas =
    typeof actual.revenueUsd === "number" && actual.spendUsd > 0
      ? actual.revenueUsd / actual.spendUsd
      : undefined;
  const forecastRoas = forecastSnapshot?.expectedRoas;

  // Spend gate — when we don't have enough spend, no further reading
  // is reliable.
  if (spendGate > 0 && actual.spendUsd < spendGate) {
    return {
      cellId,
      decision: "needs-more-data",
      rationale: `Spend $${actual.spendUsd.toFixed(0)} is below the learning floor (~$${spendGate.toFixed(0)}) — wait for more data.`,
      priority: "should-do",
    };
  }

  // Without a forecast ROAS or an actual ROAS we cannot infer scale /
  // iterate / pause — fall back to needs-more-data.
  if (typeof actualRoas !== "number" || typeof forecastRoas !== "number") {
    return {
      cellId,
      decision: "needs-more-data",
      rationale:
        "Insufficient ROAS signal — log revenue and confirm forecast assumptions before deciding.",
      priority: "should-do",
    };
  }

  // Scale rule.
  if (
    actualRoas > forecastRoas * SCALE_ROAS_MULT &&
    actual.conversions >= SCALE_MIN_CONVERSIONS
  ) {
    return {
      cellId,
      decision: "scale",
      rationale: `ROAS ${actualRoas.toFixed(2)}x exceeds forecast ${forecastRoas.toFixed(2)}x with ${actual.conversions} conversions captured.`,
      priority: "must-do",
    };
  }

  // Pause rule.
  if (actualRoas < forecastRoas * PAUSE_ROAS_MULT) {
    return {
      cellId,
      decision: "pause",
      rationale: `ROAS ${actualRoas.toFixed(2)}x below ${(forecastRoas * PAUSE_ROAS_MULT).toFixed(2)}x kill threshold (forecast ${forecastRoas.toFixed(2)}x).`,
      priority: "must-do",
    };
  }

  // Iterate window.
  if (
    actualRoas >= forecastRoas * ITERATE_LOW_MULT &&
    actualRoas <= forecastRoas * ITERATE_HIGH_MULT
  ) {
    return {
      cellId,
      decision: "iterate",
      rationale: `ROAS ${actualRoas.toFixed(2)}x sits inside the iterate window (~${(forecastRoas * ITERATE_LOW_MULT).toFixed(2)}x to ${(forecastRoas * ITERATE_HIGH_MULT).toFixed(2)}x) — refresh hook or proof.`,
      priority: "should-do",
    };
  }

  // Falls between pause and iterate (e.g. 0.6-0.7 × forecast). Treat as
  // iterate so the operator at least tries a one-axis swap before
  // killing.
  return {
    cellId,
    decision: "iterate",
    rationale: `ROAS ${actualRoas.toFixed(2)}x is under the iterate floor — try one creative swap before pausing.`,
    priority: "should-do",
  };
}

function classifyOverallAccuracy(args: {
  weightedRoas: number | undefined;
  forecastWeightedRoas: number | undefined;
  weightedCpa: number | undefined;
  forecastWeightedCpa: number | undefined;
  totalSpendUsd: number;
  minLearning: number;
}): ForecastAccuracyReport["overallAccuracy"] {
  const { weightedRoas, forecastWeightedRoas, totalSpendUsd, minLearning } = args;
  // Insufficient data — total spend hasn't cleared the learning gate.
  if (
    minLearning > 0 &&
    totalSpendUsd < minLearning * LEARNING_SPEND_GATE_FRACTION
  ) {
    return "insufficient-data";
  }
  if (
    typeof weightedRoas !== "number" ||
    typeof forecastWeightedRoas !== "number" ||
    forecastWeightedRoas === 0
  ) {
    return "insufficient-data";
  }
  const ratio = weightedRoas / forecastWeightedRoas;
  if (ratio > OVERALL_BETTER_MULT) return "better-than-forecast";
  if (ratio < OVERALL_WORSE_MULT) return "worse-than-forecast";
  return "on-target";
}

function parseCsvNumber(args: {
  raw: string | undefined;
  field: string;
  cellId: string;
  rowNumber: number;
  issues: ResultImportIssue[];
  required: boolean;
}): number | undefined {
  const { raw, field, cellId, rowNumber, issues, required } = args;
  if (raw === undefined || raw.trim().length === 0) {
    if (required) {
      issues.push({
        kind: "invalid-number",
        cellId,
        rowNumber,
        message: `Row ${rowNumber} is missing a value for '${field}'.`,
        fix: `Add a numeric value for ${field} on row ${rowNumber}.`,
      });
    }
    return undefined;
  }
  const cleaned = raw.trim().replace(/^[$£€]/, "").replace(/,/g, "");
  const v = Number(cleaned);
  if (!Number.isFinite(v) || v < 0) {
    issues.push({
      kind: "invalid-number",
      cellId,
      rowNumber,
      message: `Row ${rowNumber} has an invalid '${field}' value: ${raw}.`,
      fix: `Replace '${raw}' with a non-negative number.`,
    });
    return undefined;
  }
  return v;
}

function splitCsvLine(line: string): string[] {
  // Simple split-aware parser handling quoted fields with commas.
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        buf += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

function normaliseStatus(raw: string): CampaignActualResult["status"] {
  switch (raw) {
    case "winning":
    case "losing":
    case "inconclusive":
    case "needs-more-data":
      return raw;
    default:
      return "inconclusive";
  }
}

function cellLabelFor(id: string, angle: string, format: string): string {
  return `${id} · ${angle} · ${format}`;
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

function roundCurrencyOrRatio(
  metric: ActualVsForecastMetric["metric"],
  v: number
): number {
  if (!Number.isFinite(v)) return 0;
  if (metric === "ctr" || metric === "cvr" || metric === "roas") {
    return roundTo(v, 4);
  }
  return roundCurrency(v);
}
