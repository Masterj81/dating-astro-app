import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';

type HoroscopeSection = {
  title: string;
  emoji: string;
  content: string;
  rating: number;
};

function DailyHoroscopeScreenContent() {
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

  const getDayName = (dayIndex: number) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return t(days[dayIndex]) || days[dayIndex];
  };

  const dateString = `${getDayName(today.getDay())}, ${getMonthName(today.getMonth())} ${today.getDate()}, ${today.getFullYear()}`;

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
      setError(t('loadingError') || 'Could not load your horoscope. Please try again.');
    }

    setLoading(false);
  };

  const getHoroscopeSections = (): HoroscopeSection[] => [
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

  const renderStars = (rating: number) => `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;

  const getMoonPhase = () => {
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
    return phases[Math.floor(today.getDate() / 4) % 8];
  };

  // Memoize before any early returns to respect React hooks rules
  const sections = useMemo(() => getHoroscopeSections(), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const moonPhase = useMemo(() => getMoonPhase(), [t, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
          <Text style={{ color: AppTheme.colors.textMuted, marginTop: 12, fontSize: 14 }}>
            {t('loadingHoroscope') || 'Reading the stars...'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🔮'}</Text>
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
        <Text style={styles.title}>{t('dailyHoroscope')}</Text>
        <Text style={styles.date}>{dateString}</Text>
      </View>


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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('todaysOverview')}</Text>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewText}>
              {t('dailyOverviewContent', { sign: sunSign ? t(sunSign.toLowerCase()) : '' })}
            </Text>
          </View>
        </View>

        <View style={styles.ratingSection}>
          <Text style={styles.ratingLabel}>{t('overallEnergy')}</Text>
          <Text style={styles.ratingStars}>★★★★☆</Text>
          <Text style={styles.ratingPercent}>82%</Text>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.horoscopeCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardEmoji}>{section.emoji}</Text>
              <Text style={styles.cardTitle}>{section.title}</Text>
              <Text style={styles.cardRating}>{renderStars(section.rating)}</Text>
            </View>
            <Text style={styles.cardContent}>{section.content}</Text>
          </View>
        ))}

        <View style={styles.luckySection}>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyNumbers')}</Text>
            <Text style={styles.luckyValue}>7, 14, 23</Text>
          </View>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyColor')}</Text>
            <View style={styles.colorDots}>
              <View style={[styles.colorDot, { backgroundColor: AppTheme.colors.cosmic }]} />
              <View style={[styles.colorDot, { backgroundColor: AppTheme.colors.coral }]} />
            </View>
          </View>
          <View style={styles.luckyItem}>
            <Text style={styles.luckyLabel}>{t('luckyTime')}</Text>
            <Text style={styles.luckyValue}>2:00 PM</Text>
          </View>
        </View>

        <View style={styles.affirmationCard}>
          <Text style={styles.affirmationEmoji}>✨</Text>
          <Text style={styles.affirmationLabel}>{t('dailyAffirmation')}</Text>
          <Text style={styles.affirmationText}>{t('affirmationContent')}</Text>
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
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
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
  moonInfo: {
    alignItems: 'center',
  },
  moonEmoji: {
    fontSize: 24,
  },
  moonName: {
    fontSize: 10,
    color: AppTheme.colors.textMuted,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
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
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 12,
  },
  ratingLabel: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
  },
  ratingStars: {
    fontSize: 18,
    color: AppTheme.colors.warning,
    letterSpacing: 2,
  },
  ratingPercent: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppTheme.colors.success,
  },
  horoscopeCard: {
    backgroundColor: AppTheme.colors.panel,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
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
    color: AppTheme.colors.textPrimary,
  },
  cardRating: {
    fontSize: 12,
    color: AppTheme.colors.warning,
    letterSpacing: 1,
  },
  cardContent: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
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
    backgroundColor: AppTheme.colors.panel,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
  },
  luckyLabel: {
    fontSize: 10,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  luckyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
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
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.22)',
    marginBottom: 24,
  },
  affirmationEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  affirmationLabel: {
    fontSize: 12,
    color: AppTheme.colors.coral,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  affirmationText: {
    fontSize: 16,
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 24,
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

export default function DailyHoroscopeScreen() {
  return (
    <PremiumGate feature="daily-horoscope">
      <DailyHoroscopeScreenContent />
    </PremiumGate>
  );
}
