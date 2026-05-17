// ad-concept-cards.ts — Ad Concept Cards.
//
// Combines avatars × hook-library × offers × ranked angles × creator
// briefs into 3-6 deterministic ad concept cards. Each card covers a
// distinct (avatar × pattern × offer) combination. Every output is
// derived from upstream inputs — no randomness, no API.

import type {
  AdConceptCard,
  AudienceAvatar,
  ConceptFormatFit,
  CreatorBrief,
  HookLibrary,
  HookLibraryItem,
  HookPattern,
  OfferKind,
  OfferRecommendation,
  ProductInput,
  VariantAxis,
} from "@/types/strategy";
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

interface BuildArgs {
  input: ProductInput;
  avatars: AudienceAvatar[];
  hookLibrary: HookLibrary;
  offers: OfferRecommendation[];
  rankedAngles: string[];
  creatorBriefs: CreatorBrief[];
  labels?: CopyLabels;
}

// Pattern → formatFit. Stable mapping so two products with the same
// pattern share the format shape but the copy differs.
const PATTERN_FORMAT_FIT: Record<HookPattern, ConceptFormatFit[]> = {
  "pain-first": ["video-9-16-short", "video-9-16-medium", "static-4-5"],
  "outcome-first": ["video-9-16-short", "video-1-1", "static-1-1"],
  contrarian: ["video-9-16-medium", "static-4-5"],
  "proof-led": ["video-9-16-medium", "video-1-1", "carousel"],
  curiosity: ["video-9-16-short", "static-9-16"],
  comparison: ["carousel", "static-4-5", "static-1-1"],
  mistake: ["video-9-16-short", "video-9-16-medium"],
  "before-after": ["static-4-5", "carousel", "video-1-1"],
};

const VARIANT_AXES: VariantAxis[] = ["hook", "hold", "proof", "cta", "offer"];

export function buildAdConceptCards(args: BuildArgs): AdConceptCard[] {
  const { input, avatars, hookLibrary, offers, rankedAngles } = args;
  const labels = args.labels ?? deriveCopyLabels(input, offers);

  if (avatars.length === 0 || hookLibrary.items.length === 0) {
    return [];
  }

  // Target count: 3 cards per avatar capped at 6 total. With 2 avatars
  // we get 4; with 3 avatars we get 6. With one avatar we'd get 3, but
  // the avatar floor in the builder is 2 so this is a safety case.
  const perAvatar = avatars.length >= 3 ? 2 : 3;
  const targetTotal = Math.min(avatars.length * perAvatar, 6);

  const cards: AdConceptCard[] = [];
  const usedPatternsByAvatar = new Map<string, Set<HookPattern>>();

  let cardIndex = 0;
  // Round-robin through avatars so the spread is balanced and
  // deterministic. We stop when we hit the targetTotal.
  for (let pass = 0; pass < perAvatar && cards.length < targetTotal; pass++) {
    for (const avatar of avatars) {
      if (cards.length >= targetTotal) break;
      const used = usedPatternsByAvatar.get(avatar.id) ?? new Set<HookPattern>();
      const hook = pickHookForAvatar(hookLibrary, avatar, used);
      if (!hook) continue;
      used.add(hook.pattern);
      usedPatternsByAvatar.set(avatar.id, used);

      cardIndex += 1;
      const card = composeCard({
        index: cardIndex,
        input,
        avatar,
        hook,
        offer: pickOfferForCard(offers, cardIndex),
        rankedAngles,
        axisRotation: cardIndex,
        labels,
      });
      cards.push(card);
    }
  }

  return cards;
}

function pickHookForAvatar(
  library: HookLibrary,
  avatar: AudienceAvatar,
  alreadyUsed: Set<HookPattern>
): HookLibraryItem | null {
  // Prefer hooks that fit the avatar and use a pattern not yet picked.
  const fitting = library.items.filter((it) => it.avatarFit.includes(avatar.id));
  const candidates = fitting.length > 0 ? fitting : library.items;

  // First try patterns we haven't used for this avatar.
  const fresh = candidates.find((it) => !alreadyUsed.has(it.pattern));
  if (fresh) return fresh;
  return candidates[0] ?? null;
}

function pickOfferForCard(
  offers: OfferRecommendation[],
  cardIndex: number
): OfferRecommendation | undefined {
  if (offers.length === 0) return undefined;
  // Stable rotation; first card pulls top offer, then cycle deeper.
  return offers[(cardIndex - 1) % offers.length];
}

interface ComposeArgs {
  index: number;
  input: ProductInput;
  avatar: AudienceAvatar;
  hook: HookLibraryItem;
  offer: OfferRecommendation | undefined;
  rankedAngles: string[];
  axisRotation: number;
  labels: CopyLabels;
}

function composeCard(args: ComposeArgs): AdConceptCard {
  const { index, input, avatar, hook, offer, rankedAngles, axisRotation, labels } = args;
  const productName = input.name || "this product";

  const name = buildConceptName(hook.pattern, avatar, productName);
  const promise = buildPromise(input, avatar, labels);
  const proofAngle = buildProofAngle(avatar, productName);
  const offerTieIn = buildOfferTieIn(offer, avatar, labels);
  const visualIdea = buildVisualIdea(hook.pattern, avatar, input, labels);
  const formatFit = formatsForPattern(hook.pattern);
  const testHypothesis = buildTestHypothesis(hook.pattern, avatar);
  const nextVariantSuggestion = buildNextVariantSuggestion(
    axisRotation,
    hook,
    offer
  );

  return {
    id: `concept-${index}`,
    name,
    targetAvatarId: avatar.id,
    hook,
    promise,
    proofAngle,
    offerTieIn,
    visualIdea,
    formatFit,
    testHypothesis,
    nextVariantSuggestion,
  };
}

function buildConceptName(
  pattern: HookPattern,
  avatar: AudienceAvatar,
  productName: string
): string {
  const patternLabel = patternShortLabel(pattern);
  return `${patternLabel} for ${avatar.label.toLowerCase()} — ${truncate(productName, 24)}`;
}

function buildPromise(
  input: ProductInput,
  avatar: AudienceAvatar,
  labels: CopyLabels
): string {
  return `${capFirst(labels.mechanismLabel)} turns ${truncate(avatar.label.toLowerCase(), 28)} momentum into ${labels.outcomeLabel} inside the first session.`;
}

function buildProofAngle(avatar: AudienceAvatar, productName: string): string {
  const proof = avatar.proofNeeded[0] || "customer quote";
  const second = avatar.proofNeeded[1];
  return second
    ? `Lead with a ${proof}; back it with a ${second} of ${truncate(productName, 24)} working on screen.`
    : `Lead with a ${proof} of ${truncate(productName, 24)} actually working — no narration over it.`;
}

function buildOfferTieIn(
  offer: OfferRecommendation | undefined,
  avatar: AudienceAvatar,
  labels: CopyLabels
): string {
  if (!offer) {
    return `No offer attached — concept rides on differentiator and proof alone.`;
  }
  // Frame the offer for the avatar's primary objection.
  const primaryObjection = avatar.objections[0];
  const objectionHint = primaryObjection
    ? ` Counter-frames the "${primaryObjection.kind}" objection.`
    : "";
  return `Tie the close to the ${offer.kind} lever ("${labels.offerLabel}").${objectionHint}`;
}

function buildVisualIdea(
  pattern: HookPattern,
  avatar: AudienceAvatar,
  input: ProductInput,
  labels: CopyLabels
): string {
  const productName = input.name || "the product";
  switch (pattern) {
    case "pain-first":
      return `Cold open on the pain moment in the avatar's environment — close-up, no music. Cut hard to a clean shot of ${labels.mechanismLabel} working.`;
    case "outcome-first":
      return `Open on the after-state: the avatar in the moment of relief or pride. Then reveal ${productName} as the cause, not the topic.`;
    case "contrarian":
      return `Talking-head, eye-level, plain background. The contrarian line lands in the first three seconds with on-screen text mirroring it.`;
    case "proof-led":
      return `Lead with a 4-second customer soundbite, then cut to the screen demo where the claim resolves. Keep the customer audio first-person.`;
    case "curiosity":
      return `Tease the missing-piece visual — show a partial UI or a hidden screen for the first two seconds, then deliver the payoff.`;
    case "comparison":
      return `Side-by-side static or a two-column carousel — left = ${labels.competitorLabel}, right = ${productName}. One row, one decisive contrast.`;
    case "mistake":
      return `Selfie-angle confessional: speaker names the mistake they used to make. Cut to a clean demo of the fix at the midpoint.`;
    case "before-after":
      return `Two paired frames in the same setting — before the mechanism vs after. Match cut, no transition effects.`;
  }
}

function formatsForPattern(pattern: HookPattern): ConceptFormatFit[] {
  // Clamp to 2-4.
  const raw = PATTERN_FORMAT_FIT[pattern].slice();
  return raw.slice(0, Math.max(2, Math.min(4, raw.length)));
}

function buildTestHypothesis(
  pattern: HookPattern,
  avatar: AudienceAvatar
): string {
  return `If ${truncate(avatar.label.toLowerCase(), 30)} responds to ${patternShortLabel(pattern).toLowerCase()} better than the current control, the ${patternShortLabel(pattern).toLowerCase()} archetype becomes the next prospecting workhorse.`;
}

function buildNextVariantSuggestion(
  axisRotation: number,
  hook: HookLibraryItem,
  offer: OfferRecommendation | undefined
): string {
  // Rotate through the 5 Variant Spinner axes deterministically.
  const axis = VARIANT_AXES[(axisRotation - 1) % VARIANT_AXES.length];
  switch (axis) {
    case "hook":
      return `Spin the hook axis — keep the rest constant and swap the opener archetype to ${patternShortLabel(altPattern(hook.pattern)).toLowerCase()}.`;
    case "hold":
      return `Spin the hold axis — keep the hook and proof but test a pattern-interrupt edit against the steady-hold base.`;
    case "proof":
      return `Spin the proof axis — swap the proof modality (testimonial / demo / data) while holding the hook and CTA.`;
    case "cta":
      return `Spin the CTA axis — same hook and proof, swap the CTA framing (commit / explore / save).`;
    case "offer":
      return offer
        ? `Spin the offer axis — keep the rest constant and swap the ${offer.kind} lever for the next-best offer in the recommendation set.`
        : `Spin the offer axis — keep the rest constant and attach a no-risk free-trial frame to the close.`;
  }
}

function altPattern(p: HookPattern): HookPattern {
  // Deterministic alternate for hook-axis suggestion: skip to the next
  // pattern in the canonical order, wrapping at the end.
  const order: HookPattern[] = [
    "pain-first",
    "outcome-first",
    "contrarian",
    "proof-led",
    "curiosity",
    "comparison",
    "mistake",
    "before-after",
  ];
  const idx = order.indexOf(p);
  return order[(idx + 1) % order.length];
}

function patternShortLabel(p: HookPattern): string {
  return (
    {
      "pain-first": "Pain-first",
      "outcome-first": "Outcome-first",
      contrarian: "Contrarian",
      "proof-led": "Proof-led",
      curiosity: "Curiosity",
      comparison: "Comparison",
      mistake: "Mistake",
      "before-after": "Before-after",
    }[p] ?? p
  );
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
