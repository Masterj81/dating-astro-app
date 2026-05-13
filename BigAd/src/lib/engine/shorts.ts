import type { FacebookAdConcept, ProductInput, ShortScript } from "@/types/strategy";

// generateTiktokScripts — 3 short-form scripts in distinct formats:
// "talking head", "screen + voice", "before/after". Each one names the
// audience, pain, and differentiator.

export function generateTiktokScripts(input: ProductInput): ShortScript[] {
  const name = input.name || "the product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "the same old frustration";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";

  return [
    {
      hook: `Three things ${audience} stop doing once they switch from regular ${category} to ${name}:`,
      beats: [
        `1. They stop trying to "win" at ${category}. ${name} replaces that game with ${differentiator}.`,
        `2. They stop blaming themselves for ${pain.toLowerCase()} — it was the format, not them.`,
        `3. They start using ${shortDiff(differentiator)} instead of fighting the algorithm.`,
      ],
      cta: `Save this so the next time you're stuck in ${category}, you remember the option exists.`,
    },
    {
      hook: `POV: you've used every ${category} app and still feel ${painAdj(pain)}. Here's why.`,
      beats: [
        `Every ${category} app optimizes the wrong layer — the surface, not the signal.`,
        `${name} works on the signal. ${capitalize(differentiator)} is the part nobody else ships.`,
        `Result: you stop performing in ${category}. You actually use it.`,
      ],
      cta: `Comment "${shortCta(name)}" and I'll show you the exact first screen.`,
    },
    {
      hook: `Before ${name}: ${shortDiff(pain)}. After ${name}: ${shortDiff(differentiator)}. Same person. Same week.`,
      beats: [
        `Day 1 — open ${name}, set up in under 90 seconds.`,
        `Day 3 — first noticeable shift in how ${audience} interact with ${category}.`,
        `Day 7 — the old version of ${category} feels like a different product.`,
      ],
      cta: `Link in bio. Try ${name} free, then decide.`,
    },
  ];
}

// generateFacebookAds — 3 ad concepts spanning different stages.
export function generateFacebookAds(input: ProductInput): FacebookAdConcept[] {
  const name = input.name || "the product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "the same old frustration";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";

  return [
    {
      angle: "Problem-aware cold",
      primaryText: `${capitalize(audience)} keep telling me the same thing: "${name ? "every " + category : category} app feels the same." We agreed. So we built ${name} around ${differentiator} instead.`,
      headline: `${capitalize(category)} that finally fits ${audience}.`,
      description: `${capitalize(differentiator)} — built into the core, not bolted on.`,
      cta: `Learn more`,
    },
    {
      angle: "Solution-aware mid-funnel",
      primaryText: `Most ${category} apps optimize for engagement metrics. ${name} optimizes for the part ${audience} actually care about: ${shortDiff(differentiator)}.`,
      headline: `${capitalize(differentiator)} — without the ${category} circus.`,
      description: `Made for ${audience}. Free to try.`,
      cta: `Sign up`,
    },
    {
      angle: "Product-aware retargeting",
      primaryText: `Still on the fence about ${name}? Here's the one-liner: it replaces ${painSummary(pain)} with ${shortDiff(differentiator)}. That's the whole pitch.`,
      headline: `${name}: the version of ${category} you wanted.`,
      description: `One screen of setup. Cancel anytime.`,
      cta: `Get started`,
    },
  ];
}

function shortDiff(s: string): string {
  const cleaned = (s || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function painAdj(pain: string): string {
  const p = (pain || "").trim().toLowerCase();
  if (!p) return "stuck";
  if (/shallow|empty|hollow/.test(p)) return "hollow";
  if (/tired|exhausted/.test(p)) return "exhausted";
  if (/stuck/.test(p)) return "stuck";
  return "stuck";
}

function painSummary(pain: string): string {
  return (pain || "").replace(/\.$/, "").toLowerCase();
}

function shortCta(name: string): string {
  return (name || "info").split(/\s+/)[0].toLowerCase();
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
