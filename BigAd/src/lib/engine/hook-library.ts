// hook-library.ts — Hook Pattern Library.
//
// Emits a deterministic library of 2-3 hooks per pattern (16-24 total).
// Each item is parameterised on the input, the audience avatars, and the
// ranked-angle list. Voice is BigAd's own — paraphrased direct-response.
//
// IMPORTANT: this library proposes hooks; the Hook Critic evaluates
// user-typed drafts. They are complementary. This file MUST NOT import
// from hook-critic.ts.

import type {
  AudienceAvatar,
  AwarenessStage,
  HookLibrary,
  HookLibraryItem,
  HookPattern,
  ProductInput,
} from "@/types/strategy";

// Stable order so the output is deterministic. All 8 patterns must
// appear.
const PATTERN_ORDER: HookPattern[] = [
  "pain-first",
  "outcome-first",
  "contrarian",
  "proof-led",
  "curiosity",
  "comparison",
  "mistake",
  "before-after",
];

// Awareness stages each pattern serves best. Deliberately conservative —
// each pattern names 2-3 stages, never all five.
const PATTERN_AWARENESS_FIT: Record<HookPattern, AwarenessStage[]> = {
  "pain-first": ["problem-aware", "solution-aware"],
  "outcome-first": ["solution-aware", "product-aware", "most-aware"],
  contrarian: ["solution-aware", "product-aware", "most-aware"],
  "proof-led": ["solution-aware", "product-aware", "most-aware"],
  curiosity: ["unaware", "problem-aware"],
  comparison: ["product-aware", "most-aware"],
  mistake: ["problem-aware", "solution-aware"],
  "before-after": ["problem-aware", "solution-aware", "product-aware"],
};

// Risk note per pattern. One sentence.
const PATTERN_RISK: Record<HookPattern, string> = {
  "pain-first":
    "Reads as negative if the pain isn't framed as solvable in the same beat.",
  "outcome-first":
    "Reads as a vague promise if the outcome isn't named in concrete terms.",
  contrarian:
    "Reads as click-bait if the contrarian claim isn't backed within the next two beats.",
  "proof-led":
    "Reads as a brag if the proof isn't tied to the viewer's own situation.",
  curiosity:
    "Reads as bait-and-switch if the payoff is delayed past the third beat.",
  comparison:
    "Reads as defensive if the comparison is to a generic 'other tools' rather than a named alternative.",
  mistake:
    "Reads as scolding if the mistake isn't shared by the speaker.",
  "before-after":
    "Reads as fake if the before-state is exaggerated or the after-state is undefined.",
};

export function buildHookLibrary(
  input: ProductInput,
  avatars: AudienceAvatar[],
  rankedAngles: string[]
): HookLibrary {
  const items: HookLibraryItem[] = [];
  for (const pattern of PATTERN_ORDER) {
    const perPattern = buildPatternItems(pattern, input, avatars, rankedAngles);
    items.push(...perPattern);
  }
  return { items };
}

function buildPatternItems(
  pattern: HookPattern,
  input: ProductInput,
  avatars: AudienceAvatar[],
  rankedAngles: string[]
): HookLibraryItem[] {
  // We aim for 3 items per pattern when we have at least 2 avatars and 2
  // ranked angles; otherwise 2.
  const target = avatars.length >= 2 && rankedAngles.length >= 2 ? 3 : 2;
  const seeds = HOOK_TEMPLATES[pattern];
  const items: HookLibraryItem[] = [];

  for (let i = 0; i < target; i++) {
    const seed = seeds[i % seeds.length];
    // Cycle through avatars so each item has a meaningful avatarFit.
    const primaryAvatar = avatars[i % Math.max(avatars.length, 1)];
    const secondaryAvatar =
      avatars.length > 1 ? avatars[(i + 1) % avatars.length] : undefined;
    const avatarFit = [primaryAvatar?.id, secondaryAvatar?.id]
      .filter((id): id is string => !!id)
      // Each pattern gets 1-2 avatars; we cap at 2.
      .slice(0, 2);

    const text = seed(input, primaryAvatar, rankedAngles[i % Math.max(rankedAngles.length, 1)]);
    items.push({
      pattern,
      text,
      awarenessFit: PATTERN_AWARENESS_FIT[pattern].slice(),
      avatarFit: avatarFit.length > 0 ? avatarFit : [avatars[0]?.id ?? "avatar-1"],
      riskNote: PATTERN_RISK[pattern],
    });
  }
  return items;
}

// Templates: 3 seeds per pattern. Each takes (input, avatar?, angle?) so
// the hook is parameterised on the product, the avatar's pain, and the
// angle name when available. Voice is BigAd's own.
type Seed = (
  input: ProductInput,
  avatar: AudienceAvatar | undefined,
  angle: string | undefined
) => string;

const HOOK_TEMPLATES: Record<HookPattern, Seed[]> = {
  "pain-first": [
    (i, a) =>
      `If ${truncate(i.audiencePain || "the recurring friction", 50)} sounds familiar, this is the first beat where it stops costing you time.`,
    (i, a) =>
      `${truncate(a?.emotionalLanguage[0] || phraseFromAudience(i), 40)} — that's the loop ${truncate(i.differentiator || "this mechanism", 36)} cuts.`,
    (i) =>
      `Three weeks of ${truncate(i.category || "this category", 30)} and the real cost is ${truncate(i.audiencePain || "the recurring friction", 50)}.`,
  ],
  "outcome-first": [
    (i) =>
      `${truncate(asOutcomeSentence(i), 90)}`,
    (i, a) =>
      `Picture ${truncate(a?.label.toLowerCase() || "you", 30)} closing the tab feeling done — that's the after-state of ${truncate(i.differentiator || "the mechanism", 40)}.`,
    (i) =>
      `The point of ${truncate(i.name || "this product", 30)} is one specific outcome: ${truncate(i.goal || "the result you're trying to reach", 60)}.`,
  ],
  contrarian: [
    (i) =>
      `Most ${truncate(i.category || "category", 30)} advice has it backwards — start with ${truncate(i.differentiator || "the mechanism", 50)}, not the surface.`,
    (i, a, angle) =>
      `Unpopular take: ${truncate(angle || "the safest angle", 36)} only works because ${truncate(i.differentiator || "the mechanism", 50)} is what's actually doing the work.`,
    (i) =>
      `Stop fixing ${truncate(i.audiencePain || "the recurring friction", 40)} the way every other ${truncate(i.category || "category", 24)} product tells you to.`,
  ],
  "proof-led": [
    (i) =>
      `A real customer of ${truncate(i.name || "this product", 30)} put it like this: it changed how ${truncate(i.category || "the category", 30)} feels day one.`,
    (i, a) =>
      `${truncate(a?.proofNeeded[0] || "Demo", 24)} first, claim second — that's the order this product earns belief in.`,
    (i) =>
      `One named user, one screen, one moment where ${truncate(i.differentiator || "the mechanism", 50)} clicked.`,
  ],
  curiosity: [
    (i) =>
      `There's one thing every ${truncate(i.category || "category", 24)} product skips because it was harder to build — ${truncate(i.differentiator || "this mechanism", 40)}.`,
    (i, a) =>
      `Why ${truncate(a?.label.toLowerCase() || "this audience", 30)} keeps hitting the same wall after switching tools — and what's actually behind it.`,
    (i) =>
      `${truncate(i.name || "This product", 30)} is built around one question most ${truncate(i.category || "category", 22)} pitches refuse to answer.`,
  ],
  comparison: [
    (i) => {
      const named = (i.competitors || "").split(",").map((c) => c.trim()).filter(Boolean)[0];
      return named
        ? `${truncate(i.name || "This product", 30)} vs ${truncate(named, 24)} — same job, two very different defaults.`
        : `${truncate(i.name || "This product", 30)} vs the option you're already comparing to — same job, two very different defaults.`;
    },
    (i) =>
      `If you're picking between two ${truncate(i.category || "category", 24)} tools, here's the one row that actually moves the decision.`,
    (i) =>
      `What ${truncate(i.name || "this product", 30)} does that the alternative is structurally not built to do: ${truncate(i.differentiator || "the mechanism", 40)}.`,
  ],
  mistake: [
    (i) =>
      `The mistake I kept making with ${truncate(i.category || "this category", 28)}: treating ${truncate(i.audiencePain || "the recurring friction", 40)} as a personal failure instead of a tool problem.`,
    (i, a) =>
      `If you've ever thought "${truncate(a?.emotionalLanguage[1] || a?.emotionalLanguage[0] || phraseFromAudience(i), 50)}" — that was the symptom, not the cause.`,
    (i) =>
      `One assumption that quietly costs ${truncate(i.audience || "this audience", 30)} weeks of progress on ${truncate(i.category || "the category", 24)}.`,
  ],
  "before-after": [
    (i) =>
      `Before: ${truncate(i.audiencePain || "the same loop", 36)}. After: ${truncate(i.differentiator || "the mechanism", 36)}.`,
    (i, a) =>
      `${truncate(a?.label || "Before", 24)} → who you are once ${truncate(i.differentiator || "the mechanism", 40)} is just part of the routine.`,
    (i) =>
      `Two weeks ago this was ${truncate(i.audiencePain || "the recurring friction", 32)}. Now it's a thing they do without thinking about.`,
  ],
};

function truncate(s: string, n: number): string {
  const t = (s ?? "").trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trimEnd() + "...";
}

function asOutcomeSentence(input: ProductInput): string {
  const goal = (input.goal || "").trim();
  if (goal.length > 0) {
    return capFirst(goal.endsWith(".") ? goal : `${goal}.`);
  }
  const diff = input.differentiator || "a different mechanism";
  return `What changes is the part of ${input.category || "the category"} most products skip: ${diff}.`;
}

function phraseFromAudience(input: ProductInput): string {
  return `not built for ${truncate(input.audience || "this audience", 30)}`;
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
