import type { ProductInput, SophisticationLevel } from "@/types/strategy";

// analyzeSophistication — describes how loud and bold the market has
// already heard claims around `category`, and what move the brand should
// make next. Tailored using the product's category and differentiator so
// the notes stop feeling like a textbook excerpt.

export function analyzeSophistication(input: ProductInput): string[] {
  const { sophistication, category, differentiator, competitors } = input;
  const c = category || "the category";
  const d = differentiator || "your differentiator";
  const competitorList = (competitors || "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const competitorHint =
    competitorList.length > 0
      ? `Players like ${competitorList.slice(0, 3).join(", ")} have already trained the market.`
      : `Map the loudest 3 voices in ${c} before you write a word.`;

  switch (sophistication) {
    case "fresh-market":
      return [
        `${c} is new enough that a plain promise still moves people.`,
        `State the result clearly and simply. Avoid clever mechanisms — they confuse a virgin market.`,
        `Lock in the category language now; you can become the default name later.`,
      ];
    case "simple-claims":
      return [
        `Direct promises in ${c} still land, but buyers compare a handful of options.`,
        `Beat competitors on a single, specific dimension instead of stacking many claims.`,
        competitorHint,
      ];
    case "amplified-claims":
      return [
        `${c} is loud. Every brand promises more, faster, easier. Bigger numbers no longer win.`,
        `Pivot from "how much" to "how" — introduce ${d} as the unique mechanism that earns the promise.`,
        `Lead with the mechanism, not the outcome. The outcome stops being credible alone.`,
      ];
    case "skeptical-market":
      return [
        `${c} buyers have been burned. They discount claims by default.`,
        `Open with the failure mode of ${c} so far. Acknowledge what does not work before pitching ${d}.`,
        `Proof density matters more than headline strength: receipts, screenshots, named cases.`,
      ];
    case "mature-market":
      return [
        `${c} is fully mature. New mechanisms get copied within weeks. Identity beats features.`,
        `Build a worldview around ${d} so the brand owns a stance, not just a feature.`,
        `Niche down hard. A specific audience that "gets it" is worth more than a broad audience that doesn't.`,
      ];
  }
}

export function sophisticationLabel(level: SophisticationLevel): string {
  return {
    "fresh-market": "Fresh market",
    "simple-claims": "Simple claims",
    "amplified-claims": "Amplified claims",
    "skeptical-market": "Skeptical market",
    "mature-market": "Mature / niche-it-down",
  }[level];
}
