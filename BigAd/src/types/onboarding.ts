// Onboarding & Demo Projects types.
//
// Sits ABOVE the deterministic engine (mirroring the Agency Packaging
// Layer and the Playbook Library). `buildStrategy(input)` is byte-
// identical regardless of which onboarding goal the operator picks or
// which demo project they load — the onboarding layer only shapes
// first-run guidance and seeds workspace state.
//
// State lives in localStorage under versioned `:v1` keys. Derived
// helpers (`buildProgressChecklist`, `getNextBestAction`) are pure and
// never call `Date.now()`. The demo loader (`buildDemoLoadPlan`) takes
// `nowMs` as an argument so the same plan is produced for the same
// projectId / runId / nowMs triple.
//
// User-facing surfaces say "CampaignOS". Internal identifiers and the
// localStorage keys stay `bigad:*:v1` for migration continuity.

import type { PlaybookId } from "./playbook";
import type {
  ReviewAuthor,
  ReviewItemKind,
  ReviewStatus,
} from "./review";
import type {
  KpiName,
  ProductInput,
} from "./strategy";

// ---- Goal ----------------------------------------------------------------

export type OnboardingGoalId =
  | "launch-app"
  | "launch-saas-trial"
  | "launch-ecom-promo"
  | "always-on-leadgen"
  | "fix-tracking-or-proof"
  | "agency-deliverable"
  | "just-exploring";

export interface OnboardingGoal {
  id: OnboardingGoalId;
  label: string;                // 3-6 words
  description: string;          // 1 sentence
  recommendedPlaybook: PlaybookId;
  primaryModules: string[];     // 3-5 strategy section ids the user should focus on first
}

// ---- Step ----------------------------------------------------------------

export type OnboardingStepId =
  | "pick-goal"
  | "create-or-load-project"
  | "review-strategy"
  | "capture-proof-or-confirm"
  | "approve-critical-items"
  | "plan-first-test-batch"
  | "export-or-handoff";

// Canonical link-to surfaces — these match StrategyView tab ids and
// related section anchors the NextBestAction CTA can navigate to.
export type OnboardingLinkTo =
  | "score"
  | "offer"
  | "proof"
  | "execution"
  | "review"
  | "workspace"
  | "agency"
  | "playbooks"
  | "report";

export interface OnboardingStep {
  id: OnboardingStepId;
  order: number;                // 1-based, contiguous
  label: string;
  description: string;
  linkTo?: OnboardingLinkTo;
  estimatedMinutes: number;     // 1-3 typical
}

// ---- Persistence --------------------------------------------------------

export interface OnboardingState {
  goalId?: OnboardingGoalId;
  completedStepIds: OnboardingStepId[];
  dismissed: boolean;           // user can dismiss the welcome panel
  updatedAt: number;            // epoch ms — store stamps at write time
}

// ---- Demo project --------------------------------------------------------

export interface DemoProjectMetadata {
  id: "astro-dating-launch" | "saas-free-trial-launch" | "ecom-seasonal-promo";
  label: string;
  blurb: string;                // 1 sentence
  goalId: OnboardingGoalId;
  recommendedPlaybook: PlaybookId;
}

// Sample shapes — kept lightweight here so the demo entries stay
// readable. The loader maps these onto the real workspace / review
// types at load time.

export type SampleResultStatus =
  | "winning"
  | "losing"
  | "killed-early"
  | "inconclusive";

export interface SampleTestResultMetric {
  name: KpiName | string;
  value: number;
}

export interface SampleTestResult {
  cellId: string;
  status: SampleResultStatus;
  spendUsd: number;
  daysRun: number;
  metrics: SampleTestResultMetric[];
  notes?: string;
}

export interface SampleReviewStatus {
  kind: ReviewItemKind;
  status: ReviewStatus;
  approvedBy?: ReviewAuthor;
  sampleComment?: {
    author: ReviewAuthor;
    body: string;
    resolved: boolean;
  };
}

export interface DemoProject extends DemoProjectMetadata {
  input: ProductInput;
  sampleTestResults: SampleTestResult[]; // 4-8 results — winners + losers + killed-early
  sampleReviewStatuses: SampleReviewStatus[]; // 6-10 covering critical + non-critical
  sampleNotes: string[]; // 2-5 short learnings to pre-populate
}

// ---- Next best action ---------------------------------------------------

export type NextBestActionKind =
  | "pick-goal"
  | "load-demo"
  | "create-project"
  | "fill-input"
  | "capture-proof"
  | "fix-tracking"
  | "approve-critical"
  | "plan-first-batch"
  | "export-report"
  | "all-done";

export interface NextBestAction {
  kind: NextBestActionKind;
  title: string;
  rationale: string;            // 1 sentence ("Tracking readiness is 38 — fix events before spending")
  linkTo?: OnboardingLinkTo;
  ctaLabel: string;             // button text
}

// ---- Progress checklist -------------------------------------------------

export interface ProgressChecklistItem {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  detail?: string;              // short status sentence ("4 / 6 critical approved")
}
