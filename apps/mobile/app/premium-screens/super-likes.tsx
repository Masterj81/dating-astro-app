import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

type SuperLikeStats = {
  available: number;
  maxDaily: number;
  usedToday: number;
  totalSent: number;
  matchRate: number;
};

function SuperLikesScreenContent() {
  const [stats, setStats] = useState<SuperLikeStats>({
    available: 5,
    maxDaily: 5,
    usedToday: 0,
    totalSent: 12,
    matchRate: 67,
  });
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setStats({
      available: 5,
      maxDaily: 5,
      usedToday: 0,
      totalSent: 12,
      matchRate: 67,
    });
  }, [user]);

  const benefits = [
    {
      emoji: '⭐',
      title: t('standOut') || 'Stand Out',
      description: t('standOutDesc') || 'Your profile appears at the top of their stack',
    },
    {
      emoji: '💫',
      title: t('higherMatchRate') || '3x Higher Match Rate',
      description: t('higherMatchRateDesc') || 'Super Likes are 3x more likely to result in a match',
    },
    {
      emoji: '💞',
      title: t('showInterest') || 'Show Special Interest',
      description: t('showInterestDesc') || 'Let them know you really like them before matching',
    },
    {
      emoji: '🔔',
      title: t('priorityNotification') || 'Priority Notification',
      description: t('priorityNotificationDesc') || 'They get a special notification about your Super Like',
    },
  ];

  const tips = [
    t('superLikeTip1') || 'Use Super Likes on profiles with high compatibility scores',
    t('superLikeTip2') || 'Read their bio carefully before using a Super Like',
    t('superLikeTip3') || 'Super Like at optimal times (evenings tend to work best)',
    t('superLikeTip4') || 'Save Super Likes for profiles that truly resonate with you',
  ];

  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.header, { paddingTop: 40 + topInset }]}>
        <TouchableOpacity style={[styles.backButton, { top: 30 + topInset }]} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('superLikes') || 'Super Likes'}</Text>
        <Text style={styles.subtitle}>{t('superLikesSubtitle') || 'Make a lasting first impression'}</Text>
      </View>


        <View style={styles.statsCard}>
          <View style={styles.mainStat}>
            <Text style={styles.mainStatNumber}>{stats.available}</Text>
            <Text style={styles.mainStatLabel}>{t('available') || 'Available'}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {stats.usedToday}/{stats.maxDaily}
              </Text>
              <Text style={styles.statLabel}>{t('usedToday') || 'Used Today'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.totalSent}</Text>
              <Text style={styles.statLabel}>{t('totalSent') || 'Total Sent'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.matchRate}%</Text>
              <Text style={styles.statLabel}>{t('matchRate') || 'Match Rate'}</Text>
            </View>
          </View>

          <View style={styles.refreshInfo}>
            <Text style={styles.refreshIcon}>🔄</Text>
            <Text style={styles.refreshText}>{t('superLikesRefresh') || 'Super Likes refresh daily at midnight'}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('howItWorks') || 'How It Works'}</Text>
          <View style={styles.stepsContainer}>
            {[
              {
                number: '1',
                title: t('swipeUp') || 'Swipe Up',
                description: t('swipeUpDesc') || 'Or tap the star icon on a profile you love',
              },
              {
                number: '2',
                title: t('theyGetNotified') || 'They Get Notified',
                description: t('theyGetNotifiedDesc') || 'Your profile appears with a special star highlight',
              },
              {
                number: '3',
                title: t('higherChance') || 'Higher Match Chance',
                description: t('higherChanceDesc') || "They know you're truly interested, increasing match probability",
              },
            ].map((step, index) => (
              <View key={step.number}>
                <View style={styles.step}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{step.number}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.description}</Text>
                  </View>
                </View>
                {index < 2 ? <View style={styles.stepConnector} /> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('benefits') || 'Benefits'}</Text>
          {benefits.map((benefit) => (
            <View key={benefit.title} style={styles.benefitCard}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDesc}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('proTips') || 'Pro Tips'}</Text>
          <View style={styles.tipsCard}>
            {tips.map((tip) => (
              <View key={tip} style={styles.tipItem}>
                <Text style={styles.tipBullet}>✦</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/(tabs)/discover')}>
          <LinearGradient colors={[...AppTheme.gradients.cta]} style={styles.ctaGradient}>
            <Text style={styles.ctaIcon}>⭐</Text>
            <Text style={styles.ctaText}>{t('startSuperLiking') || 'Start Super Liking'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.premiumBadge}>
        <Text style={styles.premiumIcon}>⭐</Text>
        <Text style={styles.premiumText}>{t('premiumFeature') || 'Premium Feature'}</Text>
      </View>
    </LinearGradient>
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
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web'
      ? {
          height: 'calc(100vh - 120px)' as any,
          overflowY: 'auto' as any,
        }
      : {}),
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: AppTheme.colors.panelStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
  },
  statsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.25)',
    marginBottom: 24,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: 20,
  },
  mainStatNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    color: AppTheme.colors.coral,
  },
  mainStatLabel: {
    fontSize: 16,
    color: AppTheme.colors.textSecondary,
    marginTop: -4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: AppTheme.colors.border,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: AppTheme.colors.border,
  },
  refreshInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  refreshIcon: {
    fontSize: 14,
  },
  refreshText: {
    fontSize: 13,
    color: AppTheme.colors.textMuted,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 16,
  },
  stepsContainer: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: AppTheme.colors.coral,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    color: AppTheme.colors.textOnAccent,
    fontWeight: 'bold',
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  stepConnector: {
    width: 2,
    height: 24,
    backgroundColor: 'rgba(232, 93, 117, 0.25)',
    marginLeft: 15,
    marginVertical: 8,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  benefitEmoji: {
    fontSize: 28,
    marginRight: 16,
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
  },
  tipsCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tipBullet: {
    color: AppTheme.colors.coral,
    marginRight: 10,
    fontSize: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    lineHeight: 20,
  },
  ctaButton: {
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  ctaIcon: {
    fontSize: 20,
  },
  ctaText: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 18,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  premiumIcon: {
    fontSize: 14,
  },
  premiumText: {
    fontSize: 12,
    color: AppTheme.colors.coral,
    fontWeight: '600',
  },
});

export default function SuperLikesScreen() {
  return (
    <PremiumGate feature="super-likes">
      <SuperLikesScreenContent />
    </PremiumGate>
  );
}
