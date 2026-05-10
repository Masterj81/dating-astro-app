/**
 * Zodiac glyph chip — renders the canonical Unicode zodiac symbol for a
 * sign name. Used in chat headers and profile chips so the sun / moon /
 * rising indicators carry visual weight beyond a translated label.
 *
 * The symbols ♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓ live in U+2648–U+2653
 * (Miscellaneous Symbols). They render as text glyphs across modern
 * fonts — not as colored emojis, which would clash with the dark
 * premium look. If a font ever ships them as emoji we can ship a SVG
 * fallback, but in practice this never happens on the platforms we
 * support.
 *
 * Sign names accepted are case-insensitive and locale-agnostic — the
 * caller passes the canonical English key (e.g. "leo" or "Leo"), the
 * mapping below normalizes.
 */

const SYMBOL: Record<string, string> = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

export function zodiacSymbol(sign: string | null | undefined): string | null {
  if (!sign) return null;
  return SYMBOL[sign.trim().toLowerCase()] ?? null;
}

type ZodiacGlyphProps = {
  sign: string | null | undefined;
  className?: string;
  /** Visual title for screen readers — defaults to the English sign name. */
  ariaLabel?: string;
};

export function ZodiacGlyph({ sign, className = "text-base leading-none", ariaLabel }: ZodiacGlyphProps) {
  const symbol = zodiacSymbol(sign);
  if (!symbol) {
    return (
      <span className={className} aria-hidden="true">
        ✦
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? sign ?? "zodiac sign"}
      className={className}
    >
      {symbol}
    </span>
  );
}
