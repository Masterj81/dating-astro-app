// portal.ts — Shareable Client Portal types.
//
// The Client Portal is a derived view ABOVE the deterministic engine.
// It reads stored workspace / review / results / agency / learning data
// and reshapes it into a small, founder-facing snapshot that an agency
// can hand a client without leaking internal scaffolding.
//
// The builder is PURE: `buildClientPortalSnapshot(input)` never calls
// `Date.now()`, never mutates inputs, and same input → byte-identical
// snapshot. `generatedAt` is derived from the max of all stored
// timestamps so reruns inside the same browser window are stable.
//
// User-facing surfaces say "CampaignOS"; internal identifiers
// (localStorage keys, type names) keep BigAd.

import type { ForecastAccuracyReport } from "./results";
import type { ReviewItemKind } from "./review";

// Canonical section identifiers, also the emission order. The portal
// renderer walks this union in order so the markdown / route output is
// stable regardless of caller iteration order.
export type PortalSectionId =
  | "overview"
  | "strategy-snapshot"
  | "offer"
  | "audience"
  | "proof"
  | "execution"
  | "forecast"
  | "simulator"
  | "benchmarks"
  | "review-status"
  | "results"
  | "next-actions";

// Visibility settings — caller-controlled. Sections default to all on
// (see `defaultPortalVisibility()`); high-level toggles default to a
// founder-facing posture (hidePricing=false, hideInternalNotes=true,
// hideAssumptions=false).
export interface PortalVisibilitySettings {
  sections: Record<PortalSectionId, boolean>;
  hidePricing: boolean;
  hideInternalNotes: boolean;
  hideAssumptions: boolean;
}

export interface PortalSection {
  id: PortalSectionId;
  title: string;
  // 1-2 sentence summary that anchors the section.
  summary: string;
  // 0-12 short bullets — keep each under ~24 words for portal readability.
  bullets: string[];
  // Optional headline pulled out as a hero stat (e.g. "Readiness: ready").
  highlight?: string;
}

export interface ClientPortalSnapshot {
  projectId: string;
  projectName: string;
  // Deterministic — max(updatedAt across all stored sources) or 0 when
  // nothing has timestamps. Never `Date.now()`.
  generatedAt: number;
  // One sentence describing the engagement.
  overviewHeadline: string;
  // Ordered: only sections whose visibility is enabled AND that have
  // content. Empty content → section absent.
  sections: PortalSection[];
  visibility: PortalVisibilitySettings;
  // 3-6 bullets, ordered by priority.
  nextActions: string[];
  // 0-8 entries — a short narrative of the engagement.
  decisionLog: Array<{
    title: string;
    detail: string;
  }>;
  // Approval roll-up derived from the review board summary.
  approvals: {
    readiness: "not-ready" | "partial" | "ready";
    criticalApproved: number;
    criticalTotal: number;
    pendingKinds: ReviewItemKind[];
    unresolvedComments: number;
  };
  // Result roll-up derived from accuracyReport — absent when results
  // haven't been imported yet.
  results?: {
    overallAccuracy: ForecastAccuracyReport["overallAccuracy"];
    totalSpendUsd: number;
    totalConversions: number;
    weightedRoas?: number;
    forecastWeightedRoas?: number;
    perCellCount: number;
  };
  // Agency layer roll-up — absent when the project has no selection.
  agency?: {
    templateLabel?: string;
    roleLabel?: string;
    packageLabel?: string;
    priceRangeUsd?: { min: number; max: number };
  };
  // Learning memory roll-up — top high-confidence learnings.
  learning?: {
    fromResultCount: number;
    headlineLearnings: string[];
  };
}

// Convenience bundle for the "Copy client summary" button.
export interface PortalSharePack {
  snapshot: ClientPortalSnapshot;
  markdown: string;
  // One-liner — `overviewHeadline` plus top next action(s).
  oneLiner: string;
}
