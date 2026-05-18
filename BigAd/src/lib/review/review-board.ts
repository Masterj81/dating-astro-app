// review-board.ts — pure / deterministic derivation for the BigAd
// Review & Approval Layer.
//
// None of these functions call `Date.now()`. Timestamps come from
// the stored ReviewItem / ReviewComment records. Given the same
// state, the output is byte-identical — same approval score, same
// readiness, same critical-blocking sentences, same item titles.
//
// Item ids are stable: `${runId}:${kind}`. The store and the markdown
// exporter both rely on this so they can be re-derived from the run
// without losing user-supplied status / assignment fields.

import type { Strategy } from "@/types/strategy";
import {
  CRITICAL_REVIEW_ITEM_KINDS,
  REVIEW_ITEM_KIND_ORDER,
  type ReviewApprovalReadiness,
  type ReviewBoard,
  type ReviewBoardSummary,
  type ReviewItem,
  type ReviewItemKind,
} from "@/types/review";

const CRITICAL_KIND_SET = new Set<ReviewItemKind>(CRITICAL_REVIEW_ITEM_KINDS);

function isCritical(kind: ReviewItemKind): boolean {
  return CRITICAL_KIND_SET.has(kind);
}

// Short human-readable label for each kind. Used by the UI, the
// markdown exporter, and the critical-blocking sentence builder.
const KIND_LABEL: Record<ReviewItemKind, string> = {
  positioning: "Positioning",
  offer: "Offer",
  "proof-assets": "Proof assets",
  "first-test-batch": "First test batch",
  "campaign-setup": "Campaign setup",
  "client-report": "Client report",
  "tracking-readiness": "Tracking readiness",
  "creative-qa": "Creative QA",
  "launch-readiness": "Launch readiness",
  "next-iteration-plan": "Next iteration plan",
};

export function reviewItemKindLabel(kind: ReviewItemKind): string {
  return KIND_LABEL[kind] ?? kind;
}

// ---- initialItemsForRun -----------------------------------------------

interface InitialItemSeed {
  title: string;
  summary: string;
}

function seedFor(kind: ReviewItemKind, strategy: Strategy): InitialItemSeed {
  const audienceRef =
    strategy.positioning.forWhom ||
    strategy.audienceAvatars[0]?.label ||
    "the target audience";
  const offerName = strategy.offers[0]?.label || "the top offer";
  const offerKind = strategy.offers[0]?.kind || "offer";
  const minimumProof = strategy.proofAssetPlan.minimumProofSet.length;
  const firstBatch = strategy.creativeTestingMatrix.recommendedFirstBatch.length;
  const campaignCount = strategy.campaignSetup.campaigns.length;
  const tracking = strategy.trackingReadiness.score;
  const qaBlockers = strategy.creativeQa.reduce(
    (n, q) => n + q.blockerCount,
    0
  );
  const iterationRecs = strategy.nextIterationPlan.recommendations.length;

  switch (kind) {
    case "positioning":
      return {
        title: "Positioning",
        summary: `Approve the positioning statement and the four components (for whom / category / unlike / unique) for ${audienceRef}.`,
      };
    case "offer":
      return {
        title: "Offer",
        summary: `Approve the top offer recommendation: ${offerName} (${offerKind}). Confirms breakeven ROAS assumptions hold.`,
      };
    case "proof-assets":
      return {
        title: "Proof assets",
        summary: `Approve the proof plan — ${minimumProof} must-have asset${minimumProof === 1 ? "" : "s"} on the minimum proof set; missing-before-spend list resolved.`,
      };
    case "first-test-batch":
      return {
        title: "First test batch",
        summary: `Approve the recommended first batch — ${firstBatch} test cell${firstBatch === 1 ? "" : "s"} on the (avatar × concept × hook × format × offer) matrix, each varying on one axis.`,
      };
    case "campaign-setup":
      return {
        title: "Campaign setup",
        summary: `Approve the campaign-setup spec — ${campaignCount} campaign${campaignCount === 1 ? "" : "s"}, naming convention, UTM template, pre-launch checklist.`,
      };
    case "client-report":
      return {
        title: "Client report",
        summary: `Approve the client-facing report and confirm it is ready to hand off to the founder or stakeholder.`,
      };
    case "tracking-readiness":
      return {
        title: "Tracking readiness",
        summary: `Reviewable: tracking readiness score is ${tracking}/100. Confirm any open warnings have a clear owner before launch.`,
      };
    case "creative-qa":
      return {
        title: "Creative QA",
        summary: `Reviewable: ${qaBlockers} creative-QA blocker${qaBlockers === 1 ? "" : "s"} across briefs. Confirm none are launch-stopping.`,
      };
    case "launch-readiness":
      return {
        title: "Launch readiness",
        summary: `Reviewable: confirm the journey-status stage, blockers, and the single concrete next step are agreed by the team.`,
      };
    case "next-iteration-plan":
      return {
        title: "Next iteration plan",
        summary: `Reviewable: ${iterationRecs} iteration recommendation${iterationRecs === 1 ? "" : "s"} on what to ship after the first batch.`,
      };
  }
}

export function initialItemsForRun(
  projectId: string,
  runId: string,
  strategy: Strategy,
  now: number
): ReviewItem[] {
  void projectId; // projectId is metadata kept on the board, not on each item.
  const items: ReviewItem[] = [];
  for (const kind of REVIEW_ITEM_KIND_ORDER) {
    const { title, summary } = seedFor(kind, strategy);
    items.push({
      id: `${runId}:${kind}`,
      runId,
      kind,
      critical: isCritical(kind),
      title,
      summary,
      status: "pending",
      updatedAt: now,
    });
  }
  return items;
}

// ---- summarizeReviewBoard ---------------------------------------------

// Scoring constants — documented here so the test asserts can refer to
// the same numbers without drift.
const CRITICAL_APPROVED_POINTS = 12; // max 72 across 6 critical items
const NON_CRITICAL_APPROVED_POINTS = 5; // max 20 across 4 non-critical items
const CRITICAL_BLOCKED_PENALTY = 10;
const CRITICAL_NEEDS_CHANGES_PENALTY = 5;
const UNRESOLVED_COMMENT_PENALTY = 2;
const UNRESOLVED_COMMENT_PENALTY_CAP = 20;
const CLEAN_BOARD_BONUS = 8;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeUnresolvedCount(board: ReviewBoard): number {
  // Only count comments whose item still exists (cascading deletes
  // should already have dropped orphans, but be defensive).
  const itemIds = new Set(board.items.map((it) => it.id));
  return board.comments.filter(
    (c) => itemIds.has(c.itemId) && c.resolved === false
  ).length;
}

export function summarizeReviewBoard(
  board: ReviewBoard
): ReviewBoardSummary {
  const items = board.items;
  const comments = board.comments;

  let criticalApproved = 0;
  let blockedItems = 0;
  let needsChangesItems = 0;
  let criticalBlocked = 0;
  let criticalNeedsChanges = 0;
  let nonCriticalApproved = 0;
  const pendingCriticalKinds: ReviewItemKind[] = [];

  for (const it of items) {
    if (it.status === "blocked") blockedItems += 1;
    if (it.status === "needs-changes") needsChangesItems += 1;

    if (it.critical) {
      if (it.status === "approved") criticalApproved += 1;
      if (it.status === "blocked") criticalBlocked += 1;
      if (it.status === "needs-changes") criticalNeedsChanges += 1;
      if (it.status !== "approved") {
        pendingCriticalKinds.push(it.kind);
      }
    } else {
      if (it.status === "approved") nonCriticalApproved += 1;
    }
  }

  const unresolvedComments = computeUnresolvedCount(board);

  // Score math.
  let score = 0;
  score += criticalApproved * CRITICAL_APPROVED_POINTS;
  score += nonCriticalApproved * NON_CRITICAL_APPROVED_POINTS;
  score -= criticalBlocked * CRITICAL_BLOCKED_PENALTY;
  score -= criticalNeedsChanges * CRITICAL_NEEDS_CHANGES_PENALTY;

  const commentPenalty = Math.min(
    unresolvedComments * UNRESOLVED_COMMENT_PENALTY,
    UNRESOLVED_COMMENT_PENALTY_CAP
  );
  score -= commentPenalty;

  // Clean-board bonus: every critical approved AND no unresolved
  // comments. Pushes a clean board to 100 with the bonus stacked on
  // top of 72 (critical) + 20 (non-critical) = 92.
  if (criticalApproved === CRITICAL_REVIEW_ITEM_KINDS.length && unresolvedComments === 0) {
    score += CLEAN_BOARD_BONUS;
  }

  score = clamp(score, 0, 100);

  const readiness = pickReadiness({
    criticalApproved,
    criticalBlocked,
    pendingCriticalCount: pendingCriticalKinds.length,
    unresolvedComments,
  });

  // derivedAt = max(updatedAt across items, createdAt + resolvedAt
  // across comments, 0). Caller-supplied timestamps only — never
  // Date.now().
  let derivedAt = 0;
  for (const it of items) {
    if (typeof it.updatedAt === "number" && it.updatedAt > derivedAt) {
      derivedAt = it.updatedAt;
    }
    if (typeof it.approvedAt === "number" && it.approvedAt > derivedAt) {
      derivedAt = it.approvedAt;
    }
  }
  for (const c of comments) {
    if (typeof c.createdAt === "number" && c.createdAt > derivedAt) {
      derivedAt = c.createdAt;
    }
    if (typeof c.resolvedAt === "number" && c.resolvedAt > derivedAt) {
      derivedAt = c.resolvedAt;
    }
  }

  return {
    approvalScore: score,
    approvalReadiness: readiness,
    criticalApproved,
    criticalTotal: CRITICAL_REVIEW_ITEM_KINDS.length,
    unresolvedComments,
    blockedItems,
    needsChangesItems,
    pendingCriticalKinds,
    derivedAt,
  };
}

function pickReadiness(args: {
  criticalApproved: number;
  criticalBlocked: number;
  pendingCriticalCount: number;
  unresolvedComments: number;
}): ReviewApprovalReadiness {
  const total = CRITICAL_REVIEW_ITEM_KINDS.length;

  // ready: every critical approved + zero blocked + zero unresolved
  // comments. This is the gate the journey-status integration uses
  // to allow `ready-to-spend`.
  if (
    args.criticalApproved === total &&
    args.criticalBlocked === 0 &&
    args.unresolvedComments === 0
  ) {
    return "ready";
  }
  // not-ready: any critical blocked OR any critical still pending /
  // needs-changes / blocked. We compute pendingCriticalCount as
  // "items that are not approved", so this captures every non-ready
  // critical state.
  if (args.criticalBlocked > 0 || args.pendingCriticalCount > 0) {
    return "not-ready";
  }
  return "partial";
}

// ---- unresolvedCommentCountByItem -------------------------------------

export function unresolvedCommentCountByItem(
  board: ReviewBoard
): Record<string, number> {
  const itemIds = new Set(board.items.map((it) => it.id));
  const counts: Record<string, number> = {};
  for (const it of board.items) {
    counts[it.id] = 0;
  }
  for (const c of board.comments) {
    if (!itemIds.has(c.itemId)) continue;
    if (c.resolved) continue;
    counts[c.itemId] = (counts[c.itemId] ?? 0) + 1;
  }
  return counts;
}

// ---- criticalBlockingMessages ------------------------------------------
//
// Returns one short sentence per critical item that is blocked,
// pending, or needs-changes. Used by the journey-status integration
// and by the UI gauge tooltip. Returns an empty array when the
// summary is `ready`.

export function criticalBlockingMessages(board: ReviewBoard): string[] {
  const summary = summarizeReviewBoard(board);
  if (summary.approvalReadiness === "ready") return [];

  const byKind = new Map<ReviewItemKind, ReviewItem>();
  for (const it of board.items) {
    byKind.set(it.kind, it);
  }

  const messages: string[] = [];
  for (const kind of CRITICAL_REVIEW_ITEM_KINDS) {
    const it = byKind.get(kind);
    if (!it) continue;
    if (it.status === "approved") continue;
    const label = reviewItemKindLabel(kind);
    if (it.status === "blocked") {
      messages.push(`${label} is blocked — clear the blocker before approval.`);
    } else if (it.status === "needs-changes") {
      messages.push(`${label} needs changes — address comments and re-review.`);
    } else {
      messages.push(`${label} is pending review — assign a reviewer to unblock approval.`);
    }
  }
  return messages;
}
