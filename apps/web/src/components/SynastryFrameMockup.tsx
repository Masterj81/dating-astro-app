/**
 * SynastryFrameMockup — a single "phone screen" mockup for one synastry
 * reading frame (love / friendship / business). Pure presentational, no
 * client JS, no real data fetch. Used by HeroSynastryTriptych to compose
 * the three-intentions hero visual.
 *
 * Why a code mockup and not a screenshot?
 *   - Matches the existing landing pattern: CompatibilityDotsArc,
 *     IntentPill, IcebreakerBubble, ValuePillCloud are all code-rendered.
 *   - Updates automatically when the design tokens / score palette change.
 *   - Pixel-perfect at any DPI, no LCP penalty, server-renderable.
 *
 * Composition mirrors the real Synastry surface so the hero reads as
 * "this is the actual product", not as a generic illustration:
 *   1. iPhone-style frame (matches PhoneMockupPlaceholder chrome)
 *   2. Profile header — name + tri-sign line
 *   3. Compatibility dots arc with score
 *   4. Frame eyebrow + frame title + 2-line desc
 *   5. 1 zone row (emotional or communication, frame-specific)
 *   6. "Question to explore" line at the bottom — ties to the
 *      exploration_* section shipped in b142000.
 */

import { CompatibilityDotsArc } from "@/components/CompatibilityDotsArc";

export type FrameKey = "love" | "friendship" | "business";

type FrameTheme = {
  /** Soft ambient glow color behind the phone. */
  glow: string;
  /** Tint used on the frame eyebrow + zone bar fill. */
  accent: string;
  /** Small leading dot color in the eyebrow pill. */
  dot: string;
  /** Pill background tint. */
  pillBg: string;
  /** Pill border tint. */
  pillBorder: string;
};

const FRAME_THEMES: Record<FrameKey, FrameTheme> = {
  love: {
    glow: "rgba(201, 134, 146, 0.22)",
    accent: "#C98692",
    dot: "#C98692",
    pillBg: "rgba(201, 134, 146, 0.10)",
    pillBorder: "rgba(201, 134, 146, 0.36)",
  },
  friendship: {
    glow: "rgba(91, 84, 168, 0.20)",
    accent: "#7681FF",
    dot: "#7681FF",
    pillBg: "rgba(91, 84, 168, 0.10)",
    pillBorder: "rgba(91, 84, 168, 0.36)",
  },
  business: {
    glow: "rgba(218, 181, 109, 0.20)",
    accent: "#E8C77E",
    dot: "#E8C77E",
    pillBg: "rgba(218, 181, 109, 0.10)",
    pillBorder: "rgba(218, 181, 109, 0.36)",
  },
};

export type SynastryFrameMockupProps = {
  frame: FrameKey;
  /** 0..100, drives the arc + the headline score number. */
  score: number;
  /** "Love" / "Friendship" / "Working chemistry" — pre-translated. */
  frameLabel: string;
  /** 2-line desc shown under the frame label. */
  frameDescription: string;
  /** Profile name in the top header — e.g. "Liam". */
  profileName: string;
  /** Tri-sign line, e.g. "Virgo · Taurus · Capricorn". */
  profileSigns: string;
  /** Single zone preview row label, e.g. "Communication rhythm". */
  zoneLabel: string;
  /** Zone score 0..100 for the bar fill. */
  zoneScore: number;
  /** "Question to explore" caption (translated). */
  questionCaption: string;
  /** The question itself, pre-translated. */
  questionBody: string;
  /**
   * Visual variant. Center phone in the triptych uses `primary`
   * (bigger, fuller content). Side phones use `secondary` (slightly
   * smaller, shows the same anatomy so the triptych still reads as
   * "three product surfaces" — not "one product + two ornaments").
   */
  variant?: "primary" | "secondary";
  /** Optional override for the frame max-width Tailwind class. */
  maxWidthClassName?: string;
  /** Optional rotation in degrees around the Y axis (perspective). */
  rotateY?: number;
  /** Optional aria override. */
  ariaLabel?: string;
};

export function SynastryFrameMockup({
  frame,
  score,
  frameLabel,
  frameDescription,
  profileName,
  profileSigns,
  zoneLabel,
  zoneScore,
  questionCaption,
  questionBody,
  variant = "primary",
  maxWidthClassName,
  rotateY = 0,
  ariaLabel,
}: SynastryFrameMockupProps) {
  const theme = FRAME_THEMES[frame];
  const isPrimary = variant === "primary";
  const arcSize = isPrimary ? 132 : 92;
  // Use a fixed width (not w-full + max-w-*) so the mockup renders inside
  // a flex container without flex-basis. w-full would collapse to 0 in
  // that case; an explicit w-[X] sizes the phone deterministically.
  const widthClass =
    maxWidthClassName ??
    (isPrimary ? "w-[244px] sm:w-[264px]" : "w-[180px] sm:w-[196px]");

  // Language-neutral aria-label: frameLabel is already translated by the
  // parent triptych; we avoid hardcoding the word "frame" in English so
  // screen readers in non-EN locales don't hear a bilingual sentence.
  const accessibleLabel =
    ariaLabel ?? `JUNO Synastry — ${frameLabel}, ${Math.round(score)}/100`;

  // Inline transform so the parent triptych can rotate the side phones
  // without needing extra wrapper classes. preserve-3d on the parent +
  // rotateY here = a clean perspective hinge.
  const phoneTransform = rotateY !== 0 ? { transform: `rotateY(${rotateY}deg)` } : undefined;

  return (
    <div
      className={`relative mx-auto aspect-[195/422] ${widthClass}`}
      style={phoneTransform}
      role="img"
      aria-label={accessibleLabel}
    >
      {/* Soft ambient glow behind the phone — color shifts with the frame */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-full blur-2xl"
        style={{
          background: `radial-gradient(ellipse at center, ${theme.glow}, transparent 70%)`,
        }}
        aria-hidden="true"
      />

      {/* Phone frame — same chrome as PhoneMockupPlaceholder so the triptych
          reads consistent with the rest of the marketing page if any
          PNG-backed mockup ever appears alongside it. */}
      <div className="absolute inset-0 rounded-[42px] border border-white/15 bg-gradient-to-b from-[#1a1825] to-[#0e0c14] shadow-[0_30px_80px_-20px_rgba(201,134,146,0.25)]">
        {/* Notch */}
        <div
          className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black"
          aria-hidden="true"
        />

        {/* Inner screen */}
        <div className="absolute inset-2 flex flex-col overflow-hidden rounded-[36px] bg-[#0b0a12]">
          {/* Status bar mock — keeps the screen feeling like a real iOS shot */}
          <div className="flex items-center justify-between px-5 pt-5 pb-2 text-[9px] font-semibold tracking-wide text-white/80">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span aria-hidden="true">●●●●</span>
              <span aria-hidden="true">100%</span>
            </span>
          </div>

          {/* Frame eyebrow pill — Love / Friendship / Business with tint */}
          <div className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{
              backgroundColor: theme.pillBg,
              borderColor: theme.pillBorder,
              color: theme.accent,
            }}
          >
            <span
              aria-hidden="true"
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: theme.dot }}
            />
            {frameLabel}
          </div>

          {/* Profile header */}
          <div className="mt-3 px-4 text-center">
            <p className="text-[13px] font-semibold leading-tight text-white">
              {profileName}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/45">
              {profileSigns}
            </p>
          </div>

          {/* Compatibility arc — the score IS the frame-specific reading */}
          <div className="flex-1 flex items-start justify-center pt-3">
            <CompatibilityDotsArc
              percentage={score}
              size={arcSize}
              showScore
            />
          </div>

          {/* Short frame description — 2-3 lines max. Hidden on secondary
              variant to keep side phones readable at smaller size. */}
          {isPrimary ? (
            <div className="px-4 pb-2 text-center">
              <p className="text-[11px] leading-[15px] text-white/75 line-clamp-3">
                {frameDescription}
              </p>
            </div>
          ) : null}

          {/* One zone preview row — labeled + accent-tinted bar fill */}
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                {zoneLabel}
              </p>
              <p className="text-[10px] font-semibold text-white/85">
                {Math.round(zoneScore)}
              </p>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/8">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, Math.min(100, zoneScore))}%`,
                  backgroundColor: theme.accent,
                }}
              />
            </div>
          </div>

          {/* "Question to explore" footer — small, italic, references the
              exploration_* section that ships inside the actual synastry
              surface. Hidden on secondary variant to keep the side phones
              from feeling cramped at smaller width. */}
          {isPrimary ? (
            <div className="border-t border-white/8 px-4 py-3 text-center">
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: theme.accent }}
              >
                {questionCaption}
              </p>
              <p className="mt-1.5 text-[11px] leading-snug text-white/85">
                {questionBody}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
