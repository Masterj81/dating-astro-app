import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConstellationBg } from '../../components/astrology/ConstellationBg';
import { AnimatedGradientBg } from '../../components/ui/AnimatedGradientBg';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import WebTabWrapper from '../../components/WebTabWrapper';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';

const CELESTIAL_FEATURES = [
  { key: 'fullNatalChart', icon: '🌟', route: '/premium-screens/natal-chart' },
  { key: 'advancedSynastry', icon: '💕', route: '/premium-screens/synastry' },
  { key: 'seeWhoLikes', icon: '❤️', route: '/premium-screens/likes' },
  { key: 'superLikes', icon: '⭐', route: '/premium-screens/super-likes' },
  { key: 'priorityMessages', icon: '💬', route: '/premium-screens/priority-messages' },
];

const COSMIC_FEATURES = [
  { key: 'dailyHoroscope', icon: '🔮', route: '/premium-screens/daily-horoscope' },
  { key: 'monthlyHoroscope', icon: '📅', route: '/premium-screens/monthly-horoscope' },
  { key: 'planetaryTransits', icon: '🪐', route: '/premium-screens/planetary-transits' },
  { key: 'luckyDays', icon: '🍀', route: '/premium-screens/lucky-days' },
  { key: 'datePlanner', icon: '💫', route: '/premium-screens/date-planner' },
];

function FeatureCard({
  title,
  icon,
  onPress,
  locked = false,
}: {
  title: string;
  icon: string;
  onPress: () => void;
  locked?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, locked && styles.lockedCard]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Text style={styles.cardIcon}>{icon}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      {locked ? (
        <View style={styles.lockBadge}>
          <Text style={styles.lockBadgeText}>{'\u{2728}'} Cosmic</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export default function PremiumDashboard() {
  const { t } = useLanguage();
  const { tier, loading } = usePremium();
  const insets = useSafeAreaInsets();

  const isPremiumPlus = tier === 'premium_plus';
  const hasAccess = tier !== 'free';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={AppTheme.colors.coral} />
      </View>
    );
  }

  if (!hasAccess) {
    return <Redirect href={'/premium-screens/plans' as any} />;
  }

  if (Platform.OS === 'web') {
    return (
      <WebTabWrapper
        background={`linear-gradient(180deg, ${AppTheme.colors.heroStart} 0%, ${AppTheme.colors.heroMid} 50%, ${AppTheme.colors.heroEnd} 100%)`}
        padding={20}
        paddingTop={40}
      >
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: AppTheme.colors.textPrimary, marginBottom: 8, margin: 0 }}>
            {t('cosmicHub') || 'Cosmic Hub'}
          </h1>
          <p style={{ fontSize: 16, color: AppTheme.colors.coral, fontWeight: 600, margin: 0 }}>
            {isPremiumPlus ? `🌌 ${t('cosmicMember') || 'Cosmic Member'}` : `✨ ${t('celestialMember') || 'Celestial Member'}`}
          </p>
        </div>

        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: AppTheme.colors.textMuted, margin: '0 0 15px', textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('celestialFeatures') || 'Celestial Features'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {CELESTIAL_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => router.push(feature.route as any)}
                style={{
                  backgroundColor: AppTheme.colors.panel,
                  borderRadius: 20,
                  padding: 20,
                  width: 'calc(50% - 6px)',
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: `1px solid ${AppTheme.colors.border}`,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: AppTheme.colors.textPrimary, fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: AppTheme.colors.textMuted, margin: '0 0 15px', textTransform: 'uppercase', letterSpacing: 1 }}>
            {t('cosmicFeatures') || 'Cosmic Features'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {COSMIC_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => {
                  if (isPremiumPlus) {
                    router.push(feature.route as any);
                    return;
                  }
                  router.push('/premium-screens/plus');
                }}
                style={{
                  backgroundColor: AppTheme.colors.panel,
                  borderRadius: 20,
                  padding: 20,
                  width: 'calc(50% - 6px)',
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: `1px solid ${AppTheme.colors.border}`,
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  opacity: isPremiumPlus ? 1 : 0.58,
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: AppTheme.colors.textPrimary, fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
                {!isPremiumPlus ? <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 14 }}>🔒</span> : null}
              </div>
            ))}
          </div>
        </div>

        {!isPremiumPlus ? (
          <div
            onClick={() => router.push('/premium-screens/plus')}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(124, 108, 255, 0.14)',
              borderRadius: 16,
              padding: 16,
              border: '1px solid rgba(124, 108, 255, 0.22)',
              marginTop: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 32, marginRight: 12 }}>🌌</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: AppTheme.colors.textPrimary, fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {t('upgradeToCosmic') || 'Upgrade to Cosmic'}
              </div>
              <div style={{ color: AppTheme.colors.textSecondary, fontSize: 13 }}>
                {t('unlockAllFeatures') || 'Unlock daily horoscopes, transits & more'}
              </div>
            </div>
            <span style={{ color: AppTheme.colors.cosmic, fontSize: 20, fontWeight: 'bold' }}>→</span>
          </div>
        ) : null}
      </WebTabWrapper>
    );
  }

  return (
    <AnimatedGradientBg style={styles.container}>
      <ConstellationBg density={20} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('cosmicHub') || 'Cosmic Hub'}</Text>
          <Text style={styles.subtitle}>
            {isPremiumPlus ? `🌌 ${t('cosmicMember') || 'Cosmic Member'}` : `✨ ${t('celestialMember') || 'Celestial Member'}`}
          </Text>
          <Text style={styles.headerWelcome}>
            {t('hubWelcome') || 'Your cosmic toolkit is ready. Explore the features below.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('celestialFeatures') || 'Celestial Features'}</Text>
          <View style={styles.grid}>
            {CELESTIAL_FEATURES.map((feature) => (
              <FeatureCard
                key={feature.key}
                title={t(feature.key) || feature.key}
                icon={feature.icon}
                onPress={() => router.push(feature.route as any)}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('cosmicFeatures') || 'Cosmic Features'}</Text>
          <View style={styles.grid}>
            {COSMIC_FEATURES.map((feature) => (
              <FeatureCard
                key={feature.key}
                title={t(feature.key) || feature.key}
                icon={feature.icon}
                locked={!isPremiumPlus}
                onPress={() => {
                  if (isPremiumPlus) {
                    router.push(feature.route as any);
                    return;
                  }
                  router.push('/premium-screens/plus');
                }}
              />
            ))}
          </View>
        </View>

        {!isPremiumPlus ? (
          <TouchableOpacity style={styles.upgradeBanner} onPress={() => router.push('/premium-screens/plus')}>
            <Text style={styles.upgradeIcon}>🌌</Text>
            <View style={styles.upgradeTextContainer}>
              <Text style={styles.upgradeTitle}>{t('hubUpgradeTitle') || 'Go Cosmic for the Full Experience'}</Text>
              <Text style={styles.upgradeDescription}>
                {t('hubUpgradeDesc') || 'Daily love forecasts, lucky timing, planetary alerts \u2014 everything the stars offer'}
              </Text>
            </View>
            <Text style={styles.upgradeArrow}>→</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </AnimatedGradientBg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: '100%' as any,
          width: '100%' as any,
        }
      : {}),
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: AppTheme.colors.heroStart,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: '100%' as any,
          overflowY: 'auto' as any,
        }
      : {}),
  },
  content: {
    padding: AppTheme.spacing.xl,
  },
  header: {
    marginBottom: 36,
  },
  title: {
    ...AppTheme.type.hero,
    color: AppTheme.colors.textPrimary,
    marginBottom: AppTheme.spacing.sm,
  },
  subtitle: {
    ...AppTheme.type.body,
    color: AppTheme.colors.coral,
    fontWeight: '700',
  },
  headerWelcome: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    marginTop: 8,
    lineHeight: 20,
  },
  section: {
    marginBottom: 36,
  },
  sectionTitle: {
    ...AppTheme.type.micro,
    color: AppTheme.colors.textMuted,
    marginBottom: AppTheme.spacing.lg,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: AppTheme.spacing.md,
  },
  card: {
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.xl,
    padding: AppTheme.spacing.xl,
    width: '47%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorderElevated,
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  lockedCard: {
    opacity: 0.60,
    borderColor: AppTheme.colors.premiumCosmicBorder,
    backgroundColor: 'rgba(124,108,255,0.05)',
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: AppTheme.spacing.md,
  },
  cardTitle: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textPrimary,
    fontWeight: '700',
    textAlign: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(124, 108, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: AppTheme.radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.30)',
  },
  lockBadgeText: {
    ...AppTheme.type.micro,
    color: AppTheme.colors.cosmic,
    fontWeight: '700',
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.premiumCosmicSoft,
    borderRadius: AppTheme.radius.xl,
    padding: AppTheme.spacing.xl,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumCosmicBorder,
    marginTop: AppTheme.spacing.md,
    shadowColor: AppTheme.colors.cosmic,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  upgradeIcon: {
    fontSize: 36,
    marginRight: 14,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    color: AppTheme.colors.textPrimary,
    ...AppTheme.type.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  upgradeDescription: {
    color: AppTheme.colors.textSecondary,
    ...AppTheme.type.caption,
  },
  upgradeArrow: {
    color: AppTheme.colors.cosmic,
    fontSize: 22,
    fontWeight: 'bold',
  },
});
