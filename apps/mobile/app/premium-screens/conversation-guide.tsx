// Conversation Guide — "Ways to say it, by sign."
//
// THE ONE THING THIS SCREEN MUST NOT DO
// ------------------------------------
// It must not spend the reader's daily free preview before they have read
// anything. Two consequences shape the whole file:
//
//   1. There is NO <PremiumGate> wrapper. PremiumGate decides at mount
//      (components/PremiumGate.tsx) — wrapping this screen would consume the
//      preview on open, and would then hide the FREE situation for the rest of
//      the day. `scripts/validate-coach-content.mjs` fails the build if the
//      name PremiumGate ever appears here.
//   2. `enforcePremiumFeature` is called exactly once, from a callback, on the
//      first tap of a LOCKED situation. Never from an effect. The same
//      validator asserts that structurally.
//
// WHY THE SERVER IS CALLED AT ALL
// -------------------------------
// The locked situations need a real decision (entitlement, daily preview,
// quota) and the RPC is atomic — it decides AND records in one call. That
// record is also the only telemetry this feature has: the app ships no
// analytics SDK and there is no OTA, so `premium_usage` rows are what make
// opens, next-day return and preview→subscribe conversion measurable in SQL
// from day one. See §11.2 of docs/conversation-coach-feature-plan-2026-08.md
// for the exact queries.
//
// SAME-DAY REPLAY
// ---------------
// The server's replay window is 15 minutes. A reader who spends their preview
// and comes back two hours later would otherwise be refused something they
// already paid for. `coach:preview-date` in AsyncStorage replays a grant
// already made today. It can never grant the FIRST unlock — only re-show one
// the server has already recorded.
//
// CONTENT
// -------
// English-only in P0, by product decision. The chrome is localised; the
// guidance is not. `conversationGuideEnglishNote` says so on screen rather
// than pretending otherwise.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COACH_SIGNS,
  COACH_SITUATIONS,
  buildCoachCard,
  resolveCoachSign,
  resolveCoachSituation,
  type CoachSign,
  type CoachSituationKey,
} from '@astro/shared/coach';
import { ZodiacGlyph } from '../../components/astro/ZodiacGlyph';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { buttonPress, premiumLocked, successNotification } from '../../services/haptics';
import {
  enforcePremiumFeature,
  SERVER_ENFORCED_FEATURES,
  type PremiumGateReason,
} from '../../services/premiumUsage';

// Replays a grant the server already recorded today. Read the file header
// before changing this — it is load-bearing for the preview promise.
//
// Scoped per account. A shared device must not let account A's spent preview
// unlock content for account B, and — more importantly — a per-user key means
// there is nothing to clear on sign-out. An "if (!user) clear it" effect would
// fire during the auth-loading window on every cold start and silently destroy
// the marker it exists to protect.
const PREVIEW_REPLAY_KEY = 'coach:preview-date';
const previewKeyFor = (userId: string) => `${PREVIEW_REPLAY_KEY}:${userId}`;

const FEATURE_KEY = 'conversation-guide' as const;
const SERVER_FEATURE_KEY = SERVER_ENFORCED_FEATURES[FEATURE_KEY] ?? 'conversation_guide';

/** Local date in the user's own timezone — `usage_date` is a server DATE, and
 *  toISOString() would roll the day over early for anyone west of UTC. */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type UnlockState =
  | { status: 'locked' }
  | { status: 'checking' }
  | { status: 'unlocked'; viaPreview: boolean }
  | { status: 'refused'; reason: PremiumGateReason };

export default function ConversationGuideScreen() {
  const params = useLocalSearchParams<{ sign?: string; situation?: string }>();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tier, canAccessFeature } = usePremium();
  const insets = useSafeAreaInsets();

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  // Deep links and push payloads are untrusted input. `resolveCoachSign`
  // returns null rather than guessing, so a bad param opens the picker instead
  // of rendering someone else's advice under a name the reader trusts.
  const initialSign = resolveCoachSign(first(params.sign));
  const initialSituation = resolveCoachSituation(first(params.situation));

  const [sign, setSign] = useState<CoachSign | null>(initialSign);
  const [situation, setSituation] = useState<CoachSituationKey>(
    initialSituation ?? 'start',
  );
  const [unlock, setUnlock] = useState<UnlockState>({ status: 'locked' });
  const [copied, setCopied] = useState(false);

  // One server call per mount. The ref — not state — is what makes that true
  // even if two taps land in the same render pass.
  const gateRequested = useRef(false);

  // Entitled accounts never need the preview machinery at all.
  const entitled = canAccessFeature(FEATURE_KEY);

  // Replay a grant the server already recorded today for THIS account.
  //
  // Storage-only and deliberately so: it reads a local marker, asks the server
  // nothing, and therefore cannot consume an allowance. It also cannot grant a
  // first unlock — only re-show one the server already recorded, which is what
  // keeps someone from being refused content they have already paid for once
  // the server's 15-minute replay window has closed.
  const userId = user?.id ?? null;
  useEffect(() => {
    let active = true;
    setUnlock({ status: 'locked' });
    gateRequested.current = false;
    if (!userId) return;

    AsyncStorage.getItem(previewKeyFor(userId))
      .then((stored) => {
        if (!active) return;
        if (stored === localDateKey(new Date())) {
          setUnlock({ status: 'unlocked', viaPreview: true });
        }
      })
      .catch(() => {
        // A missing replay marker costs one extra RPC, never access.
      });

    return () => {
      active = false;
    };
  }, [userId]);

  // Re-navigating to this route with new params (the chat chip tapped while
  // the guide is already open, a push, a fresh deep link) updates params
  // without remounting, so the initial useState values would go stale.
  //
  // This only moves the SELECTION. It never touches `unlock`, and it never
  // asks the server — landing on a locked situation shows the unlock card and
  // waits for the tap, exactly as on a cold open. A link must not be able to
  // spend someone's preview.
  const appliedParams = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${initialSign ?? ''}|${initialSituation ?? ''}`;
    if (appliedParams.current === signature) return;
    appliedParams.current = signature;
    if (initialSign) setSign(initialSign);
    if (initialSituation) setSituation(initialSituation);
    setCopied(false);
  }, [initialSign, initialSituation]);

  const situationMeta = useMemo(
    () => COACH_SITUATIONS.find((s) => s.key === situation) ?? COACH_SITUATIONS[0],
    [situation],
  );

  const card = useMemo(
    () => (sign ? buildCoachCard({ sign, situation }) : null),
    [sign, situation],
  );

  const canRead =
    situationMeta.access === 'free' || entitled || unlock.status === 'unlocked';

  // GATE: fires on the first tap of a locked situation, and only then.
  //
  // Never called on mount, never from an effect, never for the free situation,
  // and at most once per mount (`gateRequested`). Moving this call anywhere
  // near mount would spend the reader's daily preview before they read a word
  // — which is the single failure mode this whole screen is shaped around.
  const requestUnlock = useCallback(async () => {
    if (gateRequested.current) return;
    gateRequested.current = true;
    setUnlock({ status: 'checking' });

    const decision = await enforcePremiumFeature(SERVER_FEATURE_KEY);

    if (decision.allowed) {
      setUnlock({ status: 'unlocked', viaPreview: decision.isFreePreview });
      if (decision.isFreePreview && userId) {
        AsyncStorage.setItem(previewKeyFor(userId), localDateKey(new Date())).catch(() => {});
      }
      void successNotification();
      return;
    }

    // Never paywall someone who is actually paying. A network failure, or a
    // subscription the store confirmed before the billing webhook landed, both
    // surface here — the same optimistic policy PremiumGate applies.
    if (
      (decision.reason === 'error' || decision.reason === 'insufficient_tier') &&
      entitled
    ) {
      setUnlock({ status: 'unlocked', viaPreview: false });
      return;
    }

    // A refusal consumed nothing, so a network error stays retryable. A real
    // refusal ('free_preview_exhausted', 'insufficient_tier') does not: asking
    // again would be a second RPC for an answer that will not have changed.
    gateRequested.current = decision.reason !== 'error';
    setUnlock({ status: 'refused', reason: decision.reason });
    void premiumLocked();
  }, [entitled, userId]);

  const handleSituationPress = useCallback(
    (key: CoachSituationKey) => {
      void buttonPress();
      setCopied(false);
      setSituation(key);

      const meta = COACH_SITUATIONS.find((s) => s.key === key);
      const isLocked = meta?.access === 'locked';
      // Entitled accounts are NOT skipped here, deliberately. `premium_usage`
      // is this feature's only telemetry, and PremiumGate records for
      // subscribers on every other server-gated screen — skipping them would
      // undercount the Guide against natal_chart and make the one comparison
      // that decides P1 (docs/conversation-guide-telemetry.md §3.4) dishonest.
      // They never wait for it: `canRead` already includes `entitled`, so the
      // card is on screen while the call records in the background, and their
      // daily_quota is 100.
      if (!isLocked || unlock.status === 'unlocked') return;
      void requestUnlock();
    },
    [requestUnlock, unlock.status],
  );

  const handleSignPress = useCallback((next: CoachSign) => {
    void buttonPress();
    setCopied(false);
    setSign(next);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!card) return;
    try {
      await Clipboard.setStringAsync(card.copyText);
      setCopied(true);
      void successNotification();
    } catch {
      // Clipboard denial is not worth an alert — the text stays selectable.
    }
  }, [card]);

  const topPad = insets.top + 16;

  const renderSignPicker = () => (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>
        {t('conversationGuideChooseSign') || 'Choose a sign'}
      </Text>
      <View style={styles.signGrid}>
        {COACH_SIGNS.map((option) => {
          const selected = option === sign;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.signCell, selected && styles.signCellSelected]}
              onPress={() => handleSignPress(option)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(option) || option}
              testID={`coach-sign-${option}`}
            >
              <ZodiacGlyph sign={option} variant="inline" size="sm" />
              <Text style={[styles.signCellText, selected && styles.signCellTextSelected]}>
                {t(option) || option}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderSituationPicker = () => (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>
        {t('conversationGuideChooseSituation') || 'What do you want to say?'}
      </Text>
      {COACH_SITUATIONS.map((option) => {
        const selected = option.key === situation;
        const isFree = option.access === 'free';
        const openToReader = isFree || entitled || unlock.status === 'unlocked';
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.situationRow, selected && styles.situationRowSelected]}
            onPress={() => handleSituationPress(option.key)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`coach-situation-${option.key}`}
          >
            <Text
              style={[styles.situationText, selected && styles.situationTextSelected]}
            >
              {t(option.labelKey) || option.key}
            </Text>
            <View style={[styles.badge, isFree ? styles.badgeFree : styles.badgePremium]}>
              <Text style={[styles.badgeText, isFree ? styles.badgeTextFree : styles.badgeTextPremium]}>
                {isFree
                  ? t('conversationGuideFreeBadge') || 'Free'
                  : openToReader
                    ? t('conversationGuideFreeBadge') || 'Free'
                    : t('conversationGuideLockedBadge') || 'Premium'}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderLocked = () => {
    if (unlock.status === 'checking') {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('verifyingAccess') || 'Verifying access...'}</Text>
        </View>
      );
    }

    if (unlock.status === 'refused') {
      const exhausted =
        unlock.reason === 'free_preview_exhausted' || unlock.reason === 'quota_exceeded';
      const errored = unlock.reason === 'error';

      // Say what actually happened. Telling someone they used a preview they
      // were never offered is how a paywall loses trust.
      const title = errored
        ? t('conversationGuideErrorTitle') || "Couldn't check access"
        : exhausted
          ? t('conversationGuideExhaustedTitle') || 'Free preview used'
          : t('conversationGuideLockedTitle') || 'Unlock this situation';
      const body = errored
        ? t('conversationGuideErrorBody') || 'Something went wrong. Try again in a moment.'
        : exhausted
          ? t('conversationGuideExhaustedBody') ||
            'Come back tomorrow for another one, or unlock every situation with Celestial.'
          : t('conversationGuideLockedBody') ||
            'Celestial members get every situation. Free accounts get a daily free preview.';

      return (
        <View style={styles.stateCard} testID="coach-locked-card">
          <Text style={styles.stateTitle}>{title}</Text>
          <Text style={styles.stateBody}>{body}</Text>
          {errored ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                gateRequested.current = false;
                void requestUnlock();
              }}
              accessibilityRole="button"
              testID="coach-retry"
            >
              <Text style={[styles.primaryButtonText, styles.primaryButtonTextPlain]}>
                {t('conversationGuideRetry') || 'Try again'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/premium-screens/plans' as never)}
              accessibilityRole="button"
              testID="coach-upgrade-cta"
            >
              <LinearGradient
                colors={[AppTheme.colors.coral, AppTheme.colors.cosmic]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonGradient}
              >
                <Text style={styles.primaryButtonText}>
                  {t('conversationGuideUpgradeCta') || 'See plans'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Not yet asked. Nothing has been spent — the tap is what asks.
    return (
      <View style={styles.stateCard} testID="coach-locked-card">
        <Text style={styles.stateTitle}>
          {t('conversationGuideLockedTitle') || 'Unlock this situation'}
        </Text>
        <Text style={styles.stateBody}>
          {t('conversationGuideLockedBody') ||
            'Celestial members get every situation. Free accounts get a daily free preview.'}
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => void requestUnlock()}
          accessibilityRole="button"
          testID="coach-unlock-cta"
        >
          <LinearGradient
            colors={[AppTheme.colors.coral, AppTheme.colors.cosmic]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.primaryButtonGradient}
          >
            <Text style={styles.primaryButtonText}>
              {t('conversationGuideUnlockCta') || "Use today's free preview"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCard = () => {
    if (!card) {
      return (
        <View style={styles.stateCard}>
          <Text style={styles.stateBody}>
            {t('conversationGuideChooseSign') || 'Choose a sign'}
          </Text>
        </View>
      );
    }

    if (!canRead) return renderLocked();

    return (
      <View style={styles.card} testID="coach-card">
        <Text style={styles.cardIntent}>{card.intent}</Text>

        {card.sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionLabel}>{t(section.labelKey) || section.id}</Text>
            <Text style={section.copyable ? styles.sectionLine : styles.sectionBody}>
              {section.copyable ? `"${section.body}"` : section.body}
            </Text>
            {section.copyable ? (
              <>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => void handleCopy()}
                  accessibilityRole="button"
                  testID="coach-copy"
                >
                  <Text style={styles.copyButtonText}>
                    {copied
                      ? t('conversationGuideCopied') || 'Copied'
                      : t('conversationGuideCopy') || 'Copy'}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.editHint}>
                  {t('conversationGuideEditHint') ||
                    "Change the words so they're yours."}
                </Text>
              </>
            ) : null}
          </View>
        ))}

        <Text style={styles.disclaimer}>
          {t('conversationGuideDisclaimer') || card.disclaimer}
        </Text>
      </View>
    );
  };

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad, paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('back') || 'Back'}
        >
          <Text style={styles.backText}>{'←'}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('conversationGuide') || 'Conversation Guide'}</Text>
        <Text style={styles.subtitle}>
          {t('conversationGuideSubtitle') || 'Ways to say it, by sign.'}
        </Text>

        {renderSignPicker()}
        {renderSituationPicker()}
        {renderCard()}

        {unlock.status === 'unlocked' && unlock.viaPreview && tier === 'free' ? (
          <View style={styles.previewBanner} testID="coach-preview-banner">
            <Text style={styles.previewBannerText}>
              {t('conversationGuidePreviewBanner') ||
                'Free preview used - open until tomorrow'}
            </Text>
          </View>
        ) : null}

        <Text style={styles.englishNote}>
          {t('conversationGuideEnglishNote') ||
            'Guidance is written in English for now.'}
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppTheme.colors.canvas,
    ...(Platform.OS === 'web'
      ? { height: '100vh' as unknown as number, width: '100%' }
      : {}),
  },
  scroll: {
    paddingHorizontal: 20,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppTheme.colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: AppTheme.colors.textMuted,
    marginTop: 4,
    marginBottom: 20,
  },
  block: {
    marginBottom: 22,
  },
  blockLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: AppTheme.colors.textMuted,
    marginBottom: 10,
  },
  signGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.panel,
  },
  signCellSelected: {
    borderColor: AppTheme.colors.premiumGoldBorder,
    backgroundColor: AppTheme.colors.premiumGoldSoft,
  },
  signCellText: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  signCellTextSelected: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '600',
  },
  situationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.panel,
    marginBottom: 8,
  },
  situationRowSelected: {
    borderColor: AppTheme.colors.borderStrong,
    backgroundColor: AppTheme.colors.panelStrong,
  },
  situationText: {
    flex: 1,
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
  },
  situationTextSelected: {
    color: AppTheme.colors.textPrimary,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeFree: {
    borderColor: 'rgba(89, 194, 139, 0.35)',
    backgroundColor: 'rgba(89, 194, 139, 0.12)',
  },
  badgePremium: {
    borderColor: AppTheme.colors.premiumGoldBorder,
    backgroundColor: AppTheme.colors.premiumGoldSoft,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  badgeTextFree: {
    color: AppTheme.colors.success,
  },
  badgeTextPremium: {
    color: AppTheme.colors.gold,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: AppTheme.colors.panel,
    padding: 18,
  },
  cardIntent: {
    fontSize: 14,
    lineHeight: 21,
    color: AppTheme.colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 18,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: AppTheme.colors.gold,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 23,
    color: AppTheme.colors.textPrimary,
  },
  sectionLine: {
    fontSize: 17,
    lineHeight: 26,
    color: AppTheme.colors.textPrimary,
    fontWeight: '500',
  },
  copyButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AppTheme.colors.borderStrong,
    backgroundColor: AppTheme.colors.panelStrong,
  },
  copyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  editHint: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 8,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: AppTheme.colors.textMuted,
    borderTopWidth: 1,
    borderTopColor: AppTheme.colors.border,
    paddingTop: 14,
  },
  stateCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumGoldBorder,
    backgroundColor: AppTheme.colors.premiumGoldSoft,
    padding: 20,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  stateBody: {
    fontSize: 14,
    lineHeight: 21,
    color: AppTheme.colors.textSecondary,
  },
  primaryButton: {
    marginTop: 18,
    borderRadius: 999,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  primaryButtonGradient: {
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textOnAccent,
  },
  // The gradient variant already pads; the plain variant has to pad itself.
  primaryButtonTextPlain: {
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  previewBanner: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumCosmicBorder,
    backgroundColor: AppTheme.colors.premiumCosmicSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewBannerText: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
  },
  englishNote: {
    marginTop: 20,
    fontSize: 11,
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
  },
});
