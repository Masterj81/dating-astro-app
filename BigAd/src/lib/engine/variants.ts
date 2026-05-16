// variants.ts — Ad Variant Spinner.
//
// Given a BaseConcept (hook / hold / proof / cta / offer), emit exactly
// five variants — one per axis — where the named axis differs from the
// base and the other four are byte-identical. Deterministic, no API,
// pure. Voice is BigAd's own.

import type {
  AdVariant,
  BaseConcept,
  CreatorBrief,
  OfferRecommendation,
  ProductInput,
  VariantAxis,
  VariantSet,
} from "@/types/strategy";

const AXES: VariantAxis[] = ["hook", "hold", "proof", "cta", "offer"];

export function spinAdVariants(
  base: BaseConcept,
  input: ProductInput,
  offers: OfferRecommendation[]
): VariantSet {
  const variants: AdVariant[] = AXES.map((axis, i) =>
    buildVariant(base, axis, input, offers, i)
  );
  return {
    baseConceptId: base.id,
    variants,
  };
}

// Convenience: build a base concept out of a CreatorBrief deterministically.
export function baseConceptFromBrief(
  brief: CreatorBrief,
  input: ProductInput,
  offers: OfferRecommendation[]
): BaseConcept {
  const productName = input.name || "this product";
  const diff = input.differentiator || "a different mechanism";
  const hookAlt = brief.altHooks[0] ?? `Open on ${cat(input)} from inside the pain.`;
  const offerLabel = offers[0]?.label ?? "free first step";

  return {
    id: `${brief.id}-base`,
    hook: truncate(hookAlt, 96),
    hold: `Hold on a single demo beat of ${truncate(diff, 50)} for at least two seconds.`,
    proof: `Pair the claim with a live demo of ${truncate(productName, 30)} on screen.`,
    cta: `Tell the viewer where to go next for ${truncate(productName, 30)} — one verb, one destination.`,
    offer: truncate(offerLabel, 60),
  };
}

// Wire: one VariantSet per top creator brief.
export function generateVariantSets(
  briefs: CreatorBrief[],
  input: ProductInput,
  offers: OfferRecommendation[]
): VariantSet[] {
  return briefs.map((brief) => {
    const base = baseConceptFromBrief(brief, input, offers);
    return spinAdVariants(base, input, offers);
  });
}

function buildVariant(
  base: BaseConcept,
  axis: VariantAxis,
  input: ProductInput,
  offers: OfferRecommendation[],
  axisIndex: number
): AdVariant {
  // Start byte-identical to base.
  const v: AdVariant = {
    id: `${base.id}-v${axisIndex + 1}`,
    changedAxis: axis,
    hook: base.hook,
    hold: base.hold,
    proof: base.proof,
    cta: base.cta,
    offer: base.offer,
    rationale: "",
  };

  switch (axis) {
    case "hook":
      v.hook = swapHook(base.hook, input);
      v.rationale = `Tests a different opener archetype (stat / contrarian) against the base hook to see which lands faster.`;
      break;
    case "hold":
      v.hold = swapHold(base.hold, input);
      v.rationale = `Tests a pattern-interrupt edit against the steady-hold base to learn whether pacing or content drives retention.`;
      break;
    case "proof":
      v.proof = swapProof(base.proof, input);
      v.rationale = `Swaps the proof type so we can attribute lift to the proof modality, not the underlying claim.`;
      break;
    case "cta":
      v.cta = swapCta(base.cta, input);
      v.rationale = `Tests a different CTA framing (commit / explore / save) so the funnel-floor's contribution becomes visible.`;
      break;
    case "offer":
      v.offer = swapOffer(base.offer, offers);
      v.rationale = `Swaps to a different offer lever from the recommendation set to isolate offer-elasticity from creative.`;
      break;
  }
  return v;
}

// ---- Axis swaps. Each swap is deterministic. ----

function swapHook(baseHook: string, input: ProductInput): string {
  // Try four archetypes in order; pick the first that does not equal base.
  const archetypes = [
    `Did you know ${truncate(input.audiencePain || "this friction", 50)} is the actual blocker, not the apps?`,
    `Most ${cat(input)} advice has it backwards — start with ${truncate(diff(input), 40)}.`,
    `Three weeks of ${cat(input)}, one habit moved the needle: ${truncate(diff(input), 40)}.`,
    `Before: ${truncate(input.audiencePain || "the same loop", 36)}. After: ${truncate(diff(input), 36)}.`,
  ];
  for (const a of archetypes) {
    if (a !== baseHook) return a;
  }
  return archetypes[0];
}

function swapHold(baseHold: string, input: ProductInput): string {
  const alts = [
    `Cut on the beat at 2.5s with a hard transient, then re-hold on the demo frame.`,
    `Slow-zoom into the demo frame for the middle five seconds — viewer leans in instead of scanning.`,
    `Pattern-interrupt: a single jump cut to a contrasting B-roll mid-claim, then back to face.`,
  ];
  for (const a of alts) {
    if (a !== baseHold) return a;
  }
  return alts[0];
}

function swapProof(baseProof: string, input: ProductInput): string {
  const proofModalities = [
    `Cut to a 6-second testimonial soundbite — first-person, real audio.`,
    `Show a before/after pair tied to ${truncate(diff(input), 40)} — same frame, two states.`,
    `Overlay a small data callout (single number, single unit) on a clean demo frame.`,
    `Demonstrate the mechanism live for 4 seconds, no narration.`,
  ];
  for (const m of proofModalities) {
    if (m !== baseProof) return m;
  }
  return proofModalities[0];
}

function swapCta(baseCta: string, input: ProductInput): string {
  const productName = input.name || "this product";
  const ctas = [
    `Commit framing: "${truncate(productName, 24)} — start today, decide in five minutes."`,
    `Explore framing: "See ${truncate(productName, 24)} — one screen, no signup wall."`,
    `Save framing: "Bookmark ${truncate(productName, 24)} so you can come back when ${truncate(input.audiencePain || "the moment hits", 30)}."`,
  ];
  for (const c of ctas) {
    if (c !== baseCta) return c;
  }
  return ctas[0];
}

function swapOffer(baseOffer: string, offers: OfferRecommendation[]): string {
  for (const o of offers) {
    if (o.label && o.label !== baseOffer) {
      return o.label;
    }
  }
  return offers[0]?.label ?? baseOffer;
}

// ---- Helpers ----

function cat(input: ProductInput): string {
  return input.category || "this category";
}

function diff(input: ProductInput): string {
  return input.differentiator || "a different mechanism";
}

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trimEnd() + "...";
}
