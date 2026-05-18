// assets.ts — Asset Production Manager types.
//
// Sits ABOVE the deterministic engine: `buildAssetProductionPlan` derives
// a production plan from the strategy + optional upstream layers (proof,
// testing matrix, playbook, review). The plan tracks each asset's status,
// owner, quality checks, and where it's used.
//
// Persistence (`bigad:assets:v1`) keeps the per-asset state across runs.
// Derived selectors (readinessScore, missingBlockers, summary) are pure
// and must never call `Date.now()` — every timestamp comes from the
// persisted record's updatedAt.

import type { ReviewAuthor } from "./review";

export type AssetStatus =
  | "requested"
  | "scripted"
  | "in-production"
  | "in-review"
  | "approved"
  | "rejected"
  | "shipped";

export type AssetFormat =
  | "video-9-16"
  | "video-1-1"
  | "video-16-9"
  | "video-4-5"
  | "static-1-1"
  | "static-4-5"
  | "static-9-16"
  | "screenshot"
  | "quote"
  | "case-study"
  | "landing-section"
  | "report";

export type AssetSourceKind =
  | "proof-asset"
  | "creator-brief"
  | "static-brief"
  | "video-script"
  | "test-cell"
  | "campaign-ad"
  | "report-asset";

// AssetOwnerRole inherits the same audience set as ReviewAuthor and
// extends it with creative-production roles. Keeping the union open this
// way means review and asset state can co-exist without conflict.
export type AssetOwnerRole =
  | ReviewAuthor
  | "creator"
  | "editor"
  | "designer"
  | "copywriter"
  | "producer";

export type AssetPriority = "must-have" | "should-have" | "nice-to-have";

export type AssetQualityCheckKind =
  | "proof-visible"
  | "cta-visible"
  | "brand-present"
  | "no-unsupported-claim"
  | "format-matches-placement"
  | "captions-included"
  | "export-size-noted"
  | "aspect-ratio-noted"
  | "file-link-present";

export interface AssetQualityCheck {
  kind: AssetQualityCheckKind;
  required: boolean;
  done: boolean;
  notedAt?: number;
}

export interface AssetDependency {
  dependsOnAssetId: string;
  reason: string;
}

export interface AssetWhereUsed {
  context: "test-cell" | "campaign-ad" | "landing-page" | "report" | "proof-block";
  refId: string;
  label: string;
}

export interface ProductionAsset {
  id: string;
  title: string;
  sourceKind: AssetSourceKind;
  sourceRefId: string;
  format: AssetFormat;
  priority: AssetPriority;
  status: AssetStatus;
  ownerRole: AssetOwnerRole;
  dueWindow: { startOffsetDays: number; endOffsetDays: number };
  linkedTestCellIds: string[];
  linkedProofAssetIds: string[];
  qualityChecks: AssetQualityCheck[];
  dependencies: AssetDependency[];
  whereUsed: AssetWhereUsed[];
  riskIfMissing: string;
  fileLink?: string;
  notes?: string;
  updatedAt: number;
}

export interface AssetProductionPlan {
  runId: string;
  assets: ProductionAsset[];
  mustHaveCount: number;
  shouldHaveCount: number;
  niceToHaveCount: number;
  blockedCount: number;
  readinessScore: number;
  missingBlockers: Array<{ assetId: string; reason: string }>;
  byOwner: Partial<Record<AssetOwnerRole, number>>;
  byStatus: Partial<Record<AssetStatus, number>>;
  derivedAt: number;
}

export interface AssetProductionSummary {
  readinessScore: number;
  mustHaveTotal: number;
  mustHaveReady: number;
  pendingMustHaveIds: string[];
  shippedCount: number;
  derivedAt: number;
}
