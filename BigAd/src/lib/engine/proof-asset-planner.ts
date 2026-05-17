// proof-asset-planner.ts — Proof Asset Planner.
//
// Reads avatar `proofNeeded`, concept `proofAngle`, the offer set, and
// the diagnosis `missingProof` signal, and emits a concrete, ranked
// plan of proof assets the operator should capture before spend.
// Deterministic: same inputs always produce the same plan.
//
// The output is ordered:
//   1. must-have priority assets first
//   2. should-have second
//   3. nice-to-have third
// `minimumProofSet` and `missingBeforeSpend` are deterministic
// subsets of the priority list. The MVP assumes nothing is captured
// yet, so the readiness score is the "starting score" against an
// idealised target — operators can later capture the assets and the
// score will move.

import type {
  AdConceptCard,
  AudienceAvatar,
  AvatarObjection,
  OfferDiagnosis,
  OfferRecommendation,
  PlannedProofAsset,
  ProductInput,
  ProofAssetPlan,
  ProofAssetType,
} from "@/types/strategy";

// ---- Public --------------------------------------------------------------

export interface ProofAssetPlannerArgs {
  input: ProductInput;
  audienceAvatars: AudienceAvatar[];
  adConceptCards: AdConceptCard[];
  offers: OfferRecommendation[];
  diagnosis: OfferDiagnosis | undefined;
}

export function buildProofAssetPlan(args: ProofAssetPlannerArgs): ProofAssetPlan {
  const { input, audienceAvatars, adConceptCards } = args;

  const shape = classifyShape(input);
  const skepticalMix = isSkepticalMix(input, audienceAvatars);

  // Build the asset templates based on the product shape.
  const templates = shapeTemplates(shape, skepticalMix);

  // Walk avatars and concepts to find objections each asset can
  // reference. Each template is matched to the strongest objection
  // statement when one exists.
  const objectionPool = collectObjections(audienceAvatars);
  const conceptPool = collectConceptHints(adConceptCards);

  const priorityAssets: PlannedProofAsset[] = templates.map((tpl, i) => {
    const id = `proof-${i + 1}`;
    const relatedObjection = pickRelatedObjection(tpl.type, objectionPool);
    const captureInstructions = buildCaptureInstructions(
      tpl.type,
      input,
      conceptPool
    );
    const whyItMatters = buildWhyItMatters(tpl.type, input, audienceAvatars);
    const title = buildTitle(tpl.type, input);
    return {
      id,
      type: tpl.type,
      priority: tpl.priority,
      title,
      whyItMatters,
      captureInstructions,
      whereToUse: tpl.whereToUse.slice(),
      relatedObjection,
      readinessImpact: tpl.readinessImpact,
    };
  });

  // Sort: must-have > should-have > nice-to-have. Preserve original
  // order within each bucket for determinism.
  const priorityOrder: Record<PlannedProofAsset["priority"], number> = {
    "must-have": 0,
    "should-have": 1,
    "nice-to-have": 2,
  };
  priorityAssets.sort((a, b) => {
    const pa = priorityOrder[a.priority];
    const pb = priorityOrder[b.priority];
    if (pa !== pb) return pa - pb;
    return 0;
  });

  // Renumber ids after sort so "proof-1" is always the top must-have.
  priorityAssets.forEach((p, i) => {
    p.id = `proof-${i + 1}`;
  });

  const minimumProofSet = priorityAssets
    .filter((p) => p.priority === "must-have")
    .map((p) => p.id);

  // MVP: nothing is captured yet, so every must-have is missing.
  const missingBeforeSpend = minimumProofSet.slice();

  // Readiness score: every must-have's impact represents a hole until
  // captured. Start at 100 and subtract the sum of missing must-have
  // impacts; clamp to [0,100].
  const missingImpact = priorityAssets
    .filter((p) => p.priority === "must-have")
    .reduce((sum, p) => sum + p.readinessImpact, 0);
  let proofReadinessScore = 100 - missingImpact;
  if (proofReadinessScore < 0) proofReadinessScore = 0;
  if (proofReadinessScore > 100) proofReadinessScore = 100;

  return {
    priorityAssets,
    minimumProofSet,
    missingBeforeSpend,
    proofReadinessScore,
  };
}

// ---- Shape classification ------------------------------------------------

type Shape = "astro-shaped" | "heirloom-shaped" | "b2b-shaped" | "generic";

function classifyShape(input: ProductInput): Shape {
  const cat = (input.category || "").toLowerCase();
  const desc = (input.description || "").toLowerCase();
  const model = input.businessModel;
  const blob = `${cat} ${desc}`;

  // AstroDating-shape: dating / astrology / matching subscription/freemium.
  const datingHints =
    /(dating|astrology|swipe|matching|synastry|chart|relationship)/.test(blob);
  if (
    datingHints &&
    (model === "subscription" || model === "freemium")
  ) {
    return "astro-shaped";
  }
  // HeirloomBrew-shape: one-time physical product.
  if (
    (model === "one-time" || model === "marketplace") &&
    /(coffee|wine|tea|food|beverage|skincare|fragrance|origin|farm|roast|brew|craft|artisan)/.test(
      blob
    )
  ) {
    return "heirloom-shaped";
  }
  // B2B-ish: services, ads, writing tool / CRM / project mgmt / dev tool.
  if (
    model === "services" ||
    model === "ads" ||
    /(crm|project|saas|enterprise|b2b|workflow|api|sdk|writing|fiction|developer|designer|operator)/.test(
      blob
    )
  ) {
    return "b2b-shaped";
  }
  return "generic";
}

function isSkepticalMix(
  input: ProductInput,
  avatars: AudienceAvatar[]
): boolean {
  if (
    input.sophistication === "skeptical-market" ||
    input.sophistication === "mature-market"
  ) {
    return true;
  }
  // If any avatar's proofNeeded mentions "case study" / "demo" / "quote",
  // treat it as a skeptical mix.
  const hasHardProof = avatars.some((av) =>
    av.proofNeeded.some((p) =>
      /(case\s+study|customer\s+quote|demo|before[-/\s]?after)/i.test(p)
    )
  );
  return hasHardProof;
}

// ---- Asset templates per shape -------------------------------------------

interface AssetTemplate {
  type: ProofAssetType;
  priority: PlannedProofAsset["priority"];
  whereToUse: string[];
  readinessImpact: number;
}

function shapeTemplates(shape: Shape, skepticalMix: boolean): AssetTemplate[] {
  switch (shape) {
    case "astro-shaped":
      return [
        {
          type: "screenshot",
          priority: "must-have",
          whereToUse: ["landing-hero", "static-1-1", "video-9-16"],
          readinessImpact: skepticalMix ? 18 : 15,
        },
        {
          type: "screenshot",
          priority: "must-have",
          whereToUse: ["static-4-5", "video-9-16-medium"],
          readinessImpact: skepticalMix ? 16 : 14,
        },
        {
          type: "demo-video",
          priority: "must-have",
          whereToUse: ["landing-hero", "store-listing"],
          readinessImpact: skepticalMix ? 20 : 16,
        },
        {
          type: "demo-video",
          priority: "should-have",
          whereToUse: ["static-9-16", "video-9-16-short"],
          readinessImpact: 10,
        },
        {
          type: "customer-quote",
          priority: "should-have",
          whereToUse: ["landing-mid", "static-4-5"],
          readinessImpact: 12,
        },
        {
          type: "before-after",
          priority: "nice-to-have",
          whereToUse: ["video-9-16-medium"],
          readinessImpact: 7,
        },
      ];
    case "heirloom-shaped":
      return [
        {
          type: "founder-story",
          priority: "must-have",
          whereToUse: ["landing-hero", "video-9-16-medium"],
          readinessImpact: 18,
        },
        {
          type: "before-after",
          priority: "must-have",
          whereToUse: ["static-1-1", "video-9-16-medium"],
          readinessImpact: 16,
        },
        {
          type: "customer-quote",
          priority: skepticalMix ? "must-have" : "should-have",
          whereToUse: ["landing-mid", "static-4-5"],
          readinessImpact: skepticalMix ? 15 : 11,
        },
        {
          type: "case-study",
          priority: "should-have",
          whereToUse: ["landing-mid", "email"],
          readinessImpact: 10,
        },
        {
          type: "app-store-review",
          priority: "nice-to-have",
          whereToUse: ["landing-mid"],
          readinessImpact: 5,
        },
      ];
    case "b2b-shaped":
      return [
        {
          type: "demo-video",
          priority: "must-have",
          whereToUse: ["landing-hero", "video-1-1"],
          readinessImpact: 18,
        },
        {
          type: "case-study",
          priority: "must-have",
          whereToUse: ["landing-mid", "email"],
          readinessImpact: 17,
        },
        {
          type: "founder-story",
          priority: "should-have",
          whereToUse: ["landing-hero", "video-9-16-medium"],
          readinessImpact: 10,
        },
        {
          type: "customer-quote",
          priority: "should-have",
          whereToUse: ["landing-mid", "static-4-5"],
          readinessImpact: 9,
        },
        {
          type: "screenshot",
          priority: "should-have",
          whereToUse: ["static-1-1", "video-1-1"],
          readinessImpact: 8,
        },
      ];
    case "generic":
    default:
      return [
        {
          type: "demo-video",
          priority: "must-have",
          whereToUse: ["landing-hero", "video-9-16"],
          readinessImpact: 16,
        },
        {
          type: "screenshot",
          priority: "must-have",
          whereToUse: ["static-1-1", "static-4-5"],
          readinessImpact: 14,
        },
        {
          type: "customer-quote",
          priority: "should-have",
          whereToUse: ["landing-mid", "static-4-5"],
          readinessImpact: 10,
        },
        {
          type: "before-after",
          priority: "nice-to-have",
          whereToUse: ["video-9-16-medium"],
          readinessImpact: 6,
        },
      ];
  }
}

// ---- Per-asset copy builders ---------------------------------------------

function buildTitle(type: ProofAssetType, input: ProductInput): string {
  const product = (input.name || "the product").trim() || "the product";
  switch (type) {
    case "screenshot":
      return `Screenshot of ${product}'s core view`;
    case "demo-video":
      return `90-second ${product} demo video`;
    case "customer-quote":
      return `One-sentence customer quote about ${product}`;
    case "before-after":
      return `Before / after of the ${product} experience`;
    case "case-study":
      return `Named case study from a ${product} user`;
    case "app-store-review":
      return `Surfaced app-store review for ${product}`;
    case "founder-story":
      return `Founder story behind ${product}`;
  }
}

function buildWhyItMatters(
  type: ProofAssetType,
  input: ProductInput,
  avatars: AudienceAvatar[]
): string {
  const audience = avatars[0]?.label?.toLowerCase() || "the audience";
  const product = input.name || "the product";
  switch (type) {
    case "screenshot":
      return `${audience} need to see the mechanism on a real screen — a screenshot lets them validate the claim without leaving the page.`;
    case "demo-video":
      return `A short demo answers the "show me the thing" objection in seconds, before any voiceover has to convince anyone.`;
    case "customer-quote":
      return `${audience} discount asserted claims — a named quote from a peer carries weight the brand can't carry alone.`;
    case "before-after":
      return `A before / after frame names the pain and the relief in the same beat, which is how problem-aware buyers prefer to hear it.`;
    case "case-study":
      return `A named case study moves the claim from "this could work" to "this worked for a real user" — the single strongest proof in a skeptical market.`;
    case "app-store-review":
      return `Most-aware buyers check ratings before signing up — a recent review surfaced in the ad shortens the consideration loop.`;
    case "founder-story":
      return `In a market where every brand sounds the same, a founder story signals stance — buyers learn whether ${product} is for people like them.`;
  }
}

function buildCaptureInstructions(
  type: ProofAssetType,
  input: ProductInput,
  conceptHints: ConceptHints
): string {
  const product = input.name || "the product";
  switch (type) {
    case "screenshot":
      return `Capture the single most distinctive screen — the one that shows ${conceptHints.mechanismHint} on a fresh account. Use the default theme, no debug overlays.`;
    case "demo-video":
      return `Record a 90s screen capture from app open to first ${conceptHints.outcomeHint} on a fresh account. No music, captions on, mobile aspect.`;
    case "customer-quote":
      return `Ask three recent ${product} users to send one sentence describing what changed. Pick the quote that names a concrete failure mode of the old way.`;
    case "before-after":
      return `Frame one beat of the old workflow next to one beat of the ${product} workflow. Keep the comparison literal, not metaphorical.`;
    case "case-study":
      return `Pick one named user with a measurable result. Write three sentences: starting state, what changed, outcome — no marketing language.`;
    case "app-store-review":
      return `Surface a recent 4 or 5-star review that names a specific moment of value. Avoid generic "love it" reviews — they don't move objections.`;
    case "founder-story":
      return `Record a 60s talking-head explaining why ${product} exists and what was wrong with the alternatives. First person, no slides.`;
  }
}

// Concept hints — read the AdConceptCards once and pull out a
// product-specific noun for the mechanism and the outcome so the
// capture instructions can mention something real.
interface ConceptHints {
  mechanismHint: string;
  outcomeHint: string;
}

function collectConceptHints(cards: AdConceptCard[]): ConceptHints {
  const mech = cards
    .map((c) => c.proofAngle)
    .find((s) => typeof s === "string" && s.length > 0);
  const outcome = cards
    .map((c) => c.promise)
    .find((s) => typeof s === "string" && s.length > 0);
  return {
    mechanismHint: shortNounish(mech) || "the core mechanism",
    outcomeHint: shortNounish(outcome) || "the first useful result",
  };
}

function shortNounish(s: string | undefined): string {
  if (!s) return "";
  // Take first 6 words to keep instructions tight.
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 6) return words.join(" ");
  return words.slice(0, 6).join(" ");
}

// ---- Objection mapping ---------------------------------------------------

function collectObjections(avatars: AudienceAvatar[]): AvatarObjection[] {
  const out: AvatarObjection[] = [];
  for (const av of avatars) {
    for (const o of av.objections) {
      out.push(o);
    }
  }
  return out;
}

function pickRelatedObjection(
  type: ProofAssetType,
  pool: AvatarObjection[]
): string | undefined {
  // Each proof type pairs naturally with one or two objection kinds.
  const preferredKinds: Record<ProofAssetType, AvatarObjection["kind"][]> = {
    screenshot: ["fit", "complexity"],
    "demo-video": ["risk", "complexity"],
    "customer-quote": ["trust", "fit"],
    "before-after": ["fit", "risk"],
    "case-study": ["trust", "risk"],
    "app-store-review": ["trust", "social"],
    "founder-story": ["social", "trust"],
  };
  for (const kind of preferredKinds[type]) {
    const match = pool.find((o) => o.kind === kind);
    if (match) return match.statement;
  }
  return pool[0]?.statement;
}
