import type { LandingCopy, ProductInput } from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";
import type { CopyLabels } from "./copy-normalize";

// generateLandingCopy — assembles a hero, sub-hero, value bullets,
// objection handlers, and CTA. The wording adapts to awareness and
// sophistication so the copy is appropriate to where the market is.

export function generateLandingCopy(
  input: ProductInput,
  labels?: CopyLabels
): LandingCopy {
  const L = labels ?? deriveCopyLabels(input, []);
  const name = input.name || "Your product";

  const hero =
    input.awareness === "unaware"
      ? `${capitalize(L.painLabel)} is not who you are. It is how ${L.categoryLabel} is built.`
      : input.awareness === "product-aware" || input.awareness === "most-aware"
      ? `${name}: ${L.mechanismLabel}, made for ${L.audienceLabel.toLowerCase()}.`
      : `${capitalize(L.categoryLabel)}, rebuilt around ${L.mechanismLabel}.`;

  const subhead =
    `For ${L.audienceLabel.toLowerCase()} done with ${L.painLabel}. ` +
    `${name} replaces the surface-level parts of ${L.categoryLabel} with ${L.mechanismLabel}, so the next move you make actually fits.`;

  const bullets = [
    `Built specifically for ${L.audienceLabel.toLowerCase()}, not the average user of ${L.categoryLabel}.`,
    `Replaces ${L.painLabel} with ${L.outcomeLabel}.`,
    `Designed to help you reach ${L.outcomeLabel} without restarting from scratch.`,
    `No bloat. No dark patterns. No reasons to apologise for the product.`,
  ];

  const cta =
    input.awareness === "most-aware"
      ? `Start with ${name} today`
      : `Try ${name}`;

  const socialProofLine =
    input.sophistication === "skeptical-market" || input.sophistication === "mature-market"
      ? `Quietly used by ${L.audienceLabel.toLowerCase()} done with the ${L.categoryLabel} hamster wheel.`
      : `Built with — and for — ${L.audienceLabel.toLowerCase()}.`;

  const objectionsHandled = [
    {
      objection: `"Is this just another ${L.categoryLabel} product?"`,
      reply: `No. Most ${L.categoryLabel} tools optimise ${L.painLabel}. ${name} replaces it with ${L.mechanismLabel}.`,
    },
    {
      objection: `"I've tried tools like this before."`,
      reply: `Then you know the failure mode. ${name} is engineered around that failure — ${L.mechanismLabel} is the part previous attempts skipped.`,
    },
    {
      objection: `"I'm too busy to set up another tool."`,
      reply: `Setup is one screen. ${name} starts working from the first session, then gets sharper as you use it.`,
    },
  ];

  return { hero, subhead, bullets, cta, socialProofLine, objectionsHandled };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
