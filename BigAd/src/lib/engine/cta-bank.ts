// cta-bank.ts — CTA Bank.
//
// Deterministic generator that emits a bank of concise CTA variants
// across five styles (direct / curious / time-boxed / proof-led /
// low-pressure) and five surfaces (meta-feed / meta-reels / tiktok /
// landing-primary / email). Each variant is short, surface-appropriate,
// and seeded from the product inputs + top offer. No randomness, no
// external data, no API calls.

import type {
  CampaignType,
  CtaBank,
  CtaStyle,
  CtaSurface,
  CtaVariant,
  OfferRecommendation,
  ProductInput,
} from "@/types/strategy";
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

const STYLES: CtaStyle[] = [
  "direct",
  "curious",
  "time-boxed",
  "proof-led",
  "low-pressure",
];

const SURFACES: CtaSurface[] = [
  "meta-feed",
  "meta-reels",
  "tiktok",
  "landing-primary",
  "email",
];

// Per-surface maximum word counts. Reels and TikTok are ultra-short.
const MAX_WORDS_BY_SURFACE: Record<CtaSurface, number> = {
  "meta-feed": 10,
  "meta-reels": 7,
  tiktok: 7,
  "landing-primary": 8,
  email: 10,
};

interface BuildCtx {
  productNoun: string;
  category: string;
  audience: string;
  pain: string;
  productName: string;
  topOfferKind: string;       // e.g. "free-trial", "guarantee"
  campaign: CampaignType;
  labels: CopyLabels;
}

export function buildCtaBank(
  input: ProductInput,
  offers: OfferRecommendation[],
  campaignType: CampaignType | undefined,
  labels?: CopyLabels
): CtaBank {
  const resolved = labels ?? deriveCopyLabels(input, offers);
  const ctx: BuildCtx = {
    productNoun: nounFromCategory(input.category) || "this",
    category: resolved.categoryLabel,
    audience: resolved.audienceLabel,
    pain: resolved.painLabel,
    productName: input.name || "this product",
    topOfferKind: offers[0]?.kind ?? "",
    campaign: campaignType ?? "always-on",
    labels: resolved,
  };

  const variants: CtaVariant[] = [];

  for (const style of STYLES) {
    for (const surface of SURFACES) {
      const built = buildVariant(style, surface, ctx);
      if (!built) continue;
      // Trim and final sanity — drop variants that are not concise enough.
      const wordCount = built.text.trim().split(/\s+/).length;
      if (wordCount > MAX_WORDS_BY_SURFACE[surface]) continue;
      if (built.text.length < 2) continue;
      variants.push(built);
    }
  }

  return { variants };
}

function buildVariant(
  style: CtaStyle,
  surface: CtaSurface,
  ctx: BuildCtx
): CtaVariant | null {
  const text = composeText(style, surface, ctx);
  if (!text) return null;
  const rationale = composeRationale(style, surface, ctx);
  return { style, surface, text, rationale };
}

// ---- Text composition (style × surface) -----------------------------------

function composeText(
  style: CtaStyle,
  surface: CtaSurface,
  ctx: BuildCtx
): string | null {
  switch (style) {
    case "direct":
      return directText(surface, ctx);
    case "curious":
      return curiousText(surface, ctx);
    case "time-boxed":
      return timeBoxedText(surface, ctx);
    case "proof-led":
      return proofLedText(surface, ctx);
    case "low-pressure":
      return lowPressureText(surface, ctx);
  }
}

function directText(surface: CtaSurface, ctx: BuildCtx): string | null {
  // Direct = imperative + outcome. Short verb + named outcome.
  switch (surface) {
    case "meta-feed":
      return tidy(`Try ${ctx.productName} today.`);
    case "meta-reels":
      return tidy(`Tap to try ${ctx.productName}.`);
    case "tiktok":
      return tidy(`Try ${ctx.productName} now.`);
    case "landing-primary":
      return tidy(`Start with ${ctx.productName}`);
    case "email":
      return tidy(`Open ${ctx.productName} and start today.`);
  }
}

function curiousText(surface: CtaSurface, ctx: BuildCtx): string | null {
  // Curious = open question or "see why X".
  switch (surface) {
    case "meta-feed":
      return tidy(`See why ${ctx.productName} feels different.`);
    case "meta-reels":
      return tidy(`Curious? See ${ctx.productName}.`);
    case "tiktok":
      return tidy(`See what changed.`);
    case "landing-primary":
      return tidy(`See how it works`);
    case "email":
      return tidy(`What if ${ctx.category} didn't feel the same?`);
  }
}

function timeBoxedText(surface: CtaSurface, ctx: BuildCtx): string | null {
  // Time-boxed = explicit window.
  const window = ctx.campaign === "launch"
    ? "today"
    : ctx.campaign === "seasonal"
    ? "this week"
    : "today";
  switch (surface) {
    case "meta-feed":
      return tidy(`Try ${ctx.productName} ${window}.`);
    case "meta-reels":
      return tidy(`Try it ${window}.`);
    case "tiktok":
      return tidy(`Start ${window}.`);
    case "landing-primary":
      return tidy(`Start ${window}`);
    case "email":
      return tidy(`Open it ${window} — the window closes soon.`);
  }
}

function proofLedText(surface: CtaSurface, ctx: BuildCtx): string | null {
  // Proof-led = number + verb. Without invented metrics we anchor on
  // a generic durability cue ("in one screen", "in five minutes").
  switch (surface) {
    case "meta-feed":
      return tidy(`Decide in five minutes.`);
    case "meta-reels":
      return tidy(`See it in 30s.`);
    case "tiktok":
      return tidy(`See it in 30s.`);
    case "landing-primary":
      return tidy(`See it in one screen`);
    case "email":
      return tidy(`Open it. Five minutes to decide.`);
  }
}

function lowPressureText(surface: CtaSurface, ctx: BuildCtx): string | null {
  // Low-pressure = "if it fits", "no pressure".
  switch (surface) {
    case "meta-feed":
      return tidy(`Have a look — no pressure.`);
    case "meta-reels":
      return tidy(`Worth a look.`);
    case "tiktok":
      return tidy(`Worth a look.`);
    case "landing-primary":
      return tidy(`Browse — no signup wall`);
    case "email":
      return tidy(`If it fits, ${ctx.productName} is here.`);
  }
}

// ---- Rationales -----------------------------------------------------------

function composeRationale(
  style: CtaStyle,
  surface: CtaSurface,
  ctx: BuildCtx
): string {
  const styleNote = STYLE_RATIONALE[style];
  const surfaceNote = SURFACE_RATIONALE[surface];
  return `${styleNote} ${surfaceNote}`;
}

const STYLE_RATIONALE: Record<CtaStyle, string> = {
  direct:
    "Imperative-plus-outcome framing works hardest on warm traffic that already knows the category.",
  curious:
    "An open question or 'see why' lift earns the click on cold traffic without making a claim.",
  "time-boxed":
    "A named window converts viewers who would otherwise file the ad away to never re-open it.",
  "proof-led":
    "Anchoring on time-to-evaluate ('five minutes', 'one screen') reads as proof of low friction.",
  "low-pressure":
    "A no-pressure ask suits considered purchases and skeptical markets where push framing back-fires.",
};

const SURFACE_RATIONALE: Record<CtaSurface, string> = {
  "meta-feed":
    "Meta feed CTAs read as headlines, so the verb and the outcome both land in one scan.",
  "meta-reels":
    "Reels CTAs ride the vertical-tap idiom — shorter than feed, anchored on tap-to-engage.",
  tiktok:
    "TikTok CTAs are spoken or overlaid in under a second, so single verbs hit hardest.",
  "landing-primary":
    "Landing buttons should describe the next action in page-button form, never a sentence.",
  email:
    "Email CTAs are read between other tasks — one sentence carries enough context to commit.",
};

// ---- Helpers --------------------------------------------------------------

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function nounFromCategory(category: string): string {
  return (category || "").trim().split(/\s+/).slice(-1)[0] || "";
}
