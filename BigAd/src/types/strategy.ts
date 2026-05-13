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

export interface Angle {
  name: string;
  hook: string;
  rationale: string;
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

export interface Strategy {
  positioning: Positioning;
  awarenessNotes: string[];
  sophisticationNotes: string[];
  centralPromise: string;
  uniqueMechanism: string;
  objections: { objection: string; reply: string }[];
  headlines: string[];
  angles: Angle[];
  landing: LandingCopy;
  store: StoreCopy;
  tiktokScripts: ShortScript[];
  facebookAds: FacebookAdConcept[];
  experiments: Experiment[];
}
