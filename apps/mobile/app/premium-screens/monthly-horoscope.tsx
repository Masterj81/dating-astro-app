import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { ZodiacGlyph } from '../../components/astro/ZodiacGlyph';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';

// V2 — formerly "Monthly Horoscope". Renamed editorially to
// "Monthly Reflection" to match the just-shipped mobile Daily Reflection
// V2 and the web Monthly Horoscope V2.
//
// The V1 surface fabricated predictive precision (★★★★☆ star ratings
// across love/career/health/luck, "best days" numeric lists, week-by-week
// energy bars, decorative emojis 💕 💼 🧘 ✨ 🌕 🌑 🍀 ☿️, and copy like
// "Venus Enters Taurus" presented as personal forecast). That presented
// invented monthly certainty as a personal reading and carried marketing
// / legal risk under the App Store's astrology guidelines.
//
// V2 keeps:
//   - The premiumCatalog key `monthlyHoroscope` (hub label)
//   - The PremiumGate feature="monthly-horoscope"
//   - The route `/premium-screens/monthly-horoscope`
//   - Sun-sign lookup against the user's profile
//
// V2 removes:
//   - Star ratings (★★★★☆) across all four categories
//   - "Best days this month" numeric date lists
//   - Week-by-week energy bars and predictive advice
//   - "Important dates" with claimed planetary precision per day
//   - All decorative emojis
//   - Hardcoded "luck" / "manifestation" surfaces
//
// V2 ships, top to bottom (matches Daily Reflection V2 architecture):
//   1. Hero — current month label + glyph + sign + qualitative monthly
//      mood phrase (no %)
//   2. Monthly lens — short reflective paragraph per sign, introspective
//      not predictive
//   3. Monthly rhythm — 4 axes (Love / Mind / Body / Social), each given
//      a qualitative label (quiet / soft / steady / bright / strong)
//      chosen deterministically from a (month + year + sign) seed.
//      Dots only, no numeric %.
//   4. Dating lens — one relational sentence for the month
//   5. Conversation prompts — 2-3 questions to ask or use in chat/profile
//   6. Reflect on — 1-2 reflection invitations for the month
//   7. Disclaimer — "for reflection, not prediction"

const SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const;
type SignKey = (typeof SIGNS)[number];

const AXES = ['love', 'mind', 'body', 'social'] as const;
type Axis = (typeof AXES)[number];

const LEVELS = ['quiet', 'soft', 'steady', 'bright', 'strong'] as const;
type Level = (typeof LEVELS)[number];

// Different multipliers per axis so the four axes don't move in lockstep.
// Co-primes with 5 (the level count) keep the distribution flat-ish across
// the year rather than clustering on one label.
const AXIS_SEED_OFFSET: Record<Axis, number> = {
  love: 0,
  mind: 3,
  body: 7,
  social: 11,
};

function pickLevel(seed: number, axis: Axis): Level {
  const value = (seed + AXIS_SEED_OFFSET[axis]) % LEVELS.length;
  return LEVELS[(value + LEVELS.length) % LEVELS.length];
}

// Dot count per level — 1..5 — used by the qualitative meter. We render
// the dot count visually but never expose it as a number to the user.
const LEVEL_INTENSITY: Record<Level, number> = {
  quiet: 1,
  soft: 2,
  steady: 3,
  bright: 4,
  strong: 5,
};

function EnergyDots({ level }: { level: Level }) {
  const filled = LEVEL_INTENSITY[level];
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i < filled ? styles.dotFilled : styles.dotEmpty]}
        />
      ))}
    </View>
  );
}

function isKnownSign(value: string | null | undefined): value is SignKey {
  if (!value) return false;
  return (SIGNS as readonly string[]).includes(value.toLowerCase());
}

function MonthlyReflectionContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // Stable date ref -- avoid creating new Date on every render
  const today = useRef(new Date()).current;

  const getMonthName = (monthIndex: number) => {
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december',
    ];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const monthLabel = `${getMonthName(today.getMonth())} ${today.getFullYear()}`;

  useEffect(() => {
    loadUserSign();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUserSign = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('sun_sign')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.sun_sign) {
        setSunSign(data.sun_sign);
      }
    } catch (err) {
      console.error('Error loading user sign:', err);
      setError(t('monthlyHoroscopeV2LoadError') || 'Could not load your monthly reflection. Please try again.');
    }

    setLoading(false);
  };

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  const signKey: SignKey | null = isKnownSign(sunSign) ? (sunSign!.toLowerCase() as SignKey) : null;
  const signLabel = signKey ? t(signKey) : null;

  // Seed for monthly rhythm — month + year + sign-length, then ×11.
  // Deterministic per (sign × month × year). Only drives qualitative labels.
  // Different multiplier than Daily Reflection (×7) so the two screens
  // don't appear identically synchronized for the same sign.
  const seed = (today.getMonth() + today.getFullYear() + (signKey?.length || 0)) * 11;

  const axisLabel: Record<Axis, string> = useMemo(() => ({
    love: t('monthlyHoroscopeV2AxisLove') || 'Love',
    mind: t('monthlyHoroscopeV2AxisMind') || 'Mind',
    body: t('monthlyHoroscopeV2AxisBody') || 'Body',
    social: t('monthlyHoroscopeV2AxisSocial') || 'Social',
  }), [t]);

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.centerFillPadded}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadUserSign} style={styles.errorButton}>
            <Text style={styles.errorButtonText}>{t('tryAgain') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const renderHeader = (
    <View style={[styles.header, { paddingTop: 40 + topInset }]}>
      <TouchableOpacity
        style={[styles.backButton, { top: 30 + topInset }]}
        onPress={() => router.back()}
        accessibilityLabel={t('back') || 'Back'}
      >
        <Text style={styles.backText}>{'←'}</Text>
      </TouchableOpacity>
      <Text style={styles.title}>{t('monthlyHoroscopeV2Title') || 'Monthly Reflection'}</Text>
      <Text style={styles.subtitle}>{monthLabel}</Text>
    </View>
  );

  // Tier is gated by PremiumGate above. Here we only branch on whether
  // we have a real sun sign on file. If we don't, we route the user to
  // the profile so we can produce an accurate read next visit — we
  // don't fabricate a sign.
  if (!signKey) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
          showsVerticalScrollIndicator={false}
        >
          {renderHeader}
          <View style={styles.noSignCard}>
            <Text style={styles.heroEyebrow}>{monthLabel}</Text>
            <Text style={styles.noSignTitle}>
              {t('monthlyHoroscopeV2NoSignTitle') ||
                'Add your birth details to personalize this month’s read'}
            </Text>
            <Text style={styles.noSignBody}>
              {t('monthlyHoroscopeV2NoSignBody') ||
                'Your Monthly Reflection tunes to your Sun sign. We don’t have one on file yet — open your profile to add a birth date and unlock a personal read.'}
            </Text>
            <TouchableOpacity
              onPress={() => router.push('/onboarding/birth-info')}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>
                {t('openProfile') || 'Open profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {renderHeader}

        {/* Block 1 — Hero. Month label, glyph, sign, qualitative monthly mood. */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {t('monthlyHoroscopeV2MonthLabel') || 'This month'}
          </Text>
          <View style={styles.heroRow}>
            <ZodiacGlyph sign={signKey} variant="premium" size="md" />
            <View style={styles.heroTextCol}>
              <Text style={styles.heroSign}>{signLabel}</Text>
              <Text style={styles.heroDate}>{monthLabel}</Text>
            </View>
          </View>
          <View style={styles.heroMoodBlock}>
            <Text style={styles.heroMoodLabel}>
              {t('monthlyHoroscopeV2Mood') || 'Monthly mood'}
            </Text>
            <Text style={styles.heroMoodText}>
              {t(`monthlyHoroscopeMoodV2_${signKey}`)}
            </Text>
          </View>
        </View>

        {/* Block 2 — Monthly lens. Short reflective paragraph. */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>
            {t('monthlyHoroscopeV2LensTitle') || 'Monthly lens'}
          </Text>
          <Text style={styles.sectionBody}>
            {t(`monthlyHoroscopeLensV2_${signKey}`)}
          </Text>
        </View>

        {/* Block 3 — Monthly rhythm. Four axes × qualitative label + dot meter.
            No percentages. Symbolic, not numeric. */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>
            {t('monthlyHoroscopeV2RhythmTitle') || 'Monthly rhythm'}
          </Text>
          <View style={styles.axesGrid}>
            {AXES.map((axis) => {
              const level = pickLevel(seed, axis);
              return (
                <View key={axis} style={styles.axisRow}>
                  <View style={styles.axisTextCol}>
                    <Text style={styles.axisLabel}>{axisLabel[axis]}</Text>
                    <Text style={styles.axisLevel}>
                      {t(`monthlyHoroscopeV2Level_${level}`)}
                    </Text>
                  </View>
                  <EnergyDots level={level} />
                </View>
              );
            })}
          </View>
        </View>

        {/* Block 4 — Dating lens. One relational sentence for the month. */}
        <View style={styles.datingCard}>
          <Text style={styles.datingEyebrow}>
            {t('monthlyHoroscopeV2DatingTitle') || 'Dating lens'}
          </Text>
          <Text style={styles.sectionBody}>
            {t(`monthlyHoroscopeDatingLensV2_${signKey}`)}
          </Text>
        </View>

        {/* Block 5 — Conversation prompts. 2-3 questions to ask or use in
            profile/chat. */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>
            {t('monthlyHoroscopeV2PromptsTitle') || 'Conversation prompts'}
          </Text>
          <Text style={styles.promptBody}>
            {t(`monthlyHoroscopeConversationPromptsV2_${signKey}`)}
          </Text>
        </View>

        {/* Block 6 — Reflect on. 1-2 reflection invitations for the month. */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionEyebrow}>
            {t('monthlyHoroscopeV2ReflectTitle') || 'Reflect on'}
          </Text>
          <Text style={styles.sectionBodyMuted}>
            {t(`monthlyHoroscopeReflectV2_${signKey}`)}
          </Text>
        </View>

        {/* Block 7 — Disclaimer. Same pattern as Daily Reflection / Retrograde V2. */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerEyebrow}>
            {t('monthlyHoroscopeV2DisclaimerTitle') || 'A reminder'}
          </Text>
          <Text style={styles.disclaimerBody}>
            {t('monthlyHoroscopeV2DisclaimerBody') ||
              'Use this as a monthly reflection tool, not a prediction.'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function MonthlyHoroscopeScreen() {
  return (
    <PremiumGate feature="monthly-horoscope">
      <MonthlyReflectionContent />
    </PremiumGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          height: '100%',
          width: '100%',
        } as any)
      : {}),
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? ({
          height: 'calc(100vh - 120px)',
          overflowY: 'auto',
        } as any)
      : {}),
  },
  scrollContent: {
    paddingBottom: 40,
  },
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerFillPadded: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  errorButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  errorButtonText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '600',
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(91, 84, 168, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91, 84, 168, 0.22)',
  },
  heroEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  heroTextCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  heroSign: {
    fontSize: 22,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  heroDate: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
  },
  heroMoodBlock: {
    marginTop: 18,
  },
  heroMoodLabel: {
    fontSize: 10,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  heroMoodText: {
    fontSize: 16,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  sectionCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  sectionEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  sectionBody: {
    fontSize: 14.5,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  sectionBodyMuted: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 22,
  },
  promptBody: {
    fontSize: 15,
    color: AppTheme.colors.textPrimary,
    lineHeight: 23,
  },
  axesGrid: {
    marginTop: 4,
    gap: 10,
  },
  axisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    gap: 12,
  },
  axisTextCol: {
    flexShrink: 1,
    minWidth: 0,
  },
  axisLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  axisLevel: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
    textTransform: 'lowercase',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: AppTheme.colors.coral,
  },
  dotEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  datingCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(201, 134, 146, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(201, 134, 146, 0.24)',
  },
  datingEyebrow: {
    fontSize: 11,
    color: '#FFB7C7',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
    fontWeight: '600',
  },
  disclaimerCard: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  disclaimerEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 6,
  },
  disclaimerBody: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  noSignCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 22,
    borderRadius: 20,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  noSignTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 10,
    lineHeight: 26,
  },
  noSignBody: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: 18,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    minHeight: 44,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: '600',
    fontSize: 14,
  },
});
