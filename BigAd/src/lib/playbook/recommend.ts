// recommend.ts — pure deterministic playbook recommendation engine.
//
// `recommendPlaybooks(input, strategy, agencySelection?)` reads a
// frozen scoring function over every playbook in the catalog and emits
// a `PlaybookRecommendation` carrying the ranked fit-scores plus the
// "why it fits" / "why it may not fit" surface.
//
// Engine purity: this function reads strategy + input as INPUTS to a
// derived function. It never mutates either and never calls back into
// the deterministic engine. `derivedAt` is the max of caller-supplied
// timestamps — never `Date.now()`.

import type { ProductInput, Strategy } from "@/types/strategy";
import type { AgencySelection, ProjectTemplateId } from "@/types/agency";
import type {
  Playbook,
  PlaybookBusinessModel,
  PlaybookCampaignType,
  PlaybookChannel,
  PlaybookFitScore,
  PlaybookId,
  PlaybookRecommendation,
  PlaybookSophistication,
} from "@/types/playbook";
import { PLAYBOOKS, listPlaybooks } from "./catalog";

// ---- Input mapping helpers --------------------------------------------

// ProductInput.businessModel is the engine's coarse type
// (subscription | one-time | freemium | marketplace | ads | services |
// other). Map it to the Playbook business-model dimension. Categories
// that the user inputs (e.g. "dating app") refine the mapping.
function mapBusinessModel(
  input: ProductInput
): PlaybookBusinessModel | undefined {
  const bm = input.businessModel;
  const category = (input.category || "").toLowerCase();
  // Heuristic mapping: be conservative — many products straddle these.
  if (bm === "subscription" || bm === "freemium") {
    if (
      category.includes("app") ||
      category.includes("mobile") ||
      category.includes("dating")
    ) {
      return "subscription-app";
    }
    // Subscription web products → saas by default.
    return "saas";
  }
  if (bm === "one-time") {
    // Creator-led drops use one-time pricing too. When the category or
    // description signals a creator-led product, prefer creator-product
    // so the playbook recommender can lock on it.
    const haystack = (
      (input.category || "") +
      " " +
      (input.description || "")
    ).toLowerCase();
    if (
      haystack.includes("creator-led") ||
      haystack.includes("creator led") ||
      haystack.includes("creator drop") ||
      haystack.includes(" creator ") ||
      haystack.startsWith("creator ")
    ) {
      return "creator-product";
    }
    return "ecommerce";
  }
  if (bm === "services") {
    if (category.includes("local") || category.includes("service")) {
      return "local-service";
    }
    return "b2b-services";
  }
  if (bm === "marketplace" || bm === "ads" || bm === "other") {
    // No confident mapping — leave undefined so playbooks score on the
    // remaining dimensions.
    return undefined;
  }
  return undefined;
}

function mapCampaignType(
  input: ProductInput
): PlaybookCampaignType | undefined {
  switch (input.campaignType) {
    case "launch":
      return "launch";
    case "seasonal":
      return "seasonal";
    case "always-on":
      return "always-on";
    default:
      return undefined;
  }
}

function mapSophistication(
  input: ProductInput
): PlaybookSophistication | undefined {
  switch (input.sophistication) {
    case "fresh-market":
      return "green-market";
    case "simple-claims":
    case "amplified-claims":
      return "competitive-market";
    case "skeptical-market":
      return "skeptical-market";
    case "mature-market":
      return "mature-market";
    default:
      return undefined;
  }
}

// Derive a category hint from input. Used for the category-coherence
// bonus.
function categoryHint(input: ProductInput): string | undefined {
  const ct = input.campaignType;
  const bm = mapBusinessModel(input);
  if (bm === "ecommerce" && ct === "seasonal") return "seasonal";
  if (bm === "local-service") return "leadgen";
  if (
    (bm === "subscription-app" || bm === "saas" || bm === "creator-product") &&
    ct === "launch"
  ) {
    return "launch";
  }
  if (bm === "b2b-services") return "service";
  if (bm === "ecommerce") return "always-on"; // covers evergreen e-com
  if (ct === "always-on") return "always-on";
  if (ct === "launch") return "launch";
  return undefined;
}

// ProductInput field presence — coarse check used for requiredInputs.
// All fields on ProductInput are strings or optional objects; treat
// non-empty / present-with-content as "present".
function isInputFieldPresent(input: ProductInput, field: string): boolean {
  switch (field) {
    case "name":
    case "category":
    case "description":
    case "price":
    case "audience":
    case "audiencePain":
    case "competitors":
    case "differentiator":
    case "goal":
      return typeof input[field] === "string" && input[field].trim().length > 0;
    case "businessModel":
    case "awareness":
    case "sophistication":
      return typeof input[field] === "string" && input[field].length > 0;
    case "campaignType":
      return typeof input.campaignType === "string" && input.campaignType.length > 0;
    case "offerContext":
      return !!input.offerContext;
    case "corePain":
      // Alias used in some playbook required-input lists.
      return (
        typeof input.audiencePain === "string" &&
        input.audiencePain.trim().length > 0
      );
    default:
      return false;
  }
}

// Channel signal in input — does the input mention any of the playbook's
// channels in audience / goal / description / competitors? Used for the
// channel-fit bonus.
function channelOverlap(
  input: ProductInput,
  channels: PlaybookChannel[]
): number {
  const haystack = [
    input.audience,
    input.goal,
    input.description,
    input.competitors,
    input.category,
  ]
    .join(" ")
    .toLowerCase();
  if (!haystack.trim()) return 0;
  let overlap = 0;
  const probes: Record<PlaybookChannel, string[]> = {
    meta: ["meta", "facebook", "instagram", "ig "],
    tiktok: ["tiktok", "tik tok"],
    youtube: ["youtube", "yt "],
    "google-search": ["google search", "search ads", "adwords"],
    "google-pmax": ["pmax", "performance max"],
    reddit: ["reddit"],
    linkedin: ["linkedin"],
    x: [" x ", "twitter"],
    email: ["email", "newsletter"],
    "organic-social": ["organic social", "organic reach"],
  };
  for (const channel of channels) {
    if (probes[channel].some((p) => haystack.includes(p))) {
      overlap += 1;
    }
  }
  return overlap;
}

// Anti-fit signal: retargeting-rescue requires an existing retargeting
// pool. We approximate the pool from the strategy's campaignSetup —
// when no retargeting campaign is configured AND the input does not
// signal an existing pool, the anti-fit fires.
function hasRetargetingFootprint(strategy: Strategy): boolean {
  const setup = strategy.campaignSetup;
  if (!setup || !Array.isArray(setup.campaigns)) return false;
  return setup.campaigns.some((c) => {
    const name = (c.name || "").toLowerCase();
    if (name.includes("retarget") || name.includes("rmkt")) return true;
    return c.adSets.some((s) =>
      ["engagement-retargeting", "site-retargeting"].some((t) =>
        (s.audienceTier || "").toLowerCase().includes(t.split("-")[0])
      )
    );
  });
}

// Agency template → playbook nudge map.
const AGENCY_TEMPLATE_TO_PLAYBOOK: Partial<
  Record<ProjectTemplateId, PlaybookId>
> = {
  "app-launch": "mobile-app-launch",
  "ecommerce-seasonal": "ecommerce-seasonal-promo",
  "saas-evergreen": "saas-free-trial-launch",
  "local-service-leadgen": "local-service-leadgen",
  "creator-product-launch": "creator-product-drop",
};

// ---- Scoring ---------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function scorePlaybook(
  playbook: Playbook,
  input: ProductInput,
  strategy: Strategy,
  agencySelection: AgencySelection | undefined
): PlaybookFitScore {
  let score = 0;
  const reasons: string[] = [];
  const mismatches: string[] = [];
  const missingInputs: string[] = [];

  // businessModel match — +25
  const bm = mapBusinessModel(input);
  if (bm && playbook.businessModels.includes(bm)) {
    score += 25;
    reasons.push(`matches ${bm} business model`);
  } else if (bm) {
    mismatches.push(`built for ${playbook.businessModels.join(" / ")}, not ${bm}`);
  }

  // campaignType match — +15
  const ct = mapCampaignType(input);
  if (ct && playbook.campaignTypes.includes(ct)) {
    score += 15;
    reasons.push(`fits ${ct} campaign cadence`);
  } else if (ct) {
    mismatches.push(
      `prefers ${playbook.campaignTypes.join(" / ")} cadence, not ${ct}`
    );
  }

  // awarenessStage match — +10
  if (input.awareness && playbook.awarenessStages.includes(input.awareness)) {
    score += 10;
    reasons.push(`tuned for ${input.awareness} audiences`);
  } else if (input.awareness) {
    mismatches.push(
      `expects ${playbook.awarenessStages.join(" / ")} awareness, got ${input.awareness}`
    );
  }

  // sophistication match — +8 / -5 / 0
  const soph = mapSophistication(input);
  if (playbook.sophistication && playbook.sophistication.length > 0) {
    if (soph && playbook.sophistication.includes(soph)) {
      score += 8;
      reasons.push(`built for ${soph} sophistication`);
    } else if (soph) {
      score -= 5;
      mismatches.push(
        `expects ${playbook.sophistication.join(" / ")} sophistication, got ${soph}`
      );
    }
  }

  // category coherence — +10
  const hint = categoryHint(input);
  if (hint && hint === playbook.category) {
    score += 10;
    reasons.push(`category hint ${hint} aligns with playbook category`);
  }

  // channel fit — +3 per overlap, cap +9
  const overlap = channelOverlap(input, playbook.channels);
  if (overlap > 0) {
    const bonus = Math.min(overlap * 3, 9);
    score += bonus;
    reasons.push(`input names ${overlap} target channel${overlap === 1 ? "" : "s"} this playbook uses`);
  }

  // proof readiness alignment — +5
  const proofScore = strategy.proofAssetPlan?.proofReadinessScore ?? 100;
  if (proofScore < 50 && playbook.proofRequirements.length >= 4) {
    score += 5;
    reasons.push("low proof readiness — this playbook front-loads proof capture");
  }

  // tracking readiness alignment — +5
  const trackingScore = strategy.trackingReadiness?.score ?? 100;
  const trackingInGates = playbook.launchGates.some((g) =>
    g.toLowerCase().includes("tracking")
  );
  if (trackingScore < 70 && trackingInGates) {
    score += 5;
    reasons.push("low tracking readiness — this playbook gates on tracking");
  }

  // required inputs present — +2 per present, cap +10
  let presentCount = 0;
  for (const field of playbook.requiredInputs) {
    if (isInputFieldPresent(input, field)) {
      presentCount += 1;
    } else {
      missingInputs.push(field);
    }
  }
  const inputBonus = Math.min(presentCount * 2, 10);
  if (inputBonus > 0) {
    score += inputBonus;
    reasons.push(`${presentCount} of ${playbook.requiredInputs.length} required inputs are present`);
  }

  // anti-fit: retargeting-rescue without a pool. Encoded deterministically.
  if (playbook.id === "retargeting-rescue") {
    if (!hasRetargetingFootprint(strategy)) {
      score -= 20;
      mismatches.push(
        "no retargeting campaign configured — rescue playbook needs an existing pool"
      );
    }
  }

  // agency selection nudge — +5
  if (agencySelection?.templateId) {
    const preferred = AGENCY_TEMPLATE_TO_PLAYBOOK[agencySelection.templateId];
    if (preferred === playbook.id) {
      score += 5;
      reasons.push(
        `agency template '${agencySelection.templateId}' nominates this playbook`
      );
    }
  }

  return {
    playbookId: playbook.id,
    score: clamp(score, 0, 100),
    reasons: reasons.slice(0, 5),
    mismatches: mismatches.slice(0, 5),
    missingInputs: missingInputs.slice(0, 5),
  };
}

// ---- derivedAt --------------------------------------------------------

// We never call Date.now(). Read deterministic timestamps from strategy
// and input when present. If neither carries one, fall back to 0.
function buildDerivedAt(input: ProductInput, strategy: Strategy): number {
  let derivedAt = 0;
  const sgen = (strategy as { generatedAt?: number }).generatedAt;
  if (typeof sgen === "number" && sgen > derivedAt) {
    derivedAt = sgen;
  }
  const igen = (input as { generatedAt?: number }).generatedAt;
  if (typeof igen === "number" && igen > derivedAt) {
    derivedAt = igen;
  }
  return derivedAt;
}

// ---- Public entry ----------------------------------------------------

export function recommendPlaybooks(
  input: ProductInput,
  strategy: Strategy,
  agencySelection?: AgencySelection
): PlaybookRecommendation {
  const all = listPlaybooks();
  const ranked: PlaybookFitScore[] = all
    .map((p) => scorePlaybook(p, input, strategy, agencySelection))
    // Stable sort: higher score first, then by id ascending.
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.playbookId < b.playbookId ? -1 : a.playbookId > b.playbookId ? 1 : 0;
    });

  const top = ranked[0];
  const topPlaybook =
    top && top.score > 0 ? PLAYBOOKS[top.playbookId] : undefined;
  const topScore = top && top.score > 0 ? top : undefined;

  const whyItFits = topScore ? topScore.reasons.slice(0, 5) : [];
  const whyItMayNotFit = topScore
    ? [...topScore.mismatches, ...topScore.missingInputs].slice(0, 3)
    : [];

  return {
    topPlaybook,
    topScore,
    ranked,
    whyItFits,
    whyItMayNotFit,
    derivedAt: buildDerivedAt(input, strategy),
  };
}
