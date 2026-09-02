/**
 * ZodiacGlyph — the single source of truth for rendering zodiac signs
 * across the JUNO mobile app. Replaces the previous mix of
 * inline emoji strings ('☀️' for Sun, '🌙' for Moon, '⬆️' for Rising)
 * and ad-hoc per-screen sign-glyph maps. Use this everywhere a sign
 * needs to be shown.
 *
 * Codepoints come from U+2648..U+2653 (Miscellaneous Symbols). Modern
 * fonts render them as monochrome text glyphs, not colored emoji —
 * exactly what we want for the premium dark look. We append the text
 * variation selector U+FE0E ('︎') immediately after the glyph so
 * any system that *would* prefer emoji presentation falls back to text
 * presentation.
 *
 * Variants:
 *   - 'inline'   plain glyph, inherits color, no chrome (mid-text use)
 *   - 'chip'     pill-style chip with optional label (lists, rows)
 *   - 'premium'  the R3 gold premium badge:
 *                  outer dark navy circle + lighter inner circle +
 *                  tiny gold dot at 12 o'clock + #E9C873 gold glyph.
 *   - 'muted'    cream-on-dark for subdued contexts
 *
 * Accessibility:
 *   - Every variant renders a `<View accessibilityLabel="…">` so screen
 *     readers announce "Aries", "Pisces", etc. — the full English sign
 *     name. Callers can override via the `accessibilityLabel` prop.
 *
 * Sizes:
 *   - 'sm' → 24px outer
 *   - 'md' → 40px outer
 *   - 'lg' → 80px outer
 */

import type { FC } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

// ── Types ───────────────────────────────────────────────────────────

export type ZodiacSignKey =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export type ZodiacGlyphVariant = 'inline' | 'chip' | 'premium' | 'muted';
export type ZodiacGlyphSize = 'sm' | 'md' | 'lg';

export interface ZodiacGlyphProps {
  sign: ZodiacSignKey;
  variant?: ZodiacGlyphVariant;
  size?: ZodiacGlyphSize;
  showLabel?: boolean;
  /** When true and `variant === 'premium'`, draws a 2px gold ring. */
  active?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

// ── Constants ───────────────────────────────────────────────────────

// Text variation selector — forces text presentation on systems that
// might otherwise upgrade these codepoints to colored emoji.
const VS_TEXT = '︎';

export const ZODIAC_GLYPHS: Record<ZodiacSignKey, string> = {
  aries: '♈',       // ♈
  taurus: '♉',      // ♉
  gemini: '♊',      // ♊
  cancer: '♋',      // ♋
  leo: '♌',         // ♌
  virgo: '♍',       // ♍
  libra: '♎',       // ♎
  scorpio: '♏',     // ♏
  sagittarius: '♐', // ♐
  capricorn: '♑',   // ♑
  aquarius: '♒',    // ♒
  pisces: '♓',      // ♓
};

export const ZODIAC_LABELS: Record<ZodiacSignKey, string> = {
  aries: 'Aries',
  taurus: 'Taurus',
  gemini: 'Gemini',
  cancer: 'Cancer',
  leo: 'Leo',
  virgo: 'Virgo',
  libra: 'Libra',
  scorpio: 'Scorpio',
  sagittarius: 'Sagittarius',
  capricorn: 'Capricorn',
  aquarius: 'Aquarius',
  pisces: 'Pisces',
};

export const ZODIAC_KEYS: readonly ZodiacSignKey[] = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

// Per-sign tiny vertical nudges in *pixels* to optically center each
// glyph inside the inner circle. Most fonts render these symbols a
// hair below the cap-line; small per-sign tweaks beat one global
// offset. Visual QA should refine these over time. Default: 0.
const SIGN_OPTICAL_OFFSET: Record<ZodiacSignKey, number> = {
  aries: 0,
  taurus: 0,
  gemini: 0,
  cancer: 0,
  leo: 0,
  virgo: 0,
  libra: 0,
  scorpio: 0,
  sagittarius: 0,
  capricorn: 0,
  aquarius: 0,
  pisces: 0,
};

// Force text-presentation rendering. On platforms where a serif/symbol
// font is available we prefer it; otherwise the VS_TEXT selector
// suffices.
const TEXT_FONT_FAMILY = Platform.select({
  ios: 'Apple Symbols',
  android: undefined, // Roboto + VS_TEXT renders zodiac as text
  default: undefined,
});

// Outer diameter per size token.
const SIZE_PX: Record<ZodiacGlyphSize, number> = {
  sm: 24,
  md: 40,
  lg: 80,
};

const GOLD = '#E9C873';
const GOLD_DOT = '#E9C873';
const NAVY = '#151522';
const NAVY_INNER = '#1f1f2e';
const MUTED_BG = '#1a1a26';
const MUTED_GLYPH = 'rgba(241, 230, 204, 0.75)'; // #F1E6CC @ 75 %

// ── Public utilities ────────────────────────────────────────────────

export function normalizeZodiacSign(
  input: string | null | undefined,
): ZodiacSignKey | null {
  if (!input) return null;
  const k = input.toLowerCase().trim();
  return k in ZODIAC_GLYPHS ? (k as ZodiacSignKey) : null;
}

export function zodiacGlyphChar(sign: ZodiacSignKey): string {
  return `${ZODIAC_GLYPHS[sign]}${VS_TEXT}`;
}

// ── Luminary glyphs (Sun / Moon / Rising) ──────────────────────────
// Disambiguation for places that previously rendered ☀️ / 🌙 / ⬆️.
// Sun: U+2609 ☉   Moon: U+263E ☾   Rising: ASC text label.

export type LuminaryKind = 'sun' | 'moon' | 'rising';

export const LUMINARY_GLYPHS: Record<LuminaryKind, string> = {
  sun: '☉︎',   // ☉
  moon: '☾︎',  // ☾
  rising: 'ASC',
};

export const LUMINARY_LABELS: Record<LuminaryKind, string> = {
  sun: 'Sun',
  moon: 'Moon',
  rising: 'Rising',
};

export interface LuminaryGlyphProps {
  kind: LuminaryKind;
  size?: ZodiacGlyphSize;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const LuminaryGlyph: FC<LuminaryGlyphProps> = ({
  kind,
  size = 'md',
  accessibilityLabel,
  style,
}) => {
  const outer = SIZE_PX[size];
  const fontSize = kind === 'rising'
    ? Math.round(outer * 0.42)
    : Math.round(outer * 0.6);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? LUMINARY_LABELS[kind]}
      style={[
        styles.luminaryBase,
        { width: outer, height: outer, borderRadius: outer / 2 },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.luminaryText,
          {
            fontSize,
            lineHeight: outer,
            ...(TEXT_FONT_FAMILY ? { fontFamily: TEXT_FONT_FAMILY } : null),
          },
        ]}
      >
        {LUMINARY_GLYPHS[kind]}
      </Text>
    </View>
  );
};

// ── ZodiacGlyph component ───────────────────────────────────────────

export const ZodiacGlyph: FC<ZodiacGlyphProps> = ({
  sign,
  variant = 'inline',
  size = 'md',
  showLabel = false,
  active = false,
  accessibilityLabel,
  style,
}) => {
  const outer = SIZE_PX[size];
  const label = accessibilityLabel ?? ZODIAC_LABELS[sign];
  const opticalOffset = SIGN_OPTICAL_OFFSET[sign];
  const glyph = zodiacGlyphChar(sign);

  if (variant === 'inline') {
    // No chrome — glyph rides the surrounding text. Use ~85 % of size
    // so it doesn't dominate; line-height matches outer for vertical
    // alignment.
    const fontSize = Math.round(outer * 0.85);
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[styles.inlineWrap, style]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.inlineText,
            {
              fontSize,
              lineHeight: outer,
              transform: opticalOffset
                ? [{ translateY: opticalOffset }]
                : undefined,
              ...(TEXT_FONT_FAMILY ? { fontFamily: TEXT_FONT_FAMILY } : null),
            },
          ]}
        >
          {glyph}
        </Text>
        {showLabel ? (
          <Text style={styles.inlineLabel}>{ZODIAC_LABELS[sign]}</Text>
        ) : null}
      </View>
    );
  }

  if (variant === 'chip') {
    const fontSize = Math.round(outer * 0.65);
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[
          styles.chipWrap,
          {
            paddingVertical: Math.round(outer * 0.18),
            paddingHorizontal: showLabel
              ? Math.round(outer * 0.35)
              : Math.round(outer * 0.22),
            borderRadius: outer,
          },
          active ? styles.chipActive : null,
          style,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.chipText,
            {
              fontSize,
              lineHeight: Math.round(outer * 0.9),
              transform: opticalOffset
                ? [{ translateY: opticalOffset }]
                : undefined,
              ...(TEXT_FONT_FAMILY ? { fontFamily: TEXT_FONT_FAMILY } : null),
            },
          ]}
        >
          {glyph}
        </Text>
        {showLabel ? (
          <Text
            style={[
              styles.chipLabel,
              { fontSize: Math.max(11, Math.round(outer * 0.32)) },
            ]}
          >
            {ZODIAC_LABELS[sign]}
          </Text>
        ) : null}
      </View>
    );
  }

  if (variant === 'muted') {
    const fontSize = Math.round(outer * 0.55);
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={[
          styles.mutedWrap,
          { width: outer, height: outer, borderRadius: outer / 2 },
          style,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.mutedText,
            {
              fontSize,
              lineHeight: outer,
              transform: opticalOffset
                ? [{ translateY: opticalOffset }]
                : undefined,
              ...(TEXT_FONT_FAMILY ? { fontFamily: TEXT_FONT_FAMILY } : null),
            },
          ]}
        >
          {glyph}
        </Text>
        {showLabel ? (
          <Text style={styles.mutedLabel}>{ZODIAC_LABELS[sign]}</Text>
        ) : null}
      </View>
    );
  }

  // variant === 'premium' — the R3 gold premium badge.
  const innerPadding = Math.round(outer * 0.18);
  const innerSize = outer - innerPadding * 2;
  const dotSize = Math.max(3, Math.round(outer / 14));
  const dotTopFromInnerTop = Math.max(2, Math.round(outer / 10));
  const fontSize = Math.round(outer * 0.5);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[{ alignItems: 'center' }, style]}
    >
      <View
        style={[
          styles.premiumOuter,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
            borderWidth: active ? 2 : 0,
            borderColor: active ? GOLD : 'transparent',
          },
        ]}
      >
        <View
          style={[
            styles.premiumInner,
            {
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[
              styles.premiumGlyph,
              {
                fontSize,
                lineHeight: innerSize,
                transform: opticalOffset
                  ? [{ translateY: opticalOffset }]
                  : undefined,
                ...(TEXT_FONT_FAMILY ? { fontFamily: TEXT_FONT_FAMILY } : null),
              },
            ]}
          >
            {glyph}
          </Text>
          {/* Gold dot at 12 o'clock of the inner circle */}
          <View
            pointerEvents="none"
            style={[
              styles.premiumDot,
              {
                width: dotSize,
                height: dotSize,
                borderRadius: dotSize / 2,
                top: dotTopFromInnerTop,
                marginLeft: -dotSize / 2,
              },
            ]}
          />
        </View>
      </View>
      {showLabel ? (
        <Text
          style={[
            styles.premiumLabel,
            { marginTop: Math.max(4, Math.round(outer * 0.1)) },
          ]}
        >
          {ZODIAC_LABELS[sign]}
        </Text>
      ) : null}
    </View>
  );
};

// `ZodiacBadge` keeps the same props but defaults to the chip variant —
// callsites that just want "sign-as-tag" can use this and forget about
// variant naming.
export const ZodiacBadge: FC<ZodiacGlyphProps> = (props) => (
  <ZodiacGlyph variant={props.variant ?? 'chip'} {...props} />
);

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Inline
  inlineWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inlineText: {
    color: '#FFFFFF',
    textAlign: 'center',
    includeFontPadding: false,
  },
  inlineLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Chip
  chipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  chipActive: {
    backgroundColor: 'rgba(233, 200, 115, 0.14)',
    borderColor: 'rgba(233, 200, 115, 0.55)',
  },
  chipText: {
    color: '#FFFFFF',
    textAlign: 'center',
    includeFontPadding: false,
  },
  chipLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Muted
  mutedWrap: {
    backgroundColor: MUTED_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(241, 230, 204, 0.16)',
  },
  mutedText: {
    color: MUTED_GLYPH,
    textAlign: 'center',
    includeFontPadding: false,
  },
  mutedLabel: {
    color: MUTED_GLYPH,
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },

  // Premium
  premiumOuter: {
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  premiumInner: {
    backgroundColor: NAVY_INNER,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  premiumGlyph: {
    color: GOLD,
    textAlign: 'center',
    fontWeight: '600',
    includeFontPadding: false,
  },
  premiumDot: {
    position: 'absolute',
    left: '50%',
    backgroundColor: GOLD_DOT,
  },
  premiumLabel: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.4,
  },

  // Luminary
  luminaryBase: {
    backgroundColor: NAVY_INNER,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 200, 115, 0.32)',
  },
  luminaryText: {
    color: GOLD,
    textAlign: 'center',
    fontWeight: '600',
    includeFontPadding: false,
  },
});

export default ZodiacGlyph;
