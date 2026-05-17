import type { ProductInput } from "@/types/strategy";
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

// generateHeadlines — produces up to 10 headline variants spread across
// different copy patterns (question, contrast, mechanism, identity, etc).
// Headlines now use normalised copy labels so they stay short and never
// dump the full audience sentence into a single line.

export function generateHeadlines(
  input: ProductInput,
  labels?: CopyLabels
): string[] {
  const name = input.name || "Your product";
  const L = labels ?? deriveCopyLabels(input, []);

  const lines = [
    // 1. Specific contrast — uses the short audience + pain labels.
    `${capitalize(L.categoryLabel)} for ${L.audienceLabel.toLowerCase()} who are done with ${L.painLabel}.`,
    // 2. Question / pattern-interrupt
    `Why does ${L.categoryLabel} still feel like ${L.painLabel}? ${name} answers it differently.`,
    // 3. Mechanism reveal
    `${capitalize(L.mechanismLabel)} — not more ${L.categoryLabel} noise.`,
    // 4. Identity headline
    `${capitalize(L.audienceLabel)} who pick ${name} stop competing on the same playing field.`,
    // 5. Direct promise
    `Less ${L.painLabel}. More ${L.outcomeLabel}. That is ${name}.`,
    // 6. Numbered intrigue
    `The 1 thing missing from ${L.categoryLabel}: ${L.mechanismLabel}.`,
    // 7. Negation + reframe
    `Not another ${L.categoryLabel}. A way for ${L.audienceLabel.toLowerCase()} to actually move forward.`,
    // 8. Inside-out
    `${name} doesn't fix ${L.categoryLabel}. It rebuilds the part of ${L.categoryLabel} ${L.audienceLabel.toLowerCase()} actually use.`,
    // 9. Cost-of-inaction
    `Every week without ${L.mechanismLabel} is another week of ${L.painLabel}.`,
    // 10. "How it works in one line"
    `${name}: ${L.mechanismLabel}, made for ${L.audienceLabel.toLowerCase()}.`,
  ];

  return dedupe(lines).slice(0, 10);
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
