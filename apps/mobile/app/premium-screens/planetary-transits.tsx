import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import PlanetGlyph from '../../components/ui/PlanetGlyph';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

type Transit = {
  planet: string;
  emoji: string;
  currentSign: string;
  enterDate: string;
  exitDate: string;
  influence: 'positive' | 'challenging' | 'neutral';
  description: string;
  affectedAreas: string[];
};

type UpcomingTransit = {
  date: string;
  event: string;
  emoji: string;
  impact: string;
};

function PlanetaryTransitsScreenContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const getMonthName = (monthIndex: number, short: boolean = true): string => {
    const months = short
      ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
      : ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const formatDate = (month: number, day: number): string => {
    return `${getMonthName(month)} ${day}`;
  };

  useEffect(() => {
    loadUserSign();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [user]);

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
      setError(t('loadingError') || 'Could not load transit data. Please try again.');
    }
    setLoading(false);
  };

  const getCurrentTransits = (): Transit[] => {
    return [
      {
        planet: t('sun'),
        emoji: '☀️',
        currentSign: 'Aquarius',
        enterDate: formatDate(0, 20),
        exitDate: formatDate(1, 18),
        influence: 'positive',
        description: t('sunTransitDesc'),
        affectedAreas: [t('identity'), t('vitality'), t('selfExpression')],
      },
      {
        planet: t('moon'),
        emoji: '🌙',
        currentSign: 'Cancer',
        enterDate: t('today'),
        exitDate: t('inDays', { count: 2 }),
        influence: 'positive',
        description: t('moonTransitDesc'),
        affectedAreas: [t('emotions'), t('intuition'), t('homeLife')],
      },
      {
        planet: t('mercury'),
        emoji: '☿️',
        currentSign: 'Capricorn',
        enterDate: formatDate(0, 8),
        exitDate: formatDate(1, 5),
        influence: 'neutral',
        description: t('mercuryTransitDesc'),
        affectedAreas: [t('communication'), t('thinking'), t('travel')],
      },
      {
        planet: t('venus'),
        emoji: '♀️',
        currentSign: 'Pisces',
        enterDate: formatDate(0, 27),
        exitDate: formatDate(1, 20),
        influence: 'positive',
        description: t('venusTransitDesc'),
        affectedAreas: [t('loveRomance'), t('beauty'), t('finances')],
      },
      {
        planet: t('mars'),
        emoji: '♂️',
        currentSign: 'Gemini',
        enterDate: formatDate(11, 13),
        exitDate: formatDate(2, 25),
        influence: 'challenging',
        description: t('marsTransitDesc'),
        affectedAreas: [t('energy'), t('action'), t('ambition')],
      },
      {
        planet: t('jupiter'),
        emoji: '♃',
        currentSign: 'Taurus',
        enterDate: formatDate(4, 16),
        exitDate: formatDate(4, 25),
        influence: 'positive',
        description: t('jupiterTransitDesc'),
        affectedAreas: [t('expansion'), t('luck'), t('wisdom')],
      },
      {
        planet: t('saturn'),
        emoji: '♄',
        currentSign: 'Pisces',
        enterDate: formatDate(2, 7),
        exitDate: formatDate(4, 24),
        influence: 'neutral',
        description: t('saturnTransitDesc'),
        affectedAreas: [t('discipline'), t('responsibility'), t('structure')],
      },
    ];
  };

  const getUpcomingTransits = (): UpcomingTransit[] => {
    return [
      {
        date: formatDate(1, 5),
        event: t('mercuryEntersAquarius'),
        emoji: '☿️',
        impact: t('mercuryAquariusImpact'),
      },
      {
        date: formatDate(1, 13),
        event: t('marsEntersCancer'),
        emoji: '♂️',
        impact: t('marsCancerImpact'),
      },
      {
        date: formatDate(1, 18),
        event: t('sunEntersPisces'),
        emoji: '☀️',
        impact: t('sunPiscesImpact'),
      },
      {
        date: formatDate(1, 20),
        event: t('venusEntersAries'),
        emoji: '♀️',
        impact: t('venusAriesImpact'),
      },
    ];
  };

  const getInfluenceColor = (influence: string): string => {
    switch (influence) {
      case 'positive': return '#4ade80';
      case 'challenging': return '#f87171';
      default: return '#fbbf24';
    }
  };

  const getInfluenceLabel = (influence: string): string => {
    switch (influence) {
      case 'positive': return t('harmonious');
      case 'challenging': return t('challenging');
      default: return t('neutral');
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={AppTheme.colors.coral} />
          <Text style={{ color: AppTheme.colors.textMuted, marginTop: 12, fontSize: 14 }}>
            {t('loadingTransits') || 'Tracking planetary movements...'}
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>{'🪐'}</Text>
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

  const transits = getCurrentTransits();
  const upcomingTransits = getUpcomingTransits();

  // Fallbacks for web where SafeAreaProvider may not work
  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  const renderContent = () => (
    <View>
      {/* Personal Impact */}
        <View style={styles.personalCard}>
          <Text style={styles.personalEmoji}>🎯</Text>
          <View style={styles.personalInfo}>
            <Text style={styles.personalLabel}>{t('personalImpact')}</Text>
            <Text style={styles.personalSign}>
              {t('transitsFor')} {sunSign ? t(sunSign.toLowerCase()) : t('unknown')}
            </Text>
          </View>
        </View>

        {/* Current Transits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('currentTransits')}</Text>

          {transits.map((transit, index) => (
            <View key={index} style={styles.transitCard}>
              <View style={styles.transitHeader}>
                <PlanetGlyph symbol={transit.emoji} size={30} textStyle={styles.transitEmoji} />
                <View style={styles.transitInfo}>
                  <Text style={styles.transitPlanet}>{transit.planet}</Text>
                  <Text style={styles.transitSign}>
                    {t('in')} {t(transit.currentSign.toLowerCase())}
                  </Text>
                </View>
                <View style={[styles.influenceBadge, { backgroundColor: getInfluenceColor(transit.influence) + '30' }]}>
                  <Text style={[styles.influenceText, { color: getInfluenceColor(transit.influence) }]}>
                    {getInfluenceLabel(transit.influence)}
                  </Text>
                </View>
              </View>

              <View style={styles.transitDates}>
                <Text style={styles.transitDateText}>
                  {transit.enterDate} → {transit.exitDate}
                </Text>
              </View>

              <Text style={styles.transitDescription}>{transit.description}</Text>

              <View style={styles.affectedAreas}>
                {transit.affectedAreas.map((area, i) => (
                  <View key={i} style={styles.areaTag}>
                    <Text style={styles.areaText}>{area}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Upcoming Transits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('upcomingTransits')}</Text>

          {upcomingTransits.map((transit, index) => (
            <View key={index} style={styles.upcomingCard}>
              <View style={styles.upcomingDate}>
                <Text style={styles.upcomingDateText}>{transit.date}</Text>
              </View>
              <PlanetGlyph symbol={transit.emoji} size={26} textStyle={styles.upcomingEmoji} />
              <View style={styles.upcomingInfo}>
                <Text style={styles.upcomingEvent}>{transit.event}</Text>
                <Text style={styles.upcomingImpact}>{transit.impact}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Transit Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>{t('transitTips')}</Text>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>💚</Text>
            <Text style={styles.tipText}>{t('transitTip1')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>💛</Text>
            <Text style={styles.tipText}>{t('transitTip2')}</Text>
          </View>
          <View style={styles.tipRow}>
            <Text style={styles.tipEmoji}>❤️</Text>
            <Text style={styles.tipText}>{t('transitTip3')}</Text>
          </View>
        </View>

        {/* Premium Badge */}
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumIcon}>✨</Text>
          <Text style={styles.premiumText}>{t('premiumPlusFeature')}</Text>
        </View>
    </View>
  );

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
<ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
      {/* Header - Fixed at top */}
      <View style={[styles.header, { paddingTop: 40 + topInset }]}>
        <TouchableOpacity style={[styles.backButton, { top: 30 + topInset }]} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('planetaryTransits')}</Text>
        <Text style={styles.subtitle}>{t('planetaryTransitsSubtitle')}</Text>
      </View>

      
        {renderContent()}
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
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      height: 'calc(100vh - 120px)' as any,
      overflowY: 'auto' as any,
    } : {}),
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
  subtitle: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
  },
  personalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  personalEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  personalInfo: {
    flex: 1,
  },
  personalLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  personalSign: {
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 16,
  },
  transitCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  transitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  transitEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  transitInfo: {
    flex: 1,
  },
  transitPlanet: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  transitSign: {
    fontSize: 13,
    color: '#888',
  },
  influenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  influenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transitDates: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  transitDateText: {
    fontSize: 12,
    color: '#888',
  },
  transitDescription: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
    marginBottom: 12,
  },
  affectedAreas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  areaTag: {
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  areaText: {
    fontSize: 11,
    color: '#9333ea',
  },
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  upcomingDate: {
    backgroundColor: '#9333ea',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 12,
  },
  upcomingDateText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  upcomingEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  upcomingInfo: {
    flex: 1,
  },
  upcomingEvent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  upcomingImpact: {
    fontSize: 12,
    color: '#888',
  },
  tipsCard: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.2)',
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4ade80',
    marginBottom: 12,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipEmoji: {
    fontSize: 16,
    marginRight: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: '#ccc',
    lineHeight: 18,
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

export default function PlanetaryTransitsScreen() {
  return (
    <PremiumGate feature="planetary-transits">
      <PlanetaryTransitsScreenContent />
    </PremiumGate>
  );
}
