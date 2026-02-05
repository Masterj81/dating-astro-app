import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import {
  BirthChart,
  calculateSynastry,
  CompatibilityScore,
  getElement,
  getZodiacEmoji,
  calculateQuickCompatibility
} from '../../services/astrologyService';
import { calculateNatalChart, calculateCompatibility } from '../../services/astrology';
import { signDegreeToLongitude } from '../../services/astrologyCore';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type Profile = {
  id: string;
  name: string;
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  birth_date: string;
  birth_time: string;
  birth_city: string;
  birth_latitude: number;
  birth_longitude: number;
  birth_chart: BirthChart | null;
  image_url: string;
};

type Category = {
  name: string;
  score: number;
  icon: string;
  description: string;
};

type Aspect = {
  aspect: string;
  type: 'harmonious' | 'intense' | 'challenging';
  description: string;
};

function ScoreRing({ score, loading, label }: { score: number; loading: boolean; label: string }) {
  return (
    <View style={styles.scoreRing}>
      <View style={styles.scoreInner}>
        {loading ? (
          <ActivityIndicator size="large" color="#e94560" />
        ) : (
          <>
            <Text style={styles.scoreNumber}>{score}</Text>
            <Text style={styles.scorePercent}>%</Text>
          </>
        )}
      </View>
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function CategoryCard({ category }: { category: Category }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#e9c46a';
    return '#ef4444';
  };

  return (
    <View style={styles.categoryCard}>
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <View style={styles.categoryContent}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <Text style={[styles.categoryScore, { color: getScoreColor(category.score) }]}>
            {category.score}%
          </Text>
        </View>
        <Text style={styles.categoryDescription}>{category.description}</Text>
      </View>
    </View>
  );
}

function AspectRow({ aspect }: { aspect: Aspect }) {
  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'harmonious':
        return { color: '#4ade80', symbol: '△' };
      case 'intense':
        return { color: '#f59e0b', symbol: '☆' };
      case 'challenging':
        return { color: '#ef4444', symbol: '□' };
      default:
        return { color: '#888', symbol: '○' };
    }
  };

  const typeStyle = getTypeStyle(aspect.type);

  return (
    <View style={styles.aspectRow}>
      <Text style={[styles.aspectSymbol, { color: typeStyle.color }]}>{typeStyle.symbol}</Text>
      <View style={styles.aspectContent}>
        <Text style={styles.aspectName}>{aspect.aspect}</Text>
        <Text style={styles.aspectDescription}>{aspect.description}</Text>
      </View>
    </View>
  );
}

function generateAspectDescriptions(
  userChart: BirthChart | null,
  matchChart: BirthChart | null,
  compatibility: CompatibilityScore | null
): Aspect[] {
  if (!userChart || !matchChart || !compatibility) {
    return [];
  }

  const aspects: Aspect[] = [];

  // Sun-Moon aspect
  const sunMoonCompat = getElement(userChart.sun.sign) === getElement(matchChart.moon.sign);
  aspects.push({
    aspect: `Your Sun (${userChart.sun.sign}) & Their Moon (${matchChart.moon.sign})`,
    type: sunMoonCompat ? 'harmonious' : 'challenging',
    description: sunMoonCompat
      ? 'Natural emotional understanding between you'
      : 'Different emotional languages - requires patience'
  });

  // Venus-Mars aspect (passion)
  const venusEl = getElement(userChart.planets.venus.sign);
  const marsEl = getElement(matchChart.planets.mars.sign);
  const passionCompat = venusEl === marsEl ||
    (venusEl === 'fire' && marsEl === 'air') ||
    (venusEl === 'air' && marsEl === 'fire') ||
    (venusEl === 'water' && marsEl === 'earth') ||
    (venusEl === 'earth' && marsEl === 'water');
  aspects.push({
    aspect: `Venus (${userChart.planets.venus.sign}) & Mars (${matchChart.planets.mars.sign})`,
    type: passionCompat ? 'intense' : 'challenging',
    description: passionCompat
      ? 'Strong romantic and physical chemistry'
      : 'Different approaches to love and desire'
  });

  // Mercury aspect (communication)
  const mercCompat = getElement(userChart.planets.mercury.sign) === getElement(matchChart.planets.mercury.sign);
  aspects.push({
    aspect: `Mercury-Mercury (${userChart.planets.mercury.sign} & ${matchChart.planets.mercury.sign})`,
    type: mercCompat ? 'harmonious' : 'challenging',
    description: mercCompat
      ? 'Easy, flowing communication'
      : 'Different communication styles to navigate'
  });

  // Moon-Moon aspect (emotional)
  const moonCompat = getElement(userChart.moon.sign) === getElement(matchChart.moon.sign);
  aspects.push({
    aspect: `Moon-Moon (${userChart.moon.sign} & ${matchChart.moon.sign})`,
    type: moonCompat ? 'harmonious' : 'challenging',
    description: moonCompat
      ? 'Deep emotional resonance and understanding'
      : 'Different emotional needs - growth opportunity'
  });

  // Saturn aspect (long-term)
  const saturnCompat = getElement(userChart.planets.saturn.sign) === getElement(matchChart.planets.saturn.sign);
  aspects.push({
    aspect: `Saturn-Saturn (${userChart.planets.saturn.sign} & ${matchChart.planets.saturn.sign})`,
    type: saturnCompat ? 'harmonious' : 'intense',
    description: saturnCompat
      ? 'Shared approach to commitment and structure'
      : 'Different timelines and life lessons'
  });

  return aspects;
}

function generateCategoryDescriptions(
  userChart: BirthChart | null,
  matchChart: BirthChart | null,
  compatibility: CompatibilityScore | null,
  t: (key: string) => string
): Category[] {
  if (!compatibility) {
    return [];
  }

  const categories: Category[] = [
    {
      name: t('emotional'),
      score: compatibility.emotional,
      icon: '💗',
      description: userChart && matchChart
        ? `${t('moon')}: ${userChart.moon.sign} & ${matchChart.moon.sign}`
        : t('emotionalDesc')
    },
    {
      name: t('communication'),
      score: compatibility.communication,
      icon: '💬',
      description: userChart && matchChart
        ? `${t('mercury')}: ${userChart.planets.mercury.sign} & ${matchChart.planets.mercury.sign}`
        : t('communicationDesc')
    },
    {
      name: t('passion'),
      score: compatibility.passion,
      icon: '🔥',
      description: userChart && matchChart
        ? `${t('venus')}-${t('mars')}: ${userChart.planets.venus.sign} & ${matchChart.planets.mars.sign}`
        : t('passionDesc')
    },
    {
      name: t('longTerm'),
      score: compatibility.longTerm,
      icon: '🏠',
      description: t('longTermDesc')
    },
    {
      name: t('values'),
      score: compatibility.values,
      icon: '❤️',
      description: userChart && matchChart
        ? `${t('venus')}: ${userChart.planets.venus.sign} & ${matchChart.planets.venus.sign}`
        : t('valuesDesc')
    },
    {
      name: t('growth'),
      score: compatibility.growth,
      icon: '🌱',
      description: t('growthDesc')
    },
  ];

  return categories;
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { tier, triggerPaywall, canAccessFeature } = usePremium();
  const isPremium = tier !== 'free';
  const navigation = useNavigation();

  // Set translated header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('compatibilityAnalysis'),
    });
  }, [navigation, t]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchProfile, setMatchProfile] = useState<Profile | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userChart, setUserChart] = useState<BirthChart | null>(null);
  const [matchChart, setMatchChart] = useState<BirthChart | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityScore | null>(null);

  useEffect(() => {
    if (id && user) {
      loadProfiles();
    }
  }, [id, user]);

  const loadProfiles = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both profiles
      const [matchResult, userResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('profiles').select('*').eq('id', user?.id).maybeSingle(),
      ]);

      if (matchResult.error) throw matchResult.error;
      if (userResult.error) throw userResult.error;
      if (!matchResult.data || !userResult.data) {
        throw new Error('Profile not found');
      }

      setMatchProfile(matchResult.data);
      setUserProfile(userResult.data);

      // Use local calculation (works offline, no Edge Function needed)
      let localChart1 = null;
      let localChart2 = null;

      // User's chart - use local calculation
      if (userResult.data.birth_date) {
        const [year, month, day] = userResult.data.birth_date.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day);
        localChart1 = calculateNatalChart(
          birthDate,
          userResult.data.birth_time,
          userResult.data.birth_latitude || 45.5,
          userResult.data.birth_longitude || -73.5
        );
      }

      // Match's chart - use local calculation
      if (matchResult.data.birth_date) {
        const [year, month, day] = matchResult.data.birth_date.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day);
        localChart2 = calculateNatalChart(
          birthDate,
          matchResult.data.birth_time,
          matchResult.data.birth_latitude || 45.5,
          matchResult.data.birth_longitude || -73.5
        );
      }

      // Convert local chart format to BirthChart format for display
      if (localChart1) {
        const chart1: BirthChart = {
          sun: { longitude: localChart1.sun.longitude ?? signDegreeToLongitude(localChart1.sun), sign: localChart1.sun.sign, degree: localChart1.sun.degree },
          moon: { longitude: localChart1.moon.longitude ?? signDegreeToLongitude(localChart1.moon), sign: localChart1.moon.sign, degree: localChart1.moon.degree },
          rising: { longitude: localChart1.rising.longitude ?? signDegreeToLongitude(localChart1.rising), sign: localChart1.rising.sign, degree: localChart1.rising.degree },
          planets: {
            mercury: { longitude: localChart1.mercury.longitude ?? signDegreeToLongitude(localChart1.mercury), sign: localChart1.mercury.sign, degree: localChart1.mercury.degree },
            venus: { longitude: localChart1.venus.longitude ?? signDegreeToLongitude(localChart1.venus), sign: localChart1.venus.sign, degree: localChart1.venus.degree },
            mars: { longitude: localChart1.mars.longitude ?? signDegreeToLongitude(localChart1.mars), sign: localChart1.mars.sign, degree: localChart1.mars.degree },
            jupiter: { longitude: localChart1.jupiter.longitude ?? signDegreeToLongitude(localChart1.jupiter), sign: localChart1.jupiter.sign, degree: localChart1.jupiter.degree },
            saturn: { longitude: localChart1.saturn.longitude ?? signDegreeToLongitude(localChart1.saturn), sign: localChart1.saturn.sign, degree: localChart1.saturn.degree },
          },
          coordinates: { latitude: userResult.data.birth_latitude || 45.5, longitude: userResult.data.birth_longitude || -73.5 },
          julianDay: 0
        };
        setUserChart(chart1);
      }

      if (localChart2) {
        const chart2: BirthChart = {
          sun: { longitude: localChart2.sun.longitude ?? signDegreeToLongitude(localChart2.sun), sign: localChart2.sun.sign, degree: localChart2.sun.degree },
          moon: { longitude: localChart2.moon.longitude ?? signDegreeToLongitude(localChart2.moon), sign: localChart2.moon.sign, degree: localChart2.moon.degree },
          rising: { longitude: localChart2.rising.longitude ?? signDegreeToLongitude(localChart2.rising), sign: localChart2.rising.sign, degree: localChart2.rising.degree },
          planets: {
            mercury: { longitude: localChart2.mercury.longitude ?? signDegreeToLongitude(localChart2.mercury), sign: localChart2.mercury.sign, degree: localChart2.mercury.degree },
            venus: { longitude: localChart2.venus.longitude ?? signDegreeToLongitude(localChart2.venus), sign: localChart2.venus.sign, degree: localChart2.venus.degree },
            mars: { longitude: localChart2.mars.longitude ?? signDegreeToLongitude(localChart2.mars), sign: localChart2.mars.sign, degree: localChart2.mars.degree },
            jupiter: { longitude: localChart2.jupiter.longitude ?? signDegreeToLongitude(localChart2.jupiter), sign: localChart2.jupiter.sign, degree: localChart2.jupiter.degree },
            saturn: { longitude: localChart2.saturn.longitude ?? signDegreeToLongitude(localChart2.saturn), sign: localChart2.saturn.sign, degree: localChart2.saturn.degree },
          },
          coordinates: { latitude: matchResult.data.birth_latitude || 45.5, longitude: matchResult.data.birth_longitude || -73.5 },
          julianDay: 0
        };
        setMatchChart(chart2);
      }

      // Calculate compatibility using local function
      if (localChart1 && localChart2) {
        const overallScore = calculateCompatibility(localChart1, localChart2);
        // Generate individual scores based on element compatibility
        const emotional = calculateQuickCompatibility(localChart1.moon.sign, localChart2.moon.sign);
        const communication = calculateQuickCompatibility(localChart1.mercury.sign, localChart2.mercury.sign);
        const passion = calculateQuickCompatibility(localChart1.venus.sign, localChart2.mars.sign);
        const longTerm = calculateQuickCompatibility(localChart1.saturn.sign, localChart2.saturn.sign);
        const values = calculateQuickCompatibility(localChart1.venus.sign, localChart2.venus.sign);
        const growth = calculateQuickCompatibility(localChart1.jupiter.sign, localChart2.jupiter.sign);

        setCompatibility({
          overall: overallScore,
          emotional,
          communication,
          passion,
          longTerm,
          values,
          growth
        });
      } else {
        // Fallback: use sun signs only
        const userSun = userResult.data.sun_sign || 'Aries';
        const matchSun = matchResult.data.sun_sign || 'Aries';
        const quickScore = calculateQuickCompatibility(userSun, matchSun);
        setCompatibility({
          overall: quickScore,
          emotional: quickScore,
          communication: quickScore,
          passion: quickScore,
          longTerm: quickScore,
          values: quickScore,
          growth: quickScore
        });
      }

    } catch (err: any) {
      console.error('Error loading synastry:', err);
      setError(err.message || 'Failed to load compatibility data');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = () => {
    // For premium feature, check access
    if (!isPremium) {
      triggerPaywall('priority-messages');
      return;
    }
    // Navigate to chat or create match first
    router.push(`/chat/${id}`);
  };

  const categories = generateCategoryDescriptions(userChart, matchChart, compatibility, t);
  const aspects = generateAspectDescriptions(userChart, matchChart, compatibility);

  if (error) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadProfiles}>
            <Text style={styles.retryButtonText}>{t('refresh')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Match Header */}
        {matchProfile && (
          <View style={styles.matchHeader}>
            <Text style={styles.matchName}>{matchProfile.name}</Text>
            <View style={styles.signRow}>
              <Text style={styles.signBadge}>
                {getZodiacEmoji(matchProfile.sun_sign || '')} {matchProfile.sun_sign}
              </Text>
              <Text style={styles.signBadge}>
                🌙 {matchProfile.moon_sign}
              </Text>
              <Text style={styles.signBadge}>
                ⬆️ {matchProfile.rising_sign}
              </Text>
            </View>
          </View>
        )}

        {/* Overall Score */}
        <View style={styles.scoreSection}>
          <ScoreRing score={compatibility?.overall || 0} loading={loading} label={t('overallCompatibility')} />
          <Text style={styles.subtitle}>
            {t('synastrySubtitle')}
          </Text>
        </View>

        {/* Category Breakdown */}
        {!loading && categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('compatibilityBreakdown')}</Text>
            {categories.map((category) => (
              <CategoryCard key={category.name} category={category} />
            ))}
          </View>
        )}

        {/* Key Aspects - Premium Feature */}
        {!loading && aspects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('keyAspects')}</Text>
            {isPremium ? (
              <View style={styles.aspectsContainer}>
                {aspects.map((aspect, index) => (
                  <AspectRow key={index} aspect={aspect} />
                ))}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.premiumLock}
                onPress={() => triggerPaywall('synastry')}
              >
                <Text style={styles.lockIcon}>🔒</Text>
                <Text style={styles.lockText}>{t('advancedSynastry')}</Text>
                <Text style={styles.unlockButton}>{t('viewAllPlans')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>{t('keyAspects')}</Text>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#4ade80' }]}>△</Text>
            <Text style={styles.legendText}>{t('harmonious')}</Text>
          </View>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#f59e0b' }]}>☆</Text>
            <Text style={styles.legendText}>{t('neutral')}</Text>
          </View>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#ef4444' }]}>□</Text>
            <Text style={styles.legendText}>{t('challenging')}</Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.messageButton} onPress={handleSendMessage}>
            <Text style={styles.messageButtonText}>{t('typeMessage')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>{t('cancel')}</Text>
          </TouchableOpacity>
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
  matchHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  matchName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  signRow: {
    flexDirection: 'row',
    gap: 8,
  },
  signBadge: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    color: '#e94560',
    fontSize: 13,
    fontWeight: '500',
  },
  scoreSection: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  scoreRing: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreInner: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  scoreNumber: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
  },
  scorePercent: {
    fontSize: 24,
    color: '#e94560',
    marginTop: 8,
  },
  scoreLabel: {
    fontSize: 16,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
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
  categoryCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  categoryIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  categoryContent: {
    flex: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  categoryScore: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  categoryDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  aspectsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  aspectRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  aspectSymbol: {
    fontSize: 20,
    width: 30,
    textAlign: 'center',
  },
  aspectContent: {
    flex: 1,
  },
  aspectName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 2,
  },
  aspectDescription: {
    fontSize: 13,
    color: '#888',
  },
  premiumLock: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    alignItems: 'center',
    gap: 8,
  },
  lockIcon: {
    fontSize: 32,
  },
  lockText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  unlockButton: {
    color: '#e94560',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 8,
  },
  legend: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendSymbol: {
    fontSize: 16,
    width: 24,
  },
  legendText: {
    fontSize: 13,
    color: '#666',
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  messageButton: {
    backgroundColor: '#e94560',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  messageButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#888',
    fontSize: 15,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#e94560',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
