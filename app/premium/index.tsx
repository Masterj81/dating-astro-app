import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { useAuth } from '../_layout';
import { getOfferings, purchasePackage, restorePurchases } from '../../services/purchases';
import { redirectToCheckout, redirectToPortal, WebSubscriptionPlan } from '../../services/webPayments';

// Subscription tiers with features
const TIERS = {
  celestial: {
    name: 'Celestial',
    emoji: '✨',
    monthlyPrice: '$9.99',
    yearlyPrice: '$47.95',
    yearlyOriginal: '$119.88',
    color: '#e94560',
    features: [
      'Unlimited swipes',
      'See who likes you',
      'Full natal chart analysis',
      'Advanced synastry reports',
      '5 Super Likes per day',
      'Priority messages',
      'No ads',
    ],
  },
  cosmic: {
    name: 'Cosmic',
    emoji: '🌌',
    monthlyPrice: '$14.99',
    yearlyPrice: '$71.95',
    yearlyOriginal: '$179.88',
    color: '#9333ea',
    features: [
      'Everything in Celestial',
      'Daily personalized horoscope',
      'Monthly forecast predictions',
      'Planetary transit alerts',
      'Retrograde notifications',
      'Lucky days calendar',
      'AI-powered date planner',
      'Unlimited Super Likes',
    ],
  },
};

// Premium features list for dashboard
const PREMIUM_FEATURES = [
  { key: 'natal-chart', icon: '🌙', labelKey: 'fullNatalChart', tier: 'premium' },
  { key: 'synastry', icon: '💫', labelKey: 'advancedSynastry', tier: 'premium' },
  { key: 'likes', icon: '❤️', labelKey: 'seeWhoLikes', tier: 'premium' },
  { key: 'super-likes', icon: '⭐', labelKey: 'superLikes', tier: 'premium' },
  { key: 'priority-messages', icon: '💬', labelKey: 'priorityMessages', tier: 'premium' },
];

const PREMIUM_PLUS_FEATURES = [
  { key: 'daily-horoscope', icon: '☀️', labelKey: 'dailyHoroscope', tier: 'premium_plus' },
  { key: 'monthly-horoscope', icon: '📅', labelKey: 'monthlyHoroscope', tier: 'premium_plus' },
  { key: 'planetary-transits', icon: '🪐', labelKey: 'planetaryTransits', tier: 'premium_plus' },
  { key: 'retrograde-alerts', icon: '⚠️', labelKey: 'retrogradeAlerts', tier: 'premium_plus' },
  { key: 'lucky-days', icon: '🍀', labelKey: 'luckyDays', tier: 'premium_plus' },
  { key: 'date-planner', icon: '💕', labelKey: 'datePlanner', tier: 'premium_plus' },
];

export default function PremiumScreen() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedTier, setSelectedTier] = useState<'celestial' | 'cosmic'>('celestial');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const { t } = useLanguage();
  const { user } = useAuth();
  const { tier, loading: premiumLoading } = usePremium();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const isPremium = tier === 'premium' || tier === 'premium_plus';
  const isPremiumPlus = tier === 'premium_plus';

  useEffect(() => {
    if (!isWeb) {
      loadOfferings();
    } else {
      setLoading(false);
    }
  }, []);

  const loadOfferings = async () => {
    setLoading(true);
    const availablePackages = await getOfferings();
    setPackages(availablePackages);
    setLoading(false);
  };

  const getSelectedPlanId = (): WebSubscriptionPlan => {
    return `${selectedTier}_${billingPeriod}` as WebSubscriptionPlan;
  };

  const handlePurchase = async () => {
    if (isWeb) {
      if (!user) {
        Alert.alert(t('error'), t('pleaseLogin'));
        return;
      }
      setPurchasing(true);
      try {
        await redirectToCheckout(getSelectedPlanId(), user.id);
      } catch (error: any) {
        Alert.alert(t('error'), error.message || t('somethingWrong'));
        setPurchasing(false);
      }
      return;
    }

    // Native: Use RevenueCat
    const selectedPackage = packages.find(pkg =>
      pkg.identifier.toLowerCase().includes(selectedTier) &&
      pkg.identifier.toLowerCase().includes(billingPeriod)
    );

    if (!selectedPackage) {
      Alert.alert(t('testMode'), t('testModeMessage'), [{ text: t('ok'), onPress: () => router.back() }]);
      return;
    }

    setPurchasing(true);
    const result = await purchasePackage(selectedPackage);
    setPurchasing(false);

    if (result.success) {
      Alert.alert(t('welcomePremium'), t('premiumAccessGranted'), [{ text: t('ok'), onPress: () => router.back() }]);
    } else if (!result.cancelled) {
      Alert.alert(t('error'), t('somethingWrong'));
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases();
    setLoading(false);

    if (result.isPremium) {
      Alert.alert(t('success'), t('premiumRestored'), [{ text: t('ok'), onPress: () => router.back() }]);
    } else {
      Alert.alert(t('error'), t('noPreviousPurchases'));
    }
  };

  const selectedTierData = TIERS[selectedTier];
  const currentPrice = billingPeriod === 'monthly'
    ? selectedTierData.monthlyPrice
    : selectedTierData.yearlyPrice;

  const handleManageSubscription = async () => {
    if (isWeb && user) {
      try {
        await redirectToPortal(user.id);
      } catch (error: any) {
        Alert.alert(t('error'), error.message || t('somethingWrong'));
      }
    }
  };

  // Show premium dashboard if user already has premium
  if (isPremium && !premiumLoading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
            <TouchableOpacity style={[styles.closeButton, { top: 16 + insets.top }]} onPress={() => router.back()}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.dashboardBadge}>
              {isPremiumPlus ? '🌌 Cosmic' : '✨ Celestial'}
            </Text>
            <Text style={styles.title}>{t('welcomePremium')}</Text>
            <Text style={styles.subtitle}>{t('premiumAccessGranted')}</Text>
          </View>

          {/* Premium Features */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresSectionTitle}>Premium Features</Text>
            {PREMIUM_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.key}
                style={styles.featureCard}
                onPress={() => router.push(`/premium/${feature.key}` as any)}
              >
                <Text style={styles.featureCardIcon}>{feature.icon}</Text>
                <Text style={styles.featureCardText}>{t(feature.labelKey) || feature.labelKey}</Text>
                <Text style={styles.featureCardArrow}>→</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Premium Plus Features */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresSectionTitle}>
              Premium Plus Features {!isPremiumPlus && '🔒'}
            </Text>
            {PREMIUM_PLUS_FEATURES.map((feature) => (
              <TouchableOpacity
                key={feature.key}
                style={[styles.featureCard, !isPremiumPlus && styles.featureCardLocked]}
                onPress={() => {
                  if (isPremiumPlus) {
                    router.push(`/premium/${feature.key}` as any);
                  } else {
                    router.push('/premium/plus');
                  }
                }}
              >
                <Text style={styles.featureCardIcon}>{feature.icon}</Text>
                <Text style={[styles.featureCardText, !isPremiumPlus && styles.featureCardTextLocked]}>
                  {t(feature.labelKey) || feature.labelKey}
                </Text>
                <Text style={styles.featureCardArrow}>
                  {isPremiumPlus ? '→' : '🔒'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Upgrade to Premium Plus (if on Celestial) */}
          {!isPremiumPlus && (
            <TouchableOpacity
              style={styles.upgradeButton}
              onPress={() => router.push('/premium/plus')}
            >
              <LinearGradient
                colors={['#9333ea', '#7c3aed']}
                style={styles.upgradeGradient}
              >
                <Text style={styles.upgradeText}>{t('upgradeToPremiumPlus')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Manage Subscription */}
          {isWeb && (
            <TouchableOpacity style={styles.manageButton} onPress={handleManageSubscription}>
              <Text style={styles.manageButtonText}>Manage Subscription</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
          <TouchableOpacity style={[styles.closeButton, { top: 16 + insets.top }]} onPress={() => router.back()}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('unlockPremium')}</Text>
          <Text style={styles.subtitle}>{t('discoverDestiny')}</Text>
        </View>

        {/* Promo Banner */}
        <View style={styles.promoBanner}>
          <Text style={styles.promoText}>
            🎉 Limited Time: <Text style={styles.promoHighlight}>60% OFF</Text> yearly plans until April 30th!
          </Text>
        </View>

        {/* Billing Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[styles.billingOption, billingPeriod === 'monthly' && styles.billingOptionActive]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text style={[styles.billingText, billingPeriod === 'monthly' && styles.billingTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.billingOption, billingPeriod === 'yearly' && styles.billingOptionActive]}
            onPress={() => setBillingPeriod('yearly')}
          >
            <Text style={[styles.billingText, billingPeriod === 'yearly' && styles.billingTextActive]}>
              Yearly
            </Text>
            {billingPeriod === 'yearly' && (
              <View style={styles.saveBadgeSmall}>
                <Text style={styles.saveBadgeText}>SAVE 60%</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Tier Cards */}
        <View style={styles.tiersContainer}>
          {/* Celestial Tier */}
          <TouchableOpacity
            style={[
              styles.tierCard,
              selectedTier === 'celestial' && styles.tierCardSelected,
              { borderColor: selectedTier === 'celestial' ? TIERS.celestial.color : 'rgba(255,255,255,0.1)' },
            ]}
            onPress={() => setSelectedTier('celestial')}
            activeOpacity={0.8}
          >
            <View style={styles.tierHeader}>
              <Text style={styles.tierEmoji}>{TIERS.celestial.emoji}</Text>
              <Text style={[styles.tierName, { color: TIERS.celestial.color }]}>
                {TIERS.celestial.name}
              </Text>
            </View>

            <View style={styles.priceContainer}>
              {billingPeriod === 'yearly' && (
                <Text style={styles.originalPrice}>{TIERS.celestial.yearlyOriginal}</Text>
              )}
              <Text style={styles.price}>
                {billingPeriod === 'monthly' ? TIERS.celestial.monthlyPrice : TIERS.celestial.yearlyPrice}
              </Text>
              <Text style={styles.pricePeriod}>
                /{billingPeriod === 'monthly' ? 'month' : 'year'}
              </Text>
            </View>

            <View style={styles.featuresContainer}>
              {TIERS.celestial.features.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Text style={[styles.checkmark, { color: TIERS.celestial.color }]}>✓</Text>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            {selectedTier === 'celestial' && (
              <View style={[styles.selectedIndicator, { backgroundColor: TIERS.celestial.color }]}>
                <Text style={styles.selectedText}>Selected</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Cosmic Tier */}
          <TouchableOpacity
            style={[
              styles.tierCard,
              selectedTier === 'cosmic' && styles.tierCardSelected,
              { borderColor: selectedTier === 'cosmic' ? TIERS.cosmic.color : 'rgba(255,255,255,0.1)' },
            ]}
            onPress={() => setSelectedTier('cosmic')}
            activeOpacity={0.8}
          >
            <View style={styles.popularTag}>
              <Text style={styles.popularTagText}>MOST POPULAR</Text>
            </View>

            <View style={styles.tierHeader}>
              <Text style={styles.tierEmoji}>{TIERS.cosmic.emoji}</Text>
              <Text style={[styles.tierName, { color: TIERS.cosmic.color }]}>
                {TIERS.cosmic.name}
              </Text>
            </View>

            <View style={styles.priceContainer}>
              {billingPeriod === 'yearly' && (
                <Text style={styles.originalPrice}>{TIERS.cosmic.yearlyOriginal}</Text>
              )}
              <Text style={styles.price}>
                {billingPeriod === 'monthly' ? TIERS.cosmic.monthlyPrice : TIERS.cosmic.yearlyPrice}
              </Text>
              <Text style={styles.pricePeriod}>
                /{billingPeriod === 'monthly' ? 'month' : 'year'}
              </Text>
            </View>

            <View style={styles.featuresContainer}>
              {TIERS.cosmic.features.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Text style={[styles.checkmark, { color: TIERS.cosmic.color }]}>✓</Text>
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            {selectedTier === 'cosmic' && (
              <View style={[styles.selectedIndicator, { backgroundColor: TIERS.cosmic.color }]}>
                <Text style={styles.selectedText}>Selected</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handlePurchase}
          disabled={purchasing || loading}
        >
          <LinearGradient
            colors={selectedTier === 'cosmic' ? ['#9333ea', '#7c3aed'] : ['#e94560', '#c23a51']}
            style={styles.subscribeGradient}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <View style={styles.subscribeContent}>
                <Text style={styles.subscribeText}>
                  Subscribe to {selectedTierData.name}
                </Text>
                <Text style={styles.subscribePriceText}>
                  {currentPrice}/{billingPeriod === 'monthly' ? 'mo' : 'yr'}
                </Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.trialText}>{t('trialInfo')}</Text>

        {/* Restore - only on native */}
        {!isWeb && (
          <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
            <Text style={styles.restoreText}>{t('restorePurchases')}</Text>
          </TouchableOpacity>
        )}

        {/* Promo Footer */}
        <View style={styles.promoFooter}>
          <Text style={styles.promoFooterText}>
            💫 Get 60% off your first year when you subscribe to any yearly plan. Offer valid until April 30th, 2026.
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    left: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  promoBanner: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    marginHorizontal: 24,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  promoText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  promoHighlight: {
    color: '#4ade80',
    fontWeight: 'bold',
  },
  billingToggle: {
    flexDirection: 'row',
    marginHorizontal: 24,
    marginBottom: 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
  },
  billingOption: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  billingOptionActive: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  billingText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },
  billingTextActive: {
    color: '#fff',
  },
  saveBadgeSmall: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  saveBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: 'bold',
  },
  tiersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  tierCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    position: 'relative',
  },
  tierCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  popularTag: {
    position: 'absolute',
    top: -1,
    left: 0,
    right: 0,
    backgroundColor: '#9333ea',
    paddingVertical: 4,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  popularTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tierHeader: {
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  tierEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  tierName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  priceContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  originalPrice: {
    fontSize: 13,
    color: '#666',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  pricePeriod: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  featuresContainer: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  checkmark: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  featureText: {
    fontSize: 12,
    color: '#ccc',
    flex: 1,
    lineHeight: 16,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  selectedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  subscribeButton: {
    marginHorizontal: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  subscribeGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  subscribeContent: {
    alignItems: 'center',
  },
  subscribeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  subscribePriceText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  trialText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 24,
  },
  restoreButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  restoreText: {
    color: '#888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  promoFooter: {
    marginHorizontal: 24,
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
  },
  promoFooterText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Premium Dashboard styles
  dashboardBadge: {
    fontSize: 24,
    marginBottom: 8,
  },
  featuresSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  featuresSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  featureCardLocked: {
    opacity: 0.6,
  },
  featureCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  featureCardText: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
  },
  featureCardTextLocked: {
    color: '#888',
  },
  featureCardArrow: {
    fontSize: 16,
    color: '#666',
  },
  upgradeButton: {
    marginHorizontal: 24,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  upgradeGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  upgradeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  manageButton: {
    marginHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  manageButtonText: {
    color: '#888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
