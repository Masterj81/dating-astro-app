import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

// V2 — formerly "Lucky Days Calculator". Renamed editorially to
// "Planning Windows". The V1 surface fabricated 30 calendar dates per
// month across Love/Career/Money/Health/Creativity, each pinned to an
// exact "lucky hour" (e.g. "11:00 AM"), an energy star rating, and
// "best for / avoid" tags — all derived from `day % 5` arithmetic with
// no astrological input. That framing crossed into disguised
// financial/relational advice ("Optimal days for investments and
// negotiations"). The V2 removes:
//   - Precise calendar dates
//   - "Lucky hour" times
//   - Numeric energy scores
//   - Money/Health categories pinned to dates
//   - The word "lucky" everywhere user-facing
//
// What remains:
//   - The Cosmic gate (PremiumGate feature="lucky-days") — unchanged
//   - The route `/premium-screens/lucky-days` — unchanged (deep links survive)
//   - The user's `sun_sign` from Supabase — used only as a heading label
//
// New shape: three broad reflection windows (Days 1-10 / 11-20 / 21-end)
// + a soft disclaimer. Sign-agnostic copy keeps the i18n footprint
// tight; sign personalization is heading-only (e.g. "Aries · May 2026").

type WindowKey = 'early' | 'mid' | 'late';

type WindowDef = {
  key: WindowKey;
  rangeKey: string;
  labelKey: string;
  verbKey: string;
  bodyKey: string;
  phase: 1 | 2 | 3 | 4 | 5;
};

const WINDOWS: WindowDef[] = [
  {
    key: 'early',
    rangeKey: 'planningWindowsEarlyRange',
    labelKey: 'planningWindowsEarlyLabel',
    verbKey: 'planningWindowsEarlyVerb',
    bodyKey: 'planningWindowsEarlyBody',
    phase: 2,
  },
  {
    key: 'mid',
    rangeKey: 'planningWindowsMidRange',
    labelKey: 'planningWindowsMidLabel',
    verbKey: 'planningWindowsMidVerb',
    bodyKey: 'planningWindowsMidBody',
    phase: 4,
  },
  {
    key: 'late',
    rangeKey: 'planningWindowsLateRange',
    labelKey: 'planningWindowsLateLabel',
    verbKey: 'planningWindowsLateVerb',
    bodyKey: 'planningWindowsLateBody',
    phase: 3,
  },
];

const LENSES: { key: string; labelKey: string; bodyKey: string }[] = [
  { key: 'connect', labelKey: 'planningWindowsLensConnect', bodyKey: 'planningWindowsLensConnectBody' },
  { key: 'reflect', labelKey: 'planningWindowsLensReflect', bodyKey: 'planningWindowsLensReflectBody' },
  { key: 'reset', labelKey: 'planningWindowsLensReset', bodyKey: 'planningWindowsLensResetBody' },
  { key: 'plan', labelKey: 'planningWindowsLensPlan', bodyKey: 'planningWindowsLensPlanBody' },
];

function PhaseDots({ filled }: { filled: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <View style={styles.phaseDots} accessibilityElementsHidden>
      {Array.from({ length: 5 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.phaseDot,
            i < filled ? styles.phaseDotFilled : styles.phaseDotEmpty,
          ]}
        />
      ))}
    </View>
  );
}

function PlanningWindowsContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const today = useRef(new Date()).current;

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const monthLabel = `${getMonthName(today.getMonth())} ${today.getFullYear()}`;

  useEffect(() => {
    loadUserSign();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user]);

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
      setError(t('loadingError') || 'Could not load planning windows. Please try again.');
    }
    setLoading(false);
  };

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
          <Text style={styles.loadingText}>
            {t('planningWindowsLoading') || 'Loading your monthly rhythm...'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={[styles.centered, { paddingHorizontal: 32 }]}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadUserSign} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('tryAgain') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const signLabel = sunSign ? t(sunSign.toLowerCase()) || sunSign : null;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: 40 + topInset }]}>
          <TouchableOpacity
            style={[styles.backButton, { top: 30 + topInset }]}
            onPress={() => router.back()}
            accessibilityLabel={t('back') || 'Back'}
          >
            <Text style={styles.backText}>{'←'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('planningWindowsTitle') || 'Planning Windows'}</Text>
          <Text style={styles.subtitle}>
            {signLabel ? `${signLabel} · ${monthLabel}` : monthLabel}
          </Text>
        </View>

        {/* Hero — reflection-first framing */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {t('planningWindowsEyebrow') || 'Monthly Rhythm'}
          </Text>
          <Text style={styles.heroBody}>
            {t('planningWindowsHeroBody') ||
              'A symbolic monthly rhythm for reflection, not lucky dates.'}
          </Text>
        </View>

        {/* Three Windows */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('planningWindowsSectionTitle') || 'Three Windows'}
          </Text>
          {WINDOWS.map((w) => (
            <View key={w.key} style={styles.windowCard}>
              <View style={styles.windowHeader}>
                <View style={styles.windowHeaderText}>
                  <Text style={styles.windowLabel}>{t(w.labelKey)}</Text>
                  <Text style={styles.windowRange}>{t(w.rangeKey)}</Text>
                </View>
                <PhaseDots filled={w.phase} />
              </View>
              <Text style={styles.windowVerb}>{t(w.verbKey)}</Text>
              <Text style={styles.windowBody}>{t(w.bodyKey)}</Text>
            </View>
          ))}
        </View>

        {/* Activity Lenses */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('planningWindowsLensesTitle') || 'Lenses For The Month'}
          </Text>
          <View style={styles.lensesGrid}>
            {LENSES.map((lens) => (
              <View key={lens.key} style={styles.lensCard}>
                <Text style={styles.lensLabel}>{t(lens.labelKey)}</Text>
                <Text style={styles.lensBody}>{t(lens.bodyKey)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Reflection prompt */}
        <View style={styles.reflectCard}>
          <Text style={styles.reflectEyebrow}>
            {t('planningWindowsReflectTitle') || 'Reflection Prompt'}
          </Text>
          <Text style={styles.reflectBody}>
            {t('planningWindowsReflectBody') ||
              'Which window of the month do you usually push hardest in? Try noticing where you rest instead.'}
          </Text>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerEyebrow}>
            {t('planningWindowsDisclaimerTitle') || 'A Note'}
          </Text>
          <Text style={styles.disclaimerBody}>
            {t('planningWindowsDisclaimerBody') ||
              'Use this as a reflection tool, not a prediction.'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function PlanningWindowsScreen() {
  return (
    <PremiumGate feature="lucky-days">
      <PlanningWindowsContent />
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: AppTheme.colors.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryText: {
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
  },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
  },
  heroEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  heroBody: {
    fontSize: 15,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 14,
  },
  windowCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  windowHeaderText: {
    flex: 1,
  },
  windowLabel: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  windowRange: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
  },
  windowVerb: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  windowBody: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  phaseDots: {
    flexDirection: 'row',
    gap: 5,
    paddingTop: 4,
  },
  phaseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  phaseDotFilled: {
    backgroundColor: AppTheme.colors.cosmic,
  },
  phaseDotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  lensesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  lensCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  lensLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  lensBody: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
    lineHeight: 18,
  },
  reflectCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(232, 93, 117, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.24)',
  },
  reflectEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.coral,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  reflectBody: {
    fontSize: 14,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  disclaimerCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  disclaimerEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  disclaimerBody: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
});
