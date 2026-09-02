import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const AppTheme = {
  colors: {
    canvas: '#0B0B14',
    canvasAlt: '#121826',
    panel: 'rgba(255,255,255,0.06)',
    panelStrong: 'rgba(255,255,255,0.10)',
    glass: 'rgba(255,255,255,0.04)',

    border: 'rgba(255,255,255,0.10)',
    borderStrong: 'rgba(255,255,255,0.18)',

    textPrimary: '#F7F4EE',
    textSecondary: '#C9C2B8',
    textMuted: '#8E8A84',
    textOnAccent: '#FFFFFF',
    /** Foreground for anything sitting ON gold. White on gold is 1.6:1. */
    textOnGold: '#0B0B14',

    // ACTIONS. Coral is a verb — like, message, send. Not decoration.
    coral: '#E85D75',
    coralStrong: '#D93C5A',

    // IDENTITY. Gold carries premium, status, and every section marker.
    // Before this, `gold` was #DAB56D with 32 usages against coral's 129, and
    // `premiumGold` had zero — so an astrology app read pink. Warmed and
    // brightened to #E8C77E: 12:1 on the canvas, unmistakably gold, never
    // yellow.
    gold: '#E8C77E',
    goldSoft: '#F2DCA8',
    goldDeep: '#C9A24D',
    /** Section labels. Muted on purpose — a screen of full-gold eyebrows
     *  reads as a jewellery shop rather than a night sky. 7.9:1. */
    goldMuted: '#B8A87F',
    goldWash: 'rgba(232, 199, 126, 0.10)',
    goldBorder: 'rgba(232, 199, 126, 0.28)',

    // COSMIC TIER ONLY (premium_plus). Not a general-purpose accent.
    cosmic: '#8B87FF',
    cosmicSoft: '#4D9FFF',

    success: '#59C28B',
    warning: '#F0B35A',
    danger: '#FF6B6B',

    heroStart: '#0B0B14',
    heroMid: '#16192A',
    heroEnd: '#1E2740',

    ctaStart: '#E85D75',
    ctaEnd: '#7C6CFF',

    // Premium tier accents. Aliases of the gold scale above, kept because
    // screens read better naming the intent than the swatch.
    premiumGold: '#E8C77E',
    premiumGoldSoft: 'rgba(232, 199, 126, 0.15)',
    premiumGoldBorder: 'rgba(232, 199, 126, 0.30)',
    premiumCosmicSoft: 'rgba(139, 135, 255, 0.12)',
    premiumCosmicBorder: 'rgba(139, 135, 255, 0.25)',

    // Elevated surfaces
    cardBg: 'rgba(255,255,255,0.05)',
    cardBgElevated: 'rgba(255,255,255,0.08)',
    cardBorder: 'rgba(255,255,255,0.10)',
    cardBorderElevated: 'rgba(255,255,255,0.16)',
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    xl: 28,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  type: {
    hero: {
      fontSize: 40,
      lineHeight: 46,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
    },
    display: {
      fontSize: 34,
      lineHeight: 40,
      fontWeight: '700' as const,
    },
    title: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: '700' as const,
    },
    heading: {
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '700' as const,
    },
    section: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600' as const,
    },
    bodyLarge: {
      fontSize: 17,
      lineHeight: 24,
      fontWeight: '400' as const,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500' as const,
    },
    meta: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600' as const,
    },
    micro: {
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '600' as const,
    },
  },
  shadow: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 12,
      elevation: 6,
    },
    cardElevated: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.30,
      shadowRadius: 20,
      elevation: 10,
    },
    coralGlow: {
      shadowColor: '#E85D75',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.40,
      shadowRadius: 16,
      elevation: 8,
    },
    goldGlow: {
      shadowColor: '#E8C77E',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
      elevation: 8,
    },
    cosmicGlow: {
      shadowColor: '#8B87FF',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    ctaGlow: {
      shadowColor: '#E85D75',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.45,
      shadowRadius: 20,
      elevation: 10,
    },
  },
  gradients: {
    screen: ['#0B0B14', '#151A2B', '#1E2540'] as const,
    /** The ordinary call to action stays coral, and it stays DARK enough to
     *  carry white text. A first attempt ramped coral into gold; white on
     *  #E8C77E is 1.63:1, which is not a style problem, it is unreadable.
     *  The old ramp ended on purple #7C6CFF (3.4:1 with white) — barely
     *  better. Ending on coralStrong is the honest version: 4.4:1. */
    cta: ['#E85D75', '#D93C5A'] as const,
    /** The PREMIUM call to action — unlock, upgrade, see plans. Gold with
     *  near-black text: 12:1, the most readable button in the app, and the
     *  place the identity belongs. Pair it with `textOnGold`, never with
     *  `textOnAccent`. */
    ctaGold: ['#F2DCA8', '#E8C77E'] as const,
    premium: ['#F2DCA8', '#C9A24D'] as const,
    goldCard: ['rgba(232,199,126,0.10)', 'rgba(232,199,126,0.02)'] as const,
    cosmicCard: ['rgba(139,135,255,0.08)', 'rgba(139,135,255,0.02)'] as const,
  },
} as const;

/**
 * Mutable copy of `AppTheme.gradients.screen` for LinearGradient's `colors`
 * prop, which expects a mutable array. Import this instead of spreading the
 * tuple in every screen file.
 */
export const SCREEN_GRADIENT: [string, string, ...string[]] = [...AppTheme.gradients.screen];

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Segoe UI', sans-serif",
    mono: "SFMono-Regular, Menlo, Consolas, monospace",
  },
});
