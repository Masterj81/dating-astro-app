// journey-status.ts — Journey Status Block.
//
// Synthesises the readiness / KPI / review / creative-plan outputs into
// a single status block: current stage, ready-to-spend flag, blockers,
// warnings, and a single concrete next step. Deterministic.

import type {
  AdReviewChecklist,
  AppliedAdReview,
  AudienceAvatar,
  BenchmarkCalibration,
  CreativeTestingMatrix,
  CreatorBrief,
  ForecastPlan,
  JourneyBlocker,
  JourneyStage,
  JourneyStatus,
  KpiDiagnosis,
  KpiTargetLadder,
  ProofAssetPlan,
  ScenarioSimulatorPlan,
  ShotList,
  TrackingReadinessScore,
  UnitEconomicsSummary,
  VariantSet,
  VideoScript,
} from "@/types/strategy";
import type { ReviewBoardSummary, ReviewItemKind } from "@/types/review";
import { reviewItemKindLabel } from "@/lib/review/review-board";
import type { AssetProductionSummary } from "@/types/assets";

export interface JourneyStatusArgs {
  trackingReadiness: TrackingReadinessScore;
  kpiLadder: KpiTargetLadder;
  kpiDiagnosis: KpiDiagnosis;
  adReview: AdReviewChecklist;
  creatorBriefs: CreatorBrief[];
  shotLists: ShotList[];
  videoScripts: VideoScript[];
  variantSets: VariantSet[];
  // Optional — when provided, journey-status raises a creative warning
  // when proof readiness is low against a skeptical / mature mix.
  proofAssetPlan?: ProofAssetPlan;
  audienceAvatars?: AudienceAvatar[];
  // Execution OS — when provided, journey-status reads the testing
  // matrix and the per-brief applied reviews to upgrade the stage.
  creativeTestingMatrix?: CreativeTestingMatrix;
  appliedAdReviews?: AppliedAdReview[];
  // Review & Approval Layer — when provided, journey-status emits a
  // review-kind warning when the board isn't ready, and gates
  // `ready-to-spend` behind approvalReadiness === "ready". When
  // absent, journey-status keeps its pre-review behaviour for
  // backward compatibility with the legacy 7-arg form.
  reviewSummary?: ReviewBoardSummary;
  // Asset Production Manager — when provided, journey-status emits an
  // asset-kind warning (escalating to blocker when readinessScore < 30)
  // for pending must-have assets and gates `ready-to-spend` behind
  // readinessScore >= 70 with no pending must-haves. Absent → no gate.
  assetSummary?: AssetProductionSummary;
  // Unit Economics / Offer Lab — when provided, journey-status emits
  // an economics-kind entry whenever the readiness status is not
  // `viable`. Severity escalates to `blocker` for `unviable`. When
  // `status === 'unviable'`, `ready-to-spend` is blocked. `tight`
  // status surfaces a warning chip but does not block. Absent → no
  // economics gate (backward-compat with every caller pre-economics).
  unitEconomics?: UnitEconomicsSummary;
  // Forecast / Budget Planner — when provided, journey-status emits a
  // forecast-kind entry whenever the plan status is not `viable`.
  // Severity escalates to `blocker` for `unviable` (and that status
  // also blocks `ready-to-spend`). `tight` surfaces a warning chip but
  // does not block. Absent → no forecast gate (backward-compat with
  // every caller that pre-dates the Forecast layer).
  forecast?: ForecastPlan;
  // Scenario Simulator / What-if Lab — when provided, journey-status
  // emits a simulator-kind entry whenever the plan status is not
  // `viable`. Severity escalates to `blocker` for `unviable` (which
  // also blocks `ready-to-spend`). `tight` surfaces a warning chip but
  // does not block. The `only-base-viable` warning is always raised as
  // a warning chip when present. Absent → no simulator gate
  // (backward-compat with every caller that pre-dates the Simulator
  // layer).
  simulator?: ScenarioSimulatorPlan;
  // Benchmarks / Calibration Layer — when provided, journey-status
  // emits a benchmark-kind entry for high-spend uncalibrated plans
  // (blocker), low calibration confidence (warning), and far-from-range
  // metric comparisons (warning). `ready-to-spend` is blocked only by
  // the high-spend-uncalibrated state — low confidence / outliers
  // surface as warnings but do not block. Absent → no benchmark gate
  // (backward-compat with every caller that pre-dates the Benchmarks
  // layer).
  benchmarkCalibration?: BenchmarkCalibration;
  // Results / Forecast Accuracy Loop — when provided, journey-status
  // emits a `results`-kind warning when a run has been saved but no
  // actual results have been logged yet. Post-launch quality gate
  // only — never blocks `ready-to-spend` (the loop closes a campaign,
  // it doesn't gate the launch). Absent → no results entry
  // (backward-compat with every caller that pre-dates the Results
  // layer).
  campaignResults?: {
    hasSavedRuns: boolean;
    hasResults: boolean;
    daysSinceFirstRun?: number;
  };
}

// Ad-review weight floor for "review-passed". The shipped checklist has
// totalWeight in the ~30-35 range; anything below 25 is treated as
// missing axes / under-weighted.
const REVIEW_WEIGHT_FLOOR = 25;

export function buildJourneyStatus(args: JourneyStatusArgs): JourneyStatus {
  const {
    trackingReadiness,
    kpiLadder,
    kpiDiagnosis,
    adReview,
    creatorBriefs,
    shotLists,
    videoScripts,
    variantSets,
  } = args;

  const blockers: JourneyBlocker[] = [];
  const warnings: JourneyBlocker[] = [];

  // Collect tracking blockers / warnings into journey-level reasons.
  for (const c of trackingReadiness.checks) {
    if (c.status === "blocker") {
      blockers.push({
        kind: "tracking",
        severity: "blocker",
        message: `${c.label}: ${c.rationale}`,
        sourceCheck: c.kind,
      });
    } else if (c.status === "warning" || c.status === "unknown") {
      warnings.push({
        kind: "tracking",
        severity: "warning",
        message: `${c.label}: ${c.rationale}`,
        sourceCheck: c.kind,
      });
    }
  }

  // Brief / script / shot list / variant set sanity warnings.
  if (creatorBriefs.length === 0) {
    blockers.push({
      kind: "creative",
      severity: "blocker",
      message: `No creator briefs yet — without a brief the production loop cannot start.`,
    });
  }
  if (shotLists.length !== creatorBriefs.length) {
    warnings.push({
      kind: "creative",
      severity: "warning",
      message: `Shot list count (${shotLists.length}) does not match brief count (${creatorBriefs.length}).`,
    });
  }
  if (videoScripts.length !== creatorBriefs.length) {
    warnings.push({
      kind: "creative",
      severity: "warning",
      message: `Video script count (${videoScripts.length}) does not match brief count (${creatorBriefs.length}).`,
    });
  }
  if (variantSets.length === 0 && creatorBriefs.length > 0) {
    warnings.push({
      kind: "creative",
      severity: "warning",
      message: `No variant sets — without spin variants, the test plan has no breadth.`,
    });
  }

  // KPI ladder sanity.
  if (!kpiLadder || kpiLadder.targets.length === 0) {
    warnings.push({
      kind: "kpi",
      severity: "warning",
      message: `KPI ladder is empty — kill / keep / scale decisions have no anchor.`,
    });
  }

  // Proof-readiness sanity — emitted only when the proof planner ran
  // and the avatar mix reads as skeptical or mature.
  if (
    args.proofAssetPlan &&
    args.proofAssetPlan.proofReadinessScore < 50 &&
    isSkepticalOrMatureMix(args.audienceAvatars)
  ) {
    warnings.push({
      kind: "creative",
      severity: "warning",
      message: `Proof readiness is below 50 — skeptical/mature audiences need proof before spend.`,
    });
  }

  // Execution OS — tracking score < 50 flips Execution into "plan only".
  if (trackingReadiness.score < 50) {
    blockers.push({
      kind: "tracking",
      severity: "blocker",
      message:
        "Tracking not ready — Execution shows plan only, do not spend.",
    });
  }

  // Proof-asset planner missing-before-spend list → per-asset creative
  // warnings, so each missing must-have surfaces traceably.
  if (args.proofAssetPlan) {
    for (const missingId of args.proofAssetPlan.missingBeforeSpend) {
      warnings.push({
        kind: "creative",
        severity: "warning",
        message: `Missing must-have proof asset (${missingId}) — capture before first spend.`,
      });
    }
  }

  // Review & Approval Layer — when a reviewSummary is provided and
  // the board isn't `ready`, emit a review-kind warning. Severity
  // upgrades to `blocker` when any critical item is blocked or any
  // pending critical kinds remain — the strongest signal the board
  // is materially incomplete. When `ready`, no review warning is
  // emitted. Backward-compatible: with no summary, behaviour is
  // unchanged.
  if (args.reviewSummary && args.reviewSummary.approvalReadiness !== "ready") {
    const pending = args.reviewSummary.pendingCriticalKinds;
    const firstThreeLabels = pending
      .slice(0, 3)
      .map((k: ReviewItemKind) => reviewItemKindLabel(k));
    const moreSuffix = pending.length > 3 ? `, +${pending.length - 3} more` : "";
    const labelList =
      firstThreeLabels.length > 0
        ? firstThreeLabels.join(", ") + moreSuffix
        : "approval still pending";
    const severity: "warning" | "blocker" =
      args.reviewSummary.blockedItems > 0 || pending.length > 0
        ? "blocker"
        : "warning";
    const entry: JourneyBlocker = {
      kind: "review",
      severity,
      message: `Approval pending: ${labelList}`,
    };
    if (severity === "blocker") {
      blockers.push(entry);
    } else {
      warnings.push(entry);
    }
  }

  // Asset Production Manager — when an assetSummary is supplied and
  // any must-have asset is pending, emit a warning. Severity escalates
  // to `blocker` when readinessScore < 30 — that's the threshold below
  // which the production sprint hasn't meaningfully started.
  if (args.assetSummary && args.assetSummary.pendingMustHaveIds.length > 0) {
    const pendingIds = args.assetSummary.pendingMustHaveIds.slice(0, 2);
    const head = `Asset production: ${args.assetSummary.pendingMustHaveIds.length} must-have asset(s) not ready`;
    const message = pendingIds.length > 0
      ? `${head} — pending: ${pendingIds.join(", ")}`
      : head;
    const severity: "warning" | "blocker" =
      args.assetSummary.readinessScore < 30 ? "blocker" : "warning";
    const entry: JourneyBlocker = {
      kind: "asset",
      severity,
      message,
    };
    if (severity === "blocker") {
      blockers.push(entry);
    } else {
      warnings.push(entry);
    }
  }

  // Unit Economics / Offer Lab — when a summary is supplied and the
  // readiness is anything but `viable`, emit an economics-kind entry.
  // Severity escalates to `blocker` when status === `unviable` or
  // when a `target-roas-below-breakeven` warning is present. `tight`
  // surfaces a warning. `incomplete` is a soft warning so the missing
  // input prompt makes it into the journey block.
  if (args.unitEconomics) {
    const ue = args.unitEconomics;
    const hasBelowBreakeven = ue.warnings.some(
      (w) => w.kind === "target-roas-below-breakeven"
    );
    const hasMissingTrial = ue.warnings.some(
      (w) =>
        w.kind === "subscription-without-trial-rate" ||
        w.kind === "missing-trial-to-paid"
    );
    if (ue.status === "unviable") {
      const topWarning =
        ue.warnings.find((w) => w.severity === "blocker") ??
        ue.warnings.find((w) => w.severity === "warning") ??
        ue.warnings[0];
      const messageTail = topWarning ? topWarning.message : "see economics tab";
      blockers.push({
        kind: "economics",
        severity: "blocker",
        message: `Unit economics unviable: ${messageTail}`,
      });
    } else if (hasBelowBreakeven) {
      const t = (ue.targetRoas ?? 0).toFixed(2);
      const b = (ue.breakevenRoas ?? 0).toFixed(2);
      blockers.push({
        kind: "economics",
        severity: "blocker",
        message: `Target ROAS ${t} below breakeven ${b}`,
      });
    } else if (ue.status === "tight") {
      const topKinds = ue.warnings
        .filter((w) => w.severity === "warning")
        .slice(0, 2)
        .map((w) => w.kind)
        .join(", ");
      const tail = topKinds || "thin margin or tight payback";
      warnings.push({
        kind: "economics",
        severity: "warning",
        message: `Unit economics tight: ${tail}`,
      });
    } else if (ue.status === "incomplete") {
      warnings.push({
        kind: "economics",
        severity: "warning",
        message: "Unit economics incomplete — provide price and commercial inputs to compute viability.",
      });
    }
    if (hasMissingTrial && ue.status !== "unviable") {
      warnings.push({
        kind: "economics",
        severity: "warning",
        message: "Subscription with free trial but trial→paid rate not provided",
      });
    }
  }

  // Forecast / Budget Planner — when a plan is supplied and status is
  // anything but `viable`, emit a forecast-kind entry. Severity
  // escalates to `blocker` when status === `unviable`. `tight` surfaces
  // a warning chip but does not block. `incomplete` is a soft warning.
  if (args.forecast) {
    const f = args.forecast;
    if (f.status === "unviable") {
      const topBlocker =
        f.warnings.find((w) => w.severity === "blocker") ??
        f.warnings.find((w) => w.severity === "warning") ??
        f.warnings[0];
      const tail = topBlocker ? topBlocker.message : "see forecast tab";
      blockers.push({
        kind: "forecast",
        severity: "blocker",
        message: `Forecast unviable: ${tail}`,
      });
    } else if (f.status === "tight") {
      const topKinds = f.warnings
        .filter((w) => w.severity === "warning")
        .slice(0, 2)
        .map((w) => w.kind)
        .join(", ");
      const tail = topKinds || "thin margin or low confidence";
      warnings.push({
        kind: "forecast",
        severity: "warning",
        message: `Forecast tight: ${tail}`,
      });
    } else if (f.status === "incomplete") {
      warnings.push({
        kind: "forecast",
        severity: "warning",
        message:
          "Forecast incomplete — provide economics + test cells to compute a budget plan.",
      });
    }
  }

  // Scenario Simulator / What-if Lab — when a plan is supplied and the
  // status is not `viable`, emit a simulator-kind entry. Severity
  // escalates to `blocker` when status === `unviable`. `tight` surfaces
  // a warning chip but does not block. The `only-base-viable` plan
  // warning is also surfaced as a warning chip when present.
  if (args.simulator) {
    const sim = args.simulator;
    if (sim.status === "unviable") {
      const topWarning =
        sim.warnings.find((w) => w.severity === "blocker") ??
        sim.warnings.find((w) => w.severity === "warning") ??
        sim.warnings[0];
      const tail = topWarning ? topWarning.message : "base scenario unviable";
      blockers.push({
        kind: "simulator",
        severity: "blocker",
        message: `Scenario simulator unviable: ${tail}`,
      });
    } else if (sim.status === "tight") {
      const topKinds = sim.warnings
        .filter((w) => w.severity === "warning")
        .slice(0, 2)
        .map((w) => w.kind)
        .join(", ");
      const tail = topKinds || "fragile to one or more levers";
      warnings.push({
        kind: "simulator",
        severity: "warning",
        message: `Scenario simulator tight: ${tail}`,
      });
    } else if (sim.status === "incomplete") {
      warnings.push({
        kind: "simulator",
        severity: "warning",
        message:
          "Scenario simulator incomplete — provide economics + forecast to stress-test the plan.",
      });
    }
    // Always raise the only-base-viable signal as a warning chip.
    if (
      sim.status !== "unviable" &&
      sim.warnings.some((w) => w.kind === "only-base-viable")
    ) {
      warnings.push({
        kind: "simulator",
        severity: "warning",
        message:
          "Plan only viable in base scenario — fragile to one negative lever",
      });
    }
  }

  // Benchmarks / Calibration Layer — when supplied, surface three
  // signals: high-spend uncalibrated (blocker), low calibration
  // confidence (warning), and far-from-range comparisons (warning).
  // Only the blocker gates ready-to-spend; the warnings are advisory.
  if (args.benchmarkCalibration) {
    const cal = args.benchmarkCalibration;
    const highSpendWarning = cal.warnings.find(
      (w) => w.kind === "high-spend-uncalibrated"
    );
    if (highSpendWarning) {
      blockers.push({
        kind: "benchmark",
        severity: "blocker",
        message: `Benchmark calibration: ${highSpendWarning.message}`,
      });
    }
    if (cal.confidence === "low") {
      warnings.push({
        kind: "benchmark",
        severity: "warning",
        message: "Low benchmark calibration confidence",
      });
    }
    const farOutliers = cal.comparisons.filter(
      (c) =>
        c.status === "far-below-range" || c.status === "far-above-range"
    );
    if (farOutliers.length >= 1) {
      const labels = farOutliers
        .slice(0, 2)
        .map((c) => `${c.metric} (${c.status})`)
        .join(", ");
      warnings.push({
        kind: "benchmark",
        severity: "warning",
        message: `Forecast far from benchmark on: ${labels}`,
      });
    }
  }

  // Results / Forecast Accuracy Loop — when provided AND the workspace
  // has saved at least one run without logging any actual results, emit
  // a `results`-kind warning so the operator sees the open loop. Never
  // a blocker — this is post-launch quality, not a pre-spend gate.
  if (args.campaignResults && args.campaignResults.hasSavedRuns && !args.campaignResults.hasResults) {
    const daysTail =
      typeof args.campaignResults.daysSinceFirstRun === "number"
        ? ` (${args.campaignResults.daysSinceFirstRun}d since first run)`
        : "";
    warnings.push({
      kind: "results",
      severity: "warning",
      message: `Saved run with no actual results logged${daysTail} — log results to close the loop`,
    });
  }

  // Execution OS — first batch presence is a prerequisite for
  // ready-to-spend. When the matrix isn't supplied (legacy callers /
  // backward-compat with tests that pre-date the Execution OS phase),
  // we don't block on it.
  const firstBatchPresent =
    !args.creativeTestingMatrix ||
    args.creativeTestingMatrix.recommendedFirstBatch.length >= 3;

  // Applied ad reviews — at least one "ready" or "almost" verdict.
  const reviewsReady =
    !args.appliedAdReviews ||
    args.appliedAdReviews.length === 0 ||
    args.appliedAdReviews.some(
      (r) => r.verdict === "ready" || r.verdict === "almost"
    );

  const proofReady =
    !args.proofAssetPlan ||
    args.proofAssetPlan.proofReadinessScore >= 50;

  // Review approval — only gates ready-to-spend when a summary is
  // supplied. Absent → no gate (backward-compat with every caller
  // that pre-dates the Review & Approval Layer).
  const approvalReady =
    !args.reviewSummary || args.reviewSummary.approvalReadiness === "ready";

  // Asset production — only gates ready-to-spend when a summary is
  // supplied. Absent → no gate (backward-compat with every caller
  // that pre-dates the Asset Production Manager).
  const assetReady =
    !args.assetSummary ||
    (args.assetSummary.readinessScore >= 70 &&
      args.assetSummary.pendingMustHaveIds.length === 0);

  // Operational blockers count — review-kind, asset-kind, economics-kind,
  // forecast-kind, simulator-kind, and benchmark-kind blockers are
  // tracked through their own gates at the review-passed /
  // ready-to-spend stages, not as creative-planned regressions.
  const operationalBlockersCount = blockers.filter(
    (b) =>
      b.kind !== "review" &&
      b.kind !== "asset" &&
      b.kind !== "economics" &&
      b.kind !== "forecast" &&
      b.kind !== "simulator" &&
      b.kind !== "benchmark" &&
      b.kind !== "results"
  ).length;

  // Unit Economics gate — only enforced when a summary was supplied.
  // `tight` does NOT block; only `unviable` blocks the final hop to
  // ready-to-spend. Absent → no gate (backward-compat).
  const economicsReady =
    !args.unitEconomics || args.unitEconomics.status !== "unviable";

  // Forecast gate — only enforced when a plan was supplied. `tight`
  // does NOT block; only `unviable` blocks the final hop to
  // ready-to-spend. Absent → no gate (backward-compat).
  const forecastReady = !args.forecast || args.forecast.status !== "unviable";

  // Simulator gate — only enforced when a plan was supplied. `tight`
  // does NOT block; only `unviable` (base scenario unviable or blocker
  // warning) blocks the final hop to ready-to-spend. Absent → no gate
  // (backward-compat with every caller that pre-dates the Simulator
  // layer).
  const simulatorReady =
    !args.simulator || args.simulator.status !== "unviable";

  // Benchmarks gate — only enforced when a calibration was supplied AND
  // a high-spend-uncalibrated blocker is present. Low confidence /
  // outlier warnings do NOT block. Absent → no gate (backward-compat
  // with every caller that pre-dates the Benchmarks layer).
  const benchmarkReady =
    !args.benchmarkCalibration ||
    !args.benchmarkCalibration.warnings.some(
      (w) => w.kind === "high-spend-uncalibrated"
    );

  // Stage selection — earliest match wins.
  const stage = pickStage({
    creatorBriefsCount: creatorBriefs.length,
    trackingScore: trackingReadiness.score,
    hasLadder: !!kpiLadder && kpiLadder.targets.length > 0,
    diagnosisPrimary: kpiDiagnosis?.primaryCategory ?? "tracking",
    reviewWeight: adReview?.totalWeight ?? 0,
    blockersCount: operationalBlockersCount,
    firstBatchPresent,
    reviewsReady,
    proofReady,
    approvalReady,
    assetReady,
    economicsReady,
    forecastReady,
    simulatorReady,
    benchmarkReady,
  });

  const readyToSpend = stage === "ready-to-spend";
  const nextStep = pickNextStep(stage, trackingReadiness, kpiDiagnosis, adReview);

  return {
    currentStage: stage,
    readyToSpend,
    blockers,
    warnings,
    nextStep,
  };
}

function isSkepticalOrMatureMix(avatars: AudienceAvatar[] | undefined): boolean {
  if (!avatars || avatars.length === 0) return false;
  // Detect via the label ("Skeptical optimiser", "Pragmatic operator") or
  // via a proofNeeded list dominated by case studies / customer quotes.
  for (const av of avatars) {
    if (/skeptic|mature|pragmatic/i.test(av.label)) return true;
    const hardProof = av.proofNeeded.filter((p) =>
      /(case\s+study|customer\s+quote|demo\s+video|founder)/i.test(p)
    );
    if (hardProof.length >= 2) return true;
  }
  return false;
}

function pickStage(args: {
  creatorBriefsCount: number;
  trackingScore: number;
  hasLadder: boolean;
  diagnosisPrimary: string;
  reviewWeight: number;
  blockersCount: number;
  firstBatchPresent: boolean;
  reviewsReady: boolean;
  proofReady: boolean;
  approvalReady: boolean;
  assetReady: boolean;
  economicsReady: boolean;
  forecastReady: boolean;
  simulatorReady: boolean;
  benchmarkReady: boolean;
}): JourneyStage {
  if (args.creatorBriefsCount === 0) return "strategy-drafted";
  if (args.trackingScore < 70 || args.blockersCount > 0) return "creative-planned";
  if (!args.hasLadder) return "tracking-ready";
  if (args.diagnosisPrimary !== "healthy") return "kpi-aligned";
  if (args.reviewWeight < REVIEW_WEIGHT_FLOOR) return "kpi-aligned";
  // Execution OS gates — first batch + applied reviews + proof readiness.
  if (!args.firstBatchPresent) return "review-passed";
  if (!args.reviewsReady) return "review-passed";
  if (!args.proofReady) return "review-passed";
  // Review & Approval gate — only enforced when a summary was
  // supplied. The pickStage function receives `approvalReady = true`
  // when the caller did not pass a reviewSummary, so legacy callers
  // remain unaffected.
  if (!args.approvalReady) return "review-passed";
  // Asset Production gate — same backward-compat: receives
  // `assetReady = true` when no assetSummary was supplied.
  if (!args.assetReady) return "review-passed";
  // Unit Economics gate — only blocks when status === `unviable`.
  // `tight` is non-blocking (warning only). Absent → economicsReady = true.
  if (!args.economicsReady) return "review-passed";
  // Forecast gate — only blocks when status === `unviable`. `tight`
  // is non-blocking (warning only). Absent → forecastReady = true.
  if (!args.forecastReady) return "review-passed";
  // Simulator gate — only blocks when status === `unviable`. `tight`
  // is non-blocking (warning only). Absent → simulatorReady = true.
  if (!args.simulatorReady) return "review-passed";
  // Benchmarks gate — only blocks when high-spend-uncalibrated is
  // present. Low confidence / outlier warnings do NOT block. Absent →
  // benchmarkReady = true.
  if (!args.benchmarkReady) return "review-passed";
  return "ready-to-spend";
}

function pickNextStep(
  stage: JourneyStage,
  tracking: TrackingReadinessScore,
  diagnosis: KpiDiagnosis,
  review: AdReviewChecklist
): string {
  switch (stage) {
    case "strategy-drafted":
      return `Generate creator briefs for the top angles before measurement work begins.`;
    case "creative-planned": {
      const firstBlocker = tracking.checks.find((c) => c.status === "blocker");
      if (firstBlocker) {
        return `Clear the tracking blocker: ${firstBlocker.label} — ${firstBlocker.fix ?? firstBlocker.rationale}`;
      }
      return `Lift the tracking readiness score above 70 — start with the first warning on the Launch tab.`;
    }
    case "tracking-ready":
      return `Set KPI targets and breakeven thresholds on the Launch tab before any ad spends.`;
    case "kpi-aligned": {
      if (diagnosis.primaryCategory !== "healthy") {
        const f = diagnosis.findings[0];
        return `Resolve the ${diagnosis.primaryCategory} signal first: ${f?.recommendedAction ?? "tighten the suspect KPI before launch."}`;
      }
      if (!review || review.totalWeight < REVIEW_WEIGHT_FLOOR) {
        return `Walk through the Ad Review checklist before handoff — current weight is below the floor.`;
      }
      return `Walk through the Ad Review checklist and tighten any axis still on warning.`;
    }
    case "review-passed":
      return `Schedule launch and confirm the post-launch review window (3-day floor / 7-day evaluation).`;
    case "ready-to-spend":
      return `Ship the first variant set as the launch cohort; add budget in 20% steps once metrics hold above breakeven.`;
  }
}
