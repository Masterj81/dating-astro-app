// audience-avatar.ts — Audience Avatar Builder.
//
// Given a ProductInput, emit 2-3 deterministic audience avatars. Each
// avatar is parameterised on the input — same input yields the same set,
// two different inputs yield visibly different sets. No randomness, no
// Date.now(), no API calls.
//
// Voice is BigAd's own — paraphrased direct-response phrasing. No
// proprietary coined terms from any third-party source.

import type {
  AudienceAvatar,
  AvatarObjection,
  AvatarObjectionKind,
  BusinessModel,
  ProductInput,
} from "@/types/strategy";

type PriceTier = "low" | "mid" | "high" | "unknown";

function parsePriceTier(price: string): PriceTier {
  if (!price) return "unknown";
  const lower = price.toLowerCase();
  if (lower.includes("free")) return "low";
  const match = price.match(/\d+(?:[.,]\d+)?/);
  if (!match) return "unknown";
  const value = Number(match[0].replace(",", "."));
  if (!Number.isFinite(value)) return "unknown";
  if (value < 30) return "low";
  if (value < 200) return "mid";
  return "high";
}

// One avatar blueprint = a stable seed for one persona variant.
interface AvatarBlueprint {
  // Stable internal id used to differentiate composition rules.
  slot: "skeptic" | "aspirant" | "lapsed" | "impulse" | "comparison" | "gift" | "pragmatic";
  labelTemplate: string;            // interpolated with input
  triggerTemplate: string;
  painLens: "skeptic" | "aspirational" | "regretful" | "decisive" | "comparative" | "altruistic" | "rational";
  outcomeLens: "outcome-relief" | "outcome-aspiration" | "outcome-restoration" | "outcome-quick" | "outcome-confidence" | "outcome-shared" | "outcome-measurable";
  objectionKinds: AvatarObjectionKind[];   // 3-4 of these
  failedAlternativesSeeds: ("substitute" | "stack" | "self" | "wait" | "freebie")[];
  emotionalVocab: string[];                // 3-6 short phrases
  proofTypes: string[];                    // 2-4 proof types
  channelAngle: string;                    // 1 sentence
}

// Catalog of slots. The composition step picks 2-3 based on business
// model + price tier so different inputs deterministically pick
// different combinations.

const BLUEPRINTS: Record<AvatarBlueprint["slot"], AvatarBlueprint> = {
  skeptic: {
    slot: "skeptic",
    labelTemplate: "Skeptical optimiser",
    triggerTemplate:
      "A clear before/after example from someone who used to think it was hype.",
    painLens: "skeptic",
    outcomeLens: "outcome-relief",
    objectionKinds: ["trust", "fit", "risk", "price"],
    failedAlternativesSeeds: ["substitute", "stack", "self"],
    emotionalVocab: [
      "I'll believe it when I see it",
      "another shiny thing",
      "I don't have time to be sold to",
      "show me the receipts",
      "is this just marketing?",
    ],
    proofTypes: ["customer quote", "case study", "demo video"],
    channelAngle:
      "Meta video: open on a sceptic-style line, then cut to a 6-second screen demo before any voiceover.",
  },
  aspirant: {
    slot: "aspirant",
    labelTemplate: "Aspirational starter",
    triggerTemplate:
      "Seeing a peer they relate to already getting the outcome they want.",
    painLens: "aspirational",
    outcomeLens: "outcome-aspiration",
    objectionKinds: ["fit", "complexity", "trust", "social"],
    failedAlternativesSeeds: ["substitute", "wait", "freebie"],
    emotionalVocab: [
      "I want to feel ahead of this",
      "what's the next version of me?",
      "I'm tired of starting over",
      "this could finally be it",
    ],
    proofTypes: ["customer quote", "before/after", "founder story"],
    channelAngle:
      "TikTok day-in-the-life: framing the outcome as a state they already half-believe is theirs.",
  },
  lapsed: {
    slot: "lapsed",
    labelTemplate: "Lapsed returnee",
    triggerTemplate:
      "A change in the product that fixes the exact reason they bounced last time.",
    painLens: "regretful",
    outcomeLens: "outcome-restoration",
    objectionKinds: ["timing", "trust", "fit", "risk"],
    failedAlternativesSeeds: ["substitute", "self", "wait"],
    emotionalVocab: [
      "I already tried it",
      "I'm not falling for that twice",
      "what's actually new?",
      "this used to not work for me",
    ],
    proofTypes: ["case study", "demo video", "before/after"],
    channelAngle:
      "Email or retargeting: lead on what changed since they last looked, in plain language.",
  },
  impulse: {
    slot: "impulse",
    labelTemplate: "Impulse buyer",
    triggerTemplate:
      "A moment of friction that the product visibly removes in under five seconds.",
    painLens: "decisive",
    outcomeLens: "outcome-quick",
    objectionKinds: ["price", "fit", "complexity"],
    failedAlternativesSeeds: ["stack", "freebie"],
    emotionalVocab: [
      "is this worth it right now?",
      "I'll know in 30 seconds",
      "just show me the thing",
      "either it clicks or it doesn't",
    ],
    proofTypes: ["demo video", "screenshots"],
    channelAngle:
      "Meta feed: a single static frame where the headline overlays the demo with no chrome.",
  },
  comparison: {
    slot: "comparison",
    labelTemplate: "Comparison shopper",
    triggerTemplate:
      "A clear, named contrast against the one alternative they're currently weighing.",
    painLens: "comparative",
    outcomeLens: "outcome-confidence",
    objectionKinds: ["price", "fit", "trust", "complexity"],
    failedAlternativesSeeds: ["substitute", "stack"],
    emotionalVocab: [
      "what's the catch vs the other one?",
      "I'm in five tabs already",
      "give me the side-by-side",
      "I'll pick whichever pays back faster",
    ],
    proofTypes: ["case study", "before/after", "screenshots"],
    channelAngle:
      "Landing comparison block: a named row-by-row contrast with the competitor in the user's own words.",
  },
  gift: {
    slot: "gift",
    labelTemplate: "Gift / shared buyer",
    triggerTemplate:
      "Realising the product is the most thoughtful version of a thing they were already going to buy for someone else.",
    painLens: "altruistic",
    outcomeLens: "outcome-shared",
    objectionKinds: ["fit", "risk", "timing", "social"],
    failedAlternativesSeeds: ["substitute", "wait"],
    emotionalVocab: [
      "will they actually use it?",
      "I want this to land",
      "is this thoughtful or weird?",
      "I'd rather get one right thing",
    ],
    proofTypes: ["customer quote", "before/after"],
    channelAngle:
      "Meta carousel: three frames of the recipient's reaction, not the product spec.",
  },
  pragmatic: {
    slot: "pragmatic",
    labelTemplate: "Pragmatic operator",
    triggerTemplate:
      "Realising the cost of the current workaround is higher than the price of switching.",
    painLens: "rational",
    outcomeLens: "outcome-measurable",
    objectionKinds: ["price", "complexity", "fit", "timing"],
    failedAlternativesSeeds: ["stack", "self"],
    emotionalVocab: [
      "what's the payback period?",
      "I don't want another tab",
      "is this one tool or three?",
      "I'll move if the math is clean",
    ],
    proofTypes: ["case study", "demo video", "before/after"],
    channelAngle:
      "Landing or LinkedIn: a single-screen ROI panel, no animation, plain numbers.",
  },
};

// Pick the slot composition deterministically from inputs.
// Differentiates on businessModel × priceTier × awareness so two
// freemium / subscription products with different awareness levels emit
// different persona stacks.
function pickSlots(input: ProductInput, tier: PriceTier): AvatarBlueprint["slot"][] {
  const model = input.businessModel;
  const aware = input.awareness;
  const isCold = aware === "unaware" || aware === "problem-aware";
  const isHot = aware === "product-aware" || aware === "most-aware";

  // Subscription + freemium: trial-driven funnel. Mix shifts on awareness.
  if (model === "subscription" || model === "freemium") {
    if (tier === "high") {
      return isCold
        ? ["aspirant", "pragmatic", "skeptic"]
        : ["skeptic", "pragmatic", "comparison"];
    }
    // Low / unknown / mid path.
    if (isCold) return ["aspirant", "pragmatic", "skeptic"];
    if (isHot) return ["skeptic", "comparison", "lapsed"];
    return ["skeptic", "aspirant", "lapsed"];
  }
  if (model === "one-time") {
    if (tier === "high") {
      return isCold
        ? ["aspirant", "comparison", "pragmatic"]
        : ["comparison", "skeptic", "pragmatic"];
    }
    if (tier === "low") {
      return isCold ? ["impulse", "gift", "comparison"] : ["impulse", "comparison", "gift"];
    }
    return isCold ? ["comparison", "gift", "impulse"] : ["comparison", "impulse", "gift"];
  }
  if (model === "services") {
    return isCold
      ? ["aspirant", "skeptic", "comparison"]
      : ["skeptic", "comparison", "pragmatic"];
  }
  if (model === "marketplace") {
    return isCold ? ["aspirant", "impulse", "comparison"] : ["comparison", "aspirant", "impulse"];
  }
  if (model === "ads") {
    return isCold ? ["aspirant", "skeptic"] : ["skeptic", "comparison"];
  }
  // Fallback for "other" and undefined-ish.
  return isCold ? ["aspirant", "skeptic"] : ["skeptic", "aspirant"];
}

export function buildAudienceAvatars(input: ProductInput): AudienceAvatar[] {
  const tier = parsePriceTier(input.price);
  const slots = pickSlots(input, tier);
  return slots.map((slot, i) =>
    materialiseAvatar(BLUEPRINTS[slot], input, tier, i + 1)
  );
}

function materialiseAvatar(
  bp: AvatarBlueprint,
  input: ProductInput,
  tier: PriceTier,
  index: number
): AudienceAvatar {
  const audience = input.audience || "this audience";
  const pain = input.audiencePain || "the recurring friction";
  const productName = input.name || "this product";
  const category = input.category || "the category";
  const differentiator = input.differentiator || "a different mechanism";

  const corePain = buildCorePain(bp, pain, category, audience);
  const desiredOutcome = buildDesiredOutcome(bp, differentiator, audience, productName);
  const trigger = buildTrigger(bp, productName, differentiator, tier);
  const objections = buildObjections(bp, input, tier);
  const failedAlternatives = buildFailedAlternatives(bp, input);
  const emotionalLanguage = pickEmotionalLanguage(bp, audience);
  const proofNeeded = bp.proofTypes.slice();
  const channelAngle = parameteriseChannelAngle(bp.channelAngle, input);

  return {
    id: `avatar-${index}`,
    label: bp.labelTemplate,
    buyingTrigger: trigger,
    corePain,
    desiredOutcome,
    objections,
    failedAlternatives,
    emotionalLanguage,
    proofNeeded,
    bestChannelAngle: channelAngle,
  };
}

function buildCorePain(
  bp: AvatarBlueprint,
  pain: string,
  category: string,
  audience: string
): string {
  const lensTemplates: Record<AvatarBlueprint["painLens"], string> = {
    skeptic: `They've seen ${category} products promise this exact outcome before. ${capFirst(pain)} keeps coming back, which is why they default to assuming the next pitch is the same as the last.`,
    aspirational: `They feel ${pain} as a gap between who they are and who they want to be in ${category}. The cost is mostly emotional — momentum lost, not money spent yet.`,
    regretful: `They already tried a ${category} fix for ${pain} and walked away. The pain didn't go away; the trust did.`,
    decisive: `${capFirst(pain)} is a daily annoyance, not a strategic problem. They are not researching — they are scrolling and waiting for something to land in three seconds.`,
    comparative: `${capFirst(pain)} matters less to them than picking the right tool for it. They're comparing options side by side and want one to clearly win.`,
    altruistic: `The pain is felt one step removed — they see ${audience} struggling with ${pain} and want a single, thoughtful thing to give that meets the moment.`,
    rational: `${capFirst(pain)} is a quantifiable cost — time, missed revenue, or stacked tools. They want a payback number, not a vibe.`,
  };
  return lensTemplates[bp.painLens];
}

function buildDesiredOutcome(
  bp: AvatarBlueprint,
  differentiator: string,
  audience: string,
  productName: string
): string {
  const lensTemplates: Record<AvatarBlueprint["outcomeLens"], string> = {
    "outcome-relief": `A clear, repeatable relief — they want to stop second-guessing and feel that ${truncate(differentiator, 60)} is doing the work they used to redo manually.`,
    "outcome-aspiration": `A version of themselves where ${truncate(differentiator, 60)} is just part of how they show up. Not magic — just the new baseline.`,
    "outcome-restoration": `The outcome they were promised the first time, this time without the rough edge that made them quit ${productName} or its substitutes.`,
    "outcome-quick": `A fast, obvious win in the first session — close the tab feeling that something already moved.`,
    "outcome-confidence": `Confidence that they picked the right option, with a defensible answer to "why not the other one?" for themselves and for ${audience}.`,
    "outcome-shared": `A win that lands well with the person they're buying for — the gift converts into a story they get told back.`,
    "outcome-measurable": `A measurable delta they can put in a spreadsheet — hours saved per week, costs cut, or revenue picked up — within a defined window.`,
  };
  return lensTemplates[bp.outcomeLens];
}

function buildTrigger(
  bp: AvatarBlueprint,
  productName: string,
  differentiator: string,
  tier: PriceTier
): string {
  const triggerByLens: Record<AvatarBlueprint["painLens"], string> = {
    skeptic: `Seeing one concrete proof clip where ${truncate(differentiator, 50)} is shown working, not described.`,
    aspirational: `A short scene of someone they relate to already living the outcome — ${productName} on screen, no pitch.`,
    regretful: `A change-log moment: a named feature that fixes the exact reason they left last time.`,
    decisive: `A frame where ${truncate(differentiator, 40)} is visible in the first second — they don't read past the hook.`,
    comparative: `A clean side-by-side row that shows ${truncate(differentiator, 40)} versus the option they're already comparing to.`,
    altruistic: `Realising the gift signals attention — the buyer wants to be seen as thoughtful, not just generous.`,
    rational: tier === "high"
      ? `A break-even calculation in plain numbers — payback inside the quarter, not the year.`
      : `A simple payback line — "pays for itself in the first use" — that they can defend to themselves in one sentence.`,
  };
  return triggerByLens[bp.painLens];
}

function buildObjections(
  bp: AvatarBlueprint,
  input: ProductInput,
  tier: PriceTier
): AvatarObjection[] {
  // Always take 3-4. We trim slots beyond 4 deterministically by their
  // declared order.
  const wanted = bp.objectionKinds.slice(0, 4);
  return wanted.map((kind) => makeObjection(kind, bp, input, tier));
}

function makeObjection(
  kind: AvatarObjectionKind,
  bp: AvatarBlueprint,
  input: ProductInput,
  tier: PriceTier
): AvatarObjection {
  const productName = input.name || "this product";
  const differentiator = input.differentiator || "a different mechanism";
  const category = input.category || "the category";
  const pain = input.audiencePain || "the recurring friction";

  switch (kind) {
    case "risk":
      return {
        kind,
        statement: `"What if I sign up and it does the same thing every other ${category} product does?"`,
        reframe: `Open with a 6-second demo of ${truncate(differentiator, 50)} actually working — the demo is the risk-reversal.`,
      };
    case "price":
      return {
        kind,
        statement: tier === "high"
          ? `"At this price I want a guaranteed return inside a quarter, not a hope."`
          : `"I can get something close to this for free or cheaper — convince me to spend on it."`,
        reframe: tier === "high"
          ? `Lead the ad with the payback math, not the headline price. Show the cost of staying on the workaround.`
          : `Compare what they get for the price against the time cost of the free workaround they're using today.`,
      };
    case "fit":
      return {
        kind,
        statement: `"My situation is different — ${truncate(pain, 40)} doesn't show up the way other people describe it."`,
        reframe: `Use a customer line that mirrors the avatar's exact framing of ${truncate(pain, 40)} — not the generic version.`,
      };
    case "trust":
      return {
        kind,
        statement: `"I haven't heard of ${productName} — who's actually using this?"`,
        reframe: `Surface a named user (or category peer) before the offer. Trust is earned with one specific name, not "trusted by thousands".`,
      };
    case "timing":
      return {
        kind,
        statement: `"This isn't the right moment — I'll come back to it later."`,
        reframe: `Make the next step take 60 seconds, not 60 minutes. Save-for-later beats abandon when the moment isn't urgent.`,
      };
    case "complexity":
      return {
        kind,
        statement: `"It looks like another thing to learn — I already have too many of those."`,
        reframe: `Show the first 90 seconds of use. If ${truncate(differentiator, 40)} doesn't visibly happen in that clip, the objection wins.`,
      };
    case "social":
      return {
        kind,
        statement: `"Will my peers (or the person I'm buying for) actually see this as serious?"`,
        reframe: `Frame the product as the thoughtful default in its niche — quote one peer or recipient saying so in their own words.`,
      };
  }
}

function buildFailedAlternatives(
  bp: AvatarBlueprint,
  input: ProductInput
): string[] {
  const category = input.category || "the category";
  const competitors = input.competitors || "";
  const productName = input.name || "this product";
  const pain = input.audiencePain || "the recurring friction";

  const namedCompetitor = competitors.split(",").map((c) => c.trim()).filter(Boolean)[0];

  const seedBuilders: Record<typeof bp.failedAlternativesSeeds[number], () => string> = {
    substitute: () =>
      namedCompetitor
        ? `Tried ${namedCompetitor} and it solved the surface, not ${truncate(pain, 40)}.`
        : `Tried another ${category} tool and it solved the surface, not ${truncate(pain, 40)}.`,
    stack: () =>
      `Stacked two or three free tools together — works for a week, falls apart when ${truncate(pain, 40)} comes back.`,
    self: () =>
      `Built a manual system in a doc or spreadsheet — it works until the moment they stop maintaining it.`,
    wait: () =>
      `Waited for a "better time" — months later, ${truncate(pain, 40)} is still on the to-do list.`,
    freebie: () =>
      `Used the free tier of a ${category} product — hit a wall the moment it actually mattered.`,
  };

  // Return 2-4 deterministically; we declare 2-3 per blueprint so the
  // floor / ceiling is naturally respected. Cap at 4 just in case.
  const items = bp.failedAlternativesSeeds.map((seed) => seedBuilders[seed]());
  return items.slice(0, 4);
}

function pickEmotionalLanguage(bp: AvatarBlueprint, audience: string): string[] {
  // 3-6 phrases. We take the vocab as-is from the blueprint, clamp to 6,
  // and ensure 3 minimum by appending an audience-keyed fallback.
  const items = bp.emotionalVocab.slice(0, 6);
  if (items.length >= 3) return items;
  const filler = `not made for someone like ${truncate(audience, 30)}`;
  while (items.length < 3) items.push(filler);
  return items;
}

function parameteriseChannelAngle(template: string, input: ProductInput): string {
  // The channel angle is already complete in the blueprint; we add a
  // trailing reference to the audience so it doesn't read as generic
  // across two different products.
  const audience = input.audience || "this audience";
  return `${template} Frame for ${truncate(audience, 40)}.`;
}

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trimEnd() + "...";
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
