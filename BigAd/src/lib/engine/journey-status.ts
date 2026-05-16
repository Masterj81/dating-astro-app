// journey-status.ts — Journey Status Block.
//
// Synthesises the readiness / KPI / review / creative-plan outputs into
// a single status block: current stage, ready-to-spend flag, blockers,
// warnings, and a single concrete next step. Deterministic.

import type {
  AdReviewChecklist,
  CreatorBrief,
  JourneyStage,
  JourneyStatus,
  KpiDiagnosis,
  KpiTargetLadder,
  ShotList,
  TrackingReadinessScore,
  VariantSet,
  VideoScript,
} from "@/types/strategy";

export interface JourneyStatusArgs {
  trackingReadiness: TrackingReadinessScore;
  kpiLadder: KpiTargetLadder;
  kpiDiagnosis: KpiDiagnosis;
  adReview: AdReviewChecklist;
  creatorBriefs: CreatorBrief[];
  shotLists: ShotList[];
  videoScripts: VideoScript[];
  variantSets: VariantSet[];
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

  const blockers: string[] = [];
  const warnings: string[] = [];

  // Collect tracking blockers / warnings into journey-level reasons.
  for (const c of trackingReadiness.checks) {
    if (c.status === "blocker") {
      blockers.push(`${c.label}: ${c.rationale}`);
    } else if (c.status === "warning" || c.status === "unknown") {
      warnings.push(`${c.label}: ${c.rationale}`);
    }
  }

  // Brief / script / shot list / variant set sanity warnings.
  if (creatorBriefs.length === 0) {
    blockers.push(`No creator briefs yet — without a brief the production loop cannot start.`);
  }
  if (shotLists.length !== creatorBriefs.length) {
    warnings.push(`Shot list count (${shotLists.length}) does not match brief count (${creatorBriefs.length}).`);
  }
  if (videoScripts.length !== creatorBriefs.length) {
    warnings.push(`Video script count (${videoScripts.length}) does not match brief count (${creatorBriefs.length}).`);
  }
  if (variantSets.length === 0 && creatorBriefs.length > 0) {
    warnings.push(`No variant sets — without spin variants, the test plan has no breadth.`);
  }

  // KPI ladder sanity.
  if (!kpiLadder || kpiLadder.targets.length === 0) {
    warnings.push(`KPI ladder is empty — kill / keep / scale decisions have no anchor.`);
  }

  // Stage selection — earliest match wins.
  const stage = pickStage({
    creatorBriefsCount: creatorBriefs.length,
    trackingScore: trackingReadiness.score,
    hasLadder: !!kpiLadder && kpiLadder.targets.length > 0,
    diagnosisPrimary: kpiDiagnosis?.primaryCategory ?? "tracking",
    reviewWeight: adReview?.totalWeight ?? 0,
    blockersCount: blockers.length,
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

function pickStage(args: {
  creatorBriefsCount: number;
  trackingScore: number;
  hasLadder: boolean;
  diagnosisPrimary: string;
  reviewWeight: number;
  blockersCount: number;
}): JourneyStage {
  if (args.creatorBriefsCount === 0) return "strategy-drafted";
  if (args.trackingScore < 70 || args.blockersCount > 0) return "creative-planned";
  if (!args.hasLadder) return "tracking-ready";
  if (args.diagnosisPrimary !== "healthy") return "kpi-aligned";
  if (args.reviewWeight < REVIEW_WEIGHT_FLOOR) return "kpi-aligned";
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
