import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateNatalChart } from '../../services/astrology';
import { geocodeCity } from '../../services/geocoding';
import { loadPreSignupDraft } from '../../utils/onboardingDraft';
import { buttonPress } from '../../services/haptics';
import {
  LuminaryGlyph,
  ZodiacGlyph,
  normalizeZodiacSign,
} from '../../components/astro/ZodiacGlyph';

// -- Sign descriptions (short, Co-Star-ish, neutral; placeholders that can
//    later be moved to i18n once translations are written for all locales).
const SUN_DESC: Record<string, string> = {
  aries: 'Quick, fearless, doesn’t wait. You lead by jumping first.',
  taurus: 'Grounded sensualist. You move slow, hold long, and mean it.',
  gemini: 'Two minds, fast, curious. You collect ideas like postcards.',
  cancer: 'Soft armor, deep tide. You guard fiercely the people you choose.',
  leo: 'A small sun. You give warmth — and you need to feel seen.',
  virgo: 'Fine-grained, useful, kind. You love by paying attention.',
  libra: 'Aesthete diplomat. You see both sides — and the third nobody noticed.',
  scorpio: 'All-or-nothing. You go where most people refuse to look.',
  sagittarius: 'Optimist with a passport. You collect distances and meanings.',
  capricorn: 'Quiet ambition. You build long, steady, with care.',
  aquarius: 'Future-tense. Friends first, then maybe more — on your terms.',
  pisces: 'Permeable, dreaming, deep. You feel through the walls.',
};

const MOON_DESC: Record<string, string> = {
  aries: 'You feel in flashes. When the spark hits, you act.',
  taurus: 'Comfort is sacred. You need touch, food, slow time.',
  gemini: 'You process by talking. Silence stings.',
  cancer: 'Tides of feeling. Home is a person, not a place.',
  leo: 'Big-hearted, performative. You love loud or not at all.',
  virgo: 'Care expressed in details. You worry as a love language.',
  libra: 'You stabilize through partnership. Solitude unsettles you.',
  scorpio: 'Underneath, always more. You don’t do casual feelings.',
  sagittarius: 'You need room to breathe — emotionally first.',
  capricorn: 'You feel in private. Trust is slow, lasting.',
  aquarius: 'You think your feelings before feeling them.',
  pisces: 'You absorb everyone. Boundaries are an art.',
};

const RISING_DESC: Record<string, string> = {
  aries: 'First impression: alive, direct, a little bit on fire.',
  taurus: 'First impression: calm, steady, present.',
  gemini: 'First impression: light, witty, quick.',
  cancer: 'First impression: warm, careful, attentive.',
  leo: 'First impression: bright, confident, a small celebration.',
  virgo: 'First impression: composed, precise, well-edited.',
  libra: 'First impression: graceful, easy, well-mannered.',
  scorpio: 'First impression: magnetic, watchful, unmissable.',
  sagittarius: 'First impression: open, candid, ready to leave.',
  capricorn: 'First impression: poised, dry, quietly capable.',
  aquarius: 'First impression: distinct, friendly, slightly off-axis.',
  pisces: 'First impression: gentle, dreamy, hard to pin down.',
};

// Element-based compatibility teaser. Simple but feels right.
const SIGN_ELEMENT: Record<string, 'fire' | 'earth' | 'air' | 'water'> = {
  aries: 'fire', leo: 'fire', sagittarius: 'fire',
  taurus: 'earth', virgo: 'earth', capricorn: 'earth',
  gemini: 'air', libra: 'air', aquarius: 'air',
  cancer: 'water', scorpio: 'water', pisces: 'water',
};

const COMPAT_PICKS: Record<string, Array<{ sign: string; score: number; line: string }>> = {
  fire: [
    { sign: 'libra', score: 92, line: 'air feeds your flame' },
    { sign: 'gemini', score: 89, line: 'curiosity matches your speed' },
    { sign: 'aries', score: 86, line: 'pace meets pace' },
  ],
  earth: [
    { sign: 'cancer', score: 91, line: 'safety meets care' },
    { sign: 'pisces', score: 88, line: 'depth steadies your build' },
    { sign: 'capricorn', score: 86, line: 'shared long horizons' },
  ],
  air: [
    { sign: 'leo', score: 92, line: 'your ideas, their stage' },
    { sign: 'aquarius', score: 89, line: 'the same future-tense' },
    { sign: 'sagittarius', score: 85, line: 'wide minds, wide world' },
  ],
  water: [
    { sign: 'taurus', score: 91, line: 'tide held, gently' },
    { sign: 'capricorn', score: 88, line: 'feeling meets structure' },
    { sign: 'pisces', score: 86, line: 'two oceans, one weather' },
  ],
};

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ---------------------------------------------------------------------------

export default function WelcomePreview() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [stage, setStage] = useState<'computing' | 'ready' | 'incomplete'>('computing');
  const [chart, setChart] = useState<{
    sun: string;
    moon: string;
    rising: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fadeSun = useRef(new Animated.Value(0)).current;
  const fadeMoon = useRef(new Animated.Value(0)).current;
  const fadeRising = useRef(new Animated.Value(0)).current;
  const fadeCompat = useRef(new Animated.Value(0)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;

  // Spin animation while computing.
  useEffect(() => {
    Animated.loop(
      Animated.timing(ringSpin, {
        toValue: 1,
        duration: 6000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();
  }, [ringSpin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const draft = await loadPreSignupDraft();
        if (!draft || !draft.birthMonth || !draft.birthDay || !draft.birthYear) {
          if (!cancelled) setStage('incomplete');
          return;
        }
        const month = Number(draft.birthMonth);
        const day = Number(draft.birthDay);
        const year = Number(draft.birthYear);
        if (!month || !day || !year) {
          if (!cancelled) setStage('incomplete');
          return;
        }

        const date = new Date(year, month - 1, day);
        const time = !draft.timeUnknown && draft.birthHour && draft.birthMinute
          ? `${draft.birthHour}:${draft.birthMinute}`
          : undefined;

        // Geocode the city, or keep null. (0, 0) used to stand in for
        // "unknown", but zero is a real coordinate — the Gulf of Guinea — and
        // the engine happily computed an ascendant there. Null makes the
        // engine withhold the angles instead; sun and moon stay accurate
        // either way because they depend only on the UTC instant.
        let lat: number | null = null;
        let lng: number | null = null;
        let iana: string | null = null;
        const cityStr = String(draft.birthCity || '').trim();
        if (cityStr.length >= 2) {
          try {
            const geo = await geocodeCity(cityStr);
            if (geo && typeof geo.latitude === 'number' && typeof geo.longitude === 'number') {
              lat = geo.latitude;
              lng = geo.longitude;
              iana = geo.iana;
            }
          } catch {
            // network / geocode failure — keep null; sun/moon stay accurate.
          }
        }

        const local = calculateNatalChart(date, time ?? null, lat, lng, iana);
        if (cancelled) return;

        const sun = String(local.sun?.sign || '').toLowerCase();
        const moon = String(local.moon?.sign || '').toLowerCase();
        // The engine returns null without a birth time, so `local.rising` is
        // now the single source of truth — the `!time` guard was compensating
        // for the Aries substitution this file never saw, and is kept only as
        // a belt-and-braces read. An empty string would have rendered as a
        // blank placement; null hides the row instead.
        const rising = local.rising?.sign ? local.rising.sign.toLowerCase() : null;

        setChart({ sun, moon, rising });
        setStage('ready');

        // Reveal animation, one luminary at a time.
        Animated.stagger(280, [
          Animated.timing(fadeSun, { toValue: 1, duration: 480, useNativeDriver: true }),
          Animated.timing(fadeMoon, { toValue: 1, duration: 480, useNativeDriver: true }),
          Animated.timing(fadeRising, { toValue: 1, duration: 480, useNativeDriver: true }),
          Animated.timing(fadeCompat, { toValue: 1, duration: 480, useNativeDriver: true }),
        ]).start();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not compute chart');
          setStage('incomplete');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fadeSun, fadeMoon, fadeRising, fadeCompat]);

  const handleContinue = () => {
    buttonPress();
    router.push('/auth/signup');
  };

  const handleEdit = () => {
    buttonPress();
    router.back();
  };

  // ---------------- Render ------------------

  const renderRing = () => {
    const spin = ringSpin.interpolate({
      inputRange: [0, 1],
      outputRange: ['0deg', '360deg'],
    });
    return (
      <Animated.View style={[styles.ringWrap, { transform: [{ rotate: spin }] }]}>
        <LinearGradient
          colors={[AppTheme.colors.coral, AppTheme.colors.cosmic, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.ring}
        />
      </Animated.View>
    );
  };

  if (stage === 'computing') {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={[styles.center, { paddingTop: insets.top + 80 }]}>
          {renderRing()}
          <Text style={styles.computeTitle}>
            {t('welcomeComputeTitle') || 'Drawing your chart'}
          </Text>
          <Text style={styles.computeSubtitle}>
            {t('welcomeComputeSubtitle') ||
              'Sun, Moon, Rising — pulling your sky from the day you arrived…'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (stage === 'incomplete' || !chart) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={[styles.center, { paddingTop: insets.top + 80 }]}>
          <Text style={styles.computeTitle}>
            {t('welcomePreviewIncompleteTitle') || 'We need a little more'}
          </Text>
          <Text style={styles.computeSubtitle}>
            {error || t('welcomePreviewIncompleteBody') ||
              'Go back and complete your birth details so we can draw an accurate chart.'}
          </Text>
          <TouchableOpacity onPress={handleEdit} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>{t('welcomeBackToEdit') || 'Edit details'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const element = SIGN_ELEMENT[chart.sun] || 'air';
  const compats = COMPAT_PICKS[element] || COMPAT_PICKS.air;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{t('welcomeYourSky') || 'Your sky'}</Text>
          <Text style={styles.title}>
            {t('welcomePreviewTitle') || 'Here you are.'}
          </Text>
        </View>

        {/* Sun */}
        <Animated.View style={[styles.luminaryCard, { opacity: fadeSun }]}>
          <View style={styles.luminaryHead}>
            <LuminaryGlyph kind="sun" size="md" />
            <View style={{ flex: 1 }}>
              <Text style={styles.luminaryLabel}>
                {t('welcomeSun') || 'Sun in'} {capitalize(chart.sun)}
              </Text>
              <Text style={styles.luminarySublabel}>
                {t('welcomeWhoYouAre') || 'who you are at center'}
              </Text>
            </View>
            {normalizeZodiacSign(chart.sun) ? (
              <ZodiacGlyph
                sign={normalizeZodiacSign(chart.sun)!}
                variant="premium"
                size="sm"
              />
            ) : null}
          </View>
          <Text style={styles.luminaryDesc}>{SUN_DESC[chart.sun] || ''}</Text>
        </Animated.View>

        {/* Moon */}
        <Animated.View style={[styles.luminaryCard, { opacity: fadeMoon }]}>
          <View style={styles.luminaryHead}>
            <LuminaryGlyph kind="moon" size="md" />
            <View style={{ flex: 1 }}>
              <Text style={styles.luminaryLabel}>
                {t('welcomeMoon') || 'Moon in'} {capitalize(chart.moon)}
              </Text>
              <Text style={styles.luminarySublabel}>
                {t('welcomeHowYouFeel') || 'how you love and need'}
              </Text>
            </View>
            {normalizeZodiacSign(chart.moon) ? (
              <ZodiacGlyph
                sign={normalizeZodiacSign(chart.moon)!}
                variant="premium"
                size="sm"
              />
            ) : null}
          </View>
          <Text style={styles.luminaryDesc}>{MOON_DESC[chart.moon] || ''}</Text>
        </Animated.View>

        {/* Rising — only if time was provided */}
        {chart.rising ? (
          <Animated.View style={[styles.luminaryCard, { opacity: fadeRising }]}>
            <View style={styles.luminaryHead}>
              <LuminaryGlyph kind="rising" size="md" />
              <View style={{ flex: 1 }}>
                <Text style={styles.luminaryLabel}>
                  {t('welcomeRising') || 'Rising in'} {capitalize(chart.rising)}
                </Text>
                <Text style={styles.luminarySublabel}>
                  {t('welcomeFirstImpression') || 'how the world meets you'}
                </Text>
              </View>
              {normalizeZodiacSign(chart.rising) ? (
                <ZodiacGlyph
                  sign={normalizeZodiacSign(chart.rising)!}
                  variant="premium"
                  size="sm"
                />
              ) : null}
            </View>
            <Text style={styles.luminaryDesc}>{RISING_DESC[chart.rising] || ''}</Text>
          </Animated.View>
        ) : null}

        {/* Compatibility teaser */}
        <Animated.View style={[styles.compatBlock, { opacity: fadeCompat }]}>
          <Text style={styles.compatHeading}>
            {t('welcomeMostCompatible') || 'Most cosmically aligned with you'}
          </Text>
          <View style={styles.compatRow}>
            {compats.map((c) => {
              const signKey = normalizeZodiacSign(c.sign);
              return (
                <View key={c.sign} style={styles.compatPill}>
                  {signKey ? (
                    <ZodiacGlyph
                      sign={signKey}
                      variant="premium"
                      size="sm"
                      style={{ marginBottom: 6 }}
                    />
                  ) : null}
                  <Text style={styles.compatName}>{capitalize(c.sign)}</Text>
                  <Text style={styles.compatScore}>{c.score}%</Text>
                  <Text style={styles.compatLine}>{c.line}</Text>
                </View>
              );
            })}
          </View>

          {/* CTA */}
          <TouchableOpacity onPress={handleContinue} activeOpacity={0.85} style={styles.cta}>
            <LinearGradient
              colors={[...AppTheme.gradients.cta]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>
                {t('welcomeContinueToFind') || 'Continue to find them'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEdit} style={styles.editBtn}>
            <Text style={styles.editBtnText}>{t('welcomeEditDetails') || 'Edit my details'}</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  ringWrap: {
    width: 140,
    height: 140,
    marginBottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 140,
    height: 140,
    borderRadius: 70,
    opacity: 0.55,
  },
  computeTitle: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  computeSubtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },

  header: { marginBottom: 28 },
  eyebrow: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  title: {
    ...AppTheme.type.hero,
    color: AppTheme.colors.textPrimary,
  },

  luminaryCard: {
    backgroundColor: AppTheme.colors.cardBg,
    borderColor: AppTheme.colors.cardBorder,
    borderWidth: 1,
    borderRadius: AppTheme.radius.lg,
    padding: 18,
    marginBottom: 14,
    ...AppTheme.shadow.card,
  },
  luminaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
  },
  luminaryLabel: {
    ...AppTheme.type.heading,
    color: AppTheme.colors.textPrimary,
  },
  luminarySublabel: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  luminaryDesc: {
    ...AppTheme.type.bodyLarge,
    color: AppTheme.colors.textSecondary,
    lineHeight: 24,
  },

  compatBlock: {
    marginTop: 24,
  },
  compatHeading: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center',
  },
  compatRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  compatPill: {
    flex: 1,
    backgroundColor: AppTheme.colors.panel,
    borderColor: AppTheme.colors.borderStrong,
    borderWidth: 1,
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  compatName: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
    marginBottom: 2,
  },
  compatScore: {
    ...AppTheme.type.body,
    color: AppTheme.colors.coral,
    fontWeight: '700',
    marginBottom: 6,
  },
  compatLine: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  cta: {
    borderRadius: AppTheme.radius.pill,
    overflow: 'hidden',
    ...AppTheme.shadow.ctaGlow,
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: AppTheme.colors.textOnAccent,
    ...AppTheme.type.bodyLarge,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  editBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  editBtnText: {
    color: AppTheme.colors.textMuted,
    ...AppTheme.type.caption,
  },

  secondaryBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: AppTheme.radius.pill,
    backgroundColor: AppTheme.colors.panelStrong,
    borderColor: AppTheme.colors.borderStrong,
    borderWidth: 1,
  },
  secondaryBtnText: {
    color: AppTheme.colors.textPrimary,
    ...AppTheme.type.body,
    fontWeight: '600',
  },
});
