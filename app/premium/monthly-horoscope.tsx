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

type WeekForecast = {
  week: number;
  dates: string;
  theme: string;
  energy: number;
  advice: string;
};

type MonthlyAspect = {
  date: string;
  event: string;
  emoji: string;
  impact: 'positive' | 'challenging' | 'neutral';
  description: string;
};

function MonthlyHoroscopeScreenContent() {
  const [loading, setLoading] = useState(true);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  const today = new Date();

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const getOrdinal = (day: number): string => {
    return t('dayOrdinal', { day }) || `${day}th`;
  };

  const monthName = `${getMonthName(today.getMonth())} ${today.getFullYear()}`;

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

  const getWeeklyForecasts = (): WeekForecast[] => {
    return [
      {
        week: 1,
        dates: '1-7',
        theme: t('weekTheme1'),
        energy: 4,
        advice: t('weekAdvice1'),
      },
      {
        week: 2,
        dates: '8-14',
        theme: t('weekTheme2'),
        energy: 5,
        advice: t('weekAdvice2'),
      },
      {
        week: 3,
        dates: '15-21',
        theme: t('weekTheme3'),
        energy: 3,
        advice: t('weekAdvice3'),
      },
      {
        week: 4,
        dates: '22-28/31',
        theme: t('weekTheme4'),
        energy: 4,
        advice: t('weekAdvice4'),
      },
    ];
  };

  const getMonthlyAspects = (): MonthlyAspect[] => {
    return [
      {
        date: getOrdinal(5),
        event: t('venusEntersTaurus'),
        emoji: '💕',
        impact: 'positive',
        description: t('venusEntersDesc'),
      },
      {
        date: getOrdinal(12),
        event: t('fullMoonEvent'),
        emoji: '🌕',
        impact: 'neutral',
        description: t('fullMoonDesc'),
      },
      {
        date: getOrdinal(18),
        event: t('mercuryRetrograde'),
        emoji: '☿️',
        impact: 'challenging',
        description: t('mercuryRetroDesc'),
      },
      {
        date: getOrdinal(26),
        event: t('newMoonEvent'),
        emoji: '🌑',
        impact: 'positive',
        description: t('newMoonDesc'),
      },
    ];
  };

  const getImpactColor = (impact: string): string => {
    switch (impact) {
      case 'positive': return '#4ade80';
      case 'challenging': return '#f87171';
      default: return '#fbbf24';
    }
  };

  const renderEnergyBars = (energy: number) => {
    return (
      <View style={styles.energyBars}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.energyBar,
              { backgroundColor: i <= energy ? '#9333ea' : 'rgba(255,255,255,0.1)' },
            ]}
          />
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  const weeklyForecasts = getWeeklyForecasts();
  const monthlyAspects = getMonthlyAspects();

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('monthlyHoroscope')}</Text>
          <Text style={styles.date}>{monthName}</Text>
        </View>

        {/* Sign Card */}
        <View style={styles.signCard}>
          <Text style={styles.signEmoji}>📅</Text>
          <View style={styles.signInfo}>
            <Text style={styles.signLabel}>{t('monthlyForecastFor')}</Text>
            <Text style={styles.signName}>{sunSign ? t(sunSign.toLowerCase()) : t('unknown')}</Text>
          </View>
        </View>

        {/* Monthly Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('monthlyOverview')}</Text>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>
              {t('monthlyOverviewContent', { sign: sunSign ? t(sunSign.toLowerCase()) : '' })}
            </Text>
          </View>
        </View>

        {/* Key Themes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('keyThemes')}</Text>
          <View style={styles.themesRow}>
            <View style={styles.themeTag}>
              <Text style={styles.themeEmoji}>💫</Text>
              <Text style={styles.themeText}>{t('themeTransformation')}</Text>
            </View>
            <View style={styles.themeTag}>
              <Text style={styles.themeEmoji}>💕</Text>
              <Text style={styles.themeText}>{t('themeRelationships')}</Text>
            </View>
            <View style={styles.themeTag}>
              <Text style={styles.themeEmoji}>📈</Text>
              <Text style={styles.themeText}>{t('themeGrowth')}</Text>
            </View>
          </View>
        </View>

        {/* Weekly Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('weekByWeek')}</Text>

          {weeklyForecasts.map((week, index) => (
            <View key={index} style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekNumber}>{t('week')} {week.week}</Text>
                </View>
                <Text style={styles.weekDates}>{week.dates}</Text>
                {renderEnergyBars(week.energy)}
              </View>
              <Text style={styles.weekTheme}>{week.theme}</Text>
              <Text style={styles.weekAdvice}>{week.advice}</Text>
            </View>
          ))}
        </View>

        {/* Important Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('importantDates')}</Text>

          {monthlyAspects.map((aspect, index) => (
            <View key={index} style={styles.aspectCard}>
              <View style={styles.aspectHeader}>
                <View style={[styles.aspectDateBadge, { borderColor: getImpactColor(aspect.impact) }]}>
                  <Text style={[styles.aspectDate, { color: getImpactColor(aspect.impact) }]}>
                    {aspect.date}
                  </Text>
                </View>
                <Text style={styles.aspectEmoji}>{aspect.emoji}</Text>
                <Text style={styles.aspectEvent}>{aspect.event}</Text>
              </View>
              <Text style={styles.aspectDescription}>{aspect.description}</Text>
            </View>
          ))}
        </View>

        {/* Monthly Ratings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('monthlyRatings')}</Text>

          <View style={styles.ratingsGrid}>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingEmoji}>💕</Text>
              <Text style={styles.ratingLabel}>{t('loveRomance')}</Text>
              <Text style={styles.ratingStars}>★★★★☆</Text>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingEmoji}>💼</Text>
              <Text style={styles.ratingLabel}>{t('careerMoney')}</Text>
              <Text style={styles.ratingStars}>★★★★★</Text>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingEmoji}>🧘</Text>
              <Text style={styles.ratingLabel}>{t('healthWellness')}</Text>
              <Text style={styles.ratingStars}>★★★☆☆</Text>
            </View>
            <View style={styles.ratingItem}>
              <Text style={styles.ratingEmoji}>🍀</Text>
              <Text style={styles.ratingLabel}>{t('luck')}</Text>
              <Text style={styles.ratingStars}>★★★★☆</Text>
            </View>
          </View>
        </View>

        {/* Best Days */}
        <View style={styles.bestDaysCard}>
          <Text style={styles.bestDaysTitle}>{t('bestDaysThisMonth')}</Text>
          <View style={styles.bestDaysRow}>
            <View style={styles.bestDay}>
              <Text style={styles.bestDayEmoji}>💕</Text>
              <Text style={styles.bestDayLabel}>{t('forLove')}</Text>
              <Text style={styles.bestDayValue}>14, 21, 28</Text>
            </View>
            <View style={styles.bestDay}>
              <Text style={styles.bestDayEmoji}>💼</Text>
              <Text style={styles.bestDayLabel}>{t('forCareer')}</Text>
              <Text style={styles.bestDayValue}>3, 10, 24</Text>
            </View>
            <View style={styles.bestDay}>
              <Text style={styles.bestDayEmoji}>✨</Text>
              <Text style={styles.bestDayLabel}>{t('forManifestation')}</Text>
              <Text style={styles.bestDayValue}>5, 19, 26</Text>
            </View>
          </View>
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
    fontSize: 16,
    color: '#9333ea',
    fontWeight: '600',
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
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
  themesRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  themeEmoji: {
    fontSize: 16,
  },
  themeText: {
    fontSize: 13,
    color: '#fff',
  },
  weekCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekBadge: {
    backgroundColor: '#9333ea',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 10,
  },
  weekNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  weekDates: {
    color: '#888',
    fontSize: 14,
    flex: 1,
  },
  energyBars: {
    flexDirection: 'row',
    gap: 3,
  },
  energyBar: {
    width: 16,
    height: 6,
    borderRadius: 3,
  },
  weekTheme: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  weekAdvice: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  aspectCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  aspectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aspectDateBadge: {
    borderWidth: 2,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 10,
  },
  aspectDate: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  aspectEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  aspectEvent: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  aspectDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  ratingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  ratingItem: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  ratingEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 14,
    color: '#fff',
    marginBottom: 6,
  },
  ratingStars: {
    fontSize: 14,
    color: '#fbbf24',
    letterSpacing: 2,
  },
  bestDaysCard: {
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  bestDaysTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 16,
  },
  bestDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bestDay: {
    alignItems: 'center',
    flex: 1,
  },
  bestDayEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  bestDayLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  bestDayValue: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
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

export default function MonthlyHoroscopeScreen() {
  return (
    <PremiumGate feature="monthly-horoscope">
      <MonthlyHoroscopeScreenContent />
    </PremiumGate>
  );
}
