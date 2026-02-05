import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState, ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../contexts/LanguageContext';
import { usePremium, SubscriptionTier } from '../contexts/PremiumContext';
import { FeatureKey, FEATURE_TIERS } from '../services/premiumUsage';

type PremiumGateProps = {
  feature: FeatureKey;
  children: ReactNode;
};

export default function PremiumGate({ feature, children }: PremiumGateProps) {
  const { tier, loading, canAccessFeature, consumeTrial, triggerPaywall } = usePremium();
  const { t } = useLanguage();
  const [accessState, setAccessState] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [trialConsumed, setTrialConsumed] = useState(false);

  useEffect(() => {
    checkAccess();
  }, [tier, loading]);

  const checkAccess = async () => {
    if (loading) {
      setAccessState('checking');
      return;
    }

    // If user has subscription access, grant immediately
    if (canAccessFeature(feature)) {
      setAccessState('granted');
      return;
    }

    // For free users, try to consume trial
    const result = await consumeTrial(feature);

    if (result.success) {
      setAccessState('granted');
      setTrialConsumed(true);
    } else if (result.showPaywall) {
      setAccessState('denied');
      // Don't auto-show paywall, let user decide
    }
  };

  const handleUnlock = () => {
    const requiredTier = FEATURE_TIERS[feature];
    if (requiredTier === 'premium_plus') {
      router.push('/premium/plus');
    } else {
      router.push('/premium');
    }
  };

  const handleTriggerPaywall = () => {
    triggerPaywall(feature);
  };

  const getTierDisplayName = (tier: SubscriptionTier): string => {
    if (tier === 'premium_plus') {
      return t('premiumPlus') || 'Premium Plus';
    }
    return t('premium') || 'Premium';
  };

  const getFeatureDisplayName = (feature: FeatureKey): string => {
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

  // Loading state
  if (accessState === 'checking') {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
        </View>
      </LinearGradient>
    );
  }

  // Access denied - show paywall prompt
  if (accessState === 'denied') {
    const requiredTier = FEATURE_TIERS[feature];

    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.deniedContainer}>
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>x</Text>
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>
              {requiredTier === 'premium_plus' ? '✨' : '⭐'}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {t('trialExhausted') || 'Free Preview Used'}
          </Text>

          {/* Description */}
          <Text style={styles.description}>
            {t('trialExhaustedDesc') ||
              "You've used your free daily preview. Subscribe for unlimited access."}
          </Text>

          {/* Feature name */}
          <View style={styles.featureCard}>
            <Text style={styles.featureName}>{getFeatureDisplayName(feature)}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>
                {getTierDisplayName(requiredTier)} {t('required') || 'REQUIRED'}
              </Text>
            </View>
          </View>

          {/* CTA Button */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleUnlock}
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

          {/* Secondary link */}
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/premium')}
          >
            <Text style={styles.secondaryText}>
              {t('viewAllPlans') || 'View All Plans'}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Access granted - render children with optional trial indicator
  return (
    <>
      {children}

      {/* Show trial indicator for free users using trial */}
      {trialConsumed && tier === 'free' && (
        <TouchableOpacity
          style={styles.trialBanner}
          onPress={handleTriggerPaywall}
        >
          <Text style={styles.trialBannerIcon}>✨</Text>
          <Text style={styles.trialBannerText}>
            {t('freePreviewAvailable') || '1 free preview per day'}
          </Text>
          <Text style={styles.trialBannerLink}>
            {t('unlockNow') || 'Unlock Full Access'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  icon: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 32,
    alignItems: 'center',
  },
  featureName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  tierBadge: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tierBadgeText: {
    fontSize: 12,
    color: '#e94560',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ctaButton: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  ctaGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
  },
  secondaryText: {
    color: '#9333ea',
    fontSize: 16,
    fontWeight: '600',
  },
  trialBanner: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
  },
  trialBannerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  trialBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#ccc',
  },
  trialBannerLink: {
    fontSize: 13,
    color: '#9333ea',
    fontWeight: '600',
  },
});
