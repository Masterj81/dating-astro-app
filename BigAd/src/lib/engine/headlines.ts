import type { ProductInput } from "@/types/strategy";

// generateHeadlines — produces 10 headline variants spread across
// different copy patterns (question, contrast, mechanism, identity, etc).
// All are built from the input so they reference the audience, pain,
// differentiator, and category by name.

export function generateHeadlines(input: ProductInput): string[] {
  const name = input.name || "Your product";
  const audience = input.audience || "people who care";
  const pain = input.audiencePain || "the same old frustration";
  const differentiator = input.differentiator || "a new approach";
  const category = input.category || "this category";

  const painNoun = pain.replace(/\.$/, "");
  const audienceShort = audience.replace(/\.$/, "");
  // When the audience description already names the pain (e.g. "people tired
  // of shallow swiping" + pain "shallow swiping..."), collapse to a shorter
  // descriptor so headline #1 doesn't double-stack the same idea.
  const audienceForContrast = audienceContainsPain(audienceShort, painNoun)
    ? stripPainSuffix(audienceShort, painNoun)
    : audienceShort;

  return dedupe([
    // 1. Specific contrast
    `${capitalize(category)} for ${audienceForContrast} who are done with ${painNoun.toLowerCase()}.`,
    // 2. Question / pattern-interrupt
    `Why does ${category} still feel like ${painNoun.toLowerCase()}? ${name} answers it differently.`,
    // 3. Mechanism reveal
    `${capitalize(differentiator)} — not more ${category} noise.`,
    // 4. Identity headline
    `${capitalize(audienceShort)} who pick ${name} stop competing on the same playing field.`,
    // 5. Direct promise
    `Less ${painNoun.toLowerCase()}. More signal. That is ${name}.`,
    // 6. Numbered intrigue
    `The 1 thing missing from ${category}: ${shortDiff(differentiator)}.`,
    // 7. Negation + reframe
    `Not another ${category} app. A way for ${audienceShort} to actually move forward.`,
    // 8. Inside-out
    `${name} doesn't fix ${category}. It rebuilds the part of ${category} that ${audienceShort} actually use.`,
    // 9. Cost-of-inaction
    `Every week without ${shortDiff(differentiator)} is another week of ${painNoun.toLowerCase()}.`,
    // 10. "How it works in one line"
    `${name}: ${differentiator}, made for ${audienceShort}.`,
  ]).slice(0, 10);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function shortDiff(diff: string): string {
  const cleaned = diff.replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function audienceContainsPain(audience: string, pain: string): boolean {
  const a = audience.toLowerCase();
  const tokens = pain
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 3);
  // If 2+ meaningful pain tokens already live in the audience phrase,
  // we consider the audience already loaded with the pain idea.
  let hits = 0;
  for (const t of tokens) {
    if (a.includes(t)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

function stripPainSuffix(audience: string, pain: string): string {
  // For phrases like "people tired of shallow swiping" we want "people"
  // back. We strip everything from the first "tired of"/"sick of"/"done with".
  const m = audience.match(/^(.*?)\s+(tired of|sick of|done with|exhausted by|frustrated with)\b.*$/i);
  if (m && m[1].trim()) return m[1].trim();
  // Fallback: keep the audience as-is.
  return audience;
}
