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
import { CELESTIAL_FEATURE_KEYS, COSMIC_FEATURE_KEYS } from '../../constants/premiumCatalog';
import { AppTheme } from '../../constants/theme';
import { AppCard } from '../../components/ui/AppCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TierBadge } from '../../components/ui/TierBadge';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { getAllTierPackages, purchasePackage } from '../../services/purchases';

export default function PremiumPlusScreen() {
  const [purchasing, setPurchasing] = useState(false);

  const [celestialMonthlyPackage, setCelestialMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [celestialAnnualPackage, setCelestialAnnualPackage] = useState<PurchasesPackage | null>(null);
  const [cosmicMonthlyPackage, setCosmicMonthlyPackage] = useState<PurchasesPackage | null>(null);
  const [cosmicAnnualPackage, setCosmicAnnualPackage] = useState<PurchasesPackage | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly');
  const [loadError, setLoadError] = useState<string | null>(null);

  const { t } = useLanguage();
  const { refreshSubscription, tier } = usePremium();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const celestialTierLabel = t('celestialTier') || 'Celestial';
  const cosmicTierLabel = t('cosmicTier') || 'Cosmic';

  // Web: redirect to premium tab
  useEffect(() => {
    if (Platform.OS === 'web' && isFocused) {
      router.replace('/(tabs)/premium' as any);
    }
  }, [isFocused]);

  // Native: load packages
  useEffect(() => {
    if (Platform.OS !== 'web') {
      loadPackages();
    }
  }, []);

  const loadPackages = async () => {
    try {
      setLoadError(null);

      const allPackages = await getAllTierPackages();

      console.log('[Plus] resolved packages', {
        celestialMonthly: allPackages.celestial.monthly
          ? {
              identifier: allPackages.celestial.monthly.identifier,
              packageType: String(allPackages.celestial.monthly.packageType),
              priceString: allPackages.celestial.monthly.product.priceString,
            }
          : null,
        celestialAnnual: allPackages.celestial.annual
          ? {
              identifier: allPackages.celestial.annual.identifier,
              packageType: String(allPackages.celestial.annual.packageType),
              priceString: allPackages.celestial.annual.product.priceString,
            }
          : null,
        cosmicMonthly: allPackages.cosmic.monthly
          ? {
              identifier: allPackages.cosmic.monthly.identifier,
              packageType: String(allPackages.cosmic.monthly.packageType),
              priceString: allPackages.cosmic.monthly.product.priceString,
            }
          : null,
        cosmicAnnual: allPackages.cosmic.annual
          ? {
              identifier: allPackages.cosmic.annual.identifier,
              packageType: String(allPackages.cosmic.annual.packageType),
              priceString: allPackages.cosmic.annual.product.priceString,
            }
          : null,
      });

      setCelestialMonthlyPackage(allPackages.celestial.monthly);
      setCelestialAnnualPackage(allPackages.celestial.annual);
      setCosmicMonthlyPackage(allPackages.cosmic.monthly);
      setCosmicAnnualPackage(allPackages.cosmic.annual);

      if (!allPackages.cosmic.monthly && allPackages.cosmic.annual) {
        setSelectedPlan('annual');
      }

      if (!allPackages.cosmic.monthly && !allPackages.cosmic.annual) {
        setLoadError('No cosmic packages returned by RevenueCat');
      }
    } catch (error) {
      console.error('[Plus] Failed to load packages:', error);
      setLoadError(String(error));
    }
  };

  const currentCosmicPackage =
    selectedPlan === 'monthly' ? cosmicMonthlyPackage : cosmicAnnualPackage;

  const currentCelestialPrice =
    selectedPlan === 'monthly'
      ? celestialMonthlyPackage?.product.priceString
      : celestialAnnualPackage?.product.priceString;

  const currentCosmicPrice = currentCosmicPackage?.product.priceString;
  const isCelestialUpgrade = tier === 'premium';

  const handlePurchase = async () => {
    if (Platform.OS === 'web') {
      router.push('/(tabs)/premium' as any);
      return;
    }

    if (!currentCosmicPackage) {
      const debugInfo = __DEV__
        ? `\n\nDebug: cosmicMonthly=${!!cosmicMonthlyPackage} cosmicAnnual=${!!cosmicAnnualPackage} error=${loadError ?? 'none'}`
        : '';

      Alert.alert(
        t('error') || 'Error',
        (t('packageNotAvailable') || 'Package not available. Please try again later.') + debugInfo,
        [{ text: t('ok') || 'OK' }]
      );
      return;
    }

    setPurchasing(true);
    try {
      const result = await purchasePackage(currentCosmicPackage, {
        isUpgrade: isCelestialUpgrade,
      });

      if (result.success) {
        await refreshSubscription();
        Alert.alert(
          t('purchaseSuccess') || 'Success!',
          t('premiumPlusActivated') || 'Subscription activated.',
          [{ text: t('ok') || 'OK', onPress: () => router.back() }]
        );
      } else if (!result.cancelled) {
        Alert.alert(
          t('purchaseFailed') || 'Purchase Failed',
          t('purchaseError') || 'There was an error processing your purchase.',
          [{ text: t('ok') || 'OK' }]
        );
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert(
        t('error') || 'Error',
        t('purchaseError') || 'There was an error processing your purchase.',
        [{ text: t('ok') || 'OK' }]
      );
    } finally {
      setPurchasing(false);
    }
  };

  // Web: show loading screen while redirecting
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRedirectContainer}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.webRedirectText}>
          {t('redirectingToPlans') || 'Redirecting to subscription plans...'}
        </Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: 56 + insets.top }]}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>←</Text>
          </TouchableOpacity>

          <TierBadge tier="cosmic" label={cosmicTierLabel} />
          <Text style={styles.heroTitle}>{cosmicTierLabel}</Text>
          <Text style={styles.heroSubtitle}>{t('premiumPlusSubtitle')}</Text>
        </View>

        <View style={styles.planSelector}>
          <TouchableOpacity
            style={[styles.planTab, selectedPlan === 'monthly' && styles.planTabActive]}
            onPress={() => setSelectedPlan('monthly')}
            disabled={!cosmicMonthlyPackage}
          >
            <Text style={styles.planTabLabel}>{t('monthly')}</Text>
            <Text style={styles.planTabPrice}>{cosmicMonthlyPackage?.product.priceString || '—'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planTab, selectedPlan === 'annual' && styles.planTabActive]}
            onPress={() => setSelectedPlan('annual')}
            disabled={!cosmicAnnualPackage}
          >
            <Text style={styles.planTabLabel}>{t('yearly')}</Text>
            <Text style={styles.planTabPrice}>{cosmicAnnualPackage?.product.priceString || '—'}</Text>
          </TouchableOpacity>
        </View>

        <AppCard elevated style={styles.compareCard}>
          <View style={styles.compareColumn}>
            <TierBadge tier="celestial" label={celestialTierLabel} />
            <Text style={styles.comparePrice}>{currentCelestialPrice || '—'}</Text>
            <View style={styles.featureList}>
              {CELESTIAL_FEATURE_KEYS.map((featureKey) => (
                <Text key={featureKey} style={styles.featureItem}>
                  {'• '}{t(featureKey)}
                </Text>
              ))}
            </View>
          </View>

          <View style={styles.compareDivider} />

          <View style={styles.compareColumn}>
            <TierBadge tier="cosmic" label={cosmicTierLabel} />
            <Text style={styles.comparePrice}>{currentCosmicPrice || '—'}</Text>
            <View style={styles.featureList}>
              {COSMIC_FEATURE_KEYS.map((featureKey) => (
                <Text key={featureKey} style={styles.featureItem}>
                  {'• '}{t(featureKey)}
                </Text>
              ))}
            </View>
          </View>
        </AppCard>

        <PrimaryButton
          label={t('upgradeToTier', { tier: cosmicTierLabel })}
          subtitle={currentCosmicPrice || undefined}
          onPress={handlePurchase}
          loading={purchasing}
          disabled={!currentCosmicPackage}
          style={styles.cta}
        />

        {isCelestialUpgrade ? (
          <Text style={styles.upgradeNote}>
            {t('upgradeBillingNote') ||
              'You already have Celestial. The store will calculate the final Cosmic upgrade charge at checkout.'}
          </Text>
        ) : null}

        <Text style={styles.trialText}>{t('trialInfo')}</Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: AppTheme.spacing.xl,
  },
  hero: {
    paddingBottom: AppTheme.spacing.xxxl,
    gap: AppTheme.spacing.md,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: AppTheme.radius.pill,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: AppTheme.spacing.lg,
  },
  closeText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 22,
  },
  heroTitle: {
    ...AppTheme.type.display,
    color: AppTheme.colors.textPrimary,
  },
  heroSubtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    maxWidth: 320,
  },
  planSelector: {
    flexDirection: 'row',
    gap: AppTheme.spacing.md,
    marginBottom: AppTheme.spacing.xxl,
  },
  planTab: {
    flex: 1,
    borderRadius: AppTheme.radius.lg,
    padding: AppTheme.spacing.lg,
    backgroundColor: AppTheme.colors.glass,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  planTabActive: {
    backgroundColor: 'rgba(124,108,255,0.12)',
    borderColor: 'rgba(124,108,255,0.35)',
  },
  planTabLabel: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    marginBottom: AppTheme.spacing.sm,
  },
  planTabPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  compareCard: {
    flexDirection: 'row',
    marginBottom: AppTheme.spacing.xxl,
  },
  compareColumn: {
    flex: 1,
    gap: AppTheme.spacing.md,
  },
  featureList: {
    gap: AppTheme.spacing.sm,
  },
  featureItem: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  compareDivider: {
    width: 1,
    backgroundColor: AppTheme.colors.border,
    marginHorizontal: AppTheme.spacing.lg,
  },
  comparePrice: {
    fontSize: 28,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  cta: {
    marginBottom: AppTheme.spacing.lg,
  },
  upgradeNote: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: AppTheme.spacing.md,
  },
  webRedirectContainer: {
    flex: 1,
    backgroundColor: AppTheme.colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  webRedirectText: {
    color: AppTheme.colors.textPrimary,
    marginTop: 12,
    fontSize: 16,
  },
  trialText: {
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginBottom: AppTheme.spacing.xl,
  },
});
