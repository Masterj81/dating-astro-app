// scripts-line.ts — Video Script Generator.
//
// For each CreatorBrief, emit a line-level script that mirrors the
// brief's 4-section spine. Output is fully deterministic — every value
// is derived from the brief + its source input. No randomness, no
// external data fetching, no API calls.
//
// Voice is BigAd's own. Lines paraphrase the brief's section beats into
// a single concrete utterance per line.
//
// Envelope rules:
//   - Sum of durationSeconds per section ≈ briefSection.durationSeconds (±1s).
//   - totalDurationSeconds ≈ brief.durationSeconds (±2s).

import type {
  CreatorBrief,
  CreatorBriefSection,
  ProductInput,
  ScriptLine,
  ScriptLineKind,
  VideoScript,
} from "@/types/strategy";
import type { CopyLabels } from "./copy-normalize";
import { deriveCopyLabels } from "./copy-normalize";

interface LineSpec {
  kind: ScriptLineKind;
  fraction: number; // share of the section's duration
  template: (ctx: TemplateCtx) => string;
}

interface TemplateCtx {
  input: ProductInput;
  brief: CreatorBrief;
  section: CreatorBriefSection;
  sectionIndex: number;
  labels: CopyLabels;
}

// Per-section line specs. Two-to-three lines per section; the fractions
// always sum to 1.0 within a section.
const SECTION_LINE_SPECS: LineSpec[][] = [
  // 0: hook — three lines, on-camera + overlay + sfx
  [
    {
      kind: "on-camera",
      fraction: 0.55,
      template: ({ labels }) =>
        `${capitaliseFirst(labels.painLabel)} — that's the part of ${labels.categoryLabel} most people quietly accept.`,
    },
    {
      kind: "on-screen-text",
      fraction: 0.3,
      template: ({ labels }) => labels.painLabel.toUpperCase(),
    },
    {
      kind: "sfx",
      fraction: 0.15,
      template: () => `Sharp transient on cut — no music bed yet.`,
    },
  ],
  // 1: problem — two lines, vo + on-camera
  [
    {
      kind: "vo",
      fraction: 0.55,
      template: ({ labels }) =>
        `For ${labels.audienceLabel.toLowerCase()}, it shows up every time ${labels.painLabel} hits.`,
    },
    {
      kind: "on-camera",
      fraction: 0.45,
      template: ({ labels }) =>
        `Most ${labels.categoryLabel} tools paper over it. The cause sits one layer below.`,
    },
  ],
  // 2: solution-or-proof — three lines, vo + on-camera + overlay
  [
    {
      kind: "on-camera",
      fraction: 0.4,
      template: ({ input, brief, labels }) =>
        `Here is the shift: ${input.name || "this"} replaces that with ${labels.mechanismLabel}. ${anglePhrase(brief)}`,
    },
    {
      kind: "vo",
      fraction: 0.35,
      template: () =>
        `One clean demonstration, not a feature list — the result first, the mechanism second.`,
    },
    {
      kind: "on-screen-text",
      fraction: 0.25,
      template: ({ labels }) => labels.mechanismLabel.toUpperCase(),
    },
  ],
  // 3: cta — two lines, on-camera + overlay
  [
    {
      kind: "on-camera",
      fraction: 0.6,
      template: ({ input, labels }) =>
        `${ctaAsk(input, labels)} — say "${input.name || "this product"}" so the viewer can recover it from audio alone.`,
    },
    {
      kind: "on-screen-text",
      fraction: 0.4,
      template: ({ input }) =>
        `${(input.name || "TRY IT").toUpperCase()} — ONE STEP`,
    },
  ],
];

export function generateVideoScripts(
  briefs: CreatorBrief[],
  input: ProductInput,
  labels?: CopyLabels
): VideoScript[] {
  const resolved = labels ?? deriveCopyLabels(input, []);
  return briefs.map((brief) => buildScript(brief, input, resolved));
}

function buildScript(
  brief: CreatorBrief,
  input: ProductInput,
  labels: CopyLabels
): VideoScript {
  const lines: ScriptLine[] = [];
  let cursor = 0;
  let lineIndex = 1;

  for (let i = 0; i < brief.sections.length; i++) {
    const section = brief.sections[i];
    const specs = SECTION_LINE_SPECS[i] ?? SECTION_LINE_SPECS[SECTION_LINE_SPECS.length - 1];
    const sectionDuration = section.durationSeconds;
    // Allocate durations so the sum exactly equals sectionDuration to one decimal.
    const durations = allocate(specs, sectionDuration);

    let sectionCursor = 0;
    for (let j = 0; j < specs.length; j++) {
      const spec = specs[j];
      const dur = durations[j];
      const text = spec.template({ input, brief, section, sectionIndex: i, labels });
      lines.push({
        index: lineIndex++,
        briefSectionIndex: i,
        kind: spec.kind,
        text: cleanLine(text),
        startSeconds: roundTo(cursor + sectionCursor, 1),
        durationSeconds: roundTo(dur, 1),
      });
      sectionCursor += dur;
    }
    cursor += sectionDuration;
  }

  return {
    briefId: brief.id,
    totalDurationSeconds: roundTo(cursor, 1),
    lines,
  };
}

function allocate(specs: LineSpec[], total: number): number[] {
  // Multiply fractions × total, then nudge the last one so the sum is exact.
  const raw = specs.map((s) => s.fraction * total);
  const rounded = raw.map((r) => roundTo(r, 1));
  // Adjust last entry by the residual.
  const sum = rounded.reduce((a, b) => a + b, 0);
  rounded[rounded.length - 1] = roundTo(
    rounded[rounded.length - 1] + (total - sum),
    1
  );
  // Guard: no zero / negative durations.
  for (let i = 0; i < rounded.length; i++) {
    if (rounded[i] <= 0) rounded[i] = 0.1;
  }
  return rounded;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---- Template helpers ----

function anglePhrase(brief: CreatorBrief): string {
  const a = brief.forAngle || "";
  if (!a) return "";
  return `Angle: ${a}.`;
}

function ctaAsk(input: ProductInput, labels: CopyLabels): string {
  const c = input.campaignType ?? "always-on";
  if (c === "launch") return `Open the door on ${labels.outcomeLabel} today`;
  if (c === "seasonal") return `Pick up ${labels.outcomeLabel} this season`;
  return `Try it — one step toward ${labels.outcomeLabel}`;
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
