import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { usePremium, SubscriptionTier } from '../contexts/PremiumContext';
import { FeatureKey } from '../services/premiumUsage';
import {
  getButtonA11yProps,
  announceForAccessibility,
  a11yColors,
} from '../utils/accessibility';
import { modalFeedback, buttonPress, premiumLocked } from '../services/haptics';

export default function PaywallModal() {
  const { paywallState, dismissPaywall, tier } = usePremium();
  const { t } = useLanguage();

  const { visible, feature, recommendedTier } = paywallState;

  // Announce modal opening and trigger haptic
  useEffect(() => {
    if (visible) {
      modalFeedback();
      premiumLocked();
      // Announce for screen readers
      const featureName = feature ? getFeatureDisplayName(feature) : '';
      const tierName = getTierDisplayName(recommendedTier);
      announceForAccessibility(
        `${t('trialExhausted') || 'Free Preview Used'}. ${featureName} requires ${tierName}.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [visible, feature, recommendedTier]);

  const handleUpgrade = () => {
    buttonPress();
    dismissPaywall();
    if (tier === 'free') {
      router.push('/premium-screens/plans' as any);
    } else if (recommendedTier === 'premium_plus') {
      router.push('/premium-screens/plus');
    } else {
      router.push('/(tabs)/premium');
    }
  };

  const handleViewPlans = () => {
    buttonPress();
    dismissPaywall();
    router.push('/premium-screens/plans' as any);
  };

  const handleDismiss = () => {
    buttonPress();
    dismissPaywall();
  };

  const getFeatureDisplayName = (feature: FeatureKey | null): string => {
    if (!feature) return '';

    const featureNames: Record<FeatureKey, string> = {
      'synastry': t('advancedSynastry') || 'Advanced Synastry',
      'super-likes': t('superLikes') || 'Super Likes',
      'likes': t('seeWhoLikes') || 'See Who Likes You',
      'priority-messages': t('priorityMessages') || 'Priority Messages',
      'natal-chart': t('fullNatalChart') || 'Full Natal Chart',
      'daily-horoscope': t('dailyHoroscope') || 'Daily Horoscope',
      'monthly-horoscope': t('monthlyHoroscope') || 'Monthly Horoscope',
      'planetary-transits': t('planetaryTransits') || 'Planetary Transits',
      'retrograde-alerts': t('retrogradeAlerts') || 'Retrograde Alerts',
      'lucky-days': t('luckyDays') || 'Lucky Days',
      'date-planner': t('datePlanner') || 'Date Planner',
      'weekly-tarot': t('weeklyTarot') || 'Weekly Tarot',
      'monthly-tarot': t('monthlyTarot') || 'Monthly Tarot',
    };

    return featureNames[feature] || feature;
  };

  const getTierDisplayName = (tier: SubscriptionTier): string => {
    if (tier === 'premium_plus') {
      return t('cosmicTier') || 'Cosmic';
    }
    return t('celestialTier') || 'Celestial';
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
      accessibilityViewIsModal={true}
      accessibilityLabel={t('a11y.closeModal')}
    >
      <View style={styles.overlay}>
        <View
          style={styles.container}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <LinearGradient
            colors={['#1a1a2e', '#16213e']}
            style={styles.content}
          >
            {/* Close button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleDismiss}
              {...getButtonA11yProps(t('a11y.closeModal'))}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>

            {/* Icon */}
            <View style={styles.iconContainer} accessibilityLabel="">
              <Text style={styles.icon} accessibilityLabel="">
                {recommendedTier === 'premium_plus' ? '✨' : '⭐'}
              </Text>
            </View>

            {/* Title - emotional, specific to the blocked feature */}
            <Text style={styles.title} accessibilityRole="header">
              {feature
                ? t('paywallFeatureTitle') || 'This Insight Awaits You'
                : t('youreAlmostThere') || 'You\u2019re Almost There'}
            </Text>

            {/* Description - concrete value, not generic */}
            <Text style={styles.description}>
              {feature
                ? `${getFeatureDisplayName(feature)} ${t('paywallFeatureDesc') || 'reveals what the stars see in your connections. Unlock it with a free 7-day trial.'}`
                : t('paywallGenericDesc') || 'Your cosmic blueprint is ready. Start your free trial to see who the stars align you with.'}
            </Text>

            {/* Quick benefits - emotional copy with concrete value */}
            <View style={styles.quickBenefits}>
              {[
                { icon: '\u2764\uFE0F', text: t('paywallBenefit1') || 'See who\u2019s drawn to your energy' },
                { icon: '\u{1F31F}', text: t('paywallBenefit2') || 'Your full birth chart with 10 planets' },
                { icon: '\u{1F52E}', text: t('paywallBenefit3') || 'Daily guidance tuned to your chart' },
              ].map((b, i) => (
                <View key={i} style={styles.quickBenefitRow}>
                  <Text style={styles.quickBenefitIcon}>{b.icon}</Text>
                  <Text style={styles.quickBenefitText}>{b.text}</Text>
                </View>
              ))}
            </View>

            {/* Social proof line */}
            <View style={styles.paywallSocialProof}>
              <Text style={styles.paywallSocialProofText}>
                {t('paywallSocialProof') || 'Trusted by 12,000+ cosmic seekers'}
              </Text>
            </View>

            {/* CTA Button - urgency without being pushy */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleUpgrade}
              {...getButtonA11yProps(t('a11y.upgradeButton'))}
            >
              <LinearGradient
                colors={['#e94560', '#7C6CFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>
                  {t('paywallCta') || 'Try 7 Days Free'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.trialNote}>
              {t('paywallTrialReassurance') || 'No charge for 7 days \u00B7 Cancel anytime in 30 seconds'}
            </Text>

            {/* Secondary CTA */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleViewPlans}
              {...getButtonA11yProps(t('a11y.viewPlansButton'))}
            >
              <Text style={styles.secondaryText}>
                {t('viewAllPlans') || 'Compare Plans'}
              </Text>
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity
              style={styles.dismissButton}
              onPress={handleDismiss}
              {...getButtonA11yProps(t('a11y.dismissButton'))}
            >
              <Text style={styles.dismissText}>
                {t('notNow') || 'Not Now'}
              </Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    overflow: 'hidden',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: a11yColors.text.secondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: a11yColors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: a11yColors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  quickBenefits: {
    width: '100%',
    marginBottom: 20,
    gap: 10,
  },
  quickBenefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickBenefitIcon: {
    fontSize: 16,
  },
  quickBenefitText: {
    fontSize: 14,
    color: a11yColors.text.primary,
    fontWeight: '500',
  },
  paywallSocialProof: {
    backgroundColor: 'rgba(218, 181, 109, 0.12)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(218, 181, 109, 0.25)',
  },
  paywallSocialProofText: {
    fontSize: 12,
    color: '#DAB56D',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  trialNote: {
    fontSize: 12,
    color: a11yColors.text.muted,
    marginBottom: 12,
    textAlign: 'center',
  },
  ctaButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: a11yColors.text.primary,
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  secondaryText: {
    color: '#9333ea',
    fontSize: 15,
    fontWeight: '600',
  },
  dismissButton: {
    paddingVertical: 8,
  },
  dismissText: {
    color: a11yColors.text.muted,
    fontSize: 14,
  },
});
