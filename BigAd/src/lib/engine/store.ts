import type { ProductInput, StoreCopy } from "@/types/strategy";

// generateStoreCopy — App Store / Play Store style listing draft.
// Stays inside the 30/170/4000 character zones loosely (no enforcement,
// but the templates aim for the right shapes).

export function generateStoreCopy(input: ProductInput): StoreCopy {
  const name = input.name || "Your product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "everyday friction";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";

  const subtitle = clip(
    `${capitalize(category)} for ${audience} — ${shortDiff(differentiator)}`,
    60
  );

  const promoText = clip(
    `${name} replaces tired ${category} habits with ${shortDiff(differentiator)}. Built for ${audience}.`,
    170
  );

  const description = [
    `${name} is ${category} rebuilt around ${differentiator}.`,
    ``,
    `Made for ${audience} who are tired of ${pain.toLowerCase()}.`,
    ``,
    `What's inside:`,
    `• ${capitalize(differentiator)} — the part most ${category} apps skip`,
    `• A workflow that respects how ${audience} actually decide`,
    `• Nothing that wastes your evening: no dark patterns, no manipulative streaks`,
    ``,
    `If you've used ${category} apps before and felt nothing changed, that's the problem ${name} was built to fix.`,
  ].join("\n");

  const keywords = keywordsFrom(input);

  return {
    appName: name,
    subtitle,
    promoText,
    description,
    keywords,
  };
}

function keywordsFrom(input: ProductInput): string[] {
  const seed = [
    input.name,
    input.category,
    input.audience,
    input.differentiator,
    input.audiencePain,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tokens = seed
    .split(/[^a-z0-9+]+/i)
    .filter((t) => t && t.length > 2 && !STOPWORDS.has(t));

  // Keep up to 12 unique tokens.
  return Array.from(new Set(tokens)).slice(0, 12);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "from", "their", "they", "your",
  "you", "this", "are", "but", "have", "has", "not", "into", "what",
  "who", "people", "tired", "make", "made", "ones", "stuff",
]);

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function shortDiff(diff: string): string {
  const cleaned = diff.replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 8) return cleaned;
  return words.slice(0, 8).join(" ");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
