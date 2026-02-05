import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';

export default function PremiumPlusScreen() {
  const [purchasing, setPurchasing] = useState(false);
  const { t } = useLanguage();

  const PREMIUM_PLUS_FEATURES = [
    {
      emoji: '🌙',
      title: t('fullNatalChart'),
      description: t('fullNatalChartDesc'),
      route: '/premium/natal-chart',
      included: true
    },
    {
      emoji: '☀️',
      title: t('dailyHoroscopeFeature'),
      description: t('dailyHoroscopeDesc'),
      route: '/premium/daily-horoscope',
      included: true
    },
    {
      emoji: '📅',
      title: t('monthlyHoroscopeFeature'),
      description: t('monthlyHoroscopeDesc'),
      route: '/premium/monthly-horoscope',
      included: true
    },
    {
      emoji: '🔮',
      title: t('planetaryTransits'),
      description: t('planetaryTransitsDesc'),
      route: '/premium/planetary-transits',
      included: true
    },
    {
      emoji: '💫',
      title: t('retrogradeAlerts'),
      description: t('retrogradeAlertsDesc'),
      route: '/premium/retrograde-alerts',
      included: true
    },
    {
      emoji: '🌟',
      title: t('luckyDays'),
      description: t('luckyDaysDesc'),
      route: '/premium/lucky-days',
      included: true
    },
  ];

  const handlePurchase = async () => {
    setPurchasing(true);
    // Simulated purchase
    setTimeout(() => {
      setPurchasing(false);
      Alert.alert(
        t('testMode'),
        t('testModeMessage'),
        [{ text: t('ok'), onPress: () => router.back() }]
      );
    }, 1000);
  };

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>←</Text>
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Text style={styles.starIcon}>✨</Text>
            <View style={styles.plusBadge}>
              <Text style={styles.plusText}>PLUS</Text>
            </View>
          </View>
          <Text style={styles.title}>{t('premiumPlus')}</Text>
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
              <Text style={styles.planHeader}>{t('premium')}</Text>
              <Text style={styles.planPrice}>$9.99/{t('monthly').toLowerCase()}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>✓ {t('unlimitedSwipes')}</Text>
                <Text style={styles.planFeature}>✓ {t('advancedSynastry')}</Text>
                <Text style={styles.planFeature}>✓ {t('superLikes')}</Text>
                <Text style={styles.planFeature}>✓ {t('seeWhoLikes')}</Text>
                <Text style={styles.planFeatureMissing}>✗ {t('dailyHoroscopeFeature')}</Text>
                <Text style={styles.planFeatureMissing}>✗ {t('monthlyHoroscopeFeature')}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={[styles.planColumn, styles.planColumnHighlight]}>
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t('recommended')}</Text>
              </View>
              <Text style={styles.planHeaderHighlight}>{t('premiumPlus')}</Text>
              <Text style={styles.planPriceHighlight}>$14.99/{t('monthly').toLowerCase()}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeatureHighlight}>✓ {t('allPremiumFeatures')}</Text>
                <Text style={styles.planFeatureHighlight}>✓ {t('fullNatalChart')}</Text>
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
                <Text style={styles.subscribeText}>{t('upgradeToPremiumPlus')}</Text>
                <Text style={styles.subscribePriceText}>$14.99/{t('monthly').toLowerCase()}</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.trialText}>{t('trialInfo')}</Text>

        {/* Already Premium */}
        <TouchableOpacity style={styles.alreadyPremium} onPress={() => router.push('/premium')}>
          <Text style={styles.alreadyPremiumText}>{t('viewRegularPremium')}</Text>
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
