import { useIsFocused } from '@react-navigation/native';
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
import { getOfferings, purchasePackage } from '../../services/purchases';

export default function PremiumPlusScreen() {
  const [purchasing, setPurchasing] = useState(false);
  const [premiumPlusPackage, setPremiumPlusPackage] = useState<PurchasesPackage | null>(null);
  const { t } = useLanguage();
  const { refreshSubscription } = usePremium();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const celestialTierLabel = t('celestialTier') || 'Celestial';
  const cosmicTierLabel = t('cosmicTier') || 'Cosmic';

  // Load available packages on mount (native only)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadPackages();
    }
  }, []);

  const loadPackages = async () => {
    try {
      const packages = await getOfferings();
      // Find the premium_plus package (monthly or annual)
      const plusPkg = packages.find(
        (pkg) =>
          pkg.identifier.includes('premium_plus') ||
          pkg.identifier.includes('plus') ||
          pkg.product.identifier.includes('premium_plus')
      );
      if (plusPkg) {
        setPremiumPlusPackage(plusPkg);
      }
    } catch (error) {
      console.error('Failed to load packages:', error);
    }
  };

  const PREMIUM_PLUS_FEATURES = [
    {
      emoji: '\u{2600}\u{FE0F}',
      title: t('dailyHoroscopeFeature'),
      description: t('dailyHoroscopeDesc'),
      route: '/premium-screens/daily-horoscope',
      included: true
    },
    {
      emoji: '\u{1F4C5}',
      title: t('monthlyHoroscopeFeature'),
      description: t('monthlyHoroscopeDesc'),
      route: '/premium-screens/monthly-horoscope',
      included: true
    },
    {
      emoji: '\u{1F52E}',
      title: t('planetaryTransits'),
      description: t('planetaryTransitsDesc'),
      route: '/premium-screens/planetary-transits',
      included: true
    },
    {
      emoji: '\u{1F4AB}',
      title: t('retrogradeAlerts'),
      description: t('retrogradeAlertsDesc'),
      route: '/premium-screens/retrograde-alerts',
      included: true
    },
    {
      emoji: '\u{1F31F}',
      title: t('luckyDays'),
      description: t('luckyDaysDesc'),
      route: '/premium-screens/lucky-days',
      included: true
    },
  ];

  const handlePurchase = async () => {
    // Web: redirect to Stripe checkout (handled separately)
    if (Platform.OS === 'web') {
      // Web purchases go through Stripe - redirect to premium tab which handles web payments
      router.push('/(tabs)/premium' as any);
      return;
    }

    // Native: use RevenueCat
    if (!premiumPlusPackage) {
      Alert.alert(
        t('error') || 'Error',
        t('packageNotAvailable') || 'Premium Plus package is not available. Please try again later.',
        [{ text: t('ok') || 'OK' }]
      );
      return;
    }

    setPurchasing(true);
    try {
      const result = await purchasePackage(premiumPlusPackage);

      if (result.success) {
        // Refresh subscription status in context
        await refreshSubscription();
        Alert.alert(
          t('purchaseSuccess') || 'Success!',
          t('premiumPlusActivated') || 'Premium Plus has been activated. Enjoy your new features!',
          [{ text: t('ok') || 'OK', onPress: () => router.back() }]
        );
      } else if (result.cancelled) {
        // User cancelled - no action needed
      } else {
        Alert.alert(
          t('purchaseFailed') || 'Purchase Failed',
          t('purchaseError') || 'There was an error processing your purchase. Please try again.',
          [{ text: t('ok') || 'OK' }]
        );
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert(
        t('error') || 'Error',
        t('purchaseError') || 'There was an error processing your purchase. Please try again.',
        [{ text: t('ok') || 'OK' }]
      );
    } finally {
      setPurchasing(false);
    }
  };

  // Web version with position fixed
  if (Platform.OS === 'web') {
    if (!isFocused) {
      return null;
    }
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        overflowY: 'auto',
        zIndex: 1
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', padding: '40px 20px 24px' }}>
          <button
            onClick={() => router.back()}
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: '#fff',
              fontSize: 24,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ←
          </button>
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
            <span style={{ fontSize: 64 }}>✨</span>
            <span style={{
              position: 'absolute',
              bottom: -4,
              right: -16,
              backgroundColor: '#9333ea',
              padding: '4px 8px',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
              fontWeight: 'bold'
            }}>PLUS</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', margin: '0 0 8px' }}>
            {cosmicTierLabel}
          </h1>
          <p style={{ color: '#888', fontSize: 16, margin: 0, padding: '0 40px' }}>
            {t('premiumPlusSubtitle')}
          </p>
        </div>

        {/* Features */}
        <div style={{ padding: '0 24px 24px' }}>
          <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
            {t('whatsIncluded')}
          </h2>
          {PREMIUM_PLUS_FEATURES.map((feature, index) => (
            <div
              key={index}
              onClick={() => feature.route && router.push(feature.route as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                cursor: feature.route ? 'pointer' : 'default'
              }}
            >
              <span style={{ fontSize: 28, marginRight: 16, width: 40, textAlign: 'center' }}>
                {feature.emoji}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
                  {feature.title}
                </div>
                <div style={{ color: '#888', fontSize: 13 }}>{feature.description}</div>
              </div>
              <span style={{ color: feature.route ? '#9333ea' : '#4ade80', fontSize: 18, marginLeft: 8 }}>
                {feature.route ? '→' : '✓'}
              </span>
            </div>
          ))}
        </div>

        {/* Subscribe Button */}
        <div style={{ padding: '0 24px' }}>
          <button
            onClick={handlePurchase}
            disabled={purchasing}
            style={{
              width: '100%',
              background: 'linear-gradient(90deg, #9333ea, #7c3aed)',
              border: 'none',
              borderRadius: 16,
              padding: '18px',
              cursor: purchasing ? 'wait' : 'pointer',
              opacity: purchasing ? 0.7 : 1
            }}
          >
            {purchasing ? (
              <span style={{ color: '#fff' }}>...</span>
            ) : (
              <>
                <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
                  {`Upgrade to ${cosmicTierLabel}`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 }}>
                  $14.99/{t('monthly')?.toLowerCase()}
                </div>
              </>
            )}
          </button>
          <p style={{ textAlign: 'center', color: '#666', fontSize: 13, marginTop: 12 }}>
            {t('trialInfo')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: 60 + insets.top }]}>
          <TouchableOpacity style={[styles.closeButton, { top: 50 + insets.top }]} onPress={() => router.back()}>
            <Text style={styles.closeText}>←</Text>
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Text style={styles.starIcon}>✨</Text>
            <View style={styles.plusBadge}>
              <Text style={styles.plusText}>PLUS</Text>
            </View>
          </View>
          <Text style={styles.title}>{cosmicTierLabel}</Text>
          <Text style={styles.subtitle}>{t('premiumPlusSubtitle')}</Text>
        </View>

        {/* What's Included */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('whatsIncluded')}</Text>

          {PREMIUM_PLUS_FEATURES.map((feature, index) => (
            <TouchableOpacity
              key={index}
              style={styles.featureRow}
              onPress={() => feature.route && router.push(feature.route as any)}
              activeOpacity={feature.route ? 0.7 : 1}
            >
              <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              {feature.route ? (
                <Text style={styles.featureArrow}>→</Text>
              ) : (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Comparison */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('comparePlans')}</Text>

          <View style={styles.comparisonCard}>
            <View style={styles.planColumn}>
              <Text style={styles.planHeader}>{celestialTierLabel}</Text>
              <Text style={styles.planPrice}>$9.99/{t('monthly').toLowerCase()}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>✓ {t('unlimitedSwipes')}</Text>
                <Text style={styles.planFeature}>✓ {t('advancedSynastry')}</Text>
                <Text style={styles.planFeature}>✓ {t('superLikes')}</Text>
                <Text style={styles.planFeature}>✓ {t('seeWhoLikes')}</Text>
                <Text style={styles.planFeature}>✓ {t('fullNatalChart')}</Text>
                <Text style={styles.planFeatureMissing}>✗ {t('dailyHoroscopeFeature')}</Text>
                <Text style={styles.planFeatureMissing}>✗ {t('monthlyHoroscopeFeature')}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={[styles.planColumn, styles.planColumnHighlight]}>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t('recommended')}</Text>
              </View>
              <Text style={styles.planHeaderHighlight}>{cosmicTierLabel}</Text>
              <Text style={styles.planPriceHighlight}>$14.99/{t('monthly').toLowerCase()}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeatureHighlight}>✓ {t('allPremiumFeatures')}</Text>
                <Text style={styles.planFeatureHighlight}>✓ {t('dailyHoroscopeFeature')}</Text>
                <Text style={styles.planFeatureHighlight}>✓ {t('monthlyHoroscopeFeature')}</Text>
                <Text style={styles.planFeatureHighlight}>✓ {t('planetaryTransits')}</Text>
                <Text style={styles.planFeatureHighlight}>✓ {t('retrogradeAlerts')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handlePurchase}
          disabled={purchasing}
        >
          <LinearGradient
            colors={['#9333ea', '#7c3aed']}
            style={styles.subscribeGradient}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.subscribeText}>{`Upgrade to ${cosmicTierLabel}`}</Text>
                <Text style={styles.subscribePriceText}>$14.99/{t('monthly').toLowerCase()}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.trialText}>{t('trialInfo')}</Text>

        {/* Already Premium */}
        <TouchableOpacity style={styles.alreadyPremium} onPress={() => router.push('/(tabs)/premium' as any)}>
          <Text style={styles.alreadyPremiumText}>{t('viewRegularPremium')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: '100%' as any,
      width: '100%' as any,
    } : {}),
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: '100%' as any,
      width: '100%' as any,
      overflowY: 'auto' as any,
    } : {}),
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 24,
  },
  iconContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  starIcon: {
    fontSize: 64,
  },
  plusBadge: {
    position: 'absolute',
    bottom: -4,
    right: -16,
    backgroundColor: '#9333ea',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  plusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  featureEmoji: {
    fontSize: 28,
    marginRight: 16,
    width: 40,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 13,
    color: '#888',
  },
  featureArrow: {
    fontSize: 18,
    color: '#9333ea',
    marginLeft: 8,
  },
  checkmark: {
    fontSize: 18,
    color: '#4ade80',
    marginLeft: 8,
  },
  comparisonCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  planColumn: {
    flex: 1,
    padding: 16,
  },
  planColumnHighlight: {
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
  },
  recommendedBadge: {
    backgroundColor: '#9333ea',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  recommendedText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  planHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
  },
  planHeaderHighlight: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  planPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  planPriceHighlight: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#9333ea',
    marginBottom: 12,
  },
  planFeatures: {
    gap: 6,
  },
  planFeature: {
    fontSize: 12,
    color: '#888',
  },
  planFeatureMissing: {
    fontSize: 12,
    color: '#555',
  },
  planFeatureHighlight: {
    fontSize: 12,
    color: '#ccc',
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
  subscribePriceText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 4,
  },
  trialText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    marginTop: 12,
  },
  alreadyPremium: {
    marginTop: 20,
    alignItems: 'center',
  },
  alreadyPremiumText: {
    color: '#888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
