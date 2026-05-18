// Agency Packaging Layer types.
//
// Sits ABOVE the deterministic engine. `buildStrategy(input)` is
// byte-identical regardless of which agency context is selected; the
// agency layer reshapes how the strategy is *delivered* (project
// template defaults, role-based filtering, package scope, delivery
// summary), not what the engine produces.
//
// State lives in localStorage under a versioned key. Derived selectors
// (delivery summary) are pure and never call `Date.now()` — every
// timestamp comes from the stored review board / workspace state.

import type { ReviewItemKind } from "./review";

// ---- ID unions --------------------------------------------------------

export type ProjectTemplateId =
  | "app-launch"
  | "ecommerce-seasonal"
  | "saas-evergreen"
  | "local-service-leadgen"
  | "creator-product-launch";

export type AgencyRoleId =
  | "owner"
  | "client"
  | "media-buyer"
  | "creator"
  | "strategist";

export type PackagePresetId =
  | "strategy-sprint"
  | "launch-sprint"
  | "growth-os-setup"
  | "custom-build";

// StrategySectionId — canonical section identifiers reachable from
// StrategyView's tab strip plus a small set of finer-grained references
// (e.g. cta-bank, static-briefs) that map to sub-sections inside the
// concepts / briefs tabs. Kept as a string union so the catalog can
// reference future sections without a type bump, but the catalog only
// uses ids drawn from the list below.
export type StrategySectionId =
  | "score"
  | "positioning"
  | "awareness"
  | "audience"
  | "diagnosis"
  | "offer"
  | "calendar"
  | "angles"
  | "concepts"
  | "briefs"
  | "shots"
  | "launch"
  | "execution"
  | "proof"
  | "landing"
  | "store"
  | "experiments"
  | "export"
  | "workspace"
  | "review"
  | "agency"
  | "report"
  | "hooks"
  | "scripts"
  | "variants"
  | "cta-bank"
  | "static-briefs"
  | "creative-qa"
  | "editor-handoff"
  | "tracking"
  | "kpi-ladder"
  | "launch-readiness"
  | "next-iteration"
  | "avatars"
  | "strategy-snapshot"
  | "decision-log";

// ---- Project template -------------------------------------------------

export interface ProjectTemplate {
  id: ProjectTemplateId;
  label: string;
  summary: string;
  campaignType: "always-on" | "promo-3-tier" | "seasonal" | "evergreen" | "launch";
  businessModel:
    | "subscription-app"
    | "ecommerce"
    | "saas"
    | "local-service"
    | "creator-product";
  defaultProofRequirements: string[];
  trackingChecklistEmphasis: string[];
  recommendedOutputSections: StrategySectionId[];
  recommendedReportSections: StrategySectionId[];
  reviewApprovalItems: ReviewItemKind[];
  defaultPackage: PackagePresetId;
}

// ---- Role preset ------------------------------------------------------

export interface RolePreset {
  id: AgencyRoleId;
  label: string;
  cares: StrategySectionId[];
  approves: ReviewItemKind[];
  hides: StrategySectionId[];
  handoffFormat: "meeting" | "video-walkthrough" | "doc-only" | "async-comments";
  defaultQuestions: string[];
}

// ---- Package preset ---------------------------------------------------

export interface PackagePreset {
  id: PackagePresetId;
  label: string;
  summary: string;
  deliverables: string[];
  timelineDays: { min: number; max: number };
  priceRangeUsd: { min: number; max: number };
  includedModules: StrategySectionId[];
  clientResponsibilities: string[];
  upsellPath: PackagePresetId[];
  acceptanceCriteria: string[];
}

// ---- Delivery summary -------------------------------------------------

export interface DeliverySummary {
  whatWasDecided: string[];
  whatNeedsApproval: string[];
  whatWillLaunchFirst: string[];
  missingAssets: string[];
  clientNeedsToProvide: string[];
  nextMeetingAgenda: string[];
  derivedAt: number;
}

// ---- Persistence ------------------------------------------------------

export interface AgencySelection {
  projectId: string;
  templateId?: ProjectTemplateId;
  roleId?: AgencyRoleId;
  packageId?: PackagePresetId;
  updatedAt: number;
}
