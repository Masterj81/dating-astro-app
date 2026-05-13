import type {
  GenericFlag,
  ProductInput,
  Strategy,
} from "@/types/strategy";

// Banned phrases (lowercased substring match). These are the
// industry-standard hollow marketing phrases that say nothing about a
// specific product. If any of them slips into generated copy, the
// guard flags it and proposes a specific replacement seeded from the
// product's actual category / audience / differentiator.
//
// Keep this list narrow and concrete. Adding too many short words
// (e.g. "the best") causes false positives across normal copy.

export const BANNED_PHRASES: string[] = [
  "boost your business",
  "take it to the next level",
  "revolutionary",
  "game-changing",
  "game changing",
  "game-changer",
  "unlock your potential",
  "seamless solution",
  "world-class",
  "world class",
  "synergy",
  "best-in-class",
  "best in class",
  "cutting-edge",
  "cutting edge",
  "leverage the power of",
  "next-generation",
  "next generation",
  "one-stop shop",
  "one stop shop",
];

// detectGenericCopy — scans a strategy's customer-facing text fields
// for any banned phrase. Returns one GenericFlag per (field, phrase)
// hit, with a concrete replacement seeded from `input`.
export function detectGenericCopy(
  strategy: Strategy,
  input: ProductInput
): GenericFlag[] {
  const flags: GenericFlag[] = [];

  // Collect every (field, text) pair we want to scan.
  const samples: { field: string; text: string }[] = [];

  strategy.headlines.forEach((h, i) =>
    samples.push({ field: `headline[${i + 1}]`, text: h })
  );
  strategy.angles.forEach((a, i) => {
    samples.push({ field: `angle[${i + 1}].hook`, text: a.hook });
    samples.push({ field: `angle[${i + 1}].rationale`, text: a.rationale });
  });
  samples.push({ field: "landing.hero", text: strategy.landing.hero });
  samples.push({ field: "landing.subhead", text: strategy.landing.subhead });
  strategy.landing.bullets.forEach((b, i) =>
    samples.push({ field: `landing.bullet[${i + 1}]`, text: b })
  );
  samples.push({ field: "landing.cta", text: strategy.landing.cta });
  samples.push({ field: "store.subtitle", text: strategy.store.subtitle });
  samples.push({ field: "store.promoText", text: strategy.store.promoText });
  samples.push({
    field: "store.description",
    text: strategy.store.description,
  });
  strategy.facebookAds.forEach((a, i) => {
    samples.push({
      field: `meta-ad[${i + 1}].primaryText`,
      text: a.primaryText,
    });
    samples.push({ field: `meta-ad[${i + 1}].headline`, text: a.headline });
    samples.push({
      field: `meta-ad[${i + 1}].description`,
      text: a.description,
    });
  });
  strategy.tiktokScripts.forEach((s, i) => {
    samples.push({ field: `tiktok[${i + 1}].hook`, text: s.hook });
    s.beats.forEach((b, j) =>
      samples.push({ field: `tiktok[${i + 1}].beat[${j + 1}]`, text: b })
    );
  });

  for (const { field, text } of samples) {
    const lower = (text || "").toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        flags.push({
          field,
          phrase,
          text,
          suggestion: rewriteSuggestion(phrase, input),
        });
      }
    }
  }

  return flags;
}

// detectGenericInText — same scan, but for an arbitrary string. Used
// in tests and to power a "would this phrase be flagged?" hook in the
// UI if needed.
export function detectGenericInText(
  text: string,
  input: ProductInput,
  field = "text"
): GenericFlag[] {
  const flags: GenericFlag[] = [];
  const lower = (text || "").toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) {
      flags.push({
        field,
        phrase,
        text,
        suggestion: rewriteSuggestion(phrase, input),
      });
    }
  }
  return flags;
}

function rewriteSuggestion(phrase: string, input: ProductInput): string {
  const audience = input.audience || "your audience";
  const category = input.category || "this category";
  const pain = input.audiencePain || "the frustration";
  const diff = input.differentiator || "the unique mechanism";
  const diffShort = shortDiff(diff);

  // Per-phrase replacement seeded from input — never the same line twice
  // across two products.
  switch (phrase) {
    case "boost your business":
      return `Name the specific lever: instead of "boost your business", write "fewer ${painNoun(pain)} per week" or "${diffShort} replaces the slowest part of ${category}".`;
    case "take it to the next level":
      return `Replace with the concrete next state: "${capitalize(audience)} stop ${painNoun(pain)} and start ${normalGoal(input.goal)}."`;
    case "revolutionary":
      return `Drop the adjective. Show the mechanism: "${capitalize(diffShort)} — not another ${category} promise."`;
    case "game-changing":
    case "game changing":
    case "game-changer":
      return `Trade the cliché for a specific shift: "${capitalize(audience)} go from ${painNoun(pain)} to ${normalGoal(input.goal)} in their first session."`;
    case "unlock your potential":
      return `Be concrete about what gets unlocked: "${capitalize(audience)} get back the hours they were losing to ${painNoun(pain)}."`;
    case "seamless solution":
      return `Stop selling "seamless". Sell the moment: "One screen of setup, then ${diffShort} starts working in the next session."`;
    case "world-class":
    case "world class":
      return `Replace with evidence: "Built with ${audience} who tried 3 ${category} apps first" — not "world-class".`;
    case "synergy":
      return `Cut the corporate filler. Say what connects to what: "${capitalize(diffShort)} feeds directly into the part of ${category} ${audience} already use."`;
    case "best-in-class":
    case "best in class":
      return `Pick the one dimension you're actually best at and name it: "${capitalize(diffShort)} — that's the part competitors skip."`;
    case "cutting-edge":
    case "cutting edge":
      return `Date the claim or drop the adjective: "Shipping ${diffShort} this quarter" beats "cutting-edge ${category}".`;
    case "leverage the power of":
      return `Replace "leverage the power of" with the verb the reader cares about: "Use ${diffShort} to skip ${painNoun(pain)}."`;
    case "next-generation":
    case "next generation":
      return `Skip the generational claim. Compare directly: "Unlike most ${category}, ${diffShort} is the layer it works on, not a coat of paint."`;
    case "one-stop shop":
    case "one stop shop":
      return `Name the two or three things this actually replaces: "Replaces ${painNoun(pain)} with ${diffShort}."`;
    default:
      return `Replace "${phrase}" with a sentence that names the audience, the pain, and the mechanism: "${capitalize(audience)} stop ${painNoun(pain)} using ${diffShort}."`;
  }
}

function shortDiff(diff: string): string {
  const cleaned = (diff || "").replace(/\.$/, "");
  const words = cleaned.split(/\s+/);
  if (words.length <= 6) return cleaned;
  return words.slice(0, 6).join(" ");
}

function painNoun(pain: string): string {
  return (pain || "the frustration").replace(/\.$/, "").toLowerCase();
}

function normalGoal(goal: string): string {
  const g = (goal || "").trim().toLowerCase();
  if (!g) return "what they actually came here for";
  return g.replace(/\.$/, "");
}

function capitalize(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
