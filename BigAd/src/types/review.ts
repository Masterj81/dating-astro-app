// Review & Approval Layer types.
//
// The review board wraps a SavedRun with a fixed set of reviewable
// items (6 critical, 4 non-critical) plus a comments thread. State
// lives ABOVE the deterministic engine — `buildStrategy(input)` is
// unchanged. Persistence lives in localStorage under versioned keys,
// mirroring the Project Workspace pattern.
//
// Derived selectors (approvalScore, readiness, blocking messages,
// markdown export) are pure functions of the stored state. They must
// never call `Date.now()` — every timestamp the derivation reads
// comes from the persisted item / comment records.

export type ReviewItemKind =
  | "positioning"
  | "offer"
  | "proof-assets"
  | "first-test-batch"
  | "campaign-setup"
  | "client-report"
  | "tracking-readiness" // non-critical reviewable
  | "creative-qa" // non-critical reviewable
  | "launch-readiness" // non-critical reviewable
  | "next-iteration-plan"; // non-critical reviewable

// The first 6 ReviewItemKind values are CRITICAL — they block
// approval until status === "approved". The remaining 4 are
// reviewable but non-blocking.
export const CRITICAL_REVIEW_ITEM_KINDS: ReviewItemKind[] = [
  "positioning",
  "offer",
  "proof-assets",
  "first-test-batch",
  "campaign-setup",
  "client-report",
];

export const NON_CRITICAL_REVIEW_ITEM_KINDS: ReviewItemKind[] = [
  "tracking-readiness",
  "creative-qa",
  "launch-readiness",
  "next-iteration-plan",
];

// Deterministic emission order — used by initialItemsForRun and by
// the markdown exporter so the Approval Pack always reads in the
// same sequence.
export const REVIEW_ITEM_KIND_ORDER: ReviewItemKind[] = [
  ...CRITICAL_REVIEW_ITEM_KINDS,
  ...NON_CRITICAL_REVIEW_ITEM_KINDS,
];

export type ReviewStatus = "pending" | "approved" | "needs-changes" | "blocked";

export type ReviewAuthor = "owner" | "client" | "media-buyer" | "creator";

export interface ReviewComment {
  id: string;
  itemId: string; // ReviewItem.id
  author: ReviewAuthor;
  body: string; // 1+ chars
  resolved: boolean;
  createdAt: number; // epoch ms — supplied by store, not by derived fns
  resolvedAt?: number;
}

export interface ReviewItem {
  id: string; // stable: `${runId}:${kind}`
  runId: string; // SavedRun.id this review pertains to
  kind: ReviewItemKind;
  critical: boolean;
  title: string;
  summary: string; // short description of what's being reviewed
  status: ReviewStatus;
  assignedTo?: ReviewAuthor;
  approvedBy?: ReviewAuthor;
  approvedAt?: number;
  updatedAt: number;
}

export interface ReviewBoard {
  projectId: string;
  runId: string;
  items: ReviewItem[];
  comments: ReviewComment[];
}

export type ReviewApprovalReadiness = "not-ready" | "partial" | "ready";

export interface ReviewBoardSummary {
  approvalScore: number; // 0-100
  approvalReadiness: ReviewApprovalReadiness;
  criticalApproved: number;
  criticalTotal: number; // always 6
  unresolvedComments: number;
  blockedItems: number;
  needsChangesItems: number;
  pendingCriticalKinds: ReviewItemKind[];
  derivedAt: number; // = max(updatedAt across items + createdAt across comments)
}
