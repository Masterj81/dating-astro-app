// input-assistant.ts — Input Assistant.
//
// Reads a raw ProductInput and returns a deterministic quality assessment:
// a 0-100 score, an overall status, a list of warnings (with concrete
// fixes), per-field suggestions, and a `rewrittenHints` block that
// proposes sharper, copy-safe values for the most common offending
// fields. No randomness, no API calls.
//
// The assessor never edits the input itself — it only emits suggestions
// the operator can apply. The score is computed deterministically from
// the warning list so the same input always yields the same score.

import type {
  InputQuality,
  InputSuggestion,
  InputWarning,
  InputWarningKind,
  ProductInput,
  RewrittenInputHints,
} from "@/types/strategy";
import { deriveCopyLabels } from "./copy-normalize";

// ---- Tunables -------------------------------------------------------------

const AUDIENCE_CHAR_CAP = 80;
const AUDIENCE_WORD_CAP = 12;
const PAIN_CHAR_CAP = 100;
const PAIN_WORD_CAP = 16;

const GENERIC_AUDIENCE_HEAD = /^(everyone|all|users|customers|people|anyone)\b/i;
const HAS_AUDIENCE_QUALIFIER =
  /\b(\d{2}(?:-\d{2})?|teens|twenties|thirties|forties|fifties|20s|30s|40s|50s|early|mid|late|tired|stuck|sick|exhausted|frustrated|done|fed|new|first-time|returning|lapsed|skeptical|curious|professional|founder|creator|operator|parent|student|writer|developer|designer|gamer|fan|enthusiast|drinker|smoker|runner|cyclist|traveler|traveller|single|married|dating|hobbyist|small\s+business|enterprise|b2b|b2c|astrology[-\s]?curious)\b/i;

const PAIN_CONCRETE_VERBS =
  /\b(fails?\s+to|wastes?|can'?t|cannot|spend(s|ing)?|loses?|losing|leaks?|breaks?|burns?|drops?|stalls?|stops?|abandons?|ghosts?|swipes?|repeats?|rewrites?|forgets?|never\s+finish|never\s+become|sound\s+the\s+same|all\s+sound|don'?t\s+convert|don'?t\s+reply)\b/i;

const GENERIC_DIFF_WORDS =
  /\b(best|better|easy|simple|fast|premium|quality|love|amazing|powerful|great|awesome|innovative|modern)\b/i;

const MECHANISM_NOUN_HINT =
  /\b(graph|engine|algorithm|score|index|chart|map|matrix|signal|api|sdk|library|model|template|workflow|pipeline|playbook|format|protocol|kit|deck|board|inbox|chart|prompt|insight|preview|intro|profile|review|score)\b/i;

const GOAL_BUSINESS_LEAD =
  /^(increase|drive|grow|boost|hit|reach|capture|launch|build|generate|push|achieve|scale|acquire)\b/i;

const GOAL_KPI_NOUN =
  /\b(revenue|roas|cac|ltv|cpa|cvr|ctr|cpm|signups?|trials?|installs?|subscribers?|paid\s+conversions?|active\s+users?|wau|mau|dau|aov|arpu|users?|customers?)\b/i;

// ---- Public --------------------------------------------------------------

export function assessInputQuality(input: ProductInput): InputQuality {
  const warnings: InputWarning[] = [];
  const suggestions: InputSuggestion[] = [];

  detectAudienceWarnings(input, warnings, suggestions);
  detectPainWarnings(input, warnings, suggestions);
  detectDifferentiatorWarnings(input, warnings, suggestions);
  detectGoalWarning(input, warnings, suggestions);
  detectCategoryDuplicated(input, warnings, suggestions);
  detectCompetitorMissing(input, warnings, suggestions);
  detectBusinessModelPriceIncoherence(input, warnings);
  detectOfferContextGaps(input, warnings);
  detectNoProofForSkepticalMarket(input, warnings);

  // Score: start at 100, deduct per warning, clamp.
  let score = 100;
  for (const w of warnings) {
    score -= w.severity === "blocker" ? 20 : 8;
  }
  if (score < 0) score = 0;
  if (score > 100) score = 100;
  const status: InputQuality["status"] =
    score >= 75 ? "strong" : score >= 40 ? "okay" : "weak";

  const rewrittenHints = buildRewrittenHints(input);

  return {
    score,
    status,
    warnings,
    suggestions,
    rewrittenHints,
  };
}

// ---- Detection rules ------------------------------------------------------

function detectAudienceWarnings(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const audience = (input.audience || "").trim();
  if (!audience) {
    push(warnings, {
      kind: "audience-too-generic",
      field: "audience",
      severity: "warning",
      message: "Audience is empty — every downstream draft will read as generic.",
      fix: "Add a qualifier — age range, role, or current state.",
    });
    return;
  }
  const words = audience.split(/\s+/).filter(Boolean).length;
  const tooLong = audience.length > AUDIENCE_CHAR_CAP || words > AUDIENCE_WORD_CAP;
  if (tooLong) {
    push(warnings, {
      kind: "audience-too-long",
      field: "audience",
      severity: "warning",
      message: "Audience is a full sentence — CampaignOS will struggle to fit it in a hook.",
      fix: "Tighten to a noun phrase under 8 words.",
    });
    const labels = deriveCopyLabels(input, []);
    suggestions.push({
      field: "audience",
      suggestion: labels.audienceLabel,
      rationale: "Short noun phrase that survives an overlay.",
    });
  }
  const generic =
    GENERIC_AUDIENCE_HEAD.test(audience) || !HAS_AUDIENCE_QUALIFIER.test(audience);
  if (generic) {
    push(warnings, {
      kind: "audience-too-generic",
      field: "audience",
      severity: "warning",
      message: "Audience reads as everyone — there's no qualifier the copy can hook on.",
      fix: "Add a qualifier — age range, role, or current state.",
    });
    suggestions.push({
      field: "audience",
      suggestion: "Astrology-curious singles, late 20s to 30s, tired of swipe fatigue.",
      rationale: "Adds an age band and a current-state qualifier so hooks can land.",
    });
  }
}

function detectPainWarnings(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const pain = (input.audiencePain || "").trim();
  if (!pain) {
    push(warnings, {
      kind: "pain-too-vague",
      field: "audiencePain",
      severity: "warning",
      message: "Core pain is empty — the strategy has nothing concrete to push against.",
      fix: "Name a specific failure mode in five to ten words.",
    });
    return;
  }
  const words = pain.split(/\s+/).filter(Boolean).length;
  const tooLong = pain.length > PAIN_CHAR_CAP || words > PAIN_WORD_CAP;
  if (tooLong) {
    push(warnings, {
      kind: "pain-too-long",
      field: "audiencePain",
      severity: "warning",
      message: "Core pain runs long — it will leak into overlays as a full sentence.",
      fix: "Cut to a single, concrete pain phrase.",
    });
    const labels = deriveCopyLabels(input, []);
    suggestions.push({
      field: "audiencePain",
      suggestion: labels.painLabel,
      rationale: "First clause keeps the pain noun-shaped.",
    });
  }
  // Vague when no concrete failure mode named.
  const concrete = PAIN_CONCRETE_VERBS.test(pain);
  if (!concrete) {
    push(warnings, {
      kind: "pain-too-vague",
      field: "audiencePain",
      severity: "warning",
      message: "Core pain doesn't name a concrete failure mode buyers will recognise.",
      fix: "Name what actually fails — what's wasted, lost, or never finished.",
    });
    suggestions.push({
      field: "audiencePain",
      suggestion: "Matches never become real conversations.",
      rationale: "Names the failure mode and is short enough for an overlay.",
    });
  }
}

function detectDifferentiatorWarnings(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const diff = (input.differentiator || "").trim();
  if (!diff) {
    push(warnings, {
      kind: "differentiator-too-generic",
      field: "differentiator",
      severity: "warning",
      message: "Differentiator is empty — there's no mechanism for hooks to lean on.",
      fix: "Name the specific mechanism — what does this product do that others don't?",
    });
    return;
  }
  const hasGeneric = GENERIC_DIFF_WORDS.test(diff);
  const hasMechanism = MECHANISM_NOUN_HINT.test(diff);
  if (hasGeneric && !hasMechanism) {
    push(warnings, {
      kind: "differentiator-too-generic",
      field: "differentiator",
      severity: "warning",
      message: "Differentiator is adjectival — buyers can't picture the mechanism.",
      fix: "Name the specific mechanism — what does this product do that others don't?",
    });
    const labels = deriveCopyLabels(input, []);
    suggestions.push({
      field: "differentiator",
      suggestion: labels.mechanismLabel,
      rationale: "Replaces an adjective with a noun the audience can picture.",
    });
  }
}

function detectGoalWarning(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const goal = (input.goal || "").trim();
  if (!goal) return;
  const looksLikePromise =
    GOAL_BUSINESS_LEAD.test(goal) && GOAL_KPI_NOUN.test(goal);
  if (looksLikePromise) {
    push(warnings, {
      kind: "goal-as-promise",
      field: "goal",
      severity: "warning",
      message:
        "Goal reads as a business KPI — CampaignOS never uses it in customer-facing copy.",
      fix:
        "The goal field is for your business KPI — separate from the customer promise. Keep it for internal use.",
    });
    suggestions.push({
      field: "goal",
      suggestion: customerSideOfGoal(goal),
      rationale: "A customer-side outcome the copy can promise out loud.",
    });
  }
}

function detectCategoryDuplicated(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const haystacks = [
    `${input.name ?? ""} ${input.category ?? ""}`,
    input.category ?? "",
    input.description ?? "",
  ];
  for (const h of haystacks) {
    if (/\b(\w{3,})\s+\1\b/i.test(h)) {
      push(warnings, {
        kind: "category-duplicated",
        field: "category",
        severity: "warning",
        message: "A noun is repeated in the product description (e.g. \"dating app app\").",
        fix: "Tidy the product description.",
      });
      suggestions.push({
        field: "category",
        suggestion: (input.category || "").replace(/\b(\w{3,})\s+\1\b/gi, "$1"),
        rationale: "Removes the duplicate noun so overlays read clean.",
      });
      return;
    }
  }
}

function detectCompetitorMissing(
  input: ProductInput,
  warnings: InputWarning[],
  suggestions: InputSuggestion[]
): void {
  const competitors = (input.competitors || "").trim();
  if (competitors.length === 0) {
    push(warnings, {
      kind: "competitor-missing",
      field: "competitors",
      severity: "warning",
      message: "No competitors named — positioning will land softer than it could.",
      fix: "Naming a competitor sharpens positioning.",
    });
    suggestions.push({
      field: "competitors",
      suggestion: "Name two or three obvious alternatives the audience already weighs.",
      rationale: "Gives the comparison shopper avatar something to push against.",
    });
  }
}

function detectBusinessModelPriceIncoherence(
  input: ProductInput,
  warnings: InputWarning[]
): void {
  const model = input.businessModel;
  const ctx = input.offerContext;
  const tier = inferPriceTier(input.price || "");

  if (model === "subscription" && tier === "high" && !ctx?.cogsPercent) {
    push(warnings, {
      kind: "businessmodel-price-incoherent",
      field: "businessModel",
      severity: "warning",
      message:
        "High-ticket subscription without COGS — breakeven ROAS can't be computed.",
      fix: "Add COGS % under offerContext so the offer architect can compute breakeven.",
    });
  }
  if (model === "one-time" && tier === "low") {
    // A low-price one-time SKU with a high-end payment-plan instinct.
    if (input.differentiator && /pay(\s|-)?plan|installment/i.test(input.differentiator)) {
      push(warnings, {
        kind: "businessmodel-price-incoherent",
        field: "businessModel",
        severity: "warning",
        message:
          "Payment-plan signal on a low-price one-time product — the offer won't fit.",
        fix: "Drop the payment-plan framing for low-ticket one-time SKUs.",
      });
    }
  }
}

function detectOfferContextGaps(
  input: ProductInput,
  warnings: InputWarning[]
): void {
  const ctx = input.offerContext;
  const model = input.businessModel;

  // COGS — needed for breakeven ROAS for every monetised model.
  const needsCogs =
    model === "subscription" ||
    model === "one-time" ||
    model === "freemium" ||
    model === "marketplace";
  if (needsCogs && (!ctx || typeof ctx.cogsPercent !== "number")) {
    push(warnings, {
      kind: "missing-offercontext-cogs",
      field: "offerContext.cogsPercent",
      severity: "warning",
      message: "No COGS % — breakeven ROAS can't be computed.",
      fix: "Add COGS % so breakeven ROAS can compute.",
    });
  }
  if (needsCogs && (!ctx || typeof ctx.targetMarginPercent !== "number")) {
    push(warnings, {
      kind: "missing-offercontext-margin",
      field: "offerContext.targetMarginPercent",
      severity: "warning",
      message: "No target margin — the offer architect has no guardrail.",
      fix: "Add target margin % so offers stay inside the contribution envelope.",
    });
  }
  if (needsCogs && (!ctx || typeof ctx.currentAOV !== "number")) {
    push(warnings, {
      kind: "missing-offercontext-aov",
      field: "offerContext.currentAOV",
      severity: "warning",
      message: "No current AOV — the KPI ladder has no anchor.",
      fix: "Add current AOV so the KPI ladder lands at the right tier.",
    });
  }
  if (needsCogs && (!ctx || typeof ctx.targetROAS !== "number")) {
    push(warnings, {
      kind: "missing-offercontext-roas",
      field: "offerContext.targetROAS",
      severity: "warning",
      message: "No target ROAS — kill/keep/scale decisions have no threshold.",
      fix: "Add target ROAS so the diagnosis can flag below-target campaigns.",
    });
  }
}

function detectNoProofForSkepticalMarket(
  input: ProductInput,
  warnings: InputWarning[]
): void {
  if (
    input.sophistication !== "skeptical-market" &&
    input.sophistication !== "mature-market"
  ) {
    return;
  }
  // Heuristic: skeptical/mature markets need proof. We never see a
  // captured-proof signal in the canonical ProductInput, so the
  // surface area for the warning is the offerContext block plus
  // differentiator's mention of proof types.
  const diff = (input.differentiator || "").toLowerCase();
  const mentionsProof =
    /\b(case\s+study|customer\s+quote|testimonial|screenshot|demo\s+video|before[-/\s]?after|review)\b/.test(
      diff
    );
  if (!mentionsProof) {
    push(warnings, {
      kind: "no-proof-for-skeptical-market",
      field: "differentiator",
      severity: "warning",
      message:
        "Skeptical or mature market without any named proof — claims will be doubted.",
      fix:
        "Skeptical markets need proof before spend — see proof asset plan.",
    });
  }
}

// ---- Rewritten hints ------------------------------------------------------

function buildRewrittenHints(input: ProductInput): RewrittenInputHints {
  const labels = deriveCopyLabels(input, []);
  const audience = labels.audienceLabel;
  const corePain = labels.painLabel;
  const differentiator = labels.mechanismLabel;
  const goal = customerSideOfGoal(input.goal || "");
  const proofNeeded = pickProofNeeded(input);
  return { audience, corePain, differentiator, goal, proofNeeded };
}

function customerSideOfGoal(goal: string): string {
  const g = (goal || "").trim();
  if (!g) return "";
  // If the goal already reads customer-side, hand it back.
  if (!GOAL_BUSINESS_LEAD.test(g) && !GOAL_KPI_NOUN.test(g)) return g;
  // Otherwise, pick a deterministic customer-side reframe seeded from
  // the strongest customer signal — pain or differentiator.
  const lower = g.toLowerCase();
  if (/dating|astrology|swip(e|ing)|chemistry|match/.test(lower)) {
    return "Help singles see real compatibility before the conversation starts.";
  }
  if (/writ(e|ing)|draft|novel|fiction|momentum|scene/.test(lower)) {
    return "Help writers keep momentum to the end of the draft.";
  }
  if (/coffee|origin|farmer|roast/.test(lower)) {
    return "Help drinkers taste the origin behind each cup.";
  }
  if (/trial|subscri/.test(lower)) {
    return "Help the audience decide if it fits their style in seven days.";
  }
  return "Help the audience feel the shift in the first week.";
}

function pickProofNeeded(input: ProductInput): string[] {
  const tier = inferPriceTier(input.price || "");
  const soph = input.sophistication;
  const aware = input.awareness;
  const isRecurring =
    input.businessModel === "subscription" || input.businessModel === "freemium";

  // High-ticket or skeptical/mature markets: case studies and demos lead.
  if (tier === "high" || soph === "skeptical-market" || soph === "mature-market") {
    const set = ["customer-quote", "case-study", "demo-video"];
    if (isRecurring) set.push("screenshot");
    return set.slice(0, 4);
  }
  // Low-ticket, most-aware audiences: lean on screenshots and reviews.
  if (tier === "low" && aware === "most-aware") {
    return ["screenshot", "before-after", "app-store-review"];
  }
  // Problem-aware audiences benefit from before/after framing.
  if (aware === "problem-aware" || aware === "unaware") {
    return ["before-after", "demo-video", "customer-quote"];
  }
  // Default: balanced kit.
  return ["screenshot", "demo-video", "customer-quote"];
}

// ---- Helpers --------------------------------------------------------------

function push(warnings: InputWarning[], w: InputWarning): void {
  // Avoid emitting duplicate kinds — first hit wins (deterministic).
  if (warnings.some((existing) => existing.kind === w.kind)) return;
  warnings.push(w);
}

function inferPriceTier(price: string): "low" | "mid" | "high" | "unknown" {
  if (!price) return "unknown";
  const lower = price.toLowerCase();
  if (lower.includes("free")) return "low";
  const m = price.match(/\d+(?:[.,]\d+)?/);
  if (!m) return "unknown";
  const v = Number(m[0].replace(",", "."));
  if (!Number.isFinite(v)) return "unknown";
  if (v < 30) return "low";
  if (v < 200) return "mid";
  return "high";
}

// Re-export for tests.
export type {
  InputQuality,
  InputSuggestion,
  InputWarning,
  InputWarningKind,
  RewrittenInputHints,
} from "@/types/strategy";
