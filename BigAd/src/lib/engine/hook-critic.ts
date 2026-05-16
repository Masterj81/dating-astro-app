// hook-critic.ts — On-demand critic for a user-typed hook draft.
//
// Pure, deterministic, no API. Score starts at 100; each flag subtracts
// per severity (high=-20, medium=-10, low=-5), clamped to [0, 100]. The
// rewrite is template-driven, parameterised on the product input. Voice
// is BigAd's own — generic direct-response phrasing.
//
// This module is NOT wired into buildStrategy(). It is exported from
// engine/index.ts so the UI can call it from a textarea in the Ads tab.

import type {
  AwarenessLevel,
  HookCritique,
  HookFlag,
  HookFlagKind,
  ProductInput,
} from "@/types/strategy";

// Words that signal a weak opener when they begin the draft.
const WEAK_OPENERS = new Set([
  "the",
  "a",
  "an",
  "this",
  "that",
  "these",
  "those",
  "it",
  "well",
  "so",
  "basically",
  "actually",
  "literally",
  "just",
  "really",
  "honestly",
  "okay",
  "ok",
  "hi",
  "hey",
  "hello",
  "introducing",
]);

// Stake / pain trigger words. If absent from the draft we flag "no-stakes".
const STAKE_WORDS = [
  "pain",
  "tired",
  "stuck",
  "wasted",
  "fail",
  "missing",
  "broken",
  "boring",
  "frustrat",
  "exhaust",
  "lose",
  "lost",
  "cost",
  "expensive",
  "never",
  "hard",
  "annoying",
  "regret",
  "fear",
  "worry",
  "drain",
  "ruin",
  "waste",
];

// Passive-voice trigger pattern: am/is/are/was/were/be/been + past-participle-ish word.
const PASSIVE_PATTERN =
  /\b(?:am|is|are|was|were|be|been|being)\s+\w+(?:ed|en|own|aid)\b/i;

// Bland category openings.
const BLAND_PATTERNS = [
  /\bbest\s+(?:app|product|tool|service|brand|solution)\b/i,
  /\bnumber\s+one\b/i,
  /\bworld[- ]class\b/i,
  /\bgame[- ]?changing\b/i,
  /\brevolutionary\b/i,
  /\bnext[- ]level\b/i,
  /\bnext[- ]generation\b/i,
  /\bcutting[- ]edge\b/i,
];

// Tone fingerprints (very rough, deterministic). We compare the draft's
// "tone signal" against the voice we'd expect for the awareness stage.
const FORMAL_MARKERS = [/\bhowever\b/i, /\bmoreover\b/i, /\bthereby\b/i, /\butilize\b/i];
const CASUAL_MARKERS = [/\b(?:gonna|wanna|kinda|lemme|tbh|imo)\b/i, /[!?]{2,}/];

export function critiqueHook(draft: string, input: ProductInput): HookCritique {
  const trimmed = (draft ?? "").trim();
  const flags: HookFlag[] = [];

  // Tokenise.
  const words = trimmed.length === 0 ? [] : trimmed.split(/\s+/);
  const wordCount = words.length;

  // Spoken-vs-overlay envelope. Heuristic: if the draft is fully UPPER it
  // reads as an overlay; otherwise treat as spoken-spec.
  const looksLikeOverlay =
    trimmed.length > 0 &&
    trimmed === trimmed.toUpperCase() &&
    trimmed.replace(/[^A-Za-z]/g, "").length > 4;
  const lengthCeiling = looksLikeOverlay ? 8 : 12;

  if (wordCount > lengthCeiling) {
    flags.push({
      kind: "too-long",
      severity: wordCount > lengthCeiling + 6 ? "high" : "medium",
      message: `Hook runs ${wordCount} words — the eye leaves before the payoff lands.`,
      fix: `Trim to ${lengthCeiling} words or fewer. Lead with the single sharpest noun.`,
    });
  }

  // Weak opener.
  const firstWord = (words[0] ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (firstWord && WEAK_OPENERS.has(firstWord)) {
    flags.push({
      kind: "weak-opener",
      severity: "medium",
      message: `The first word "${words[0]}" is filler — the viewer hears it and tunes out.`,
      fix: `Open with a concrete noun or verb. Cut the filler.`,
    });
  }

  // No-stakes: no pain / stake words anywhere in the draft.
  const lower = trimmed.toLowerCase();
  const painHit =
    STAKE_WORDS.some((w) => lower.includes(w)) ||
    (input.audiencePain &&
      lower.includes(input.audiencePain.toLowerCase().slice(0, 12)));
  if (!painHit && wordCount > 0) {
    flags.push({
      kind: "no-stakes",
      severity: "high",
      message: `No stake or pain word — the viewer is not given a reason to care in the first beat.`,
      fix: `Name the cost in the viewer's own words. Mirror "${truncate(
        input.audiencePain || "the recurring friction",
        50
      )}".`,
    });
  }

  // No specificity: no digits AND no named entity (capitalised mid-sentence word).
  const hasDigit = /\d/.test(trimmed);
  const hasNamedEntity = /(?:^|\s)([A-Z][a-z]{2,})/.test(trimmed);
  if (!hasDigit && !hasNamedEntity && wordCount > 0) {
    flags.push({
      kind: "no-specificity",
      severity: "medium",
      message: `No number, name, or place — the claim could apply to any product in the category.`,
      fix: `Add one concrete detail: a count, a duration, a named audience, or a named place.`,
    });
  }

  // Buried payoff: hook ends with the strong word, not starts with it.
  if (wordCount >= 6) {
    const lastQuarter = words.slice(Math.floor(wordCount * 0.75)).join(" ").toLowerCase();
    const firstQuarter = words.slice(0, Math.max(1, Math.floor(wordCount * 0.25))).join(" ").toLowerCase();
    const productHint = (input.differentiator || input.category || "").toLowerCase().split(/\s+/)[0];
    if (
      productHint &&
      productHint.length > 3 &&
      lastQuarter.includes(productHint) &&
      !firstQuarter.includes(productHint)
    ) {
      flags.push({
        kind: "buried-payoff",
        severity: "medium",
        message: `The strongest noun lands at the end of the hook — the viewer has scrolled by then.`,
        fix: `Move the payoff into the first three words.`,
      });
    }
  }

  // Passive voice.
  if (PASSIVE_PATTERN.test(trimmed)) {
    flags.push({
      kind: "passive-voice",
      severity: "low",
      message: `Passive verb form — the subject of the sentence is unclear.`,
      fix: `Rewrite as an active sentence. Put the doer in the first three words.`,
    });
  }

  // Category-bland phrases.
  for (const re of BLAND_PATTERNS) {
    if (re.test(trimmed)) {
      flags.push({
        kind: "category-bland",
        severity: "high",
        message: `Reads like a generic category claim — could be any brand.`,
        fix: `Replace with a sentence only your product could say. Reference "${truncate(
          input.differentiator || input.category || "the mechanism",
          50
        )}".`,
      });
      break;
    }
  }

  // Off-tone vs awareness.
  const formal = countMatches(trimmed, FORMAL_MARKERS);
  const casual = countMatches(trimmed, CASUAL_MARKERS);
  if (input.awareness === "unaware" || input.awareness === "problem-aware") {
    if (formal > 0 && casual === 0) {
      flags.push({
        kind: "off-tone",
        severity: "low",
        message: `Cold traffic reads as too formal — the viewer doesn't know the product yet.`,
        fix: `Soften the register. Plain spoken phrasing reads as native.`,
      });
    }
  } else if (input.awareness === "most-aware") {
    if (casual > 0 && formal === 0) {
      flags.push({
        kind: "off-tone",
        severity: "low",
        message: `Most-aware viewers want a direct ask, not casual filler.`,
        fix: `Cut the casual markers. One clean clause is enough.`,
      });
    }
  }

  // Off-awareness: cold audience but the draft assumes the product is known.
  const productName = (input.name || "").trim();
  if (
    productName &&
    productName.length > 1 &&
    (input.awareness === "unaware" || input.awareness === "problem-aware") &&
    new RegExp(`\\b${escapeRegex(productName)}\\b`, "i").test(trimmed)
  ) {
    flags.push({
      kind: "off-awareness",
      severity: "medium",
      message: `Names the product to a cold viewer — they have no reason to recognise it yet.`,
      fix: `Open on the pain or the category, not on the product name.`,
    });
  }

  const score = clampScore(
    100 -
      flags.reduce(
        (acc, f) =>
          acc + (f.severity === "high" ? 20 : f.severity === "medium" ? 10 : 5),
        0
      )
  );

  const rewrite = buildRewrite(input, flags);
  const rationale = buildRationale(input, flags);

  return {
    draft: trimmed,
    score,
    flags,
    rewrite,
    rationale,
  };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.floor(n);
}

function countMatches(text: string, patterns: RegExp[]): number {
  let n = 0;
  for (const re of patterns) if (re.test(text)) n++;
  return n;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 3).trimEnd() + "...";
}

// Deterministic rewrite generator. Picks one of four templates by which
// flag-kind set is present. No randomness.
function buildRewrite(input: ProductInput, flags: HookFlag[]): string {
  const pain = (input.audiencePain || "the usual friction").trim();
  const diff = (input.differentiator || "a different mechanism").trim();
  const cat = (input.category || "the category").trim();
  const audience = (input.audience || "someone in this audience").trim();

  const kinds = new Set(flags.map((f) => f.kind));
  const isCold =
    input.awareness === "unaware" || input.awareness === "problem-aware";

  // Template 1: bland or no-specificity → contrarian opener naming the mechanism.
  if (kinds.has("category-bland") || kinds.has("no-specificity")) {
    return `Most ${cat} advice misses one thing — ${truncate(diff, 60)}.`;
  }
  // Template 2: weak opener or buried payoff → front-load the strong noun.
  if (kinds.has("weak-opener") || kinds.has("buried-payoff")) {
    return `${capitaliseFirst(truncate(diff, 50))} is the part of ${cat} you actually feel.`;
  }
  // Template 3: cold-traffic or off-awareness → pain-first opener.
  if (isCold || kinds.has("off-awareness") || kinds.has("no-stakes")) {
    return `If ${truncate(pain, 50)} sounds familiar, this is for ${truncate(audience, 30)}.`;
  }
  // Template 4: default polish.
  return `${capitaliseFirst(truncate(audience, 30))} — here is the part of ${cat} most products skip: ${truncate(diff, 50)}.`;
}

function buildRationale(input: ProductInput, flags: HookFlag[]): string {
  if (flags.length === 0) {
    return `The draft already lands cleanly. The rewrite is a one-step refinement keyed to your differentiator.`;
  }
  const top = flags[0];
  const cat = input.category || "the category";
  return `Top issue: ${top.message.toLowerCase()} The rewrite leads with a concrete, ${cat}-specific clause so the viewer earns the payoff in the first beat.`;
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}

// Re-export the AwarenessLevel type so consumers don't need to import it
// twice. (Type-only export.)
export type { AwarenessLevel };
