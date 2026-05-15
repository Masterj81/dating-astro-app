// briefs.ts — Creator Brief Generator.
//
// Turns ranked angles + offer recommendations into one-page production
// briefs a creator can shoot from. Output is fully deterministic: every
// value is derived from the input and the upstream strategy fields.
// No randomness, no Date.now(), no API calls.
//
// Voice is BigAd's own — paraphrased, generic direct-response cadence.
// No proprietary coined terms from any third-party training source.

import type {
  AwarenessLevel,
  BriefSectionKind,
  BusinessModel,
  CampaignType,
  CreatorBrief,
  CreatorBriefSection,
  OfferRecommendation,
  ProductInput,
} from "@/types/strategy";

// Section duration envelopes (seconds). Sum is the total brief duration.
const SECTION_DURATIONS: Record<BriefSectionKind, number> = {
  hook: 3,
  problem: 4,
  "solution-or-proof": 7,
  cta: 3,
};

// Section order is fixed — production briefs follow a stable spine so a
// creator can move section-by-section on set.
const SECTION_ORDER: BriefSectionKind[] = [
  "hook",
  "problem",
  "solution-or-proof",
  "cta",
];

export function generateCreatorBriefs(
  input: ProductInput,
  angles: string[],
  offers: OfferRecommendation[]
): CreatorBrief[] {
  // Top three angles get briefs. If fewer angles are supplied, brief
  // exactly that many — never fewer than the floor of 2 when possible.
  const selected = angles.slice(0, 3);
  return selected.map((angle, i) =>
    buildBrief(input, angle, offers, i + 1)
  );
}

function buildBrief(
  input: ProductInput,
  angle: string,
  offers: OfferRecommendation[],
  rank: number
): CreatorBrief {
  const sections = SECTION_ORDER.map((kind) =>
    buildSection(kind, input, angle, offers, rank)
  );
  const totalDuration = sections.reduce(
    (acc, s) => acc + s.durationSeconds,
    0
  );

  return {
    id: `brief-${rank}`,
    forAngle: angle,
    durationSeconds: totalDuration,
    framing: framingRule(input),
    altHooks: altHookOpeners(input, angle, rank),
    sections,
    deliverables: deliverablesFor(input.campaignType ?? "always-on"),
    notes: rank === 1 ? topPickNote() : undefined,
  };
}

// ---- Framing rule (varies with businessModel, awareness, priceTier) ----

function framingRule(input: ProductInput): string {
  const model = input.businessModel;
  const awareness = input.awareness;
  const tier = priceTier(input.price);
  const productNoun = input.category || "product";

  // Compose two clauses: (a) opening posture, (b) delivery posture.
  const opener = openingPosture(awareness, model);
  const delivery = deliveryPosture(tier, model, productNoun);
  return `${opener} ${delivery}`;
}

function openingPosture(
  awareness: AwarenessLevel,
  model: BusinessModel
): string {
  if (awareness === "unaware" || awareness === "problem-aware") {
    return "Open inside the pain moment, in plain words the viewer already uses.";
  }
  if (awareness === "solution-aware") {
    return "Open with the category choice the viewer is already weighing.";
  }
  if (awareness === "product-aware") {
    return "Open as if the viewer already knows the product exists.";
  }
  // most-aware
  if (model === "subscription" || model === "freemium") {
    return "Open with the daily ritual the viewer already wants to feel.";
  }
  return "Open with the post-purchase feeling, then earn it back through proof.";
}

function deliveryPosture(
  tier: "low" | "mid" | "high" | "unknown",
  model: BusinessModel,
  productNoun: string
): string {
  if (tier === "high") {
    return `Take time to earn trust — high-ticket ${productNoun} carries higher buyer caution.`;
  }
  if (tier === "low") {
    return `Move fast — at this price tier the viewer decides in seconds, not minutes.`;
  }
  if (model === "subscription" || model === "freemium") {
    return `Show the recurring value once, not many times — one clear use is enough.`;
  }
  if (model === "marketplace") {
    return `Show one transaction end-to-end so the viewer can picture themselves on either side.`;
  }
  return `Make one promise, deliver one demonstration, close on one ask.`;
}

// ---- Alt hook openers (parameterised, no source-language) ----

function altHookOpeners(
  input: ProductInput,
  angle: string,
  rank: number
): string[] {
  const name = input.name || "this";
  const cat = input.category || "category";
  const pain = input.audiencePain || "the usual friction";
  const diff = input.differentiator || "the mechanism";

  // Four hook archetypes — question, contrarian, stat, before/after.
  // Pick three deterministically by the brief's rank index.
  const archetypes: string[] = [
    `Question opener: "What if ${cat} stopped feeling like ${pain}?"`,
    `Contrarian opener: "Most ${cat} advice has it backwards — here is what actually shifts."`,
    `Pattern-break opener: "I tried every ${cat} option for the last month — only one moved the needle."`,
    `Before/after opener: "Before ${name}, my ${cat} routine looked like this. After, it looks like this."`,
  ];

  const offset = (rank - 1) % archetypes.length;
  const ordered = [
    archetypes[offset],
    archetypes[(offset + 1) % archetypes.length],
    archetypes[(offset + 2) % archetypes.length],
  ];

  // Add an angle-specific opener as a fourth option, derived from the
  // angle name + differentiator — keeps each brief's alt-hooks distinct.
  ordered.push(
    `Angle opener: "${truncatePhrase(angle)} — and the part that makes it work is ${truncatePhrase(diff)}."`
  );
  return ordered;
}

function truncatePhrase(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= 80) return trimmed;
  return trimmed.slice(0, 77).trimEnd() + "...";
}

// ---- Section builders ----

function buildSection(
  kind: BriefSectionKind,
  input: ProductInput,
  angle: string,
  offers: OfferRecommendation[],
  rank: number
): CreatorBriefSection {
  switch (kind) {
    case "hook":
      return hookSection(input, angle, rank);
    case "problem":
      return problemSection(input);
    case "solution-or-proof":
      return solutionSection(input, angle, offers);
    case "cta":
      return ctaSection(input);
  }
}

function hookSection(
  input: ProductInput,
  angle: string,
  rank: number
): CreatorBriefSection {
  const cat = input.category || "category";
  const pain = input.audiencePain || "the friction we know";

  // Two alt openers inside the section (separate from brief-level altHooks).
  // These are the on-set quick-fire takes the creator films back-to-back.
  const sectionAlts: string[] = [
    `Open on a face-to-camera question that names ${pain} without naming the product yet.`,
    `Open on a fast cut of the moment ${pain} happens, framed in under three seconds.`,
  ];
  if (rank > 1) {
    sectionAlts.push(
      `Open on a single object that signals ${cat} (handheld, no voiceover yet), then cut to face.`
    );
  }

  return {
    kind: "hook",
    label: "Stop the scroll",
    beat:
      `In under three seconds, frame ${pain} in the viewer's own words and signal that ${cat} is the topic.`,
    durationSeconds: SECTION_DURATIONS.hook,
    whatToSay: sectionAlts,
    whatToShow: [
      `One visual that maps to ${pain} (no on-screen text yet).`,
      `Eye contact within the first second — no slow zoom-ins.`,
      `Hold the angle line in the lower third only after the second cut.`,
    ],
    doNot: [
      `Do not open with the product name.`,
      `Do not stack two questions back-to-back.`,
    ],
  };
}

function problemSection(input: ProductInput): CreatorBriefSection {
  const pain = input.audiencePain || "the recurring friction we are addressing";
  const cat = input.category || "the category";
  const audience = input.audience || "the viewer";

  return {
    kind: "problem",
    label: "Name the pain",
    beat:
      `Spend four seconds on the cost of ${pain} for ${audience} — concrete, in the viewer's own words. No comparative claims yet.`,
    durationSeconds: SECTION_DURATIONS.problem,
    whatToSay: [
      `Describe one specific moment ${pain} shows up.`,
      `Name the time / energy / money it costs in plain terms.`,
      `Hint that most fixes in ${cat} treat the symptom, not the cause.`,
    ],
    whatToShow: [
      `B-roll of the pain in context — neutral, no caricature.`,
      `Use natural light; avoid stylised colour grade in this beat.`,
    ],
    doNot: [
      `Do not name competitors on camera.`,
      `Do not over-promise — the promise lands in the next beat.`,
      `Do not slip into a list of features yet.`,
    ],
  };
}

function solutionSection(
  input: ProductInput,
  angle: string,
  offers: OfferRecommendation[]
): CreatorBriefSection {
  const name = input.name || "the product";
  const diff = input.differentiator || "the mechanism that matters";
  const cat = input.category || "the category";
  const topOffer = offers[0]?.label;
  const proofTypes = ["testimonial soundbite", "live demo", "before/after pair", "data callout"];

  return {
    kind: "solution-or-proof",
    label: "Show the shift",
    beat:
      `In six to eight seconds, show how ${name} delivers a different result through ${truncatePhrase(diff)}. Pair the claim with at least one proof type from the list.`,
    durationSeconds: SECTION_DURATIONS["solution-or-proof"],
    whatToSay: [
      `State the result first, mechanism second — one sentence each.`,
      `Reference the angle context: ${truncatePhrase(angle)}.`,
      `If a claim is named, name the proof source in the same sentence.`,
      topOffer
        ? `If the offer fits the moment, surface it once: ${truncatePhrase(topOffer)}.`
        : `Keep any offer reference for the CTA beat.`,
    ],
    whatToShow: [
      `One proof beat picked from: ${proofTypes.join(", ")}.`,
      `A clear demo frame — either screenshot, product-in-hand, or before/after.`,
      `Hold the strongest visual on screen for at least two beats.`,
    ],
    doNot: [
      `Do not stack three claims without three proofs.`,
      `Do not name competing ${cat} products on camera.`,
      `Do not cut away from the proof beat before the viewer can read it.`,
    ],
  };
}

function ctaSection(input: ProductInput): CreatorBriefSection {
  const name = input.name || "the product";
  const campaign = input.campaignType ?? "always-on";
  const ask = ctaAsk(campaign, name);

  return {
    kind: "cta",
    label: "Close on one ask",
    beat:
      `Three seconds: deliver one ask, on camera, with the product name and the action in the same sentence.`,
    durationSeconds: SECTION_DURATIONS.cta,
    whatToSay: [
      ask,
      `Repeat the product name in the final beat so it is recoverable from audio alone.`,
    ],
    whatToShow: [
      `Final frame holds ${name} clearly — packaging, screen, or icon.`,
      `End on a clean cut, not a fade — the viewer should feel the beat close.`,
    ],
    doNot: [
      `Do not stack two CTAs.`,
      `Do not end on a question.`,
      `Do not introduce a new claim in the last beat.`,
    ],
  };
}

function ctaAsk(campaign: CampaignType, name: string): string {
  switch (campaign) {
    case "launch":
      return `Direct ask: tell the viewer to try ${name} today while the launch window is open.`;
    case "seasonal":
      return `Time-boxed ask: anchor the ask to the seasonal window without naming a specific date on camera.`;
    case "always-on":
    default:
      return `Steady ask: tell the viewer where to go next for ${name} — one verb, one destination.`;
  }
}

// ---- Deliverables (driven by campaignType) ----

function deliverablesFor(campaign: CampaignType): string[] {
  if (campaign === "launch") {
    return [
      `1 vertical 9:16 master at 90 seconds, broadcast-safe audio.`,
      `1 square 1:1 cut-down at 30 seconds for feed placements.`,
      `1 horizontal 16:9 cut-down at 15 seconds for pre-roll inventory.`,
      `Source files (raw + edit project), no watermarks.`,
    ];
  }
  if (campaign === "seasonal") {
    return [
      `1 vertical 9:16 launch hero at 45 seconds.`,
      `1 vertical 9:16 echo variant at 20 seconds, same body, fresh hook.`,
      `Source files (raw + edit project), no watermarks.`,
    ];
  }
  // always-on
  return [
    `2 vertical 9:16 variants, 30-45 seconds each, distinct hook openers.`,
    `1 square 1:1 cut-down at 20 seconds.`,
    `Source files (raw + edit project), no watermarks.`,
  ];
}

function topPickNote(): string {
  return "Top-pick brief: shoot this one first. Use the alt-hooks block to film three opener takes back-to-back so the editor can A/B the opening cut without re-shooting the body.";
}

// ---- Price tier helper ----

function priceTier(price: string): "low" | "mid" | "high" | "unknown" {
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
