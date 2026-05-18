// Playbook Library types.
//
// Playbooks are opinionated, pre-shaped recipes that tell an operator
// which BigAd modules to lean on, which proof to capture, which gates
// to clear, and how to shape the first-test-batch for a given product /
// campaign archetype. The library sits ABOVE the deterministic engine
// (mirroring the Agency Packaging Layer): `buildStrategy(input)` is
// byte-identical regardless of which playbook the operator applies.
//
// All state lives in localStorage under a versioned `:v1` key. The
// recommendation engine reads strategy + input as inputs to a derived
// function and never mutates either. Derived selectors never call
// `Date.now()`.

// ---- ID unions --------------------------------------------------------

export type PlaybookId =
  | "saas-free-trial-launch"
  | "mobile-app-launch"
  | "dating-app-launch"
  | "ecommerce-seasonal-promo"
  | "local-service-leadgen"
  | "creator-product-drop"
  | "waitlist-launch"
  | "retargeting-rescue"
  | "landing-cro-sprint"
  | "agency-strategy-sprint";

export type PlaybookCategory =
  | "launch"
  | "always-on"
  | "seasonal"
  | "leadgen"
  | "rescue"
  | "cro"
  | "service";

export type PlaybookChannel =
  | "meta"
  | "tiktok"
  | "youtube"
  | "google-search"
  | "google-pmax"
  | "reddit"
  | "linkedin"
  | "x"
  | "email"
  | "organic-social";

export type PlaybookBusinessModel =
  | "subscription-app"
  | "ecommerce"
  | "saas"
  | "local-service"
  | "creator-product"
  | "b2b-services";

export type PlaybookCampaignType =
  | "always-on"
  | "promo-3-tier"
  | "seasonal"
  | "evergreen"
  | "launch";

export type PlaybookAwarenessStage =
  | "unaware"
  | "problem-aware"
  | "solution-aware"
  | "product-aware"
  | "most-aware";

export type PlaybookSophistication =
  | "green-market"
  | "competitive-market"
  | "skeptical-market"
  | "mature-market";

export type PlaybookFormat =
  | "video-9-16"
  | "video-1-1"
  | "video-4-5"
  | "static-1-1"
  | "static-4-5"
  | "static-9-16"
  | "carousel"
  | "collection";

// ---- Step / checklist -------------------------------------------------

export interface PlaybookStep {
  order: number; // 1-based, contiguous
  module: string; // canonical StrategySectionId-style id
  title: string; // 3-8 words
  description: string; // 1-2 sentences
  gate?: string; // optional condition
}

export interface PlaybookChecklistItem {
  id: string; // unique within playbook (kebab-case)
  label: string; // imperative one-liner
  category: "inputs" | "proof" | "creative" | "tracking" | "review" | "launch";
  required: boolean;
}

// ---- Recommendation / fit-score --------------------------------------

export interface PlaybookFitScore {
  playbookId: PlaybookId;
  score: number; // 0-100, clamped
  reasons: string[]; // 1-5 short phrases
  mismatches: string[]; // 0-5 short phrases
  missingInputs: string[]; // 0-5 short phrases — required input fields the playbook needs that input lacks
}

export interface PlaybookRecommendation {
  topPlaybook?: Playbook;
  topScore?: PlaybookFitScore;
  ranked: PlaybookFitScore[]; // all playbooks, sorted by score desc, then by id asc
  whyItFits: string[]; // top 3-5 reasons from topScore
  whyItMayNotFit: string[]; // top 1-3 mismatches / missing
  derivedAt: number; // max(strategy.generatedAt, input timestamps) — never Date.now()
}

// ---- Playbook ---------------------------------------------------------

export interface Playbook {
  id: PlaybookId;
  name: string;
  category: PlaybookCategory;
  bestFor: string[]; // 3-6 phrases describing ideal fit
  notFor: string[]; // 2-4 phrases describing anti-fit
  businessModels: PlaybookBusinessModel[];
  campaignTypes: PlaybookCampaignType[];
  awarenessStages: PlaybookAwarenessStage[];
  sophistication?: PlaybookSophistication[];
  channels: PlaybookChannel[];
  recommendedModules: string[]; // section ids ordered by recommended generation order
  requiredInputs: string[]; // ProductInput field names the playbook needs
  proofRequirements: string[]; // 3-6 concrete proof asset descriptions
  executionSteps: PlaybookStep[]; // 6-10 ordered steps
  launchGates: string[]; // 3-6 launch gates
  defaultTestPlan: {
    cellCount: { min: number; max: number };
    formats: PlaybookFormat[];
    oneVariableAtATime: boolean;
    budgetGuidance: string;
    killRuleHint: string;
    scaleRuleHint: string;
  };
  reportingFocus: string[]; // 3-6 KPI names to spotlight in the client report
  reviewRequirements: string[]; // critical review approval kinds this playbook expects
  estimatedTimelineDays: { min: number; max: number };
  riskNotes: string[]; // 2-5 phrases describing what can go wrong
}

// ---- Persistence ------------------------------------------------------

export interface AppliedPlaybook {
  projectId: string;
  playbookId: PlaybookId;
  updatedAt: number;
}
