import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import PlanetGlyph from '../../components/ui/PlanetGlyph';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';

// V2 — formerly "Retrograde Alerts". Renamed editorially to
// "Retrograde Reflection". The V1 surface fabricated start/end calendar
// dates for four planets' retrogrades (e.g. "Mercury Apr 1 - Apr 25",
// "Mars Dec 6 - Feb 23"), surfaced a 58-day countdown, framed the
// content as a "Survival Guide" with binary do / don't lists, and
// offered seven alert toggles even though no mobile push channel
// actually delivers them. That presented fabricated certainty about
// when planetary events would happen and warned users to avoid
// real-world actions during invented date ranges.
//
// V2 keeps:
//   - The Cosmic gate (PremiumGate feature="retrograde-alerts")
//   - The route `/premium-screens/retrograde-alerts`
//
// V2 removes:
//   - All fabricated start/end dates and countdowns
//   - The "Survival Guide" framing
//   - Binary do / don't lists
//   - The Switch-based alert toggles (no push channel exists)
//   - The currentlyRetrograde / currentlyDirect status badges with
//     hardcoded counts (0 retrograde, 1 upcoming, 3 direct)
//
// V2 ships: a one-line framing ("A review window, not a warning"),
// four planet cards each with a reflective theme + journal prompt,
// and a soft disclaimer. No dates. No countdowns. No alerts.

type ReflectionTheme = {
  key: string;
  symbol: string;
  planetKey: string;
  themeKey: string;
  promptKey: string;
};

const THEMES: ReflectionTheme[] = [
  {
    key: 'mercury',
    symbol: '☿',
    planetKey: 'mercury',
    themeKey: 'retrogradeReflectionMercuryTheme',
    promptKey: 'retrogradeReflectionMercuryPrompt',
  },
  {
    key: 'venus',
    symbol: '♀',
    planetKey: 'venus',
    themeKey: 'retrogradeReflectionVenusTheme',
    promptKey: 'retrogradeReflectionVenusPrompt',
  },
  {
    key: 'mars',
    symbol: '♂',
    planetKey: 'mars',
    themeKey: 'retrogradeReflectionMarsTheme',
    promptKey: 'retrogradeReflectionMarsPrompt',
  },
  {
    key: 'saturn',
    symbol: '♄',
    planetKey: 'saturn',
    themeKey: 'retrogradeReflectionSaturnTheme',
    promptKey: 'retrogradeReflectionSaturnPrompt',
  },
];

function RetrogradeReflectionContent() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

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
          <Text style={styles.title}>{t('retrogradeReflectionTitle') || 'Retrograde Reflection'}</Text>
          <Text style={styles.subtitle}>
            {t('retrogradeReflectionSubtitle') || 'A review window, not a warning.'}
          </Text>
        </View>

        {/* Hero framing */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {t('retrogradeReflectionFramingEyebrow') || 'Framing'}
          </Text>
          <Text style={styles.heroBody}>
            {t('retrogradeReflectionFramingBody') ||
              'A review window, not a warning. Retrograde is symbolic — a time the language of astrology associates with going back over what you have already started.'}
          </Text>
        </View>

        {/* Themes */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('retrogradeReflectionThemesTitle') || 'Themes To Sit With'}
          </Text>
          {THEMES.map((theme) => (
            <View key={theme.key} style={styles.themeCard}>
              <View style={styles.themeHeader}>
                <PlanetGlyph symbol={theme.symbol} size={28} textStyle={styles.themeSymbol} />
                <Text style={styles.themePlanet}>{t(theme.planetKey) || theme.key}</Text>
              </View>
              <Text style={styles.themeLabel}>{t(theme.themeKey)}</Text>
              <Text style={styles.themePrompt}>{t(theme.promptKey)}</Text>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerEyebrow}>
            {t('retrogradeReflectionDisclaimerTitle') || 'A Note'}
          </Text>
          <Text style={styles.disclaimerBody}>
            {t('retrogradeReflectionDisclaimerBody') ||
              'Use this as a reflection tool, not a prediction.'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function RetrogradeReflectionScreen() {
  return (
    <PremiumGate feature="retrograde-alerts">
      <RetrogradeReflectionContent />
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
    marginBottom: 24,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 108, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
  },
  heroEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.goldMuted,
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
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 14,
  },
  themeCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  themeSymbol: {
    fontSize: 22,
    color: AppTheme.colors.textPrimary,
  },
  themePlanet: {
    fontSize: 11,
    color: AppTheme.colors.goldMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  themeLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  themePrompt: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
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
    color: AppTheme.colors.goldMuted,
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
