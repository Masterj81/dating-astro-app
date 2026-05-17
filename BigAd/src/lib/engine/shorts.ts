import type { FacebookAdConcept, ProductInput, ShortScript } from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";
import type { CopyLabels } from "./copy-normalize";

// generateTiktokScripts — 3 short-form scripts in distinct formats.
// Now uses normalised copy labels so we never end up with "dating app app".

export function generateTiktokScripts(
  input: ProductInput,
  labels?: CopyLabels
): ShortScript[] {
  const L = labels ?? deriveCopyLabels(input, []);
  const name = input.name || "the product";

  return [
    {
      hook: `Three things ${L.audienceLabel.toLowerCase()} stop doing once they switch from ${L.competitorLabel} to ${name}:`,
      beats: [
        `1. They stop trying to "win" at ${L.categoryLabel}. ${name} replaces that with ${L.mechanismLabel}.`,
        `2. They stop blaming themselves for ${L.painLabel} — it was the format, not them.`,
        `3. They start using ${L.mechanismLabel} instead of fighting the algorithm.`,
      ],
      cta: `Save this so the next time ${L.painLabel} hits, you remember the option exists.`,
    },
    {
      hook: `POV: you've used every ${L.competitorLabel} and still feel ${painAdj(L.painLabel)}. Here's why.`,
      beats: [
        `Every ${L.categoryLabel} optimises the wrong layer — the surface, not the signal.`,
        `${name} works on the signal. ${capitalize(L.mechanismLabel)} is the part nobody else ships.`,
        `Result: less ${L.painLabel}, more ${L.outcomeLabel}.`,
      ],
      cta: `Comment "${shortCta(name)}" and I'll show you the exact first screen.`,
    },
    {
      hook: `Before ${name}: ${L.painLabel}. After ${name}: ${L.outcomeLabel}. Same person. Same week.`,
      beats: [
        `Day 1 — open ${name}, set up in under 90 seconds.`,
        `Day 3 — first noticeable shift in how ${L.audienceLabel.toLowerCase()} interact with ${L.categoryLabel}.`,
        `Day 7 — the old version of ${L.categoryLabel} feels like a different product.`,
      ],
      cta: `Link in bio. ${L.offerLabel}.`,
    },
  ];
}

// generateFacebookAds — 3 ad concepts spanning different stages.
export function generateFacebookAds(
  input: ProductInput,
  labels?: CopyLabels
): FacebookAdConcept[] {
  const L = labels ?? deriveCopyLabels(input, []);
  const name = input.name || "the product";

  return [
    {
      angle: "Problem-aware cold",
      primaryText: `${capitalize(L.audienceLabel)} keep telling me the same thing: "every ${L.categoryLabel} feels the same." We agreed. So we built ${name} around ${L.mechanismLabel} instead.`,
      headline: `${capitalize(L.categoryLabel)} that finally fits ${L.audienceLabel.toLowerCase()}.`,
      description: `${capitalize(L.mechanismLabel)} — built into the core, not bolted on.`,
      cta: `Learn more`,
    },
    {
      angle: "Solution-aware mid-funnel",
      primaryText: `Most ${L.categoryLabel} tools optimise for engagement metrics. ${name} optimises for what ${L.audienceLabel.toLowerCase()} actually care about: ${L.mechanismLabel}.`,
      headline: `${capitalize(L.mechanismLabel)} — without the ${L.categoryLabel} circus.`,
      description: `Made for ${L.audienceLabel.toLowerCase()}. ${L.offerLabel}.`,
      cta: `Sign up`,
    },
    {
      angle: "Product-aware retargeting",
      primaryText: `Still on the fence about ${name}? Here's the one-liner: it replaces ${L.painLabel} with ${L.outcomeLabel}. That's the whole pitch.`,
      headline: `${name}: the version of ${L.categoryLabel} you wanted.`,
      description: `One screen of setup. Cancel anytime.`,
      cta: `Get started`,
    },
  ];
}

function painAdj(painLabel: string): string {
  const p = (painLabel || "").trim().toLowerCase();
  if (!p) return "stuck";
  if (/shallow|empty|hollow|swiping/.test(p)) return "hollow";
  if (/tired|exhausted/.test(p)) return "exhausted";
  if (/stuck/.test(p)) return "stuck";
  return "stuck";
}

function shortCta(name: string): string {
  return (name || "info").split(/\s+/)[0].toLowerCase();
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
