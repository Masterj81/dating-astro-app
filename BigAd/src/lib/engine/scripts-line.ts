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
}

// Per-section line specs. Two-to-three lines per section; the fractions
// always sum to 1.0 within a section.
const SECTION_LINE_SPECS: LineSpec[][] = [
  // 0: hook — three lines, on-camera + overlay + sfx
  [
    {
      kind: "on-camera",
      fraction: 0.55,
      template: ({ input }) =>
        `${capitaliseFirst(stakeWord(input))} — that's the part of ${cat(input)} most people quietly accept.`,
    },
    {
      kind: "on-screen-text",
      fraction: 0.3,
      template: ({ input }) => `${painOverlay(input).toUpperCase()}`,
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
      template: ({ input }) =>
        `For ${audience(input)}, it shows up every time ${painPhrase(input)}.`,
    },
    {
      kind: "on-camera",
      fraction: 0.45,
      template: ({ input }) =>
        `Most ${cat(input)} tools paper over it. The cause sits one layer below.`,
    },
  ],
  // 2: solution-or-proof — three lines, vo + on-camera + overlay
  [
    {
      kind: "on-camera",
      fraction: 0.4,
      template: ({ input, brief }) =>
        `Here is the shift: ${truncate(input.name || "this", 30)} replaces that with ${truncate(diff(input), 50)}. ${anglePhrase(brief)}`,
    },
    {
      kind: "vo",
      fraction: 0.35,
      template: ({ input }) =>
        `One clean demonstration, not a feature list — the result first, the mechanism second.`,
    },
    {
      kind: "on-screen-text",
      fraction: 0.25,
      template: ({ input }) =>
        `${truncate(diff(input), 36).toUpperCase()}`,
    },
  ],
  // 3: cta — two lines, on-camera + overlay
  [
    {
      kind: "on-camera",
      fraction: 0.6,
      template: ({ input }) =>
        `${ctaAsk(input)} — say "${truncate(input.name || "this product", 24)}" so the viewer can recover it from audio alone.`,
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
  input: ProductInput
): VideoScript[] {
  return briefs.map((brief) => buildScript(brief, input));
}

function buildScript(brief: CreatorBrief, input: ProductInput): VideoScript {
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
      const text = spec.template({ input, brief, section, sectionIndex: i });
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

function stakeWord(input: ProductInput): string {
  const p = (input.audiencePain || "the friction we know").trim();
  // Pull the first noun-ish word of length >= 4.
  const words = p.split(/\s+/).filter((w) => w.length >= 4);
  return words[0] ?? "friction";
}

function painOverlay(input: ProductInput): string {
  const p = (input.audiencePain || "the recurring friction").trim();
  return truncate(p, 28);
}

function painPhrase(input: ProductInput): string {
  return truncate(input.audiencePain || "that moment shows up", 56);
}

function cat(input: ProductInput): string {
  return input.category || "this category";
}

function audience(input: ProductInput): string {
  return input.audience || "someone in this audience";
}

function diff(input: ProductInput): string {
  return input.differentiator || "a different mechanism";
}

function anglePhrase(brief: CreatorBrief): string {
  const a = brief.forAngle || "";
  if (!a) return "";
  return `Angle: ${truncate(a, 48)}.`;
}

function ctaAsk(input: ProductInput): string {
  const c = input.campaignType ?? "always-on";
  if (c === "launch") return "Try it today while the launch window is open";
  if (c === "seasonal") return "Try it this season — the window is finite";
  return "Try it — one step, no setup";
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 3).trimEnd() + "...";
}

function capitaliseFirst(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1);
}
