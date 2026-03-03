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
import { useAuth } from '../_layout';
import { getOfferings, purchasePackage, restorePurchases } from '../../services/purchases';
import { redirectToCheckout, WebSubscriptionPlan } from '../../services/webPayments';

// Web pricing plans
const WEB_PLANS: { id: WebSubscriptionPlan; name: string; price: string; period: string; badge?: string; originalPrice?: string }[] = [
  { id: 'celestial_monthly', name: 'Celestial', price: '$9.99', period: 'month' },
  { id: 'celestial_yearly', name: 'Celestial', price: '$47.95', period: 'year', badge: '60% OFF', originalPrice: '$119.88' },
  { id: 'cosmic_monthly', name: 'Cosmic', price: '$14.99', period: 'month' },
  { id: 'cosmic_yearly', name: 'Cosmic', price: '$71.95', period: 'year', badge: '60% OFF', originalPrice: '$179.88' },
];

export default function PremiumScreen() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [selectedWebPlan, setSelectedWebPlan] = useState<WebSubscriptionPlan>('celestial_yearly');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [, setRefresh] = useState(0);
  const { t } = useLanguage();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const PREMIUM_FEATURES = [
    { emoji: '♾️', title: t('unlimitedSwipes'), description: t('unlimitedSwipesDesc'), route: null },
    { emoji: '🌙', title: t('fullNatalChart'), description: t('fullNatalChartDesc'), route: '/premium/natal-chart' },
    { emoji: '💫', title: t('advancedSynastry'), description: t('advancedSynastryDesc'), route: '/premium/synastry' },
    { emoji: '⭐', title: t('superLikes'), description: t('superLikesDesc'), route: '/premium/super-likes' },
    { emoji: '🔮', title: t('seeWhoLikes'), description: t('seeWhoLikesDesc'), route: '/premium/likes' },
    { emoji: '💬', title: t('priorityMessages'), description: t('priorityMessagesDesc'), route: '/premium/priority-messages' },
    { emoji: '📅', title: t('datePlanner'), description: t('datePlannerDesc'), route: '/premium/date-planner', isPremiumPlus: true },
  ];

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
    if (availablePackages.length > 0) {
      setSelectedPackage(availablePackages[0]);
    }
    setLoading(false);
  };

  const handlePurchase = async () => {
    // Web: Redirect to Stripe Checkout
    if (isWeb) {
      if (!user) {
        Alert.alert(t('error'), t('pleaseLogin'));
        return;
      }
      setPurchasing(true);
      try {
        await redirectToCheckout(selectedWebPlan, user.id);
      } catch (error: any) {
        Alert.alert(t('error'), error.message || t('somethingWrong'));
        setPurchasing(false);
      }
      return;
    }

    // Native: Use RevenueCat
    if (!selectedPackage) {
      Alert.alert(
        t('testMode'),
        t('testModeMessage'),
        [{ text: t('ok'), onPress: () => router.back() }]
      );
      return;
    }

    setPurchasing(true);
    const result = await purchasePackage(selectedPackage);
    setPurchasing(false);

    if (result.success) {
      Alert.alert(t('welcomePremium'), t('premiumAccessGranted'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } else if (!result.cancelled) {
      Alert.alert(t('error'), t('somethingWrong'));
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const result = await restorePurchases();
    setLoading(false);

    if (result.isPremium) {
      Alert.alert(t('success'), t('premiumRestored'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } else {
      Alert.alert(t('error'), t('noPreviousPurchases'));
    }
  };

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 20 + insets.top }]}>
          <TouchableOpacity style={[styles.closeButton, { top: 16 + insets.top }]} onPress={() => router.back()}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>

          <Text style={styles.starIcon}>⭐</Text>
          <Text style={styles.title}>{t('unlockPremium')}</Text>
          <Text style={styles.subtitle}>{t('discoverDestiny')}</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {PREMIUM_FEATURES.map((feature, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.featureRow, (feature as any).isPremiumPlus && styles.featureRowPlus]}
              onPress={() => feature.route && router.push(feature.route as any)}
              activeOpacity={feature.route ? 0.7 : 1}
            >
              <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              <View style={styles.featureText}>
                <View style={styles.featureTitleRow}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  {(feature as any).isPremiumPlus && (
                    <View style={styles.plusBadge}>
                      <Text style={styles.plusBadgeText}>PLUS</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              {feature.route && (
                <Text style={[(feature as any).isPremiumPlus ? styles.featureArrowPlus : styles.featureArrow]}>→</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricing}>
          {loading ? (
            <ActivityIndicator color="#e94560" />
          ) : isWeb ? (
            // Web: Show Stripe plans
            <View style={styles.webPricingContainer}>
              {/* Celestial Tier */}
              <Text style={styles.tierTitle}>✨ Celestial</Text>
              <View style={styles.tierOptions}>
                {WEB_PLANS.filter(p => p.id.startsWith('celestial')).map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.priceOption,
                      selectedWebPlan === plan.id && styles.priceOptionSelected,
                    ]}
                    onPress={() => setSelectedWebPlan(plan.id)}
                  >
                    {plan.badge && (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveText}>{plan.badge}</Text>
                      </View>
                    )}
                    <Text style={styles.priceTitle}>{plan.period === 'month' ? t('monthly') : t('yearly')}</Text>
                    {plan.originalPrice && (
                      <Text style={styles.originalPrice}>{plan.originalPrice}</Text>
                    )}
                    <Text style={styles.priceAmount}>{plan.price}</Text>
                    <Text style={styles.pricePeriod}>/{plan.period}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cosmic Tier */}
              <Text style={[styles.tierTitle, styles.cosmicTitle]}>🌌 Cosmic</Text>
              <View style={styles.tierOptions}>
                {WEB_PLANS.filter(p => p.id.startsWith('cosmic')).map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.priceOption,
                      styles.cosmicOption,
                      selectedWebPlan === plan.id && styles.priceOptionSelectedCosmic,
                    ]}
                    onPress={() => setSelectedWebPlan(plan.id)}
                  >
                    {plan.badge && (
                      <View style={styles.saveBadge}>
                        <Text style={styles.saveText}>{plan.badge}</Text>
                      </View>
                    )}
                    <Text style={styles.priceTitle}>{plan.period === 'month' ? t('monthly') : t('yearly')}</Text>
                    {plan.originalPrice && (
                      <Text style={styles.originalPrice}>{plan.originalPrice}</Text>
                    )}
                    <Text style={styles.priceAmount}>{plan.price}</Text>
                    <Text style={styles.pricePeriod}>/{plan.period}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : packages.length > 0 ? (
            // Native: Show RevenueCat packages
            packages.map((pkg) => (
              <TouchableOpacity
                key={pkg.identifier}
                style={[
                  styles.priceOption,
                  selectedPackage?.identifier === pkg.identifier && styles.priceOptionSelected,
                ]}
                onPress={() => setSelectedPackage(pkg)}
              >
                <Text style={styles.priceTitle}>{pkg.product.title}</Text>
                <Text style={styles.priceAmount}>{pkg.product.priceString}</Text>
                <Text style={styles.pricePeriod}>
                  {pkg.packageType === 'MONTHLY' ? `/${t('monthly').toLowerCase()}` : `/${t('yearly').toLowerCase()}`}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            // Native fallback: Show placeholder prices
            <>
              <TouchableOpacity
                style={[styles.priceOption, styles.priceOptionSelected]}
                onPress={() => { }}
              >
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>{t('mostPopular')}</Text>
                </View>
                <Text style={styles.priceTitle}>{t('monthly')}</Text>
                <Text style={styles.priceAmount}>$9.99</Text>
                <Text style={styles.pricePeriod}>/{t('monthly').toLowerCase()}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.priceOption} onPress={() => { }}>
                <View style={styles.saveBadge}>
                  <Text style={styles.saveText}>{t('save50')}</Text>
                </View>
                <Text style={styles.priceTitle}>{t('yearly')}</Text>
                <Text style={styles.priceAmount}>$59.99</Text>
                <Text style={styles.pricePeriod}>/{t('yearly').toLowerCase()}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          <LinearGradient
            colors={['#e94560', '#c23a51']}
            style={styles.subscribeGradient}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.subscribeText}>{t('startFreeTrial')}</Text>
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

        {/* Premium Plus Upsell - only on native */}
        {!isWeb && (
          <TouchableOpacity style={styles.premiumPlusUpsell} onPress={() => router.push('/premium/plus')}>
            <View style={styles.premiumPlusContent}>
              <Text style={styles.premiumPlusEmoji}>✨</Text>
              <View style={styles.premiumPlusText}>
                <Text style={styles.premiumPlusTitle}>{t('premiumPlus')}</Text>
                <Text style={styles.premiumPlusDesc}>{t('dailyHoroscopeFeature')} + {t('monthlyHoroscopeFeature')}</Text>
              </View>
              <Text style={styles.premiumPlusArrow}>→</Text>
            </View>
          </TouchableOpacity>
        )}
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
    paddingBottom: 24,
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
  starIcon: {
    fontSize: 64,
    marginBottom: 16,
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
  features: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  featureEmoji: {
    fontSize: 28,
    marginRight: 16,
    width: 40,
    textAlign: 'center',
  },
  featureRowPlus: {
    backgroundColor: 'rgba(147, 51, 234, 0.08)',
    borderBottomColor: 'rgba(147, 51, 234, 0.2)',
  },
  featureText: {
    flex: 1,
  },
  featureTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  plusBadge: {
    backgroundColor: '#9333ea',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  plusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  featureDescription: {
    fontSize: 13,
    color: '#888',
  },
  featureArrow: {
    fontSize: 18,
    color: '#e94560',
    marginLeft: 8,
  },
  featureArrowPlus: {
    fontSize: 18,
    color: '#9333ea',
    marginLeft: 8,
  },
  pricing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  webPricingContainer: {
    width: '100%',
  },
  tierTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 12,
    marginTop: 8,
  },
  cosmicTitle: {
    color: '#9333ea',
    marginTop: 20,
  },
  tierOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  cosmicOption: {
    borderColor: 'rgba(147, 51, 234, 0.3)',
    backgroundColor: 'rgba(147, 51, 234, 0.05)',
  },
  priceOptionSelectedCosmic: {
    borderColor: '#9333ea',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
  },
  originalPrice: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  priceOption: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priceOptionSelected: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  popularBadge: {
    backgroundColor: '#e94560',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  popularText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  saveBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  saveText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  priceTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  priceAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  pricePeriod: {
    fontSize: 12,
    color: '#666',
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
  subscribeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  trialText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    marginTop: 12,
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
  premiumPlusUpsell: {
    marginHorizontal: 24,
    marginTop: 24,
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
  },
  premiumPlusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  premiumPlusEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  premiumPlusText: {
    flex: 1,
  },
  premiumPlusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9333ea',
    marginBottom: 2,
  },
  premiumPlusDesc: {
    fontSize: 12,
    color: '#888',
  },
  premiumPlusArrow: {
    fontSize: 18,
    color: '#9333ea',
  },
});
