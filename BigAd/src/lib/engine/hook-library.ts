// hook-library.ts — Hook Pattern Library.
//
// Emits a deterministic library of 2-3 hooks per pattern (16-24 total).
// Each item is parameterised on the input, the audience avatars, the
// ranked-angle list, and the normalised copy labels. Voice is BigAd's own.
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
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

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
  rankedAngles: string[],
  labels?: CopyLabels
): HookLibrary {
  const resolvedLabels = labels ?? deriveCopyLabels(input, []);
  const items: HookLibraryItem[] = [];
  for (const pattern of PATTERN_ORDER) {
    const perPattern = buildPatternItems(
      pattern,
      input,
      avatars,
      rankedAngles,
      resolvedLabels
    );
    items.push(...perPattern);
  }
  return { items };
}

function buildPatternItems(
  pattern: HookPattern,
  input: ProductInput,
  avatars: AudienceAvatar[],
  rankedAngles: string[],
  labels: CopyLabels
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

    const text = seed(
      input,
      labels,
      primaryAvatar,
      rankedAngles[i % Math.max(rankedAngles.length, 1)]
    );
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

// Templates: 3 seeds per pattern. Each takes (input, labels, avatar?, angle?)
// so the hook stays bounded by the short noun-phrase labels. Voice is
// BigAd's own.
type Seed = (
  input: ProductInput,
  labels: CopyLabels,
  avatar: AudienceAvatar | undefined,
  angle: string | undefined
) => string;

const HOOK_TEMPLATES: Record<HookPattern, Seed[]> = {
  "pain-first": [
    (_, labels) =>
      `Tired of ${labels.painLabel}? There's a cleaner way.`,
    (_, labels) =>
      `${capFirst(labels.painLabel)} isn't you — it's how ${labels.categoryLabel} is built.`,
    (i, labels) =>
      `Three weeks of ${labels.categoryLabel} and the real cost is ${labels.painLabel}.`,
  ],
  "outcome-first": [
    (_, labels) =>
      `Less ${labels.painLabel}. More ${labels.outcomeLabel}.`,
    (i, labels) =>
      `${capFirst(labels.outcomeLabel)} — finally a ${labels.categoryLabel} that delivers it.`,
    (i, labels) =>
      `${capFirst(i.name || "This product")} exists for one outcome: ${labels.outcomeLabel}.`,
  ],
  contrarian: [
    (_, labels) =>
      `Most ${labels.categoryLabel} advice starts with the surface. Start with ${labels.mechanismLabel}.`,
    (_, labels) =>
      `Hot take: ${labels.mechanismLabel} is the only ${labels.categoryLabel} feature that matters.`,
    (_, labels) =>
      `Stop fixing ${labels.painLabel} the ${labels.categoryLabel} way.`,
  ],
  "proof-led": [
    (i, labels) =>
      `Real ${labels.audienceLabel.toLowerCase()} say ${labels.mechanismLabel} changed day one.`,
    (i, labels, a) =>
      `${a?.proofNeeded[0] || "Demo"} first, claim second — that is how ${i.name || "this"} earns belief.`,
    (i, labels) =>
      `One screen, one ${labels.audienceLabel.toLowerCase()}, one moment ${labels.mechanismLabel} clicks.`,
  ],
  curiosity: [
    (_, labels) =>
      `The one part of ${labels.categoryLabel} everyone skips: ${labels.mechanismLabel}.`,
    (i, labels, a) =>
      `Why ${labels.audienceLabel.toLowerCase()} keep hitting the same wall.`,
    (i, labels) =>
      `${i.name || "This"} is built around the question ${labels.categoryLabel} pitches refuse to answer.`,
  ],
  comparison: [
    (i, labels) => {
      const productName = i.name || "This";
      return `${productName} vs ${labels.competitorLabel} — same job, different defaults.`;
    },
    (_, labels) =>
      `Picking a ${labels.categoryLabel}? Here is the row that moves the call.`,
    (i, labels) =>
      `What ${i.name || "this"} ships that ${labels.competitorLabel} can not: ${labels.mechanismLabel}.`,
  ],
  mistake: [
    (_, labels) =>
      `My mistake: treating ${labels.painLabel} as a personal failure.`,
    (_, labels, a) =>
      `Ever thought "${a?.emotionalLanguage[1] || a?.emotionalLanguage[0] || "this isn't working"}"? That was the symptom.`,
    (_, labels) =>
      `One assumption that quietly costs ${labels.audienceLabel.toLowerCase()} weeks.`,
  ],
  "before-after": [
    (_, labels) =>
      `Before: ${labels.painLabel}. After: ${labels.outcomeLabel}.`,
    (_, labels) =>
      `Who you become once ${labels.mechanismLabel} is routine.`,
    (_, labels) =>
      `Two weeks ago: ${labels.painLabel}. Now: ${labels.outcomeLabel}.`,
  ],
};

function shortAngle(angle: string | undefined): string {
  if (!angle) return "the safest angle";
  const trimmed = angle.trim().replace(/[.,;:]+$/, "");
  const words = trimmed.split(/\s+/);
  if (words.length <= 6) return trimmed;
  return words.slice(0, 6).join(" ");
}

function capFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
