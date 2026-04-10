import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';

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
  const [error, setError] = useState<string | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  // Stable date ref -- avoid creating new Date on every render
  const today = useRef(new Date()).current;

  const getMonthName = (monthIndex: number) => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const getOrdinal = (day: number) => t('dayOrdinal', { day }) || `${day}th`;
  const monthName = `${getMonthName(today.getMonth())} ${today.getFullYear()}`;

  useEffect(() => {
    loadUserSign();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUserSign = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('sun_sign')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.sun_sign) {
        setSunSign(data.sun_sign);
      }
    } catch (err) {
      console.error('Error loading user sign:', err);
      setError(t('loadingError') || 'Could not load your monthly horoscope. Please try again.');
    }

    setLoading(false);
  };

  const getWeeklyForecasts = (): WeekForecast[] => [
    { week: 1, dates: '1-7', theme: t('weekTheme1'), energy: 4, advice: t('weekAdvice1') },
    { week: 2, dates: '8-14', theme: t('weekTheme2'), energy: 5, advice: t('weekAdvice2') },
    { week: 3, dates: '15-21', theme: t('weekTheme3'), energy: 3, advice: t('weekAdvice3') },
    { week: 4, dates: '22-28/31', theme: t('weekTheme4'), energy: 4, advice: t('weekAdvice4') },
  ];

  const getMonthlyAspects = (): MonthlyAspect[] => [
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

  const getImpactColor = (impact: MonthlyAspect['impact']) => {
    switch (impact) {
      case 'positive':
        return AppTheme.colors.success;
      case 'challenging':
        return AppTheme.colors.danger;
      default:
        return AppTheme.colors.warning;
    }
  };

  const renderEnergyBars = (energy: number) => (
    <View style={styles.energyBars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.energyBar,
            { backgroundColor: i <= energy ? AppTheme.colors.cosmic : AppTheme.colors.border },
          ]}
        />
      ))}
    </View>
  );

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
          <Text style={{ color: AppTheme.colors.textMuted, marginTop: 12, fontSize: 14 }}>
            {t('loadingHoroscope') || 'Consulting the cosmos...'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{'📅'}</Text>
          <Text style={{ color: AppTheme.colors.textSecondary, fontSize: 16, textAlign: 'center', marginBottom: 20 }}>{error}</Text>
          <TouchableOpacity
            onPress={loadUserSign}
            style={{ backgroundColor: AppTheme.colors.coral, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, minHeight: 48 }}
          >
            <Text style={{ color: AppTheme.colors.textOnAccent, fontWeight: '600', fontSize: 16 }}>{t('tryAgain') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const weeklyForecasts = getWeeklyForecasts();
  const monthlyAspects = getMonthlyAspects();
  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
      <View style={[styles.header, { paddingTop: 40 + topInset }]}>
        <TouchableOpacity style={[styles.backButton, { top: 30 + topInset }]} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('monthlyHoroscope')}</Text>
        <Text style={styles.date}>{monthName}</Text>
      </View>


        <View style={styles.signCard}>
          <Text style={styles.signEmoji}>📅</Text>
          <View style={styles.signInfo}>
            <Text style={styles.signLabel}>{t('monthlyForecastFor')}</Text>
            <Text style={styles.signName}>{sunSign ? t(sunSign.toLowerCase()) : t('unknown')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('monthlyOverview')}</Text>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>
              {t('monthlyOverviewContent', { sign: sunSign ? t(sunSign.toLowerCase()) : '' })}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('keyThemes')}</Text>
          <View style={styles.themesRow}>
            {[
              { emoji: '💫', label: t('themeTransformation') },
              { emoji: '💕', label: t('themeRelationships') },
              { emoji: '📈', label: t('themeGrowth') },
            ].map((theme) => (
              <View key={theme.label} style={styles.themeTag}>
                <Text style={styles.themeEmoji}>{theme.emoji}</Text>
                <Text style={styles.themeText}>{theme.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('weekByWeek')}</Text>
          {weeklyForecasts.map((week) => (
            <View key={week.week} style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <View style={styles.weekBadge}>
                  <Text style={styles.weekNumber}>
                    {t('week')} {week.week}
                  </Text>
                </View>
                <Text style={styles.weekDates}>{week.dates}</Text>
                {renderEnergyBars(week.energy)}
              </View>
              <Text style={styles.weekTheme}>{week.theme}</Text>
              <Text style={styles.weekAdvice}>{week.advice}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('importantDates')}</Text>
          {monthlyAspects.map((aspect) => (
            <View key={aspect.date} style={styles.aspectCard}>
              <View style={styles.aspectHeader}>
                <View style={[styles.aspectDateBadge, { borderColor: getImpactColor(aspect.impact) }]}>
                  <Text style={[styles.aspectDate, { color: getImpactColor(aspect.impact) }]}>{aspect.date}</Text>
                </View>
                <Text style={styles.aspectEmoji}>{aspect.emoji}</Text>
                <Text style={styles.aspectEvent}>{aspect.event}</Text>
              </View>
              <Text style={styles.aspectDescription}>{aspect.description}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('monthlyRatings')}</Text>
          <View style={styles.ratingsGrid}>
            {[
              { emoji: '💕', label: t('loveRomance'), stars: '★★★★☆' },
              { emoji: '💼', label: t('careerMoney'), stars: '★★★★★' },
              { emoji: '🧘', label: t('healthWellness'), stars: '★★★☆☆' },
              { emoji: '🍀', label: t('luck'), stars: '★★★★☆' },
            ].map((rating) => (
              <View key={rating.label} style={styles.ratingItem}>
                <Text style={styles.ratingEmoji}>{rating.emoji}</Text>
                <Text style={styles.ratingLabel}>{rating.label}</Text>
                <Text style={styles.ratingStars}>{rating.stars}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bestDaysCard}>
          <Text style={styles.bestDaysTitle}>{t('bestDaysThisMonth')}</Text>
          <View style={styles.bestDaysRow}>
            {[
              { emoji: '💕', label: t('forLove'), value: '14, 21, 28' },
              { emoji: '💼', label: t('forCareer'), value: '3, 10, 24' },
              { emoji: '✨', label: t('forManifestation'), value: '5, 19, 26' },
            ].map((item) => (
              <View key={item.label} style={styles.bestDay}>
                <Text style={styles.bestDayEmoji}>{item.emoji}</Text>
                <Text style={styles.bestDayLabel}>{item.label}</Text>
                <Text style={styles.bestDayValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

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
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
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
    marginBottom: 4,
  },
  date: {
    fontSize: 16,
    color: AppTheme.colors.cosmic,
    fontWeight: '600',
  },
  signCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 108, 255, 0.14)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
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
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: AppTheme.colors.textPrimary,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 12,
  },
  overviewCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  overviewText: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    lineHeight: 24,
  },
  themesRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  themeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(124, 108, 255, 0.16)',
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
    color: AppTheme.colors.textPrimary,
  },
  weekCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  weekBadge: {
    backgroundColor: AppTheme.colors.cosmic,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 10,
  },
  weekNumber: {
    color: AppTheme.colors.textOnAccent,
    fontSize: 12,
    fontWeight: 'bold',
  },
  weekDates: {
    color: AppTheme.colors.textSecondary,
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
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  weekAdvice: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 18,
  },
  aspectCard: {
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
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
    color: AppTheme.colors.textPrimary,
  },
  aspectDescription: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 18,
  },
  ratingsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  ratingItem: {
    width: '47%',
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  ratingEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 14,
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  ratingStars: {
    fontSize: 14,
    color: AppTheme.colors.warning,
    letterSpacing: 2,
  },
  bestDaysCard: {
    backgroundColor: 'rgba(124, 108, 255, 0.14)',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.22)',
  },
  bestDaysTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
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
    color: AppTheme.colors.textMuted,
    marginBottom: 4,
    textAlign: 'center',
  },
  bestDayValue: {
    fontSize: 12,
    color: AppTheme.colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124, 108, 255, 0.16)',
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
    color: AppTheme.colors.cosmic,
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
