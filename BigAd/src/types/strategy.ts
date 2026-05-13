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
  exportBrief: string;
}
