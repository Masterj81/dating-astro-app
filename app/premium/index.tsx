import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useLanguage } from '../../contexts/LanguageContext';
import { getOfferings, purchasePackage, restorePurchases } from '../../services/purchases';

export default function PremiumScreen() {
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [, setRefresh] = useState(0);
  const { t } = useLanguage(); // Use t from context for reactive translations

  const PREMIUM_FEATURES = [
    { emoji: '♾️', title: t('unlimitedSwipes'), description: t('unlimitedSwipesDesc'), route: null },
    { emoji: '🌙', title: t('fullNatalChart'), description: t('fullNatalChartDesc'), route: '/premium/natal-chart' },
    { emoji: '💫', title: t('advancedSynastry'), description: t('advancedSynastryDesc'), route: '/premium/synastry' },
    { emoji: '⭐', title: t('superLikes'), description: t('superLikesDesc'), route: '/premium/super-likes' },
    { emoji: '🔮', title: t('seeWhoLikes'), description: t('seeWhoLikesDesc'), route: '/premium/likes' },
    { emoji: '💬', title: t('priorityMessages'), description: t('priorityMessagesDesc'), route: '/premium/priority-messages' },
  ];

  useEffect(() => {
    loadOfferings();
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
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
              style={styles.featureRow}
              onPress={() => feature.route && router.push(feature.route as any)}
              activeOpacity={feature.route ? 0.7 : 1}
            >
              <Text style={styles.featureEmoji}>{feature.emoji}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
              {feature.route && (
                <Text style={styles.featureArrow}>→</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricing}>
          {loading ? (
            <ActivityIndicator color="#e94560" />
          ) : packages.length > 0 ? (
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

        {/* Restore */}
        <TouchableOpacity style={styles.restoreButton} onPress={handleRestore}>
          <Text style={styles.restoreText}>{t('restorePurchases')}</Text>
        </TouchableOpacity>

        {/* Premium Plus Upsell */}
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
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    color: '#e94560',
    marginLeft: 8,
  },
  pricing: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
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
