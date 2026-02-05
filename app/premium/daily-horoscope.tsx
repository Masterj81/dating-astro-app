import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type HoroscopeSection = {
  title: string;
  emoji: string;
  content: string;
  rating: number;
};

function DailyHoroscopeScreenContent() {
  const [loading, setLoading] = useState(true);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  const today = new Date();

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const getDayName = (dayIndex: number): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return t(days[dayIndex]) || days[dayIndex];
  };

  const dateString = `${getDayName(today.getDay())}, ${getMonthName(today.getMonth())} ${today.getDate()}, ${today.getFullYear()}`;

  useEffect(() => {
    loadUserSign();
  }, [user]);

  const loadUserSign = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from('profiles')
      .select('sun_sign')
      .eq('id', user.id)
      .single();

    if (data?.sun_sign) {
      setSunSign(data.sun_sign);
    }
    setLoading(false);
  };

  const getHoroscopeSections = (): HoroscopeSection[] => {
    return [
      {
        title: t('loveRomance'),
        emoji: '💕',
        content: t('dailyLoveContent'),
        rating: 4,
      },
      {
        title: t('careerMoney'),
        emoji: '💼',
        content: t('dailyCareerContent'),
        rating: 3,
      },
      {
        title: t('healthWellness'),
        emoji: '🧘',
        content: t('dailyHealthContent'),
        rating: 5,
      },
      {
        title: t('luckyElements'),
        emoji: '🍀',
        content: t('dailyLuckyContent'),
        rating: 4,
      },
    ];
  };

  const renderStars = (rating: number) => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const getMoonPhase = (): { emoji: string; name: string } => {
    const phases = [
      { emoji: '🌑', name: t('newMoon') },
      { emoji: '🌒', name: t('waxingCrescent') },
      { emoji: '🌓', name: t('firstQuarter') },
      { emoji: '🌔', name: t('waxingGibbous') },
      { emoji: '🌕', name: t('fullMoon') },
      { emoji: '🌖', name: t('waningGibbous') },
      { emoji: '🌗', name: t('lastQuarter') },
      { emoji: '🌘', name: t('waningCrescent') },
    ];
    // Simple calculation based on day of month
    const dayOfMonth = today.getDate();
    const phaseIndex = Math.floor(dayOfMonth / 4) % 8;
    return phases[phaseIndex];
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  const sections = getHoroscopeSections();
  const moonPhase = getMoonPhase();

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('dailyHoroscope')}</Text>
          <Text style={styles.date}>{dateString}</Text>
        </View>

        {/* Sign Card */}
        <View style={styles.signCard}>
          <Text style={styles.signEmoji}>☀️</Text>
          <View style={styles.signInfo}>
            <Text style={styles.signLabel}>{t('yourSign')}</Text>
            <Text style={styles.signName}>{sunSign ? t(sunSign.toLowerCase()) : t('unknown')}</Text>
          </View>
          <View style={styles.moonInfo}>
            <Text style={styles.moonEmoji}>{moonPhase.emoji}</Text>
            <Text style={styles.moonName}>{moonPhase.name}</Text>
          </View>
        </View>

        {/* Daily Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('todaysOverview')}</Text>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>
              {t('dailyOverviewContent', { sign: sunSign ? t(sunSign.toLowerCase()) : '' })}
            </Text>
          </View>
        </View>

        {/* Overall Rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.ratingLabel}>{t('overallEnergy')}</Text>
          <Text style={styles.ratingStars}>★★★★☆</Text>
          <Text style={styles.ratingPercent}>82%</Text>
        </View>

        {/* Horoscope Sections */}
        {sections.map((section, index) => (
          <View key={index} style={styles.horoscopeCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>{section.emoji}</Text>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <Text style={styles.cardRating}>{renderStars(section.rating)}</Text>
            </View>
            <Text style={styles.cardContent}>{section.content}</Text>
          </View>
        ))}

        {/* Lucky Numbers & Colors */}
        <View style={styles.luckySection}>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyNumbers')}</Text>
            <Text style={styles.luckyValue}>7, 14, 23</Text>
          </View>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyColor')}</Text>
            <View style={styles.colorDots}>
              <View style={[styles.colorDot, { backgroundColor: '#9333ea' }]} />
              <View style={[styles.colorDot, { backgroundColor: '#e94560' }]} />
            </View>
          </View>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyTime')}</Text>
            <Text style={styles.luckyValue}>2:00 PM</Text>
          </View>
        </View>

        {/* Affirmation */}
        <View style={styles.affirmationCard}>
          <Text style={styles.affirmationEmoji}>✨</Text>
          <Text style={styles.affirmationLabel}>{t('dailyAffirmation')}</Text>
          <Text style={styles.affirmationText}>{t('affirmationContent')}</Text>
        </View>

        {/* Premium Badge */}
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumIcon}>✨</Text>
          <Text style={styles.premiumText}>{t('premiumPlusFeature')}</Text>
        </View>
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
    paddingBottom: 20,
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
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    color: '#888',
  },
  signCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  signEmoji: {
    fontSize: 40,
    marginRight: 12,
  },
  signInfo: {
    flex: 1,
  },
  signLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  moonInfo: {
    alignItems: 'center',
  },
  moonEmoji: {
    fontSize: 24,
  },
  moonName: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  overviewCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  overviewText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 24,
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 12,
  },
  ratingLabel: {
    fontSize: 14,
    color: '#888',
  },
  ratingStars: {
    fontSize: 18,
    color: '#fbbf24',
    letterSpacing: 2,
  },
  ratingPercent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4ade80',
  },
  horoscopeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardEmoji: {
    fontSize: 24,
    marginRight: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cardRating: {
    fontSize: 12,
    color: '#fbbf24',
    letterSpacing: 1,
  },
  cardContent: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  luckySection: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    gap: 12,
  },
  luckyItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  luckyLabel: {
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  luckyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  colorDots: {
    flexDirection: 'row',
    gap: 8,
  },
  colorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  affirmationCard: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.2)',
    marginBottom: 24,
  },
  affirmationEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  affirmationLabel: {
    fontSize: 12,
    color: '#e94560',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  affirmationText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    marginHorizontal: 60,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    gap: 8,
  },
  premiumIcon: {
    fontSize: 16,
  },
  premiumText: {
    fontSize: 12,
    color: '#9333ea',
    fontWeight: '600',
  },
});

export default function DailyHoroscopeScreen() {
  return (
    <PremiumGate feature="daily-horoscope">
      <DailyHoroscopeScreenContent />
    </PremiumGate>
  );
}
