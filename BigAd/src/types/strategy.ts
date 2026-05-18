// Core domain types for BigAd.
// These types describe the input the user fills in and the strategy
// output the deterministic engine produces.

import type {
  OfferScenarioResult,
  UnitEconomicsSummary,
} from "./economics";
import type {
  ForecastPlan,
} from "./forecast";

export type {
  EconomicsReadinessStatus,
  EconomicsWarning,
  EconomicsWarningKind,
  OfferScenarioResult,
  SubscriptionEconomics,
  UnitEconomicsInput,
  UnitEconomicsSummary,
} from "./economics";
export type {
  BudgetRecommendation,
  DecisionCheckpoint,
  ForecastOutcome,
  ForecastPlan,
  ForecastReadinessStatus,
  ForecastScenario,
  ForecastScenarioKind,
  ForecastWarning,
  ForecastWarningKind,
  SpendAllocation,
} from "./forecast";

export type AwarenessLevel =
  | "unaware"
  | "problem-aware"
  | "solution-aware"
  | "product-aware"
  | "most-aware";

export type SophisticationLevel =
  | "fresh-market"
  | "simple-claims"
  | "amplified-claims"
  | "skeptical-market"
  | "mature-market";

export type BusinessModel =
  | "subscription"
  | "one-time"
  | "freemium"
  | "marketplace"
  | "ads"
  | "services"
  | "other";

export type CampaignType = "launch" | "seasonal" | "always-on";

export type OfferKind =
  | "discount"
  | "bundle"
  | "guarantee"
  | "free-shipping"
  | "free-gift"
  | "payment-plan"
  | "free-trial";

export type AwarenessStage =
  | "unaware"
  | "problem-aware"
  | "solution-aware"
  | "product-aware"
  | "most-aware";

export interface OfferContext {
  cogsPercent?: number; // 0-100, optional
  targetMarginPercent?: number; // 0-100, optional
  currentAOV?: number; // optional
  targetROAS?: number; // optional, e.g. 2.5
}

export interface OfferRecommendation {
  kind: OfferKind;
  label: string; // short brand-safe phrasing, BigAd voice
  rationale: string; // why this fits — paraphrased, BigAd voice
  breakevenROAS: number | null; // null when not computable
  stickinessRisk: "low" | "medium" | "high";
  awarenessFit: AwarenessStage[];
  discountPercent?: number; // for "discount" kind
  notes?: string;
}

export type CampaignWindowKind =
  | "lead-in"
  | "warmup"
  | "ramp"
  | "peak"
  | "echo"
  | "tail"
  | "evergreen-test"
  | "evergreen-scale";

export type DipMechanism =
  | "warm-cohort-saturation"   // engaged-audience pool getting hammered
  | "warm-cohort-exhaustion"   // pool fully tapped out
  | "urgency-collapse"          // urgency window expired, momentum lost
  | "post-peak-reset";          // expected calm after a peak

export interface DipForecast {
  mechanism: DipMechanism;
  rationale: string;          // 1 short sentence, BigAd voice
  severity: "soft" | "notable" | "hard";
  expectedAroundDayOffset: number;  // relative to window's startOffsetDays
}

export type CampaignArchitectureKind = "single-tier" | "promo-3-tier";

export interface AudienceTier {
  name: string;             // e.g. "Cold broad", "Engaged (last 60 days)", "Site visitors (last 90 days)"
  intent: "prospecting" | "engagement-retargeting" | "site-retargeting";
  notes?: string;
}

export interface CampaignArchitecture {
  kind: CampaignArchitectureKind;
  rationale: string;         // 1-2 sentences, BigAd voice
  tiers: AudienceTier[];     // single-tier → 1 tier (cold broad); promo-3-tier → 3 tiers
  budgetSplitHint?: string;  // e.g. "60/25/15 cold/engaged/site"
}

export interface RetrospectiveQuestion {
  topic:
    | "prior-winning-creative"
    | "prior-offer-performance"
    | "list-quality"
    | "returning-customer-angle"
    | "landing-bottleneck"
    | "shipping-deadline-constraint"
    | "margin-guardrail"
    | "next-cycle-learning";
  question: string;            // BigAd voice, one sentence
  whyItMatters: string;        // 1 sentence
}

export interface RetrospectiveGate {
  windowKind: CampaignWindowKind;
  questions: RetrospectiveQuestion[];   // exactly 8, one per topic
}

export interface CampaignWindow {
  kind: CampaignWindowKind;
  label: string;
  startOffsetDays: number; // relative to campaign anchor (0 = anchor day)
  durationDays: number;
  primaryKPI: string; // e.g. "CTR > 1.2%", "CPA <= $24"
  readinessGate: string; // pre-condition before this window can start
  recommendedOfferKind: OfferKind | null;
  dipForecasts: DipForecast[]; // 0-2 forecasted soft windows inside this window
  recommendedArchitecture: CampaignArchitecture; // audience architecture for this window
  retrospectiveGate?: RetrospectiveGate; // 8-question pre-peak retrospective; only on the first peak in seasonal (and optionally launch)
  notes: string;
}

export interface CampaignCalendar {
  campaignType: CampaignType;
  anchorLabel: string; // e.g. "Launch Day", "Peak Day", "Always-On Start"
  windows: CampaignWindow[];
}

export interface ProductInput {
  name: string;
  category: string;
  description: string;
  price: string;
  businessModel: BusinessModel;
  audience: string;
  audiencePain: string;
  competitors: string;
  differentiator: string;
  goal: string;
  awareness: AwarenessLevel;
  sophistication: SophisticationLevel;
  // Optional commercial context for the Offer Architect.
  offerContext?: OfferContext;
  // Optional campaign type for the Calendar generator. Defaults to
  // "always-on" inside the engine when absent.
  campaignType?: CampaignType;
}

export interface Positioning {
  statement: string;
  forWhom: string;
  category: string;
  unlike: string;
  unique: string;
}

export type ChannelFit =
  | "TikTok"
  | "Meta"
  | "Landing"
  | "App Store"
  | "Email";

export interface Angle {
  name: string;
  hook: string;
  rationale: string;
  // V2 ranking metadata. Optional so callers built against MVP don't break.
  score?: number; // 0-100, deterministic
  channelFit?: ChannelFit;
  awarenessStage?: AwarenessLevel;
  objectionAddressed?: string;
  whyItCouldWork?: string;
}

export interface LandingCopy {
  hero: string;
  subhead: string;
  bullets: string[];
  cta: string;
  socialProofLine: string;
  objectionsHandled: { objection: string; reply: string }[];
}

export interface StoreCopy {
  appName: string;
  subtitle: string;
  promoText: string;
  description: string;
  keywords: string[];
}

export interface ShortScript {
  hook: string;
  beats: string[];
  cta: string;
}

export interface FacebookAdConcept {
  angle: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
}

export interface Experiment {
  hypothesis: string;
  variantA: string;
  variantB: string;
  metric: string;
}

// ---- V2 quality + diagnosis types ----

export type ScoreDimensionKey =
  | "clarity"
  | "differentiation"
  | "specificity"
  | "proofStrength"
  | "channelFit";

export interface ScoreDimension {
  key: ScoreDimensionKey;
  label: string;
  score: number; // 0-100
  explanation: string;
  suggestion: string;
}

export interface StrategyScore {
  overall: number; // weighted average, 0-100
  dimensions: ScoreDimension[];
}

export type ProofAsset =
  | "screenshots"
  | "demo video"
  | "customer quote"
  | "case study"
  | "before/after"
  | "app store reviews"
  | "founder story";

export interface OfferDiagnosis {
  strongestPromise: string;
  weakestClaim: string;
  missingProof: string;
  biggestObjection: string;
  recommendedAsset: ProofAsset;
  recommendedAssetReason: string;
}

export interface AwarenessVariant {
  stage: AwarenessLevel;
  headline: string;
  adHook: string;
  landingAngle: string;
}

export interface GenericFlag {
  field: string; // e.g. "headline[3]" or "landing.hero"
  phrase: string; // the banned phrase that was found
  text: string; // the offending sentence
  suggestion: string; // a more specific replacement seeded from input
}

export interface Strategy {
  positioning: Positioning;
  awarenessNotes: string[];
  sophisticationNotes: string[];
  centralPromise: string;
  uniqueMechanism: string;
  objections: { objection: string; reply: string }[];
  headlines: string[];
  angles: Angle[];
  rankedAngles: Angle[]; // ordered by score desc; same items, enriched
  landing: LandingCopy;
  store: StoreCopy;
  tiktokScripts: ShortScript[];
  facebookAds: FacebookAdConcept[];
  experiments: Experiment[];

  // V2 additions
  score: StrategyScore;
  diagnosis: OfferDiagnosis;
  awarenessVariants: AwarenessVariant[];
  genericFlags: GenericFlag[];

  // V3 additions — Offer Architect and Campaign Calendar.
  offers: OfferRecommendation[];
  campaignCalendar: CampaignCalendar;

  // V4 additions — Creator Brief Generator and Shot List Generator.
  creatorBriefs: CreatorBrief[];
  shotLists: ShotList[];

  // V5 additions — Execution + Ops/Data H1 modules.
  videoScripts: VideoScript[];
  variantSets: VariantSet[];
  trackingReadiness: TrackingReadinessScore;
  kpiLadder: KpiTargetLadder;
  kpiDiagnosis: KpiDiagnosis;
  adReview: AdReviewChecklist;
  // Applied per-brief evaluations against the Ad Review checklist.
  appliedAdReviews: AppliedAdReview[];
  journeyStatus: JourneyStatus;

  // V6 additions — H2 Execution / Ops modules.
  ctaBank: CtaBank;
  staticBriefs: StaticAdBrief[];
  creativeQa: CreativeQA[];
  editorHandoffs: EditorHandoff[];

  // Upstream creative-quality modules — additive.
  audienceAvatars: AudienceAvatar[];
  hookLibrary: HookLibrary;
  adConceptCards: AdConceptCard[];

  // Copy-quality flags — emitted by the copy-normalize validator.
  // Empty array when the strategy passes every anti-bad-copy rule.
  copyIssues: CopyIssue[];

  // Input Assistant — quality assessment of the raw ProductInput.
  inputQuality: InputQuality;

  // Proof Asset Planner — concrete plan of proof assets to capture.
  proofAssetPlan: ProofAssetPlan;

  // Execution OS — testing matrix → campaign setup → next iteration plan.
  creativeTestingMatrix: CreativeTestingMatrix;
  campaignSetup: CampaignSetup;
  nextIterationPlan: NextIterationPlan;

  // Unit Economics / Offer Lab — derived deterministically from input
  // (and the offer recommendations above) so the engine output stays
  // self-contained. `derivedAt` is always 0.
  unitEconomics: UnitEconomicsSummary;
  offerScenarios: OfferScenarioResult[];

  // Forecast / Budget Planner — pure derivation from the modules
  // above (unitEconomics + kpiLadder + creativeTestingMatrix +
  // campaignSetup + trackingReadiness). `derivedAt` is always 0.
  forecast?: ForecastPlan;

  exportBrief: string;
}

// ---- Input Assistant types ----------------------------------------------

export type InputWarningKind =
  | "audience-too-long"
  | "audience-too-generic"
  | "pain-too-long"
  | "pain-too-vague"
  | "differentiator-too-generic"
  | "goal-as-promise"
  | "category-duplicated"
  | "competitor-missing"
  | "businessmodel-price-incoherent"
  | "missing-offercontext-cogs"
  | "missing-offercontext-margin"
  | "missing-offercontext-aov"
  | "missing-offercontext-roas"
  | "no-proof-for-skeptical-market";

export interface InputWarning {
  kind: InputWarningKind;
  field: string;              // which ProductInput field it concerns
  severity: "warning" | "blocker";
  message: string;            // BigAd voice, one sentence
  fix: string;                // concrete fix, one sentence
}

export interface InputSuggestion {
  field: string;
  suggestion: string;         // a concrete rewrite suggestion
  rationale: string;          // 1 short sentence
}

export interface RewrittenInputHints {
  audience: string;           // shortened, sharper
  corePain: string;
  differentiator: string;
  goal: string;               // reframed customer-side
  proofNeeded: string[];      // 2-4 concrete proof types this product needs
}

export interface InputQuality {
  score: number;              // 0-100 integer
  status: "weak" | "okay" | "strong";
  warnings: InputWarning[];
  suggestions: InputSuggestion[];
  rewrittenHints: RewrittenInputHints;
}

// ---- Proof Asset Planner types ------------------------------------------

export type ProofAssetType =
  | "screenshot"
  | "demo-video"
  | "customer-quote"
  | "before-after"
  | "case-study"
  | "app-store-review"
  | "founder-story";

export interface PlannedProofAsset {
  id: string;                 // "proof-1", etc.
  type: ProofAssetType;
  priority: "must-have" | "should-have" | "nice-to-have";
  title: string;              // short title, BigAd voice
  whyItMatters: string;       // 1 sentence
  captureInstructions: string; // 1-2 sentences, actionable
  whereToUse: string[];       // e.g. ["landing-hero", "static-1-1", "video-9-16", "store-listing"]
  relatedObjection?: string;  // which avatar objection it addresses (objection.statement)
  readinessImpact: number;    // 1-20, score contribution if captured
}

export interface ProofAssetPlan {
  priorityAssets: PlannedProofAsset[];  // 4-10 ranked
  minimumProofSet: string[];            // ids of must-haves
  missingBeforeSpend: string[];         // must-haves that the user hasn't indicated they have
  proofReadinessScore: number;          // 0-100 (sum of readinessImpact of available, clamped)
}

// ---- Copy normalization issue type (validator output) ---------------------

export type CopyIssueKind =
  | "duplicate-noun"
  | "ellipsis"
  | "audience-sentence-leak"
  | "goal-as-promise"
  | "overlong-overlay"
  | "overlong-hook"
  | "irrelevant-offer";

export interface CopyIssue {
  kind: CopyIssueKind;
  source: string;     // e.g. "hookLibrary.items[3].text"
  text: string;       // the problematic snippet
}

// ---- V4 production-plan types ----

export type BriefSectionKind =
  | "hook"
  | "problem"
  | "solution-or-proof"
  | "cta";

export type ShotKind =
  | "talking-head"
  | "product-shot"
  | "b-roll"
  | "screenshot"
  | "ugc-selfie"
  | "lifestyle";

export type CameraAngle =
  | "eye-level"
  | "high"
  | "low"
  | "over-shoulder"
  | "pov";

export type ShotDuration =
  | "1-2s"
  | "2-4s"
  | "4-6s"
  | "6-10s"
  | "10s+";

export interface CreatorBriefSection {
  kind: BriefSectionKind;
  label: string;            // BigAd voice short label
  beat: string;             // 1-2 sentence direction
  durationSeconds: number;
  whatToSay?: string[];     // 2-4 bullet directions
  whatToShow?: string[];    // visual cues
  doNot?: string[];         // 1-3 anti-patterns
}

export interface CreatorBrief {
  id: string;               // deterministic id, e.g. "brief-1"
  forAngle: string;         // one of the existing angles[] entries
  durationSeconds: number;  // total
  framing: string;          // 1 sentence framing rule
  altHooks: string[];       // 2-3 alternate hook openers
  sections: CreatorBriefSection[];
  deliverables: string[];   // 2-5 deliverable bullets
  notes?: string;
}

export interface ShotListItem {
  index: number;
  kind: ShotKind;
  framing: string;          // e.g. "MCU, eye-level, indoor soft window light"
  angle: CameraAngle;
  duration: ShotDuration;
  props: string[];
  sound: string;            // e.g. "Voiceover line: ...", "Ambient room tone"
  bRollNotes?: string;
}

export interface ShotList {
  briefId: string;          // CreatorBrief.id
  totalShots: number;
  items: ShotListItem[];
}

// ---- V5: Execution H1 — Hook Critic ----

export type HookFlagKind =
  | "too-long"
  | "weak-opener"
  | "no-stakes"
  | "no-specificity"
  | "buried-payoff"
  | "passive-voice"
  | "category-bland"
  | "off-tone"
  | "off-awareness";

export interface HookFlag {
  kind: HookFlagKind;
  severity: "low" | "medium" | "high";
  message: string;
  fix: string;
}

export interface HookCritique {
  draft: string;
  score: number; // 0-100
  flags: HookFlag[];
  rewrite: string;
  rationale: string;
}

// ---- V5: Execution H1 — Video Script ----

export type ScriptLineKind = "vo" | "on-camera" | "on-screen-text" | "sfx";

export interface ScriptLine {
  index: number;
  briefSectionIndex: number; // 0..3
  kind: ScriptLineKind;
  text: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface VideoScript {
  briefId: string;
  totalDurationSeconds: number;
  lines: ScriptLine[];
}

// ---- V5: Execution H1 — Ad Variant Spinner ----

export type VariantAxis = "hook" | "hold" | "proof" | "cta" | "offer";

export interface BaseConcept {
  id: string;
  hook: string;
  hold: string;
  proof: string;
  cta: string;
  offer: string;
}

export interface AdVariant {
  id: string;
  changedAxis: VariantAxis;
  hook: string;
  hold: string;
  proof: string;
  cta: string;
  offer: string;
  rationale: string;
}

export interface VariantSet {
  baseConceptId: string;
  variants: AdVariant[];
}

// ---- V5: Ops/Data H1 — Tracking Readiness ----

export type TrackingReadinessCheckKind =
  | "pixel-installed"
  | "conversion-events"
  | "exclusion-audiences"
  | "permissions-set"
  | "naming-convention"
  | "utm-template"
  | "landing-fast"
  | "consent-banner"
  | "post-purchase-survey"
  | "test-purchase-confirmed";

export interface TrackingReadinessCheck {
  kind: TrackingReadinessCheckKind;
  label: string;
  status: "passed" | "warning" | "blocker" | "unknown";
  rationale: string;
  fix?: string;
}

export interface TrackingReadinessScore {
  score: number;
  status: "ready" | "almost" | "not-ready";
  blockers: number;
  warnings: number;
  checks: TrackingReadinessCheck[];
}

// ---- V5: Ops/Data H1 — KPI Target Ladder ----

export type KpiName =
  | "ctr"
  | "cpc"
  | "cpm"
  | "cpa"
  | "cvr"
  | "roas"
  | "hookRate"
  | "holdRate";

export type LadderTier = "starter" | "healthy" | "scaling";

export interface KpiTarget {
  kpi: KpiName;
  tier: LadderTier;
  breakeven: number;
  scaling: number;
  direction: "higher-better" | "lower-better";
  unit: "ratio" | "percent" | "currency" | "dimensionless";
  notes?: string;
}

export interface KpiTargetLadder {
  tiers: LadderTier[];
  targets: KpiTarget[];
}

// ---- V5: Ops/Data H1 — KPI Diagnosis ----

export interface KpiSnapshot {
  ctr?: number;
  cpc?: number;
  cpm?: number;
  cpa?: number;
  cvr?: number;
  roas?: number;
  hookRate?: number;
  holdRate?: number;
}

export type DiagnosisCategory =
  | "creative"
  | "landing-page"
  | "offer"
  | "audience"
  | "tracking"
  | "fatigue"
  | "healthy";

export interface DiagnosisFinding {
  category: DiagnosisCategory;
  signal: string;
  inference: string;
  recommendedAction: string;
}

export interface KpiDiagnosis {
  snapshot: KpiSnapshot;
  ladder: KpiTargetLadder;
  findings: DiagnosisFinding[];
  primaryCategory: DiagnosisCategory;
}

// ---- V5: Ops/Data H1 — Ad Review Checklist ----

export type ReviewAxisKind =
  | "hook-clarity"
  | "first-3s-payoff"
  | "claim-specificity"
  | "proof-strength"
  | "offer-visibility"
  | "cta-clarity"
  | "platform-fit"
  | "tone-match"
  | "awareness-fit"
  | "pacing"
  | "visual-hierarchy"
  | "captions-overlay"
  | "audio-quality"
  | "brand-presence"
  | "tracking-readiness-ref";

export interface ReviewAxis {
  kind: ReviewAxisKind;
  label: string;
  question: string;
  weight: 1 | 2 | 3;
}

export interface AdReviewChecklist {
  axes: ReviewAxis[];
  totalWeight: number;
}

// ---- V5: Applied Ad Review (evaluates a target against the checklist) ----

export type FindingVerdict = "passed" | "partial" | "missing" | "unknown";

export interface AdReviewFinding {
  axis: ReviewAxisKind;
  verdict: FindingVerdict;
  evidence: string;          // 1 sentence on what was observed / inferred
  fix?: string;              // present when verdict !== "passed"
  weight: 1 | 2 | 3;          // mirrors the axis weight
  scoreContribution: number;  // 0..weight, integer
}

export interface AppliedAdReview {
  targetId: string;             // e.g. brief.id or concept id
  targetKind: "brief" | "concept";
  axes: ReviewAxis[];           // snapshot of the checklist used
  findings: AdReviewFinding[];
  totalScore: number;           // sum of scoreContribution
  maxScore: number;             // sum of axis weights
  scorePercent: number;         // 0..100 integer
  verdict: "ready" | "almost" | "not-ready";
}

// ---- V5: Ops/Data H1 — Journey Status ----

export type JourneyStage =
  | "strategy-drafted"
  | "creative-planned"
  | "tracking-ready"
  | "kpi-aligned"
  | "review-passed"
  | "ready-to-spend";

export type JourneyBlockerKind =
  | "tracking"
  | "kpi"
  | "review"
  | "creative"
  | "scope"
  | "asset"
  | "economics"
  | "forecast";

export interface JourneyBlocker {
  kind: JourneyBlockerKind;
  message: string;
  severity: "warning" | "blocker";
  // For traceability: which underlying check raised this blocker, when available.
  sourceCheck?: TrackingReadinessCheckKind | ReviewAxisKind | DiagnosisCategory;
}

export interface JourneyStatus {
  currentStage: JourneyStage;
  readyToSpend: boolean;
  blockers: JourneyBlocker[];   // severity === "blocker"
  warnings: JourneyBlocker[];   // severity === "warning"
  nextStep: string;
}

// ---- V6: H2 Execution / Ops — CTA Bank ----

export type CtaStyle =
  | "direct"
  | "curious"
  | "time-boxed"
  | "proof-led"
  | "low-pressure";

export type CtaSurface =
  | "meta-feed"
  | "meta-reels"
  | "tiktok"
  | "landing-primary"
  | "email";

export interface CtaVariant {
  style: CtaStyle;
  surface: CtaSurface;
  text: string;          // concise CTA copy, BigAd voice
  rationale: string;     // 1 sentence why this fits the surface + style
}

export interface CtaBank {
  variants: CtaVariant[];
}

// ---- V6: H2 — First-Frame Static Brief ----

export type StaticAdSize = "1:1" | "4:5" | "9:16";

export type StaticLayoutZone =
  | "top-band"
  | "hero"
  | "proof-strip"
  | "bottom-band"
  | "edge-badge";

export interface StaticLayoutPiece {
  zone: StaticLayoutZone;
  copy: string;          // BigAd voice, short
  visualNote: string;    // designer-facing
}

export interface StaticAdBrief {
  briefId: string;                  // matches CreatorBrief.id
  forAngle: string;
  size: StaticAdSize;
  headlineOverlay: string;          // primary line
  subOverlay: string;               // optional secondary line
  heroElement: string;              // focal visual description
  proofElement: string;             // proof artifact description
  ctaBadge: string;                 // text on the CTA chip
  layout: StaticLayoutPiece[];      // 3-5 zones
  visualHierarchy: string;          // 1 sentence reading order
  notes?: string;
}

// ---- V6: H2 — Creative QA Checklist ----

export type QaSeverity = "ok" | "warning" | "blocker";

export type QaRule =
  | "hook-clarity"
  | "proof-visibility"
  | "offer-visibility"
  | "cta-clarity"
  | "first-frame-clarity"
  | "format-coverage"
  | "runtime-coherence"
  | "one-variable-testing"
  | "visual-hierarchy"
  | "message-angle-alignment"
  | "audience-pain-present"
  | "differentiation-present";

export interface QaFinding {
  rule: QaRule;
  severity: QaSeverity;
  message: string;
  suggestion: string;
  source?: string;
}

export interface CreativeQA {
  scope: "all" | string;            // "all" for aggregate, briefId for per-brief
  findings: QaFinding[];
  blockerCount: number;
  warningCount: number;
}

// ---- V6: H2 — Editor Handoff Brief ----

export interface EditorHandoff {
  briefId: string;
  markdown: string;                 // self-contained handoff
  assetChecklist: string[];         // 4-8 bullets
}

// ---- Upstream creative-quality modules ----

// Audience Avatar Builder

export type AvatarObjectionKind =
  | "risk"
  | "price"
  | "fit"
  | "trust"
  | "timing"
  | "complexity"
  | "social";

export interface AvatarObjection {
  kind: AvatarObjectionKind;
  statement: string;          // the avatar's voice, paraphrased
  reframe: string;            // how the ad should answer it
}

export interface AudienceAvatar {
  id: string;                 // "avatar-1", "avatar-2", ...
  label: string;              // short human label
  buyingTrigger: string;      // 1 sentence: what tips them into buying now
  corePain: string;           // 1-2 sentences, paraphrased from input.audiencePain
  desiredOutcome: string;     // 1-2 sentences
  objections: AvatarObjection[];     // 3-4 objections
  failedAlternatives: string[];      // 2-4 short bullets
  emotionalLanguage: string[];       // 3-6 short phrases
  proofNeeded: string[];             // 2-4 proof types
  bestChannelAngle: string;          // 1 sentence: channel + framing
}

// Hook Pattern Library

export type HookPattern =
  | "pain-first"
  | "outcome-first"
  | "contrarian"
  | "proof-led"
  | "curiosity"
  | "comparison"
  | "mistake"
  | "before-after";

export interface HookLibraryItem {
  pattern: HookPattern;
  text: string;                  // concise hook copy
  awarenessFit: AwarenessStage[];
  avatarFit: string[];           // avatar ids
  riskNote: string;              // 1 sentence
}

export interface HookLibrary {
  items: HookLibraryItem[];     // 2-3 per pattern × 8 patterns
}

// Ad Concept Cards

export type ConceptFormatFit =
  | "static-1-1"
  | "static-4-5"
  | "static-9-16"
  | "video-9-16-short"
  | "video-9-16-medium"
  | "video-1-1"
  | "carousel";

export interface AdConceptCard {
  id: string;                     // "concept-1", ...
  name: string;                   // short concept name
  targetAvatarId: string;
  hook: HookLibraryItem;          // selected from library
  promise: string;                // 1 sentence
  proofAngle: string;             // 1 sentence
  offerTieIn: string;             // references an OfferRecommendation kind + framing
  visualIdea: string;             // 1-2 sentences, designer-facing
  formatFit: ConceptFormatFit[];  // 2-4 formats
  testHypothesis: string;         // 1 sentence
  nextVariantSuggestion: string;  // 1 sentence; matches one of the 5 VariantSpinner axes
}

// ---- Execution OS: Creative Testing Matrix --------------------------------

export type TestFunnelStage =
  | "prospecting"
  | "engagement-retargeting"
  | "site-retargeting";

export type TestFormat =
  | "video-9-16"
  | "video-1-1"
  | "static-1-1"
  | "static-4-5"
  | "static-9-16"
  | "carousel";

export interface KillRule {
  metric: KpiName;
  threshold: number;
  comparator: "below" | "above";
  afterSpend: number;
  rationale: string;
}

export interface ScaleRule {
  metric: KpiName;
  threshold: number;
  comparator: "above" | "below";
  afterSpend: number;
  action: "duplicate" | "raise-budget" | "broaden-audience" | "graduate-to-engaged";
  rationale: string;
}

export interface TestCell {
  id: string;                       // "test-1" ...
  conceptId: string;                // references AdConceptCard.id
  angle: string;                    // copy of the angle string for traceability
  avatarId: string;                 // references AudienceAvatar.id
  hook: string;                     // chosen hook text from hookLibrary
  proofAssetRequired: string | null;
  format: TestFormat;
  funnelStage: TestFunnelStage;
  audienceTier: string;             // e.g. "Cold broad" / "Engaged 60d"
  offer: OfferKind;
  primaryKpi: KpiName;
  secondaryKpi: KpiName;
  killRule: KillRule;
  scaleRule: ScaleRule;
  learningGoal: string;             // 1 sentence
  estimatedRunDays: number;         // integer
}

export interface TestingWarning {
  kind: "missing-proof" | "too-many-variables" | "no-retargeting-pool" | "tracking-blocker";
  message: string;
  source?: string;
}

export interface CreativeTestingMatrix {
  testCells: TestCell[];            // 3-12 cells; recommendedFirstBatch picks 3-6
  recommendedFirstBatch: string[];  // 3-6 test cell ids
  maxConcurrentTests: number;       // computed from inputs (default 6)
  testingWarnings: TestingWarning[];
}

// ---- Execution OS: Campaign Setup Builder ---------------------------------

export type CampaignObjective =
  | "awareness"
  | "traffic"
  | "engagement"
  | "leads"
  | "conversions"
  | "app-installs"
  | "sales";

export type BudgetMode = "campaign-budget" | "ad-set-budget";

export interface AdSetSpec {
  name: string;
  audienceTier: string;
  budgetSplit: string;
  inclusions: string[];
  exclusions: string[];
  placements: string[];
  optimizationEvent: string;
  ads: string[];
}

export interface CampaignSpec {
  name: string;                      // PRODUCT-FUNNEL-COUNTRY-CONCEPT-VARIANT
  objective: CampaignObjective;
  conversionEvent: string;
  budgetMode: BudgetMode;
  audienceArchitecture: CampaignArchitectureKind;
  adSets: AdSetSpec[];
  utmTemplate: string;
  reportingColumns: string[];
}

export interface PreLaunchChecklistItem {
  label: string;
  status: "passed" | "warning" | "blocker" | "unknown";
  source?: string;
}

export interface CampaignSetup {
  namingConvention: string;
  campaigns: CampaignSpec[];
  preLaunchChecklist: PreLaunchChecklistItem[];
}

// ---- Execution OS: Next Iteration Planner ---------------------------------

export type WeakSignal =
  | "winning"
  | "weak-hook"
  | "weak-hold"
  | "weak-click"
  | "weak-conversion"
  | "weak-roas"
  | "proof-bottleneck";

export interface IterationRecommendation {
  signal: WeakSignal;
  diagnosis: string;
  nextSteps: string[];
  nextAssetsToProduce: string[];
  nextAnglesToTry: string[];
}

export interface NextIterationPlan {
  recommendations: IterationRecommendation[];
  nextAssetsToProduce: string[];
  nextAnglesToTry: string[];
}
