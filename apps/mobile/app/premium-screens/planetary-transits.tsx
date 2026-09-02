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

// V2 — formerly "Planetary Transits". Renamed editorially to
// "Transit Reflection". The V1 surface listed seven planets with
// hardcoded current signs, fake enter/exit calendar dates, and
// positive/challenging/neutral badges, plus an "Upcoming Transits"
// calendar of fabricated events ("Mercury enters Aquarius - Feb 5").
// None of that came from real ephemeris — the dates were hardcoded
// month/day pairs. We were effectively telling users that real-world
// celestial events would happen on dates we made up.
//
// V2 keeps:
//   - The Celestial gate (PremiumGate feature="planetary-transits")
//   - The route `/premium-screens/planetary-transits`
//
// V2 removes:
//   - All hardcoded enter/exit dates
//   - The "Upcoming Transits" calendar
//   - The harmonious / challenging / neutral influence labels
//   - The "personal impact" framing that implied event-based effects
//   - The Sun sign personalization (no longer needed for this surface)
//
// V2 ships: a one-line framing ("Use these themes as prompts for
// awareness, not event timing"), six theme cards (one per planet)
// with reflective prompts, and a soft disclaimer.

type ThemeCard = {
  key: string;
  symbol: string;
  planetKey: string;
  themeKey: string;
  promptKey: string;
};

const THEMES: ThemeCard[] = [
  { key: 'sun', symbol: '☉', planetKey: 'sun', themeKey: 'transitReflectionSunTheme', promptKey: 'transitReflectionSunPrompt' },
  { key: 'moon', symbol: '☾', planetKey: 'moon', themeKey: 'transitReflectionMoonTheme', promptKey: 'transitReflectionMoonPrompt' },
  { key: 'mercury', symbol: '☿', planetKey: 'mercury', themeKey: 'transitReflectionMercuryTheme', promptKey: 'transitReflectionMercuryPrompt' },
  { key: 'venus', symbol: '♀', planetKey: 'venus', themeKey: 'transitReflectionVenusTheme', promptKey: 'transitReflectionVenusPrompt' },
  { key: 'mars', symbol: '♂', planetKey: 'mars', themeKey: 'transitReflectionMarsTheme', promptKey: 'transitReflectionMarsPrompt' },
  { key: 'saturn', symbol: '♄', planetKey: 'saturn', themeKey: 'transitReflectionSaturnTheme', promptKey: 'transitReflectionSaturnPrompt' },
];

function TransitReflectionContent() {
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
          <Text style={styles.title}>{t('transitReflectionTitle') || 'Transit Reflection'}</Text>
          <Text style={styles.subtitle}>
            {t('transitReflectionSubtitle') || 'Symbolic themes, not event timing.'}
          </Text>
        </View>

        {/* Hero framing */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {t('transitReflectionFramingEyebrow') || 'Framing'}
          </Text>
          <Text style={styles.heroBody}>
            {t('transitReflectionFramingBody') ||
              'Use these themes as prompts for awareness, not event timing.'}
          </Text>
        </View>

        {/* Themes */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('transitReflectionThemesTitle') || 'Six Themes To Sit With'}
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
            {t('transitReflectionDisclaimerTitle') || 'A Note'}
          </Text>
          <Text style={styles.disclaimerBody}>
            {t('transitReflectionDisclaimerBody') ||
              'Use this as a reflection tool, not a prediction.'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function TransitReflectionScreen() {
  return (
    <PremiumGate feature="planetary-transits">
      <TransitReflectionContent />
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
    backgroundColor: 'rgba(91, 84, 168, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(91, 84, 168, 0.22)',
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
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
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
