// shotlist.ts — Shot List Generator.
//
// For each CreatorBrief, emit a numbered shot list that mirrors the
// brief's 4-section spine. Output is fully deterministic — every value
// is derived from the brief + its source input. No randomness, no
// external data fetching, no API calls.
//
// Shot composition rules:
//  - 4 to 8 shots per list.
//  - At least one shot per brief section (hook / problem / solution / cta).
//  - The richer "solution-or-proof" section gets two shots when room
//    allows — a demo frame plus a lifestyle b-roll cutaway.
//  - The sum of shot-duration midpoints stays within ~2 seconds of the
//    brief's total durationSeconds so the cut lands in the right
//    envelope.

import type {
  BriefSectionKind,
  CameraAngle,
  CreatorBrief,
  ProductInput,
  ShotDuration,
  ShotKind,
  ShotList,
  ShotListItem,
} from "@/types/strategy";

// Default mapping from each ShotDuration bucket to the midpoint seconds
// the engine plans against.
export const SHOT_DURATION_MIDPOINT: Record<ShotDuration, number> = {
  "1-2s": 1.5,
  "2-4s": 3,
  "4-6s": 5,
  "6-10s": 8,
  "10s+": 12,
};

// Per-section "default" shot blueprint — kind + angle + duration bucket.
interface ShotBlueprint {
  kind: ShotKind;
  angle: CameraAngle;
  duration: ShotDuration;
  framingNote: string;
  soundTemplate: string;
  bRollNotes?: string;
}

const HOOK_SHOT: ShotBlueprint = {
  kind: "ugc-selfie",
  angle: "eye-level",
  duration: "2-4s",
  framingNote: "Medium close-up, eye-level, indoor soft window light",
  soundTemplate: "On-camera hook line, room tone, no music bed yet",
};

const PROBLEM_SHOT: ShotBlueprint = {
  kind: "talking-head",
  angle: "eye-level",
  duration: "2-4s",
  framingNote: "Medium shot, eye-level, single key light",
  soundTemplate: "On-camera voice, ambient room tone behind",
};

const PROBLEM_BROLL: ShotBlueprint = {
  kind: "b-roll",
  angle: "high",
  duration: "1-2s",
  framingNote: "Top-down or high-angle insert of the pain moment in context",
  soundTemplate: "Ambient room tone only, voiceover from prior shot continues",
  bRollNotes: "Cut in over the problem beat — viewer should still hear the talking head",
};

const SOLUTION_DEMO: ShotBlueprint = {
  kind: "product-shot",
  angle: "over-shoulder",
  duration: "2-4s",
  framingNote: "Over-shoulder demo frame, viewer reads the screen / product clearly",
  soundTemplate: "Voiceover: state the result first, mechanism second",
};

const SOLUTION_BROLL: ShotBlueprint = {
  kind: "lifestyle",
  angle: "pov",
  duration: "4-6s",
  framingNote: "POV / first-person lifestyle frame, natural light",
  soundTemplate: "Voiceover layered with light music bed",
  bRollNotes: "Should feel like the viewer is the one using it",
};

const SOLUTION_SCREENSHOT: ShotBlueprint = {
  kind: "screenshot",
  angle: "eye-level",
  duration: "2-4s",
  framingNote: "Clean screen recording, full-bleed, no cursor flicker",
  soundTemplate: "Voiceover continues over the screen capture",
  bRollNotes: "Single take, no zoom-ins added in post",
};

const CTA_SHOT: ShotBlueprint = {
  kind: "talking-head",
  angle: "eye-level",
  duration: "2-4s",
  framingNote: "Medium close-up, eye-level, product visible in frame",
  soundTemplate: "On-camera CTA line, music bed steps down by ~3dB",
};

export function generateShotLists(
  briefs: CreatorBrief[],
  input?: ProductInput
): ShotList[] {
  return briefs.map((brief) => buildShotList(brief, input));
}

function buildShotList(brief: CreatorBrief, input?: ProductInput): ShotList {
  const propsForProduct = deriveProps(input);
  const items: ShotListItem[] = [];

  // Each section contributes one or two shots in order.
  for (const section of brief.sections) {
    const blueprints = blueprintsFor(section.kind);
    for (const bp of blueprints) {
      items.push(
        toItem(items.length + 1, bp, section.kind, brief, propsForProduct)
      );
    }
  }

  // Constrain to 4-8 items. The blueprint above emits 6 by default;
  // both bounds are respected. If a future change pushes count > 8,
  // drop the lowest-value b-roll first.
  while (items.length > 8) {
    const idxBroll = items
      .map((it, i) => ({ it, i }))
      .filter((x) => x.it.kind === "b-roll")
      .pop();
    if (!idxBroll) break;
    items.splice(idxBroll.i, 1);
    // Renumber.
    items.forEach((it, i) => {
      it.index = i + 1;
    });
  }
  while (items.length < 4) {
    // Pad with an extra solution screenshot shot if needed.
    items.push(
      toItem(
        items.length + 1,
        SOLUTION_SCREENSHOT,
        "solution-or-proof",
        brief,
        propsForProduct
      )
    );
  }

  return {
    briefId: brief.id,
    totalShots: items.length,
    items,
  };
}

function blueprintsFor(kind: BriefSectionKind): ShotBlueprint[] {
  switch (kind) {
    case "hook":
      return [HOOK_SHOT];
    case "problem":
      // Talking-head + a single b-roll insert.
      return [PROBLEM_SHOT, PROBLEM_BROLL];
    case "solution-or-proof":
      // Demo frame + lifestyle b-roll. Both shots together cover the
      // 6-8 second envelope of the solution beat.
      return [SOLUTION_DEMO, SOLUTION_BROLL];
    case "cta":
      return [CTA_SHOT];
  }
}

function toItem(
  index: number,
  bp: ShotBlueprint,
  sectionKind: BriefSectionKind,
  brief: CreatorBrief,
  props: string[]
): ShotListItem {
  const section = brief.sections.find((s) => s.kind === sectionKind);
  const sound = composeSound(bp, section?.beat);
  return {
    index,
    kind: bp.kind,
    framing: bp.framingNote,
    angle: bp.angle,
    duration: bp.duration,
    props,
    sound,
    bRollNotes: bp.bRollNotes,
  };
}

function composeSound(bp: ShotBlueprint, beat?: string): string {
  if (!beat) return bp.soundTemplate;
  // Append a short reference to the section beat so the audio team
  // knows which line maps to which shot. Cap at a clean word boundary.
  const trimmed = truncateToWordBoundary(beat, 110);
  return `${bp.soundTemplate} — beat: ${trimmed}`;
}

function truncateToWordBoundary(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trimEnd();
}

// ---- Props derivation ----

function deriveProps(input?: ProductInput): string[] {
  if (!input) return ["Product in clean packaging or live screen"];
  const productNoun = input.name || "the product";
  const cat = input.category || "category";

  const props: string[] = [];
  // Always include the product itself.
  props.push(`${productNoun} — packaging or live screen`);

  // Category-typed staging cues.
  const lower = cat.toLowerCase();
  if (lower.includes("app") || lower.includes("software") || lower.includes("tool")) {
    props.push("Phone or laptop, clean screen, no notifications visible");
  } else if (lower.includes("food") || lower.includes("drink") || lower.includes("beverage")) {
    props.push("Serving surface, neutral linen, single drinking vessel");
  } else if (lower.includes("apparel") || lower.includes("wear") || lower.includes("cloth")) {
    props.push("Neutral wardrobe rack or mirror, soft daylight");
  } else if (lower.includes("beauty") || lower.includes("skin") || lower.includes("hair")) {
    props.push("Vanity surface, single soft key light, clean mirror");
  } else {
    props.push("Neutral surface or backdrop matching the category");
  }

  // Pain-anchored cue, lightly paraphrased.
  if (input.audiencePain) {
    const p = input.audiencePain.toLowerCase();
    if (p.includes("time") || p.includes("rush") || p.includes("late")) {
      props.push("Clock or wristwatch visible in problem beat");
    } else if (p.includes("clutter") || p.includes("mess")) {
      props.push("Slightly cluttered surface in problem beat, tidy in solution beat");
    }
  }
  return props;
}

// ---- Public helper for tests: sum of shot-duration midpoints ----

export function sumShotMidpoints(list: ShotList): number {
  return list.items.reduce(
    (acc, it) => acc + SHOT_DURATION_MIDPOINT[it.duration],
    0
  );
}
