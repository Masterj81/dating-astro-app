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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { PurchasesPackage } from 'react-native-purchases';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppCard } from '../../components/ui/AppCard';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { TierBadge } from '../../components/ui/TierBadge';
import { CELESTIAL_FEATURE_KEYS, COSMIC_FEATURE_KEYS } from '../../constants/premiumCatalog';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { getAllTierPackages, purchasePackage } from '../../services/purchases';
import { claimPlayPromoCode, ClaimedPlayPromoCampaign } from '../../services/promoCodes';

type BillingCycle = 'monthly' | 'annual';
type TierKind = 'celestial' | 'cosmic';

type TierPackages = {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
};

const EMPTY_TIER_PACKAGES: TierPackages = {
  monthly: null,
  annual: null,
};

export default function PremiumPlansScreen() {
  const [celestialPackages, setCelestialPackages] = useState<TierPackages>(EMPTY_TIER_PACKAGES);
  const [cosmicPackages, setCosmicPackages] = useState<TierPackages>(EMPTY_TIER_PACKAGES);
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('monthly');
  const [purchasingTier, setPurchasingTier] = useState<TierKind | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoClaimedCode, setPromoClaimedCode] = useState<string | null>(null);
  const [promoClaimedCampaign, setPromoClaimedCampaign] = useState<ClaimedPlayPromoCampaign | null>(null);
  const [applyingPromo, setApplyingPromo] = useState(false);

  const { t } = useLanguage();
  const { refreshSubscription, tier } = usePremium();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const celestialTierLabel = t('celestialTier') || 'Celestial';
  const cosmicTierLabel = t('cosmicTier') || 'Cosmic';

  useEffect(() => {
    if (Platform.OS === 'web' && isFocused) {
      router.replace('/(tabs)/premium' as any);
    }
  }, [isFocused]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      void loadPackages();
    }
  }, []);

  const loadPackages = async () => {
    try {
      setLoadError(null);

      const allPackages = await getAllTierPackages();

      setCelestialPackages({
        monthly: allPackages.celestial.monthly,
        annual: allPackages.celestial.annual,
      });
      setCosmicPackages({
        monthly: allPackages.cosmic.monthly,
        annual: allPackages.cosmic.annual,
      });

      if (!allPackages.celestial.monthly && !allPackages.celestial.annual) {
        setLoadError('No celestial packages returned by RevenueCat');
      }
    } catch (error) {
      console.error('[Plans] Failed to load packages:', error);
      setLoadError(String(error));
    }
  };

  const getPackageForTier = (tier: TierKind): PurchasesPackage | null => {
    const tierPackages = tier === 'celestial' ? celestialPackages : cosmicPackages;
    return selectedCycle === 'monthly' ? tierPackages.monthly : tierPackages.annual;
  };

  const getPriceForTier = (tier: TierKind): string => {
    return getPackageForTier(tier)?.product.priceString || '-';
  };

  const handlePurchase = async (targetTier: TierKind) => {
    if (Platform.OS === 'web') {
      router.push('/(tabs)/premium' as any);
      return;
    }

    const pkg = getPackageForTier(targetTier);

    if (!pkg) {
      Alert.alert(
        t('error') || 'Error',
        t('packageNotAvailable') || 'Package not available. Please try again later.',
        [{ text: t('ok') || 'OK' }]
      );
      return;
    }

    setPurchasingTier(targetTier);
    try {
      const result = await purchasePackage(pkg, {
        isUpgrade: tier === 'premium' && targetTier === 'cosmic',
        promoCode: promoClaimedCode,
        promoCampaignMetadata: promoClaimedCampaign?.metadata ?? null,
      });

      if (result.success) {
        await refreshSubscription();
        const successMessage =
          targetTier === 'cosmic'
            ? t('premiumPlusActivated') || 'Subscription activated.'
            : t('premiumActivated') || 'Subscription activated.';

        Alert.alert(t('purchaseSuccess') || 'Success!', successMessage, [
          { text: t('ok') || 'OK', onPress: () => router.replace('/(tabs)/premium' as any) },
        ]);
      } else if (!result.cancelled) {
        Alert.alert(
          t('purchaseFailed') || 'Purchase Failed',
          t('purchaseError') || 'There was an error processing your purchase.',
          [{ text: t('ok') || 'OK' }]
        );
      }
    } catch (error) {
      console.error('[Plans] Purchase error:', error);
      Alert.alert(
        t('error') || 'Error',
        t('purchaseError') || 'There was an error processing your purchase.',
        [{ text: t('ok') || 'OK' }]
      );
    } finally {
      setPurchasingTier(null);
    }
  };

  const handleApplyPromo = async () => {
    setApplyingPromo(true);
    try {
      const billingCycle = selectedCycle === 'monthly' ? 'monthly' : 'yearly';
      const result = await claimPlayPromoCode(promoCode, billingCycle);
      if (!result.success) {
        Alert.alert(
          t('error') || 'Error',
          result.error || (t('promoApplyError') || 'Unable to apply promo code right now.'),
          [{ text: t('ok') || 'OK' }]
        );
        return;
      }

      const claimedCode = result.code ?? promoCode.trim().toUpperCase();
      setPromoClaimedCode(claimedCode);
      setPromoClaimedCampaign(result.campaign ?? null);
      setPromoCode(claimedCode);
      Alert.alert(
        t('promoAppliedTitle') || 'Promo applied',
        selectedCycle === 'monthly'
          ? t('promoAppliedBody') ||
            'Your promo has been reserved. Complete a monthly Google Play purchase to receive the extra 3 months after billing.'
          : t('promoAppliedYearlyBody') ||
            'Your promo has been reserved. Complete an annual Google Play purchase to unlock the discounted yearly offer.',
        [{ text: t('ok') || 'OK' }]
      );
    } finally {
      setApplyingPromo(false);
    }
  };

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
            <Text style={styles.closeText}>{'<'}</Text>
          </TouchableOpacity>

          <Text style={styles.heroEyebrow}>{t('plansEyebrow') || 'Your Cosmic Upgrade'}</Text>
          <Text style={styles.heroTitle}>{t('plansHeroTitle') || 'Find Your Perfect Plan'}</Text>
          <Text style={styles.heroSubtitle}>
            {t('plansHeroSubtitle') || 'Start with 7 days free \u2014 cancel anytime, no questions asked'}
          </Text>
        </View>

        <View style={styles.planSelector}>
          <TouchableOpacity
            style={[styles.planTab, selectedCycle === 'monthly' && styles.planTabActive]}
            onPress={() => setSelectedCycle('monthly')}
          >
            <Text style={styles.planTabLabel}>{t('monthly') || 'Monthly'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planTab, selectedCycle === 'annual' && styles.planTabActive]}
            onPress={() => setSelectedCycle('annual')}
          >
            <Text style={styles.planTabLabel}>{t('yearly') || 'Yearly'}</Text>
            <Text style={styles.planTabSavings}>{t('plansSaveBadge') || 'Save 50%'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.promoCard}>
          <Text style={styles.promoTitle}>{t('promoCodeTitle') || 'Promo code'}</Text>
          <Text style={styles.promoBody}>
            {selectedCycle === 'monthly'
              ? t('promoCodeBody') ||
                'Apply your promo code before checkout to unlock the campaign attached to your monthly Google Play purchase.'
              : t('promoCodeYearlyBody') ||
                'Apply your promo code before checkout to unlock the discounted yearly Google Play offer.'}
          </Text>
          <View style={styles.promoRow}>
            <TextInput
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('promoCodePlaceholder') || 'Enter code'}
              placeholderTextColor={AppTheme.colors.textMuted}
              style={styles.promoInput}
            />
            <TouchableOpacity
              style={[
                styles.promoButton,
                applyingPromo && styles.promoButtonDisabled,
              ]}
              disabled={applyingPromo}
              onPress={() => {
                void handleApplyPromo();
              }}
            >
              <Text style={styles.promoButtonText}>
                {applyingPromo ? t('applyingPromo') || 'Applying...' : t('applyPromo') || 'Apply'}
              </Text>
            </TouchableOpacity>
          </View>
          {promoClaimedCode ? (
            <Text style={styles.promoSuccess}>
              {t('promoAppliedInline') || 'Promo reserved:'} {promoClaimedCode}
            </Text>
          ) : null}
        </View>

        <View style={styles.cardsStack}>
          <PlanCard
            tier="celestial"
            label={celestialTierLabel}
            price={getPriceForTier('celestial')}
            description={
              t('plansCelestialDesc') ||
              'See who likes you, unlock full birth charts, and find matches with 94% compatibility accuracy.'
            }
            featureKeys={CELESTIAL_FEATURE_KEYS}
            selectedCycle={selectedCycle}
            loading={purchasingTier === 'celestial'}
            disabled={!getPackageForTier('celestial')}
            onPress={() => handlePurchase('celestial')}
            actionLabel={t('plansCelestialCta') || `Start Free Trial`}
            actionSubtitle={t('celestialFeatures') || 'Celestial Features'}
          />

          <PlanCard
            tier="cosmic"
            label={cosmicTierLabel}
            price={getPriceForTier('cosmic')}
            description={
              t('plansCosmicDesc') ||
              'Everything in Celestial plus daily love forecasts, lucky timing, and planetary alerts \u2014 the complete cosmic dating toolkit.'
            }
            featureKeys={COSMIC_FEATURE_KEYS}
            selectedCycle={selectedCycle}
            loading={purchasingTier === 'cosmic'}
            disabled={!getPackageForTier('cosmic')}
            onPress={() => handlePurchase('cosmic')}
            actionLabel={t('plansCosmicCta') || `Start Free Trial`}
            actionSubtitle={t('cosmicFeatures') || 'Cosmic Features'}
            billingNote={tier === 'premium' ? t('upgradeBillingNote') : undefined}
            highlight
          />
        </View>

        {loadError ? <Text style={styles.errorText}>{loadError}</Text> : null}

        {/* Trial reassurance block */}
        <View style={styles.trialReassurance}>
          <Text style={styles.trialReassuranceTitle}>{t('plansTrialTitle') || 'Try risk-free for 7 days'}</Text>
          <Text style={styles.trialReassuranceDesc}>
            {t('plansTrialDesc') || 'You won\u2019t be charged during your trial. Cancel anytime in 30 seconds from your device settings.'}
          </Text>
        </View>
        <Text style={styles.trialText}>{t('plansSocialProof') || 'Trusted by 12,000+ cosmic seekers worldwide'}</Text>
      </ScrollView>
    </LinearGradient>
  );
}

type PlanCardProps = {
  tier: TierKind;
  label: string;
  price: string;
  description: string;
  featureKeys: readonly string[];
  selectedCycle: BillingCycle;
  actionLabel: string;
  actionSubtitle: string;
  billingNote?: string;
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
  highlight?: boolean;
};

function PlanCard({
  tier,
  label,
  price,
  description,
  featureKeys,
  selectedCycle,
  actionLabel,
  actionSubtitle,
  billingNote,
  disabled,
  loading,
  onPress,
  highlight = false,
}: PlanCardProps) {
  const { t } = useLanguage();
  const cycleLabel = selectedCycle === 'monthly' ? t('monthly') || 'Monthly' : t('yearly') || 'Yearly';

  return (
    <AppCard
      elevated={highlight}
      style={highlight ? styles.planCardHighlight : styles.planCardBase}
    >
      <View style={styles.planHeader}>
        <View style={styles.planTitleRow}>
          <TierBadge tier={tier} label={label} />
          {highlight ? <Text style={styles.planPill}>{t('mostPopular') || 'Most Popular'}</Text> : null}
        </View>
        <Text style={styles.planDescription}>{description}</Text>
      </View>

      <View style={[styles.pricePanel, highlight && styles.pricePanelHighlight]}>
        <Text style={styles.planPrice}>{price}</Text>
        <Text style={styles.planCycle}>{cycleLabel}</Text>
      </View>

      <View style={styles.featurePanel}>
        <Text style={styles.featureSectionTitle}>{t('includedFeatures') || 'Included Features'}</Text>
        <View style={styles.featureList}>
          {featureKeys.map((featureKey) => (
            <View key={featureKey} style={styles.featureRow}>
              <View style={[styles.featureDot, highlight && styles.featureDotHighlight]} />
              <Text style={styles.featureItem}>{t(featureKey)}</Text>
            </View>
          ))}
        </View>
      </View>

      <PrimaryButton
        label={actionLabel}
        subtitle={`${price} • ${actionSubtitle}`}
        onPress={onPress}
        loading={loading}
        disabled={disabled}
        style={styles.cardButton}
      />
      {billingNote ? <Text style={styles.billingNote}>{billingNote}</Text> : null}
    </AppCard>
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
    fontWeight: '700',
  },
  heroEyebrow: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroTitle: {
    ...AppTheme.type.display,
    color: AppTheme.colors.textPrimary,
  },
  heroSubtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    maxWidth: 360,
  },
  planSelector: {
    flexDirection: 'row',
    gap: AppTheme.spacing.md,
    marginBottom: AppTheme.spacing.xxl,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.xl,
    padding: AppTheme.spacing.sm,
  },
  planTab: {
    flex: 1,
    borderRadius: AppTheme.radius.lg,
    paddingVertical: AppTheme.spacing.lg,
    alignItems: 'center',
  },
  planTabActive: {
    backgroundColor: 'rgba(124,108,255,0.16)',
  },
  planTabLabel: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textPrimary,
  },
  planTabSavings: {
    fontSize: 10,
    fontWeight: '800',
    color: AppTheme.colors.coral,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cardsStack: {
    gap: AppTheme.spacing.lg,
  },
  promoCard: {
    marginBottom: AppTheme.spacing.xl,
    padding: AppTheme.spacing.lg,
    borderRadius: AppTheme.radius.xl,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
    gap: AppTheme.spacing.sm,
  },
  promoTitle: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
  },
  promoBody: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
  },
  promoRow: {
    flexDirection: 'row',
    gap: AppTheme.spacing.sm,
    marginTop: AppTheme.spacing.sm,
  },
  promoInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: AppTheme.radius.lg,
    paddingHorizontal: AppTheme.spacing.lg,
    paddingVertical: AppTheme.spacing.md,
    color: AppTheme.colors.textPrimary,
    backgroundColor: 'rgba(11,11,20,0.28)',
  },
  promoButton: {
    paddingHorizontal: AppTheme.spacing.lg,
    paddingVertical: AppTheme.spacing.md,
    borderRadius: AppTheme.radius.lg,
    backgroundColor: AppTheme.colors.cosmic,
    justifyContent: 'center',
  },
  promoButtonDisabled: {
    opacity: 0.55,
  },
  promoButtonText: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textOnAccent,
  },
  promoSuccess: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.success,
    marginTop: AppTheme.spacing.xs,
  },
  planCardBase: {
    marginBottom: AppTheme.spacing.lg,
    overflow: 'hidden',
    borderColor: AppTheme.colors.border,
  },
  planCardHighlight: {
    marginBottom: AppTheme.spacing.lg,
    overflow: 'hidden',
    borderColor: 'rgba(124,108,255,0.35)',
    backgroundColor: 'rgba(124,108,255,0.10)',
  },
  planHeader: {
    marginBottom: AppTheme.spacing.lg,
    gap: AppTheme.spacing.md,
  },
  planTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planPill: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textOnAccent,
    backgroundColor: AppTheme.colors.cosmic,
    paddingHorizontal: AppTheme.spacing.md,
    paddingVertical: 6,
    borderRadius: AppTheme.radius.pill,
    overflow: 'hidden',
  },
  pricePanel: {
    padding: AppTheme.spacing.lg,
    borderRadius: AppTheme.radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    marginBottom: AppTheme.spacing.lg,
  },
  pricePanelHighlight: {
    backgroundColor: 'rgba(124,108,255,0.12)',
    borderColor: 'rgba(124,108,255,0.28)',
  },
  planPrice: {
    fontSize: 32,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  planCycle: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: AppTheme.spacing.xs,
  },
  planDescription: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
  },
  featurePanel: {
    padding: AppTheme.spacing.lg,
    borderRadius: AppTheme.radius.lg,
    backgroundColor: 'rgba(11,11,20,0.28)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  featureSectionTitle: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
    marginBottom: AppTheme.spacing.md,
  },
  featureList: {
    gap: AppTheme.spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: AppTheme.spacing.sm,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AppTheme.colors.gold,
    marginTop: 7,
  },
  featureDotHighlight: {
    backgroundColor: AppTheme.colors.cosmic,
  },
  featureItem: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
    flex: 1,
  },
  cardButton: {
    marginTop: AppTheme.spacing.xl,
  },
  billingNote: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textSecondary,
    marginTop: AppTheme.spacing.md,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorText: {
    color: AppTheme.colors.danger,
    textAlign: 'center',
    marginTop: AppTheme.spacing.md,
  },
  trialReassurance: {
    marginTop: AppTheme.spacing.xl,
    padding: AppTheme.spacing.lg,
    borderRadius: AppTheme.radius.xl,
    backgroundColor: 'rgba(218, 181, 109, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(218, 181, 109, 0.20)',
    alignItems: 'center',
  },
  trialReassuranceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: AppTheme.colors.gold,
    marginBottom: 6,
  },
  trialReassuranceDesc: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  trialText: {
    color: AppTheme.colors.textMuted,
    textAlign: 'center',
    fontSize: 13,
    marginTop: AppTheme.spacing.lg,
    marginBottom: AppTheme.spacing.xl,
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
});
