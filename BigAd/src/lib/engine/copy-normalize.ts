// copy-normalize.ts — Copy-safe normalization layer.
//
// Many engine modules used to interpolate `input.audience`, `input.audiencePain`,
// `input.differentiator`, and `input.goal` directly into customer-facing copy.
// That produced clumsy artefacts: "dating app app", full-sentence audience
// descriptions inside headlines, business goals used as customer promises,
// ellipsis truncations mid-clause, and offers that didn't fit the business
// model (free shipping on a subscription app, for example).
//
// `deriveCopyLabels(input, offers)` is the single source of truth for the
// short noun phrases the rest of the engine should use when emitting copy.
// Pure, deterministic — same input always yields the same labels.
//
// Helper sub-functions are exported so the test suite can pin down their
// behaviour (anti-pattern unit tests).

import type {
  CopyIssue,
  CopyIssueKind,
  OfferKind,
  OfferRecommendation,
  ProductInput,
  Strategy,
} from "@/types/strategy";

// Re-export so consumers can import from copy-normalize.
export type { CopyIssue, CopyIssueKind } from "@/types/strategy";

// ---- Public types ---------------------------------------------------------

export interface CopyLabels {
  audienceLabel: string;      // short noun phrase, 2-4 words
  painLabel: string;          // short noun phrase, 2-5 words
  mechanismLabel: string;     // short noun phrase, the product's how, 2-5 words
  outcomeLabel: string;       // short noun phrase, what user gets, 2-5 words
  categoryLabel: string;      // category noun, 1-2 words
  competitorLabel: string;    // generic competitor mention
  offerLabel: string;         // short offer phrase, 4-7 words
}

// ---- Filler / stop-word lists --------------------------------------------

// Common filler tokens to strip from extracted phrases. We keep this small
// and deterministic — every entry is a literal word.
const LEADING_FILLERS = new Set([
  "the", "a", "an", "and", "but", "or", "so", "of", "in", "on", "at",
  "for", "to", "with", "from", "by", "as", "is", "are", "was", "were",
  "be", "being", "been", "has", "have", "had", "they", "them", "their",
  "we", "us", "our", "you", "your", "i", "me", "my", "it", "its",
  "this", "that", "these", "those", "who", "which", "what",
]);

// Phrases that precede an actual noun phrase in user-typed pain descriptions.
// "users feel exhausted by shallow swiping" → "shallow swiping".
const PAIN_LEAD_STRIPPERS: RegExp[] = [
  /^users?\s+(?:feel|are|get|keep)\s+/i,
  /^they(?:'re|\s+are|\s+feel|\s+get|\s+keep)\s+/i,
  /^the\s+problem\s+(?:is|with[^.]*?\s+is)\s+/i,
  /^(?:it'?s|its)\s+/i,
  /^(?:exhausted|tired|stuck|frustrated|overwhelmed|sick|done|fed\s+up)\s+(?:by|with|of)\s+/i,
  /^(?:feels?|reads?)\s+like\s+/i,
];

// Audience-leak strippers — drops sentence-style framing so we can extract
// a noun phrase like "Curious 25-34s" out of a long description.
const AUDIENCE_TAIL_STRIPPERS: RegExp[] = [
  /\s+who\b.*$/i,
  /\s+that\b.*$/i,
  /\s+tired\s+of\b.*$/i,
  /\s+sick\s+of\b.*$/i,
  /\s+done\s+with\b.*$/i,
  /\s+exhausted\s+by\b.*$/i,
  /\s+frustrated\s+with\b.*$/i,
  /\s+looking\s+for\b.*$/i,
  /\s+and\s+want\b.*$/i,
  /\s+wanting\b.*$/i,
];

// Goal-as-promise strippers — drops business-side verbs so a customer-facing
// outcome can be extracted. "Drive free trial starts to validate PMF" →
// "free trial starts".
const GOAL_LEAD_STRIPPERS: RegExp[] = [
  /^(?:drive|grow|hit|reach|achieve|launch|build|capture|generate|push)\s+(?:to|the|a)?\s*/i,
  /^(?:we\s+want\s+to|aiming\s+to|trying\s+to)\s+/i,
];

// Goal tail strippers — remove the business-side "to validate / so we can"
// clauses that leak operator intent.
const GOAL_TAIL_STRIPPERS: RegExp[] = [
  /\s+to\s+validate\b.*$/i,
  /\s+so\s+we\s+can\b.*$/i,
  /\s+with\s+a\s+\d.*$/i,
  /\s+at\s+a\s+\d.*$/i,
  /\s+across\s+\w+\s+and\s+\w+.*$/i,
];

// Category nouns we treat as the "product noun" head. If the input.product
// or input.category already contains one of these, we never duplicate it.
const PRODUCT_NOUNS = new Set([
  "app", "site", "platform", "tool", "service", "subscription",
  "club", "kit", "course", "newsletter", "extension", "plugin",
  "marketplace", "agency", "studio", "store", "shop",
]);

// Map from broad category families to a generic competitor noun.
const CATEGORY_COMPETITOR_HINTS: { match: RegExp; label: string }[] = [
  { match: /\bdating\b/i, label: "swipe apps" },
  { match: /\bwriting\b/i, label: "blank-page tools" },
  { match: /\bnote\s*(?:s|taking)?\b/i, label: "messy note apps" },
  { match: /\bcoffee\b/i, label: "supermarket coffee" },
  { match: /\bfitness\b/i, label: "generic fitness apps" },
  { match: /\bmeditation\b/i, label: "calm-app clones" },
  { match: /\blanguage\b/i, label: "streak-bait language apps" },
  { match: /\bbudget(?:ing)?\b/i, label: "spreadsheet budgeting" },
  { match: /\binvest(?:ing|ment)?\b/i, label: "robo-advisors" },
  { match: /\bproject\s*management\b/i, label: "kanban tools" },
  { match: /\bcrm\b/i, label: "legacy CRMs" },
  { match: /\bnewsletter\b/i, label: "open-rate newsletters" },
  { match: /\bcourse\b/i, label: "static video courses" },
  { match: /\bjob(s)?\b/i, label: "job boards" },
];

// ---- Public derivation ----------------------------------------------------

export function deriveCopyLabels(
  input: ProductInput,
  offers: OfferRecommendation[]
): CopyLabels {
  const categoryLabel = deriveCategoryLabel(input);
  const audienceLabel = deriveAudienceLabel(input);
  const painLabel = derivePainLabel(input);
  const mechanismLabel = deriveMechanismLabel(input);
  const outcomeLabel = deriveOutcomeLabel(input, painLabel);
  const competitorLabel = deriveCompetitorLabel(input, categoryLabel);
  const offerLabel = deriveOfferLabel(input, offers);

  return {
    audienceLabel,
    painLabel,
    mechanismLabel,
    outcomeLabel,
    categoryLabel,
    competitorLabel,
    offerLabel,
  };
}

// ---- Derivation rules -----------------------------------------------------

function deriveCategoryLabel(input: ProductInput): string {
  // Prefer input.category, falling back to a noun extracted from the name.
  const raw = (input.category || "").trim();
  if (!raw) return "product";

  // dedupe "dating app app" / "writing tool tool".
  const collapsed = dedupeAdjacentRepeats(raw);

  // Limit to first two words to keep the label tight.
  const words = collapsed.split(/\s+/).filter(Boolean);
  const tight = words.slice(0, 2).join(" ");
  return tight || "product";
}

function deriveAudienceLabel(input: ProductInput): string {
  const raw = (input.audience || "").trim();
  if (!raw) return "your people";

  // Special rule: pick out an age-range cluster if one is present.
  // "people in their late twenties and thirties" → "Late 20s and 30s".
  const ageMatch = raw.match(
    /\b(early|mid|late)?\s*(twenties|thirties|forties|fifties|teens|20s|30s|40s|50s)\b(?:\s+(?:and|or|to)\s+(early|mid|late)?\s*(twenties|thirties|forties|fifties|teens|20s|30s|40s|50s))?/i
  );
  if (ageMatch) {
    const pretty = (m: string | undefined): string =>
      m
        ? m
            .replace(/twenties/i, "20s")
            .replace(/thirties/i, "30s")
            .replace(/forties/i, "40s")
            .replace(/fifties/i, "50s")
            .replace(/teens/i, "teens")
        : "";
    const lead = pretty(ageMatch[1]);
    const a = pretty(ageMatch[2]);
    const lead2 = pretty(ageMatch[3]);
    const b = pretty(ageMatch[4]);
    if (b) {
      return capFirst([lead, a, "and", lead2, b].filter(Boolean).join(" "));
    }
    return capFirst([lead, a].filter(Boolean).join(" "));
  }

  // Strip trailing clauses ("who are...", "and want...") so we end up with
  // the head noun phrase only.
  let head = raw;
  for (const re of AUDIENCE_TAIL_STRIPPERS) head = head.replace(re, "");
  head = head.trim().replace(/[,.;:]+$/, "");

  // Drop leading "people / users / folks who are X" framings —
  // "fiction writers stuck in the middle" → "fiction writers".
  head = head.replace(/^(people|users|folks|adults|professionals|operators)\s+/i, "");

  // Cut at noun heads: split into first sub-clause before "stuck", "tired",
  // etc. — these are typical pain qualifiers.
  head = head.split(/\s+(?:stuck|tired|sick|exhausted|frustrated|done|fed)\b/i)[0];
  head = head.trim();

  return toShortNounPhrase(head, 4) || toShortNounPhrase(raw, 4) || "your people";
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

function derivePainLabel(input: ProductInput): string {
  const raw = (input.audiencePain || "").trim();
  if (!raw) return "the recurring friction";

  // Split on dash / em-dash first — many pain inputs are structured
  // "<phrase> — <amplification>". Keep the first half.
  let firstClause = raw.split(/\s+[—\-–]\s+/)[0].trim();

  // Then split on the first comma / semicolon / "and".
  firstClause = firstClause.split(/[,;]|\s+and\s+/i)[0].trim();

  // Strip subclauses introduced by "where", "that", "which" — these tend
  // to drag the label past the 5-word target.
  firstClause = firstClause.split(/\s+(?:where|that|which|when)\s+/i)[0].trim();

  // Strip "users feel" / "they're" / "the problem is" leaders.
  const stripped = stripFillers(firstClause);

  return toShortNounPhrase(stripped, 5) || toShortNounPhrase(firstClause, 5) ||
    "the recurring friction";
}

function deriveMechanismLabel(input: ProductInput): string {
  const raw = (input.differentiator || "").trim();
  if (!raw) return "a different mechanism";

  // Split on dash / em-dash first — differentiators are often
  // "<phrase> — <amplification>".
  let firstClause = raw.split(/\s+[—\-–]\s+/)[0].trim();

  // First clause only — differentiators are often a list ("X, plus Y, plus Z").
  firstClause = firstClause.split(/[,;]|\s+plus\s+/i)[0].trim();

  // Drop subclauses introduced by "that", "which", "where" — these tend
  // to drag past the 5-word target.
  firstClause = firstClause.split(/\s+(?:that|which|where|when)\s+/i)[0].trim();

  // If the result still starts with "every X is" or "each X is", keep
  // the head noun phrase only ("every bag" not "every bag is a named").
  firstClause = firstClause.replace(/\s+\bis\s+a?\s+.*/i, "").trim();

  return toShortNounPhrase(firstClause, 5) || toShortNounPhrase(raw, 5) ||
    "a different mechanism";
}

function deriveOutcomeLabel(input: ProductInput, painLabel: string): string {
  // Try to flip the pain into a positive noun phrase first.
  const flippedPain = flipPainToOutcome(painLabel);
  if (flippedPain) return flippedPain;

  // Try to extract a customer-side outcome from the goal, stripping any
  // business-side framing ("Drive trial starts to validate PMF").
  const goal = (input.goal || "").trim();
  if (goal) {
    let cleaned = goal;
    for (const re of GOAL_LEAD_STRIPPERS) cleaned = cleaned.replace(re, "");
    for (const re of GOAL_TAIL_STRIPPERS) cleaned = cleaned.replace(re, "");

    // Strip everything from the first sentinel that implies business-side
    // intent ("with a 25% reply rate", "across November and December",
    // "with 1,000 weekly active matchers"). These are operator metrics,
    // not customer promises.
    cleaned = cleaned.split(/\s+with\s+(?:a\s+)?\d/i)[0];
    cleaned = cleaned.split(/\s+across\s+/i)[0];
    cleaned = cleaned.split(/\s+by\s+\w+\s+\d/i)[0];

    // Drop $ amounts ("hit $180k in holiday gifting revenue" → drop the
    // dollar prefix and keep "holiday gifting revenue" → still business-side).
    // Detect a leading dollar amount and fall through if it dominates.
    if (/^\$?\d/.test(cleaned.trim()) || /revenue|roas|cac|users?|signups?/i.test(cleaned)) {
      // Business-side metric leaked through. Fall back to category-specific
      // customer flip, or a generic placeholder.
      const flipped = flipPainToOutcome(painLabel);
      if (flipped) return flipped;
      return "real progress";
    }

    // Strip trailing punctuation / dashes.
    cleaned = cleaned.replace(/[\s\-—–:]+$/, "").trim();

    const phrase = toShortNounPhrase(cleaned, 5);
    if (phrase) return phrase;
  }

  return "real progress";
}

function deriveCompetitorLabel(
  input: ProductInput,
  categoryLabel: string
): string {
  const cat = (input.category || "") + " " + categoryLabel;
  for (const hint of CATEGORY_COMPETITOR_HINTS) {
    if (hint.match.test(cat)) return hint.label;
  }
  // Fall through: generalise from input.competitors if present, else generic.
  const competitors = (input.competitors || "").trim();
  if (competitors) {
    // Always generalise — never echo a brand name.
    return `other ${categoryLabel}s`.replace(/ss$/, "s");
  }
  return `other ${categoryLabel}s`.replace(/ss$/, "s");
}

function deriveOfferLabel(
  input: ProductInput,
  offers: OfferRecommendation[]
): string {
  const productName = (input.name || "Premium").trim();
  const model = input.businessModel;
  const isRecurring = model === "subscription" || model === "freemium";
  const isPhysical = model === "one-time" || model === "marketplace";

  // Find the most subscription-friendly offer in the recommendation set.
  const order: OfferKind[] = isRecurring
    ? ["free-trial", "guarantee", "discount", "bundle"]
    : isPhysical
    ? ["bundle", "discount", "guarantee", "free-shipping"]
    : ["free-trial", "guarantee", "discount", "bundle"];

  let chosen: OfferRecommendation | undefined;
  for (const kind of order) {
    chosen = offers.find((o) => o.kind === kind);
    if (chosen) break;
  }
  if (!chosen) chosen = offers[0];

  if (!chosen) {
    return isRecurring ? `Try ${productName} free` : `Get ${productName} today`;
  }

  switch (chosen.kind) {
    case "free-trial":
      return isRecurring
        ? `Try ${productName} free for 7 days`
        : `Try ${productName} risk-free`;
    case "guarantee":
      return `30-day guarantee on ${productName}`;
    case "discount":
      return `Save on your first ${productName} order`;
    case "bundle":
      return `${productName} starter bundle`;
    case "payment-plan":
      return `Split ${productName} into payments`;
    case "free-shipping":
      return isPhysical ? `Free shipping on ${productName}` : `Get ${productName} today`;
    case "free-gift":
      return isPhysical ? `Free gift with ${productName}` : `Get ${productName} today`;
  }
}

// ---- Helper sub-functions (exported for unit tests) -----------------------

// dedupeAdjacentRepeats — catches "dating app app" → "dating app",
// "writing tool tool" → "writing tool". Case-insensitive comparison;
// preserves the original casing of the first occurrence.
export function dedupeAdjacentRepeats(text: string): string {
  if (!text) return text;
  // Run the regex repeatedly until no more adjacent repeats exist (handles
  // "app app app" → "app").
  let out = text;
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(/\b(\w+)(\s+)\1\b/gi, "$1");
  }
  return out;
}

// stripFillers — removes leading "users feel" / "they're" / "the problem is"
// style framings so the remaining text is closer to a noun phrase.
export function stripFillers(text: string): string {
  let out = (text || "").trim();
  for (const re of PAIN_LEAD_STRIPPERS) {
    out = out.replace(re, "");
  }
  // Drop any leading filler words ("the", "a", "their"...).
  const words = out.split(/\s+/);
  while (words.length > 0 && LEADING_FILLERS.has(words[0].toLowerCase())) {
    words.shift();
  }
  return words.join(" ").trim();
}

// toShortNounPhrase — clamp text to the first `maxWords` content words.
// Strips trailing punctuation and never returns an ellipsis. Preserves the
// original casing of the first word.
export function toShortNounPhrase(text: string, maxWords: number): string {
  if (!text) return "";
  const cleaned = text.trim().replace(/[.,;:!?]+$/, "");
  if (!cleaned) return "";

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");

  return words.slice(0, maxWords).join(" ");
}

// flipPainToOutcome — for a pain like "shallow swiping" produce an outcome
// like "real compatibility". Deterministic phrase map keyed off common
// pain heads. Returns "" when no obvious flip exists.
function flipPainToOutcome(painLabel: string): string {
  const p = (painLabel || "").toLowerCase();
  if (!p) return "";

  if (/\bshallow\s+swiping\b/.test(p)) return "real compatibility";
  if (/\bswiping\b/.test(p)) return "real conversations";
  if (/\bghost(ing|ed)?\b/.test(p)) return "replies that land";
  if (/\bblank\s+page\b/.test(p)) return "momentum on the page";
  if (/\bwriter'?s?\s+block\b/.test(p)) return "first-draft momentum";
  if (/\blosing\s+momentum\b/.test(p)) return "draft momentum that holds";
  if (/\bmomentum\b/.test(p)) return "steady momentum";
  if (/\bdecision\s+fatigue\b/.test(p)) return "easy decisions";
  if (/\b(boring|bland|same)\b/.test(p)) return "something different";
  if (/\bmarketing\b/.test(p)) return "honest sourcing";
  if (/\bbusywork\b/.test(p)) return "real progress";
  if (/\bfriction\b/.test(p)) return "an easier path";
  return "";
}

// ---- Anti-bad-copy validator ----------------------------------------------

const DUPLICATE_NOUN_RE = /\b(\w+)\s+\1\b/i;

export function checkCopyIssues(
  strategy: Strategy,
  input: ProductInput
): CopyIssue[] {
  const issues: CopyIssue[] = [];

  // ---- duplicate-noun + ellipsis: deep walk over string leaves ----
  const stringLeaves = collectStringLeaves(strategy);
  for (const { path, text } of stringLeaves) {
    if (DUPLICATE_NOUN_RE.test(text)) {
      const match = text.match(DUPLICATE_NOUN_RE);
      // Skip when the repeated word is a short filler ("a a"). We only
      // care about word-pair repeats where the noun is 3+ letters.
      if (match && match[1].length >= 3) {
        issues.push({ kind: "duplicate-noun", source: path, text });
      }
    }
    if (text.includes("...") || text.includes("…")) {
      issues.push({ kind: "ellipsis", source: path, text });
    }
  }

  // ---- audience-sentence-leak ----
  const audience = (input.audience || "").trim();
  const audienceWords = audience.split(/\s+/).filter(Boolean).length;
  if (audience && audienceWords > 5) {
    const needle = audience.toLowerCase();
    for (const it of strategy.hookLibrary.items) {
      if (it.text.toLowerCase().includes(needle)) {
        issues.push({
          kind: "audience-sentence-leak",
          source: `hookLibrary.items[${strategy.hookLibrary.items.indexOf(it)}].text`,
          text: it.text,
        });
      }
    }
    for (let i = 0; i < strategy.headlines.length; i++) {
      const h = strategy.headlines[i];
      if (h.toLowerCase().includes(needle)) {
        issues.push({
          kind: "audience-sentence-leak",
          source: `headlines[${i}]`,
          text: h,
        });
      }
    }
    for (let i = 0; i < strategy.staticBriefs.length; i++) {
      const s = strategy.staticBriefs[i];
      if (s.headlineOverlay.toLowerCase().includes(needle)) {
        issues.push({
          kind: "audience-sentence-leak",
          source: `staticBriefs[${i}].headlineOverlay`,
          text: s.headlineOverlay,
        });
      }
    }
  }

  // ---- goal-as-promise ----
  const goal = (input.goal || "").trim();
  const goalWords = goal.split(/\s+/).filter(Boolean).length;
  if (goal && goalWords > 4) {
    const needle = goal.toLowerCase();
    const customerFacingStrings: { path: string; text: string }[] = [];
    customerFacingStrings.push(
      ...strategy.headlines.map((h, i) => ({ path: `headlines[${i}]`, text: h }))
    );
    customerFacingStrings.push(
      ...strategy.hookLibrary.items.map((it, i) => ({
        path: `hookLibrary.items[${i}].text`,
        text: it.text,
      }))
    );
    for (let i = 0; i < strategy.staticBriefs.length; i++) {
      customerFacingStrings.push({
        path: `staticBriefs[${i}].headlineOverlay`,
        text: strategy.staticBriefs[i].headlineOverlay,
      });
      customerFacingStrings.push({
        path: `staticBriefs[${i}].subOverlay`,
        text: strategy.staticBriefs[i].subOverlay,
      });
    }
    for (const { path, text } of customerFacingStrings) {
      if (text && text.toLowerCase().includes(needle)) {
        issues.push({ kind: "goal-as-promise", source: path, text });
      }
    }
  }

  // ---- overlong-overlay ----
  for (let i = 0; i < strategy.staticBriefs.length; i++) {
    const s = strategy.staticBriefs[i];
    const words = wordCount(s.headlineOverlay);
    if (words > 8) {
      issues.push({
        kind: "overlong-overlay",
        source: `staticBriefs[${i}].headlineOverlay`,
        text: s.headlineOverlay,
      });
    }
  }

  // ---- overlong-hook ----
  // A hook is "overlong" when either:
  //   (a) total word count > 18, OR
  //   (b) it carries 2+ separate sentences AND total words > 14 (a single
  //       punchy two-sentence hook like "Less X. More Y." is fine).
  for (let i = 0; i < strategy.hookLibrary.items.length; i++) {
    const it = strategy.hookLibrary.items[i];
    const words = wordCount(it.text);
    const multi = containsMultipleSentences(it.text);
    if (words > 18 || (multi && words > 14)) {
      issues.push({
        kind: "overlong-hook",
        source: `hookLibrary.items[${i}].text`,
        text: it.text,
      });
    }
  }

  // ---- irrelevant-offer ----
  if (strategy.offers.length > 0) {
    const topOffer = strategy.offers[0];
    const model = input.businessModel;
    const isRecurring = model === "subscription" || model === "freemium";
    const isLowPrice = (() => {
      const m = (input.price || "").match(/\d+(?:[.,]\d+)?/);
      if (!m) return false;
      const v = Number(m[0].replace(",", "."));
      return Number.isFinite(v) && v < 30;
    })();

    if (isRecurring && topOffer.kind === "free-shipping") {
      issues.push({
        kind: "irrelevant-offer",
        source: "offers[0]",
        text: `Top offer is free-shipping on a subscription-style product (${input.businessModel}).`,
      });
    }
    if (isLowPrice && topOffer.kind === "payment-plan") {
      issues.push({
        kind: "irrelevant-offer",
        source: "offers[0]",
        text: `Top offer is payment-plan on a low-price product (${input.price}).`,
      });
    }
    // Free-gift in the top 3 implies a physical SKU; flag only when it
    // ranks high enough to mislead an operator.
    const isDigital = isRecurring;
    for (let i = 0; i < Math.min(3, strategy.offers.length); i++) {
      const o = strategy.offers[i];
      if (isDigital && o.kind === "free-gift") {
        issues.push({
          kind: "irrelevant-offer",
          source: `offers[${i}]`,
          text: `Free-gift implies a physical SKU; product is ${input.businessModel}.`,
        });
      }
    }
  }

  return issues;
}

// ---- Walk helpers --------------------------------------------------------

interface StringLeaf {
  path: string;
  text: string;
}

function collectStringLeaves(root: unknown): StringLeaf[] {
  const out: StringLeaf[] = [];
  walk(root, "", out);
  return out;
}

function walk(node: unknown, path: string, out: StringLeaf[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    if (node.length > 0) out.push({ path, text: node });
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      walk(node[i], `${path}[${i}]`, out);
    }
    return;
  }
  // Skip walking the exportBrief markdown — it's a concatenation of every
  // other field, so duplicate-noun matches inside it would be noisy.
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (path === "" && key === "exportBrief") continue;
    walk(
      (node as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
      out
    );
  }
}

function wordCount(s: string): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function containsMultipleSentences(s: string): boolean {
  // A hook should be a single short sentence. A period followed by another
  // word indicates a second sentence. Ellipses (already flagged elsewhere)
  // are excluded.
  if (!s) return false;
  const stripped = s.replace(/\.\.\./g, "");
  return /[.!?]\s+[A-Za-z]/.test(stripped);
}
