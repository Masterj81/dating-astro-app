import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme } from '../../constants/theme';
import {
  CELESTIAL_FEATURES,
  COSMIC_FEATURES,
  PAYWALL_PREVIEW_FEATURES,
} from '../../constants/premiumCatalog';
import { AppCard } from '../../components/ui/AppCard';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { LoadingState } from '../../components/ScreenStates';
import WebTabWrapper from '../../components/WebTabWrapper';
import { useAuth } from '../../contexts/AuthContext';
import { getManageSubscriptionAction, manageSubscription } from '../../services/subscriptionManagement';

const FeatureCard = React.memo(function FeatureCard({ title, icon, onPress, locked = false }: {
  title: string;
  icon: string;
  onPress: () => void;
  locked?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.featureCard, locked && styles.featureCardLocked]}
      onPress={onPress}
      disabled={locked}
      activeOpacity={0.8}
    >
      <AppCard style={styles.featureCardInner} elevated={locked}>
        <Text style={styles.featureIcon}>{icon}</Text>
        <Text style={styles.featureTitle}>{title}</Text>
        {locked ? <Text style={styles.featureLock}>🔒</Text> : null}
      </AppCard>
    </TouchableOpacity>
  );
});

export default function PremiumScreen() {
  const { t } = useLanguage();
  const { tier, loading } = usePremium();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const isPremiumPlus = tier === 'premium_plus';
  const hasAccess = tier !== 'free';

  // Stable callback for navigating to feature routes (avoids re-creating per render)
  const handleFeaturePress = useCallback((route: string) => {
    router.push(route as any);
  }, []);

  const handleCosmicFeaturePress = useCallback((route: string) => {
    if (isPremiumPlus) {
      router.push(route as any);
    } else {
      router.push('/premium-screens/plus');
    }
  }, [isPremiumPlus]);

  const handleManageSubscription = async () => {
    if (!user?.id) return;

    try {
      const action = await getManageSubscriptionAction(user.id);

      if (action.type === 'none') {
        Alert.alert(
          t('subscriptions') || 'Subscriptions',
          t('manageSubscriptionUnavailable') || 'No active subscription was found to manage.',
          [{ text: t('ok') || 'OK' }]
        );
        return;
      }

      await manageSubscription(user.id);
    } catch (error) {
      console.error('[Premium] Failed to open subscription management:', error);
      Alert.alert(
        t('error') || 'Error',
        t('manageSubscriptionError') || 'Unable to open subscription management right now.',
        [{ text: t('ok') || 'OK' }]
      );
    }
  };

  // Show loading state
  if (loading) {
    return (
      <LoadingState testID="premium-loading" />
    );
  }

  // Show paywall for free users (instead of redirecting)
  if (!hasAccess) {
    // Web version paywall
    if (Platform.OS === 'web') {
      return (
        <WebTabWrapper
          background="linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)"
          padding={20}
          centered
          style={{ textAlign: 'center' }}
        >
          <span style={{ fontSize: 80, marginBottom: 24 }}>✨</span>
          <h1 style={{ fontSize: 28, fontWeight: 'bold', color: '#fff', margin: '0 0 12px' }}>
            {t('paywallHeroTitle') || 'The Stars Know Your Match'}
          </h1>
          <p style={{ fontSize: 16, color: '#888', margin: '0 0 16px', maxWidth: 340 }}>
            {t('paywallHeroSubtitle') || 'Unlock the cosmic insights that lead to deeper, more meaningful connections'}
          </p>
          <p style={{ fontSize: 12, color: '#DAB56D', margin: '0 0 32px' }}>
            {t('paywallSocialProofLine') || 'Join 12,000+ cosmic seekers finding real connections'}
          </p>

          {/* Features preview */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 32, maxWidth: 360 }}>
            {PAYWALL_PREVIEW_FEATURES.map((feature, i) => (
              <div key={i} style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                padding: '8px 16px',
                borderRadius: 20,
                color: '#ccc',
                fontSize: 14
              }}>
                {feature.icon} {t(feature.key) || feature.fallback}
              </div>
            ))}
          </div>

          <button
            onClick={() => router.push('/premium-screens/plans' as any)}
            style={{
              background: 'linear-gradient(90deg, #e94560, #9333ea)',
              border: 'none',
              borderRadius: 16,
              padding: '16px 48px',
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
              {t('paywallCtaButton') || 'Try 7 Days Free'}
            </span>
          </button>

          <p style={{ fontSize: 13, color: '#666', margin: '0 0 4px' }}>
            {t('paywallCtaSub') || 'Then $9.99/month'}
          </p>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
            {t('paywallTrialReassurance') || 'No charge for 7 days \u00B7 Cancel anytime in 30 seconds'}
          </p>
        </WebTabWrapper>
      );
    }

    // Native version paywall — compelling upsell with social proof and benefit previews
    const BENEFIT_ROWS = [
      { icon: '\u{1F495}', label: t('paywallBenefitLabel1') || 'See Who\u2019s Drawn to You', desc: t('paywallBenefitDesc1') || 'Reveal every person who swiped right on your profile' },
      { icon: '\u{1F31F}', label: t('paywallBenefitLabel2') || 'Your Complete Star Map', desc: t('paywallBenefitDesc2') || 'All 10 planets, 12 houses \u2014 your full cosmic blueprint' },
      { icon: '\u{1F52E}', label: t('paywallBenefitLabel3') || 'Daily Cosmic Guidance', desc: t('paywallBenefitDesc3') || 'Personalized love insights based on today\u2019s transits' },
      { icon: '\u{2B50}', label: t('paywallBenefitLabel4') || '3x More Matches', desc: t('paywallBenefitDesc4') || '5 daily super likes \u2014 profiles with super likes match 3x more' },
    ];

    return (
      <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.paywallScroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.paywallEmoji}>{'\u2728'}</Text>
          <Text style={styles.paywallTitle}>{t('paywallHeroTitle') || 'The Stars Know Your Match'}</Text>
          <Text style={styles.paywallSubtitle}>
            {t('paywallHeroSubtitle') || 'Unlock the cosmic insights that lead to deeper, more meaningful connections'}
          </Text>

          {/* Social proof nudge */}
          <View style={styles.socialProof}>
            <Text style={styles.socialProofText}>
              {t('paywallSocialProofLine') || 'Join 12,000+ cosmic seekers finding real connections'}
            </Text>
          </View>

          {/* Benefit rows with descriptions */}
          <View style={styles.benefitsList}>
            {BENEFIT_ROWS.map((b, i) => (
              <View key={i} style={styles.benefitRow}>
                <View style={styles.benefitIconWrap}>
                  <Text style={styles.benefitIcon}>{b.icon}</Text>
                </View>
                <View style={styles.benefitTextWrap}>
                  <Text style={styles.benefitLabel}>{b.label}</Text>
                  <Text style={styles.benefitDesc}>{b.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Blurred preview teaser */}
          <View style={styles.previewTeaser}>
            <Text style={styles.previewTeaserTitle}>
              {t('paywallCompatPreview') || 'Your compatibility preview'}
            </Text>
            <View style={styles.previewBarRow}>
              <Text style={styles.previewBarLabel}>{'\u{2600}\u{FE0F}'} Sun</Text>
              <View style={styles.previewBar}><View style={[styles.previewBarFill, { width: '78%' }]} /></View>
              <Text style={styles.previewBarPct}>78%</Text>
            </View>
            <View style={styles.previewBarRow}>
              <Text style={styles.previewBarLabel}>{'\u{1F319}'} Moon</Text>
              <View style={styles.previewBar}><View style={[styles.previewBarFill, styles.previewBarBlurred, { width: '65%' }]} /></View>
              <Text style={[styles.previewBarPct, styles.previewBarLocked]}>{'\u{1F512}'}</Text>
            </View>
            <View style={styles.previewBarRow}>
              <Text style={styles.previewBarLabel}>{'\u{2B06}\u{FE0F}'} Rising</Text>
              <View style={styles.previewBar}><View style={[styles.previewBarFill, styles.previewBarBlurred, { width: '85%' }]} /></View>
              <Text style={[styles.previewBarPct, styles.previewBarLocked]}>{'\u{1F512}'}</Text>
            </View>
            <Text style={styles.previewTeaserHint}>
              {t('paywallCompatHint') || 'Moon & Rising reveal 60% of relationship compatibility'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => router.push('/premium-screens/plans' as any)}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={[AppTheme.colors.coral, AppTheme.colors.cosmic]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.subscribeGradient}
            >
              <Text style={styles.subscribeButtonText}>{t('paywallCtaButton') || 'Try 7 Days Free'}</Text>
              <Text style={styles.subscribeButtonSubtext}>{t('paywallCtaSub') || 'Then $9.99/month'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.pricingHint}>{t('paywallTrialReassurance') || 'No charge for 7 days \u00B7 Cancel anytime in 30 seconds'}</Text>
          <Text style={styles.cancelAnytime}>{t('paywallGuarantee') || 'Satisfaction guaranteed or your money back'}</Text>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Web version
  if (Platform.OS === 'web') {
    return (
      <WebTabWrapper
        background="linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)"
        padding={20}
      >
        <div style={{ maxWidth: 920, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8, margin: 0 }}>
            {t('cosmicHub') || 'Cosmic Hub'}
          </h1>
          <p style={{ fontSize: 16, color: '#e94560', fontWeight: 600, margin: 0 }}>
            {isPremiumPlus ? '🌌 ' + (t('cosmicMember') || 'Cosmic Member') : '✨ ' + (t('celestialMember') || 'Celestial Member')}
          </p>
          <button
            onClick={() => void handleManageSubscription()}
            style={{
              marginTop: 16,
              backgroundColor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: '12px 16px',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {t('subscriptions') || 'Subscriptions & Payments'}
          </button>
        </div>

        {/* Celestial Features */}
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#888', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 15px' }}>
            {t('celestialFeatures') || 'Celestial Features'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {CELESTIAL_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => router.push(feature.route as any)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: 16,
                  minHeight: 150,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: '#fff', fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cosmic Features */}
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#888', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 15px' }}>
            {t('cosmicFeatures') || 'Cosmic Features'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            {COSMIC_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => {
                  if (isPremiumPlus) {
                    router.push(feature.route as any);
                  } else {
                    router.push('/premium-screens/plus');
                  }
                }}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: 16,
                  minHeight: 150,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  opacity: isPremiumPlus ? 1 : 0.5,
                  position: 'relative'
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: '#fff', fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
                {!isPremiumPlus && (
                  <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 14 }}>🔒</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade Banner */}
        {!isPremiumPlus && (
          <div
            onClick={() => router.push('/premium-screens/plus')}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(147, 51, 234, 0.15)',
              borderRadius: 16,
              padding: 16,
              border: '1px solid rgba(147, 51, 234, 0.3)',
              marginTop: 10,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 32, marginRight: 12 }}>🌌</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {t('upgradeToCosmic') || 'Upgrade to Cosmic'}
              </div>
              <div style={{ color: '#aaa', fontSize: 13 }}>
                {t('unlockAllFeatures') || 'Unlock daily horoscopes, transits & more'}
              </div>
            </div>
            <span style={{ color: '#9333ea', fontSize: 20, fontWeight: 'bold' }}>→</span>
          </div>
        )}
        </div>
      </WebTabWrapper>
    );
  }

  // Native version
  return (
    <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.heroBlock}>
          <Text style={styles.title}>{t('cosmicHub') || 'Cosmic Hub'}</Text>
          <Text style={styles.subtitle}>
            {isPremiumPlus ? t('cosmicMember') || 'Cosmic Member' : t('celestialMember') || 'Celestial Member'}
          </Text>
          <TouchableOpacity style={styles.manageButton} onPress={() => void handleManageSubscription()}>
            <Text style={styles.manageButtonText}>{t('subscriptions') || 'Subscriptions & Payments'}</Text>
          </TouchableOpacity>
        </View>

        {/* Celestial Features */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>{t('celestialFeatures') || 'Celestial Features'}</Text>
          <View style={styles.grid}>
            {CELESTIAL_FEATURES.map((feature) => (
              <FeatureCard
                key={feature.key}
                title={t(feature.key) || feature.key}
                icon={feature.icon}
                onPress={() => handleFeaturePress(feature.route)}
              />
            ))}
          </View>
        </View>

        {/* Cosmic Features */}
        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>{t('cosmicFeatures') || 'Cosmic Features'}</Text>
          <View style={styles.grid}>
            {COSMIC_FEATURES.map((feature) => (
              <FeatureCard
                key={feature.key}
                title={t(feature.key) || feature.key}
                icon={feature.icon}
                onPress={() => handleCosmicFeaturePress(feature.route)}
                locked={!isPremiumPlus}
              />
            ))}
          </View>
        </View>

        {/* Upgrade Banner for Celestial users */}
        {!isPremiumPlus && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => router.push('/premium-screens/plus')}
          >
            <Text style={styles.upgradeIcon}>🌌</Text>
            <View style={styles.upgradeTextContainer}>
              <Text style={styles.upgradeTitle}>{t('upgradeToCosmic') || 'Upgrade to Cosmic'}</Text>
              <Text style={styles.upgradeDescription}>
                {t('unlockAllFeatures') || 'Unlock daily horoscopes, transits & more'}
              </Text>
            </View>
            <Text style={styles.upgradeArrow}>→</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Paywall styles
  paywallContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  paywallEmoji: {
    fontSize: 80,
    marginBottom: 28,
  },
  paywallTitle: {
    ...AppTheme.type.hero,
    color: AppTheme.colors.textPrimary,
    marginBottom: 14,
    textAlign: 'center',
  },
  paywallSubtitle: {
    ...AppTheme.type.bodyLarge,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    maxWidth: 300,
    lineHeight: 26,
  },
  featuresPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 32,
    maxWidth: 320,
  },
  featureTag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  featureTagText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
  },
  subscribeButton: {
    borderRadius: AppTheme.radius.pill,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.50,
    shadowRadius: 24,
    elevation: 12,
    minWidth: 280,
  },
  subscribeGradient: {
    paddingVertical: 20,
    paddingHorizontal: 52,
  },
  subscribeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subscribeButtonSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  previewTeaserHint: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.coral,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  pricingHint: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    fontWeight: '600',
  },
  cancelAnytime: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    marginTop: 8,
    fontWeight: '400',
  },
  paywallScroll: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  socialProof: {
    backgroundColor: AppTheme.colors.premiumGoldSoft,
    borderRadius: AppTheme.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumGoldBorder,
  },
  socialProofText: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.gold,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  benefitsList: {
    width: '100%',
    gap: 12,
    marginBottom: 32,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorder,
  },
  benefitIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(232,93,117,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,93,117,0.18)',
  },
  benefitIcon: {
    fontSize: 24,
  },
  benefitTextWrap: {
    flex: 1,
  },
  benefitLabel: {
    ...AppTheme.type.body,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 3,
  },
  benefitDesc: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
  },
  previewTeaser: {
    width: '100%',
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.xl,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumCosmicBorder,
    shadowColor: AppTheme.colors.cosmic,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  previewTeaserTitle: {
    ...AppTheme.type.caption,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  previewBarLabel: {
    width: 70,
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  previewBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  previewBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: AppTheme.colors.coral,
  },
  previewBarBlurred: {
    opacity: 0.25,
    backgroundColor: AppTheme.colors.cosmic,
  },
  previewBarPct: {
    width: 36,
    fontSize: 12,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    textAlign: 'right',
  },
  previewBarLocked: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: AppTheme.spacing.xl,
  },
  heroBlock: {
    marginBottom: 36,
    gap: AppTheme.spacing.sm,
  },
  title: {
    ...AppTheme.type.hero,
    color: AppTheme.colors.textPrimary,
  },
  subtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
  manageButton: {
    alignSelf: 'flex-start',
    paddingVertical: AppTheme.spacing.md,
    paddingHorizontal: AppTheme.spacing.xl,
    borderRadius: AppTheme.radius.pill,
    backgroundColor: AppTheme.colors.cardBg,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorderElevated,
    marginTop: AppTheme.spacing.sm,
  },
  manageButtonText: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textSecondary,
    letterSpacing: 0.3,
  },
  section: {
    marginBottom: 36,
  },
  sectionEyebrow: {
    ...AppTheme.type.micro,
    color: AppTheme.colors.textMuted,
    marginBottom: AppTheme.spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
  },
  featureCard: {
    width: '47%',
  },
  featureCardInner: {
    minHeight: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureCardLocked: {
    opacity: 0.70,
  },
  featureIcon: {
    fontSize: 38,
    marginBottom: AppTheme.spacing.md,
  },
  featureTitle: {
    textAlign: 'center',
    color: AppTheme.colors.textPrimary,
    ...AppTheme.type.caption,
    fontWeight: '700',
  },
  featureLock: {
    marginTop: AppTheme.spacing.sm,
    fontSize: 14,
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.premiumCosmicSoft,
    borderRadius: AppTheme.radius.xl,
    padding: AppTheme.spacing.xl,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumCosmicBorder,
    marginTop: AppTheme.spacing.md,
    shadowColor: AppTheme.colors.cosmic,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  upgradeIcon: {
    fontSize: 36,
    marginRight: 14,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    ...AppTheme.type.body,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  upgradeDescription: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
  },
  upgradeArrow: {
    color: AppTheme.colors.cosmic,
    fontSize: 22,
    fontWeight: 'bold',
  },
});
