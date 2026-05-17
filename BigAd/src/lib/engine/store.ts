import type { ProductInput, StoreCopy } from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";
import type { CopyLabels } from "./copy-normalize";

// generateStoreCopy — App Store / Play Store style listing draft.
// Uses normalised copy labels so subtitle / promo / description stay tight
// and never end with an ellipsis.

export function generateStoreCopy(
  input: ProductInput,
  labels?: CopyLabels
): StoreCopy {
  const L = labels ?? deriveCopyLabels(input, []);
  const name = input.name || "Your product";

  const subtitle = clip(
    `${capitalize(L.categoryLabel)} for ${L.audienceLabel.toLowerCase()} — ${L.mechanismLabel}`,
    60
  );

  const promoText = clip(
    `${name} replaces ${L.painLabel} with ${L.outcomeLabel}. Built for ${L.audienceLabel.toLowerCase()}.`,
    170
  );

  const description = [
    `${name} is ${L.categoryLabel} rebuilt around ${L.mechanismLabel}.`,
    ``,
    `Made for ${L.audienceLabel.toLowerCase()} done with ${L.painLabel}.`,
    ``,
    `What's inside:`,
    `• ${capitalize(L.mechanismLabel)} — the part most ${L.categoryLabel} apps skip`,
    `• A workflow that respects how ${L.audienceLabel.toLowerCase()} actually decide`,
    `• Nothing that wastes your evening: no dark patterns, no manipulative streaks`,
    ``,
    `If you've used ${L.categoryLabel} apps before and felt nothing changed, that's what ${name} was built to fix.`,
  ].join("\n");

  const keywords = keywordsFrom(input, L);

  return {
    appName: name,
    subtitle,
    promoText,
    description,
    keywords,
  };
}

function keywordsFrom(input: ProductInput, L: CopyLabels): string[] {
  const seed = [
    input.name,
    L.categoryLabel,
    L.audienceLabel,
    L.mechanismLabel,
    L.painLabel,
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
  // Word-boundary trim; never emit an ellipsis.
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
