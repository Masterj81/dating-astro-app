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
  const { paywallState, dismissPaywall } = usePremium();
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
        `${t('trialExhausted') || 'Free Preview Used'}. ${featureName} requires ${tierName}. ${getTierPrice(recommendedTier)}`
      );
    }
  }, [visible, feature, recommendedTier]);

  const handleUpgrade = () => {
    buttonPress();
    dismissPaywall();
    // Navigate to the appropriate premium screen based on recommended tier
    if (recommendedTier === 'premium_plus') {
      router.push('/premium/plus');
    } else {
      router.push('/premium');
    }
  };

  const handleViewPlans = () => {
    buttonPress();
    dismissPaywall();
    router.push('/premium');
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
    };

    return featureNames[feature] || feature;
  };

  const getTierDisplayName = (tier: SubscriptionTier): string => {
    if (tier === 'premium_plus') {
      return t('premiumPlus') || 'Premium Plus';
    }
    return t('premium') || 'Premium';
  };

  const getTierPrice = (tier: SubscriptionTier): string => {
    if (tier === 'premium_plus') {
      return '$14.99/mo';
    }
    return '$9.99/mo';
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

            {/* Title */}
            <Text style={styles.title} accessibilityRole="header">
              {t('trialExhausted') || 'Free Preview Used'}
            </Text>

            {/* Description */}
            <Text style={styles.description}>
              {t('trialExhaustedDesc') ||
                "You've used your free daily preview. Subscribe for unlimited access."}
            </Text>

            {/* Feature info */}
            {feature && (
              <View style={styles.featureCard}>
                <Text style={styles.featureLabel}>
                  {getFeatureDisplayName(feature)}
                </Text>
                <View style={styles.tierBadge}>
                  <Text style={styles.tierText}>
                    {getTierDisplayName(recommendedTier)} {t('required') || 'REQUIRED'}
                  </Text>
                </View>
              </View>
            )}

            {/* Price display */}
            <View
              style={styles.priceContainer}
              accessibilityLabel={t('a11y.priceAnnouncement', {
                price: getTierPrice(recommendedTier).replace('/mo', ''),
                period: 'month',
              })}
            >
              <Text style={styles.priceLabel}>
                {getTierDisplayName(recommendedTier)}
              </Text>
              <Text style={styles.price}>{getTierPrice(recommendedTier)}</Text>
            </View>

            {/* CTA Button */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleUpgrade}
              {...getButtonA11yProps(t('a11y.upgradeButton'))}
            >
              <LinearGradient
                colors={['#e94560', '#c23a51']}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>
                  {t('unlockNow') || 'Unlock Full Access'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Secondary CTA */}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleViewPlans}
              {...getButtonA11yProps(t('a11y.viewPlansButton'))}
            >
              <Text style={styles.secondaryText}>
                {t('viewAllPlans') || 'View All Plans'}
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
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  featureLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: a11yColors.text.primary,
    marginBottom: 8,
  },
  tierBadge: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierText: {
    fontSize: 11,
    color: '#e94560',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  priceLabel: {
    fontSize: 14,
    color: a11yColors.text.secondary,
    marginBottom: 4,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e94560',
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
