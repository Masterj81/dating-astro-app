import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';

// V2 — formerly "Astro Date Planner". Renamed editorially to
// "Date Reflection". The V1 surface scored 30 future calendar dates
// 0-100% based on derived ephemeris and surfaced a "Top 5 Best Dates"
// carousel with a "RECOMMENDED" badge on hour ranges like
// "11:00 AM - 1:30 PM". Framing a precise date and hour as best for a
// real-world meeting between two people verges on prescriptive
// relationship advice and presents fabricated certainty.
//
// V2 keeps:
//   - The Cosmic gate (PremiumGate feature="date-planner")
//   - The route `/premium-screens/date-planner` (deep links survive)
//   - The optional `matchId` param (kept; used only to render a name
//     in the heading if we ever wire that back up — for now, ignored
//     to avoid the heavy chart fetch that powered the V1 scoring)
//
// V2 removes:
//   - The "Top 5 Best Dates" carousel
//   - Per-date overall scores (94%, 87%, etc.)
//   - "Best hours" with "RECOMMENDED" badge
//   - The 30-day score calendar
//   - All ephemeris fetches (no edge function call, no own-profile RPC)
//
// V2 ships instead: a one-line framing ("Prepare for a better
// conversation, not a perfect outcome."), an intention selector
// (single-select chip group), a small bank of conversation prompts
// keyed to the chosen intention, three low-pressure date ideas, a
// consent and boundaries note, and a soft disclaimer.

type Intention =
  | 'curious'
  | 'connect'
  | 'know'
  | 'fun';

const INTENTIONS: { key: Intention; labelKey: string }[] = [
  { key: 'curious', labelKey: 'dateReflectionIntentionCurious' },
  { key: 'connect', labelKey: 'dateReflectionIntentionConnect' },
  { key: 'know', labelKey: 'dateReflectionIntentionKnow' },
  { key: 'fun', labelKey: 'dateReflectionIntentionFun' },
];

const PROMPT_KEYS_BY_INTENTION: Record<Intention, string[]> = {
  curious: [
    'dateReflectionPromptCurious1',
    'dateReflectionPromptCurious2',
    'dateReflectionPromptCurious3',
  ],
  connect: [
    'dateReflectionPromptConnect1',
    'dateReflectionPromptConnect2',
    'dateReflectionPromptConnect3',
  ],
  know: [
    'dateReflectionPromptKnow1',
    'dateReflectionPromptKnow2',
    'dateReflectionPromptKnow3',
  ],
  fun: [
    'dateReflectionPromptFun1',
    'dateReflectionPromptFun2',
    'dateReflectionPromptFun3',
  ],
};

const IDEA_KEYS = [
  { titleKey: 'dateReflectionIdea1Title', bodyKey: 'dateReflectionIdea1Body' },
  { titleKey: 'dateReflectionIdea2Title', bodyKey: 'dateReflectionIdea2Body' },
  { titleKey: 'dateReflectionIdea3Title', bodyKey: 'dateReflectionIdea3Body' },
];

function DateReflectionContent() {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // `matchId` kept for forward-compat (deep links, share targets). Not
  // used in the V2 layout — name lookup is intentionally removed so we
  // don't fetch a partner's chart only to render a heading.
  useLocalSearchParams<{ matchId?: string }>();

  const [intention, setIntention] = useState<Intention>('curious');

  const prompts = useMemo(
    () => PROMPT_KEYS_BY_INTENTION[intention],
    [intention]
  );

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
          <Text style={styles.title}>{t('dateReflectionTitle') || 'Date Reflection'}</Text>
          <Text style={styles.subtitle}>
            {t('dateReflectionSubtitle') || 'Prepare for a better conversation.'}
          </Text>
        </View>

        {/* Hero framing */}
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>
            {t('dateReflectionFramingEyebrow') || 'Framing'}
          </Text>
          <Text style={styles.heroBody}>
            {t('dateReflectionFramingBody') ||
              'Prepare for a better conversation, not a perfect outcome.'}
          </Text>
        </View>

        {/* Intention selector */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('dateReflectionIntentionTitle') || 'Set An Intention'}
          </Text>
          <View style={styles.chipRow}>
            {INTENTIONS.map((opt) => {
              const active = intention === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setIntention(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Conversation prompts */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('dateReflectionPromptsTitle') || 'Conversation Prompts'}
          </Text>
          {prompts.map((pk) => (
            <View key={pk} style={styles.promptCard}>
              <Text style={styles.promptText}>{t(pk)}</Text>
            </View>
          ))}
        </View>

        {/* Low-pressure date ideas */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>
            {t('dateReflectionIdeasTitle') || 'Low-Pressure Ideas'}
          </Text>
          {IDEA_KEYS.map((idea) => (
            <View key={idea.titleKey} style={styles.ideaCard}>
              <Text style={styles.ideaTitle}>{t(idea.titleKey)}</Text>
              <Text style={styles.ideaBody}>{t(idea.bodyKey)}</Text>
            </View>
          ))}
        </View>

        {/* Consent and boundaries */}
        <View style={styles.consentCard}>
          <Text style={styles.consentEyebrow}>
            {t('dateReflectionConsentTitle') || 'Consent And Boundaries'}
          </Text>
          <Text style={styles.consentBody}>
            {t('dateReflectionConsentBody') ||
              'Both people should feel safe and free to leave at any point. Check in early. Match energy, not pressure.'}
          </Text>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerEyebrow}>
            {t('dateReflectionDisclaimerTitle') || 'A Note'}
          </Text>
          <Text style={styles.disclaimerBody}>
            {t('dateReflectionDisclaimerBody') ||
              'Use this as a reflection tool, not a prediction.'}
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

export default function DateReflectionScreen() {
  return (
    <PremiumGate feature="date-planner">
      <DateReflectionContent />
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(232, 93, 117, 0.18)',
    borderColor: AppTheme.colors.coral,
  },
  chipText: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    fontWeight: '500',
  },
  chipTextActive: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '600',
  },
  promptCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  promptText: {
    fontSize: 14,
    color: AppTheme.colors.textPrimary,
    lineHeight: 22,
  },
  ideaCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  ideaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  ideaBody: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  consentCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(232, 93, 117, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.24)',
  },
  consentEyebrow: {
    fontSize: 11,
    color: AppTheme.colors.coral,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 10,
  },
  consentBody: {
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
