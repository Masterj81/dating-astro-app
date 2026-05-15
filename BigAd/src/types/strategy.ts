// Core domain types for BigAd.
// These types describe the input the user fills in and the strategy
// output the deterministic engine produces.

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

export interface CampaignWindow {
  kind: CampaignWindowKind;
  label: string;
  startOffsetDays: number; // relative to campaign anchor (0 = anchor day)
  durationDays: number;
  primaryKPI: string; // e.g. "CTR > 1.2%", "CPA <= $24"
  readinessGate: string; // pre-condition before this window can start
  recommendedOfferKind: OfferKind | null;
  expectedDip: boolean; // forecasted soft window
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

  exportBrief: string;
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
