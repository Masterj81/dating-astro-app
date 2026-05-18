// journey-status.ts — Journey Status Block.
//
// Synthesises the readiness / KPI / review / creative-plan outputs into
// a single status block: current stage, ready-to-spend flag, blockers,
// warnings, and a single concrete next step. Deterministic.

import type {
  AdReviewChecklist,
  AppliedAdReview,
  AudienceAvatar,
  CreativeTestingMatrix,
  CreatorBrief,
  JourneyBlocker,
  JourneyStage,
  JourneyStatus,
  KpiDiagnosis,
  KpiTargetLadder,
  ProofAssetPlan,
  ShotList,
  TrackingReadinessScore,
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

  // Operational blockers count — review-kind and asset-kind blockers
  // are tracked through their own gates at the review-passed stage,
  // not as creative-planned regressions.
  const operationalBlockersCount = blockers.filter(
    (b) => b.kind !== "review" && b.kind !== "asset"
  ).length;

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
