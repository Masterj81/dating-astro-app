import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, router } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import { useAuth } from '../../contexts/AuthContext';

// Feature cards for the dashboard
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

function FeatureCard({ title, icon, onPress, locked = false }: {
  title: string;
  icon: string;
  onPress: () => void;
  locked?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.card, locked && styles.lockedCard]}
      onPress={onPress}
      disabled={locked}
      activeOpacity={0.7}
    >
      <Text style={styles.cardIcon}>{icon}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      {locked && <Text style={styles.lockText}>🔒</Text>}
    </TouchableOpacity>
  );
}

export default function PremiumDashboard() {
  const { t } = useLanguage();
  const { tier, loading } = usePremium();
  const { user: _user } = useAuth();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const isPremiumPlus = tier === 'premium_plus';
  const hasAccess = tier !== 'free';

  // Show loading state
  if (loading) {
    return <View style={styles.loadingContainer} />;
  }

  // Redirect free users to the paywall
  if (!hasAccess) {
    return <Redirect href="/premium-screens/plus" />;
  }

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
        bottom: 60,
        background: 'linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
        padding: 20,
        paddingTop: 40,
        overflowY: 'auto',
        zIndex: 1
      }}>
        {/* Header */}
        <div style={{ marginBottom: 30 }}>
          <h1 style={{ fontSize: 32, fontWeight: 'bold', color: '#fff', marginBottom: 8, margin: 0 }}>
            {t('cosmicHub') || 'Cosmic Hub'}
          </h1>
          <p style={{ fontSize: 16, color: '#e94560', fontWeight: 600, margin: 0 }}>
            {isPremiumPlus ? '🌌 ' + (t('cosmicMember') || 'Cosmic Member') : '✨ ' + (t('celestialMember') || 'Celestial Member')}
          </p>
        </div>

        {/* Celestial Features */}
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#888', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 15px' }}>
            {t('celestialFeatures') || 'Celestial Features'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {CELESTIAL_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => router.push(feature.route as any)}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: 20,
                  width: 'calc(50% - 6px)',
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: '#fff', fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Cosmic Features */}
        <div style={{ marginBottom: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#888', marginBottom: 15, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 15px' }}>
            {t('cosmicFeatures') || 'Cosmic Features'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {COSMIC_FEATURES.map((feature) => (
              <div
                key={feature.key}
                onClick={() => {
                  if (isPremiumPlus) {
                    router.push(feature.route as any);
                  } else {
                    router.push('/premium-screens/plus');
                  }
                }}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: 20,
                  width: 'calc(50% - 6px)',
                  aspectRatio: '1',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  opacity: isPremiumPlus ? 1 : 0.5,
                  position: 'relative'
                }}
              >
                <span style={{ fontSize: 36, marginBottom: 12 }}>{feature.icon}</span>
                <span style={{ color: '#fff', fontWeight: 600, textAlign: 'center', fontSize: 13 }}>
                  {t(feature.key) || feature.key}
                </span>
                {!isPremiumPlus && (
                  <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 14 }}>🔒</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Upgrade Banner */}
        {!isPremiumPlus && (
          <div
            onClick={() => router.push('/premium-screens/plus')}
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'rgba(147, 51, 234, 0.15)',
              borderRadius: 16,
              padding: 16,
              border: '1px solid rgba(147, 51, 234, 0.3)',
              marginTop: 10,
              cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 32, marginRight: 12 }}>🌌</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {t('upgradeToCosmic') || 'Upgrade to Cosmic'}
              </div>
              <div style={{ color: '#aaa', fontSize: 13 }}>
                {t('unlockAllFeatures') || 'Unlock daily horoscopes, transits & more'}
              </div>
            </div>
            <span style={{ color: '#9333ea', fontSize: 20, fontWeight: 'bold' }}>→</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t('cosmicHub') || 'Cosmic Hub'}</Text>
          <Text style={styles.subtitle}>
            {isPremiumPlus ? '🌌 ' + (t('cosmicMember') || 'Cosmic Member') : '✨ ' + (t('celestialMember') || 'Celestial Member')}
          </Text>
        </View>

        {/* Celestial Features */}
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

        {/* Cosmic Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('cosmicFeatures') || 'Cosmic Features'}</Text>
          <View style={styles.grid}>
            {COSMIC_FEATURES.map((feature) => (
              <FeatureCard
                key={feature.key}
                title={t(feature.key) || feature.key}
                icon={feature.icon}
                onPress={() => {
                  if (isPremiumPlus) {
                    router.push(feature.route as any);
                  } else {
                    router.push('/premium-screens/plus');
                  }
                }}
                locked={!isPremiumPlus}
              />
            ))}
          </View>
        </View>

        {/* Upgrade Banner for Celestial users */}
        {!isPremiumPlus && (
          <TouchableOpacity
            style={styles.upgradeBanner}
            onPress={() => router.push('/premium-screens/plus')}
          >
            <Text style={styles.upgradeIcon}>🌌</Text>
            <View style={styles.upgradeTextContainer}>
              <Text style={styles.upgradeTitle}>{t('upgradeToCosmic') || 'Upgrade to Cosmic'}</Text>
              <Text style={styles.upgradeDescription}>
                {t('unlockAllFeatures') || 'Unlock daily horoscopes, transits & more'}
              </Text>
            </View>
            <Text style={styles.upgradeArrow}>→</Text>
          </TouchableOpacity>
        )}
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: '100%' as any,
      overflowY: 'auto' as any,
    } : {}),
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#e94560',
    fontWeight: '600',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#888',
    marginBottom: 15,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 20,
    width: '47%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lockedCard: {
    opacity: 0.5,
  },
  cardIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  cardTitle: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 13,
  },
  lockText: {
    position: 'absolute',
    top: 12,
    right: 12,
    fontSize: 14,
  },
  upgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
    marginTop: 10,
  },
  upgradeIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  upgradeDescription: {
    color: '#aaa',
    fontSize: 13,
  },
  upgradeArrow: {
    color: '#9333ea',
    fontSize: 20,
    fontWeight: 'bold',
  },
});
