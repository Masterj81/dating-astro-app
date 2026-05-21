/**
 * ZodiacGlyph — the single source of truth for rendering zodiac signs
 * across the JUNO web app. Replaces inline emoji strings
 * ('☀️' / '🌙' / '⬆️') and ad-hoc per-component glyph maps.
 *
 * The symbols ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ live in U+2648–U+2653
 * (Miscellaneous Symbols). They render as text glyphs across modern
 * fonts — not as colored emojis, which would clash with the dark
 * premium look. We append U+FE0E (text variation selector) so any
 * platform that *would* prefer emoji presentation falls back to text.
 *
 * The component supports two API styles for back-compat:
 *
 *   1. Existing simple usage (preserved):
 *        <ZodiacGlyph sign={leo} className="text-lg leading-none" />
 *      — `sign` is a lowercase string; case-insensitive.
 *
 *   2. New variant-based usage (premium / chip / muted / inline):
 *        <ZodiacGlyph sign="leo" variant="premium" size="lg" showLabel />
 */

import type { CSSProperties, FC } from "react";

// ── Types ───────────────────────────────────────────────────────────

export type ZodiacSignKey =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

export type ZodiacGlyphVariant = "inline" | "chip" | "premium" | "muted";
export type ZodiacGlyphSize = "sm" | "md" | "lg";

export interface ZodiacGlyphProps {
  /** Lowercase or capitalized sign key — case-insensitive. */
  sign: string | null | undefined;
  /** Optional Tailwind classes for the inline variant. */
  className?: string;
  /** Override the default aria-label (defaults to the English sign name). */
  ariaLabel?: string;
  /** @deprecated Prefer `ariaLabel`. */
  variant?: ZodiacGlyphVariant;
  size?: ZodiacGlyphSize;
  showLabel?: boolean;
  /** Selected/highlighted state — adds a 2px gold ring on the premium variant. */
  active?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────

const VS_TEXT = "︎"; // text variation selector

export const ZODIAC_GLYPHS: Record<ZodiacSignKey, string> = {
  aries: "♈",       // ♈
  taurus: "♉",      // ♉
  gemini: "♊",      // ♊
  cancer: "♋",      // ♋
  leo: "♌",         // ♌
  virgo: "♍",       // ♍
  libra: "♎",       // ♎
  scorpio: "♏",     // ♏
  sagittarius: "♐", // ♐
  capricorn: "♑",   // ♑
  aquarius: "♒",    // ♒
  pisces: "♓",      // ♓
};

export const ZODIAC_LABELS: Record<ZodiacSignKey, string> = {
  aries: "Aries",
  taurus: "Taurus",
  gemini: "Gemini",
  cancer: "Cancer",
  leo: "Leo",
  virgo: "Virgo",
  libra: "Libra",
  scorpio: "Scorpio",
  sagittarius: "Sagittarius",
  capricorn: "Capricorn",
  aquarius: "Aquarius",
  pisces: "Pisces",
};

export const ZODIAC_KEYS: readonly ZodiacSignKey[] = [
  "aries", "taurus", "gemini", "cancer",
  "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
];

const GOLD = "#E9C873";
const NAVY = "#151522";
const NAVY_INNER = "#1f1f2e";
const MUTED_BG = "#1a1a26";
const MUTED_GLYPH = "rgba(241,230,204,0.75)";

const SIZE_PX: Record<ZodiacGlyphSize, number> = {
  sm: 24,
  md: 40,
  lg: 80,
};

// Force text-presentation rendering. Fall back through serif/symbol
// fonts known to ship the codepoints as text glyphs before defaulting
// to the platform serif.
const TEXT_FONT_STACK =
  "'Apple Symbols','Noto Sans Symbols 2','DejaVu Sans',serif";

// ── Utilities ───────────────────────────────────────────────────────

export function normalizeZodiacSign(
  input: string | null | undefined,
): ZodiacSignKey | null {
  if (!input) return null;
  const k = input.toLowerCase().trim();
  return k in ZODIAC_GLYPHS ? (k as ZodiacSignKey) : null;
}

export function zodiacSymbol(
  sign: string | null | undefined,
): string | null {
  const key = normalizeZodiacSign(sign);
  return key ? ZODIAC_GLYPHS[key] : null;
}

export function zodiacGlyphChar(sign: ZodiacSignKey): string {
  return `${ZODIAC_GLYPHS[sign]}${VS_TEXT}`;
}

// ── Luminary glyphs (Sun / Moon / Rising) ──────────────────────────

export type LuminaryKind = "sun" | "moon" | "rising";

export const LUMINARY_GLYPHS: Record<LuminaryKind, string> = {
  sun: `☉${VS_TEXT}`,  // ☉
  moon: `☾${VS_TEXT}`, // ☾
  rising: "ASC",
};

export const LUMINARY_LABELS: Record<LuminaryKind, string> = {
  sun: "Sun",
  moon: "Moon",
  rising: "Rising",
};

export interface LuminaryGlyphProps {
  kind: LuminaryKind;
  size?: ZodiacGlyphSize;
  ariaLabel?: string;
  className?: string;
}

export const LuminaryGlyph: FC<LuminaryGlyphProps> = ({
  kind,
  size = "md",
  ariaLabel,
  className,
}) => {
  const outer = SIZE_PX[size];
  const fontSize = kind === "rising"
    ? Math.round(outer * 0.42)
    : Math.round(outer * 0.6);

  const baseStyle: CSSProperties = {
    width: outer,
    height: outer,
    borderRadius: outer / 2,
    backgroundColor: NAVY_INNER,
    border: "1px solid rgba(233,200,115,0.32)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: GOLD,
    fontSize,
    fontFamily: kind === "rising" ? undefined : TEXT_FONT_STACK,
    fontWeight: 600,
    lineHeight: 1,
  };

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? LUMINARY_LABELS[kind]}
      className={className}
      style={baseStyle}
    >
      {LUMINARY_GLYPHS[kind]}
    </span>
  );
};

// ── ZodiacGlyph component ───────────────────────────────────────────

export function ZodiacGlyph({
  sign,
  className,
  ariaLabel,
  variant,
  size = "md",
  showLabel = false,
  active = false,
}: ZodiacGlyphProps) {
  const key = normalizeZodiacSign(sign);

  // Legacy / inline call: no variant supplied → keep the old simple
  // span output. This preserves 100 % back-compat with all existing
  // callers (text-lg leading-none classes, etc.).
  if (!variant) {
    if (!key) {
      return (
        <span
          className={className ?? "text-base leading-none"}
          aria-hidden="true"
          style={{ fontFamily: TEXT_FONT_STACK }}
        >
          ✦
        </span>
      );
    }
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? ZODIAC_LABELS[key]}
        className={className ?? "text-base leading-none"}
        style={{ fontFamily: TEXT_FONT_STACK }}
      >
        {zodiacGlyphChar(key)}
      </span>
    );
  }

  // Unknown sign + variant: render a discreet placeholder rather than
  // exploding. Keeps existing data flows where sign might be empty
  // working without throwing.
  if (!key) {
    return (
      <span
        className={className}
        aria-hidden="true"
        style={{
          fontFamily: TEXT_FONT_STACK,
          color: "rgba(255,255,255,0.4)",
        }}
      >
        ✦
      </span>
    );
  }

  const label = ariaLabel ?? ZODIAC_LABELS[key];
  const outer = SIZE_PX[size];
  const glyphChar = zodiacGlyphChar(key);

  if (variant === "inline") {
    const fontSize = Math.round(outer * 0.85);
    return (
      <span
        role="img"
        aria-label={label}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: TEXT_FONT_STACK,
        }}
      >
        <span
          style={{
            fontSize,
            lineHeight: 1,
            color: "currentColor",
          }}
        >
          {glyphChar}
        </span>
        {showLabel ? (
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {ZODIAC_LABELS[key]}
          </span>
        ) : null}
      </span>
    );
  }

  if (variant === "chip") {
    const fontSize = Math.round(outer * 0.65);
    return (
      <span
        role="img"
        aria-label={label}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: `${Math.round(outer * 0.18)}px ${
            showLabel ? Math.round(outer * 0.35) : Math.round(outer * 0.22)
          }px`,
          borderRadius: outer,
          background: active
            ? "rgba(233,200,115,0.14)"
            : "rgba(255,255,255,0.06)",
          border: active
            ? "1px solid rgba(233,200,115,0.55)"
            : "1px solid rgba(255,255,255,0.10)",
          color: "#FFFFFF",
        }}
      >
        <span
          style={{
            fontFamily: TEXT_FONT_STACK,
            fontSize,
            lineHeight: 1,
          }}
        >
          {glyphChar}
        </span>
        {showLabel ? (
          <span
            style={{
              fontSize: Math.max(11, Math.round(outer * 0.32)),
              fontWeight: 600,
            }}
          >
            {ZODIAC_LABELS[key]}
          </span>
        ) : null}
      </span>
    );
  }

  if (variant === "muted") {
    const fontSize = Math.round(outer * 0.55);
    return (
      <span
        role="img"
        aria-label={label}
        className={className}
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            background: MUTED_BG,
            border: "1px solid rgba(241,230,204,0.16)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: TEXT_FONT_STACK,
            fontSize,
            lineHeight: 1,
            color: MUTED_GLYPH,
          }}
        >
          {glyphChar}
        </span>
        {showLabel ? (
          <span
            style={{
              color: MUTED_GLYPH,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {ZODIAC_LABELS[key]}
          </span>
        ) : null}
      </span>
    );
  }

  // variant === "premium"
  const innerPadding = Math.round(outer * 0.18);
  const innerSize = outer - innerPadding * 2;
  const dotSize = Math.max(3, Math.round(outer / 14));
  const dotTopOffset = Math.max(2, Math.round(outer / 10));
  const fontSize = Math.round(outer * 0.5);

  return (
    <span
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <span
        style={{
          position: "relative",
          width: outer,
          height: outer,
          borderRadius: outer / 2,
          background: NAVY,
          border: active ? `2px solid ${GOLD}` : "none",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            position: "relative",
            width: innerSize,
            height: innerSize,
            borderRadius: innerSize / 2,
            background: NAVY_INNER,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontFamily: TEXT_FONT_STACK,
              color: GOLD,
              fontSize,
              lineHeight: 1,
              fontWeight: 600,
            }}
          >
            {glyphChar}
          </span>
          {/* Gold dot at 12 o'clock */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: dotTopOffset,
              left: "50%",
              marginLeft: -dotSize / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              background: GOLD,
            }}
          />
        </span>
      </span>
      {showLabel ? (
        <span
          style={{
            color: GOLD,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: 0.4,
            marginTop: Math.max(4, Math.round(outer * 0.1)),
          }}
        >
          {ZODIAC_LABELS[key]}
        </span>
      ) : null}
    </span>
  );
}

export const ZodiacBadge: FC<ZodiacGlyphProps> = (props) => (
  <ZodiacGlyph {...props} variant={props.variant ?? "chip"} />
);

export default ZodiacGlyph;
