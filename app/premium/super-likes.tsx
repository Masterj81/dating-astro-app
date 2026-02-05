import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../_layout';

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

  useEffect(() => {
    // In a real app, load super like stats from API
    loadSuperLikeStats();
  }, [user]);

  const loadSuperLikeStats = async () => {
    // Simulated stats - in real app, fetch from Supabase
    setStats({
      available: 5,
      maxDaily: 5,
      usedToday: 0,
      totalSent: 12,
      matchRate: 67,
    });
  };

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
      emoji: '💜',
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

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('superLikes') || 'Super Likes'}</Text>
          <Text style={styles.subtitle}>
            {t('superLikesSubtitle') || 'Make a lasting first impression'}
          </Text>
        </View>

        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.mainStat}>
            <Text style={styles.mainStatNumber}>{stats.available}</Text>
            <Text style={styles.mainStatLabel}>{t('available') || 'Available'}</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.usedToday}/{stats.maxDaily}</Text>
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
            <Text style={styles.refreshText}>
              {t('superLikesRefresh') || 'Super Likes refresh daily at midnight'}
            </Text>
          </View>
        </View>

        {/* How It Works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('howItWorks') || 'How It Works'}</Text>
          <View style={styles.stepsContainer}>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{t('swipeUp') || 'Swipe Up'}</Text>
                <Text style={styles.stepDesc}>
                  {t('swipeUpDesc') || 'Or tap the star icon on a profile you love'}
                </Text>
              </View>
            </View>

            <View style={styles.stepConnector} />

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{t('theyGetNotified') || 'They Get Notified'}</Text>
                <Text style={styles.stepDesc}>
                  {t('theyGetNotifiedDesc') || 'Your profile appears with a special star highlight'}
                </Text>
              </View>
            </View>

            <View style={styles.stepConnector} />

            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{t('higherChance') || 'Higher Match Chance'}</Text>
                <Text style={styles.stepDesc}>
                  {t('higherChanceDesc') || 'They know you\'re truly interested, increasing match probability'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('benefits') || 'Benefits'}</Text>
          {benefits.map((benefit, index) => (
            <View key={index} style={styles.benefitCard}>
              <Text style={styles.benefitEmoji}>{benefit.emoji}</Text>
              <View style={styles.benefitContent}>
                <Text style={styles.benefitTitle}>{benefit.title}</Text>
                <Text style={styles.benefitDesc}>{benefit.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('proTips') || 'Pro Tips'}</Text>
          <View style={styles.tipsCard}>
            {tips.map((tip, index) => (
              <View key={index} style={styles.tipItem}>
                <Text style={styles.tipBullet}>✦</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push('/(tabs)/discover')}
        >
          <LinearGradient
            colors={['#e94560', '#c23a51']}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaIcon}>⭐</Text>
            <Text style={styles.ctaText}>
              {t('startSuperLiking') || 'Start Super Liking'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Premium Badge */}
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
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
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
  backText: {
    color: '#fff',
    fontSize: 24,
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
  statsCard: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    marginBottom: 24,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: 20,
  },
  mainStatNumber: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#e94560',
  },
  mainStatLabel: {
    fontSize: 16,
    color: '#ccc',
    marginTop: -4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
    color: '#888',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  stepsContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  stepConnector: {
    width: 2,
    height: 24,
    backgroundColor: 'rgba(233, 69, 96, 0.3)',
    marginLeft: 15,
    marginVertical: 8,
  },
  benefitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
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
    color: '#fff',
    marginBottom: 4,
  },
  benefitDesc: {
    fontSize: 14,
    color: '#888',
  },
  tipsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  tipItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  tipBullet: {
    color: '#e94560',
    marginRight: 10,
    fontSize: 12,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: '#ccc',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
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
    color: '#e94560',
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
