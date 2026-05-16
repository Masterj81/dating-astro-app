// static-brief.ts — First-Frame Static Brief.
//
// For each of the top creator briefs, emit one StaticAdBrief per size
// (1:1, 4:5, 9:16). Each brief carries a headline overlay, sub overlay,
// hero element, proof element, CTA badge, and a 3-5 zone layout
// description. Designer-actionable on its own. Deterministic, pure.

import type {
  CreatorBrief,
  CtaBank,
  CtaSurface,
  CtaVariant,
  ProductInput,
  StaticAdBrief,
  StaticAdSize,
  StaticLayoutPiece,
  StaticLayoutZone,
} from "@/types/strategy";

const ALL_SIZES: StaticAdSize[] = ["1:1", "4:5", "9:16"];

export function buildStaticAdBriefs(
  briefs: CreatorBrief[],
  input: ProductInput,
  ctaBank: CtaBank
): StaticAdBrief[] {
  const out: StaticAdBrief[] = [];
  for (const brief of briefs.slice(0, 3)) {
    for (const size of ALL_SIZES) {
      const built = buildOne(brief, input, ctaBank, size);
      if (built) out.push(built);
    }
  }
  return out;
}

function buildOne(
  brief: CreatorBrief,
  input: ProductInput,
  ctaBank: CtaBank,
  size: StaticAdSize
): StaticAdBrief | null {
  const headlineOverlay = headlineFromBrief(brief, input);
  const subOverlay = subFromInput(input);
  const heroElement = heroElement_(input);
  const proofElement = proofElement_(input);
  const ctaBadge = pickCtaBadge(ctaBank, size);

  if (!headlineOverlay || !heroElement) return null;

  const layout = layoutForSize(
    size,
    headlineOverlay,
    subOverlay,
    heroElement,
    proofElement,
    ctaBadge
  );
  const visualHierarchy = hierarchyForSize(size);

  return {
    briefId: brief.id,
    forAngle: brief.forAngle,
    size,
    headlineOverlay,
    subOverlay,
    heroElement,
    proofElement,
    ctaBadge,
    layout,
    visualHierarchy,
  };
}

// ---- Copy seeding ---------------------------------------------------------

function headlineFromBrief(brief: CreatorBrief, input: ProductInput): string {
  // Prefer the brief's first alt-hook stripped of meta-language, fall back
  // to the audience pain framed as a question.
  const candidate = brief.altHooks[0] ?? "";
  const cleaned = stripOpenerLabel(candidate);
  if (cleaned && cleaned.length <= 80) return cleaned;
  if (input.audiencePain) {
    return truncate(capitaliseFirst(input.audiencePain) + ".", 80);
  }
  return truncate(brief.forAngle, 80);
}

function subFromInput(input: ProductInput): string {
  const diff = input.differentiator || "";
  const audience = input.audience || "";
  if (diff && diff.length <= 100) return truncate(capitaliseFirst(diff) + ".", 100);
  if (audience) return truncate(`Built for ${audience}.`, 100);
  return "";
}

function heroElement_(input: ProductInput): string {
  const cat = input.category || "the product";
  const productName = input.name || "the product";
  return `Centered ${productName} screen / pack-shot framed against a soft neutral background, ${cat} context cue in the corner.`;
}

function proofElement_(input: ProductInput): string {
  // A neutral, generic proof artifact description — never invents a metric.
  if (input.audience) {
    return `Small proof strip: short caption from a real ${input.audience} viewer, kept inside one line.`;
  }
  return `Small proof strip: short caption from a real viewer, kept inside one line.`;
}

function pickCtaBadge(bank: CtaBank, size: StaticAdSize): string {
  // 9:16 maps to reels CTA; 1:1 / 4:5 map to feed CTA. Fall back to landing.
  const targetSurface: CtaSurface =
    size === "9:16" ? "meta-reels" : "meta-feed";
  const exact = bank.variants.find(
    (v) => v.surface === targetSurface && v.style === "direct"
  );
  if (exact) return truncate(stripTerminal(exact.text), 24);
  const anySurface = bank.variants.find((v) => v.surface === targetSurface);
  if (anySurface) return truncate(stripTerminal(anySurface.text), 24);
  // Final fallback — landing-primary direct.
  const landing = bank.variants.find(
    (v) => v.surface === "landing-primary" && v.style === "direct"
  );
  if (landing) return truncate(stripTerminal(landing.text), 24);
  return "Try it";
}

// ---- Layout per size ------------------------------------------------------

function layoutForSize(
  size: StaticAdSize,
  headline: string,
  sub: string,
  hero: string,
  proof: string,
  cta: string
): StaticLayoutPiece[] {
  switch (size) {
    case "1:1":
      return [
        zone("top-band", headline, "Headline anchored top, large weight, single line, generous left and right padding."),
        zone("hero", hero, "Hero element centered, occupies the middle 60% of the canvas."),
        zone("proof-strip", proof, "Thin proof strip just above the bottom band, smaller scale."),
        zone("bottom-band", cta, "CTA chip pinned bottom-center, contrast against background."),
      ];
    case "4:5":
      return [
        zone("top-band", headline, "Headline at top, two-line allowance for sub overlay below it."),
        zone("top-band", sub, "Sub overlay sits one line below the headline, lower weight."),
        zone("hero", hero, "Hero element occupies the middle 50% — more vertical breathing room than 1:1."),
        zone("proof-strip", proof, "Proof strip mid-frame, between hero and CTA, single line."),
        zone("bottom-band", cta, "CTA chip pinned bottom-center, contrast against background."),
      ];
    case "9:16":
      return [
        zone("hero", hero, "Full-bleed hero element fills the canvas top-to-bottom edge-to-edge."),
        zone("top-band", headline, "Headline overlay sits in the top third, large but safe-area-aware."),
        zone("proof-strip", proof, "Proof strip lower-middle, single line, kept inside the safe area."),
        zone("edge-badge", cta, "CTA edge badge anchored bottom safe-area, tappable hint."),
      ];
  }
}

function hierarchyForSize(size: StaticAdSize): string {
  switch (size) {
    case "1:1":
      return "Reading order: headline -> hero -> proof strip -> CTA chip.";
    case "4:5":
      return "Reading order: headline -> sub overlay -> hero -> proof strip -> CTA chip.";
    case "9:16":
      return "Reading order: hero (full-bleed) -> headline overlay -> proof strip -> CTA edge badge.";
  }
}

function zone(
  zoneKind: StaticLayoutZone,
  copy: string,
  visualNote: string
): StaticLayoutPiece {
  return { zone: zoneKind, copy, visualNote };
}

// ---- Helpers --------------------------------------------------------------

function stripOpenerLabel(s: string): string {
  // Brief alt hooks are prefixed like 'Question opener: "..."'. Strip
  // that label and the surrounding quotes for use as a headline overlay.
  const trimmed = (s ?? "").trim();
  if (!trimmed) return "";
  const colon = trimmed.indexOf(":");
  if (colon === -1) return trimmed.replace(/^["“]|["”]$/g, "");
  const after = trimmed.slice(colon + 1).trim();
  return after.replace(/^["“]|["”]$/g, "").replace(/["”]$/g, "");
}

function stripTerminal(s: string): string {
  return s.replace(/[.!?]+$/g, "").trim();
}

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).trimEnd() + "…";
}

function capitaliseFirst(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}
