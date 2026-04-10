import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BlockReportMenu from '../../components/BlockReportMenu';
import { AppTheme } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePremium } from '../../contexts/PremiumContext';
import {
  BirthChart,
  CompatibilityScore,
  getElement,
  getZodiacEmoji,
  calculateQuickCompatibility
} from '../../services/astrologyService';
import { calculateNatalChart, calculateCompatibility } from '../../services/astrology';
import { signDegreeToLongitude } from '../../services/astrologyCore';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

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
  title: string;
  type: 'harmonious' | 'intense' | 'challenging';
  description: string;
};

const ScoreRing = React.memo(function ScoreRing({ score, loading, label, t }: { score: number; loading: boolean; label: string; t: (key: string) => string }) {
  const getScoreVerdict = (s: number) => {
    if (s >= 90) return t('scoreExcellent') || 'Soulmate potential';
    if (s >= 75) return t('scoreGreat') || 'Strong cosmic bond';
    if (s >= 60) return t('scoreGood') || 'Promising alignment';
    if (s >= 45) return t('scoreFair') || 'Room to grow together';
    return t('scoreLow') || 'Different cosmic paths';
  };

  const getScoreColor = (s: number) => {
    if (s >= 80) return '#4ade80';
    if (s >= 60) return '#e9c46a';
    return '#ef4444';
  };

  return (
    <View style={styles.scoreRing}>
      <View style={[styles.scoreInner, !loading && { borderColor: getScoreColor(score) }]}>
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
      {!loading && (
        <Text style={[styles.scoreVerdict, { color: getScoreColor(score) }]}>
          {getScoreVerdict(score)}
        </Text>
      )}
    </View>
  );
});

const CategoryCard = React.memo(function CategoryCard({ category, explainer }: { category: Category; explainer?: string }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4ade80';
    if (score >= 60) return '#e9c46a';
    return '#ef4444';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    return 'Needs work';
  };

  return (
    <View style={styles.categoryCard}>
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <View style={styles.categoryContent}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <View style={styles.categoryScoreWrap}>
            <Text style={[styles.categoryScore, { color: getScoreColor(category.score) }]}>
              {category.score}%
            </Text>
            <Text style={[styles.categoryScoreLabel, { color: getScoreColor(category.score) }]}>
              {getScoreLabel(category.score)}
            </Text>
          </View>
        </View>
        {explainer && <Text style={styles.categoryExplainer}>{explainer}</Text>}
        <Text style={styles.categoryDescription}>{category.description}</Text>
      </View>
    </View>
  );
});

const AspectRow = React.memo(function AspectRow({ aspect, typeExplainer }: { aspect: Aspect; typeExplainer?: string }) {
  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'harmonious':
        return { color: '#4ade80', symbol: '△', label: 'Harmonious' };
      case 'intense':
        return { color: '#f59e0b', symbol: '☆', label: 'Intense' };
      case 'challenging':
        return { color: '#ef4444', symbol: '□', label: 'Challenging' };
      default:
        return { color: '#888', symbol: '○', label: '' };
    }
  };

  const typeStyle = getTypeStyle(aspect.type);

  return (
    <View style={styles.aspectRow}>
      <View style={styles.aspectSymbolWrap}>
        <Text style={[styles.aspectSymbol, { color: typeStyle.color }]}>{typeStyle.symbol}</Text>
        <Text style={[styles.aspectTypeLabel, { color: typeStyle.color }]}>{typeStyle.label}</Text>
      </View>
      <View style={styles.aspectContent}>
        <Text style={styles.aspectName}>{aspect.title}</Text>
        <Text style={styles.aspectDescription}>{aspect.description}</Text>
        {typeExplainer && <Text style={styles.aspectExplainer}>{typeExplainer}</Text>}
      </View>
    </View>
  );
});

function generateAspectDescriptions(
  userChart: BirthChart | null,
  matchChart: BirthChart | null,
  compatibility: CompatibilityScore | null,
  t: (key: string) => string
): Aspect[] {
  if (!userChart || !matchChart || !compatibility) {
    return [];
  }

  const aspects: Aspect[] = [];
  const translateSign = (sign: string) => t(sign.toLowerCase()) || sign;

  // Sun-Moon aspect
  const sunMoonCompat = getElement(userChart.sun.sign) === getElement(matchChart.moon.sign);
  aspects.push({
    title: `${t('sun')} (${translateSign(userChart.sun.sign)}) • ${t('moon')} (${translateSign(matchChart.moon.sign)})`,
    type: sunMoonCompat ? 'harmonious' : 'challenging',
    description: sunMoonCompat
      ? t('emotionalDesc')
      : t('growthCompatibility')
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
    title: `${t('venus')} (${translateSign(userChart.planets.venus.sign)}) • ${t('mars')} (${translateSign(matchChart.planets.mars.sign)})`,
    type: passionCompat ? 'intense' : 'challenging',
    description: passionCompat
      ? t('passionDesc')
      : t('growthCompatibility')
  });

  // Mercury aspect (communication)
  const mercCompat = getElement(userChart.planets.mercury.sign) === getElement(matchChart.planets.mercury.sign);
  aspects.push({
    title: `${t('mercury')} (${translateSign(userChart.planets.mercury.sign)}) • ${t('mercury')} (${translateSign(matchChart.planets.mercury.sign)})`,
    type: mercCompat ? 'harmonious' : 'challenging',
    description: t('communicationDesc')
  });

  // Moon-Moon aspect (emotional)
  const moonCompat = getElement(userChart.moon.sign) === getElement(matchChart.moon.sign);
  aspects.push({
    title: `${t('moon')} (${translateSign(userChart.moon.sign)}) • ${t('moon')} (${translateSign(matchChart.moon.sign)})`,
    type: moonCompat ? 'harmonious' : 'challenging',
    description: moonCompat
      ? t('emotionalDesc')
      : t('growthCompatibility')
  });

  // Saturn aspect (long-term)
  const saturnCompat = getElement(userChart.planets.saturn.sign) === getElement(matchChart.planets.saturn.sign);
  aspects.push({
    title: `${t('saturn')} (${translateSign(userChart.planets.saturn.sign)}) • ${t('saturn')} (${translateSign(matchChart.planets.saturn.sign)})`,
    type: saturnCompat ? 'harmonious' : 'intense',
    description: saturnCompat
      ? t('longTermDesc')
      : t('growthCompatibility')
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
  const { tier, triggerPaywall } = usePremium();
  const isPremium = tier !== 'free';
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation, t]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchProfile, setMatchProfile] = useState<Profile | null>(null);
  const [_userProfile, setUserProfile] = useState<Profile | null>(null);
  const [userChart, setUserChart] = useState<BirthChart | null>(null);
  const [matchChart, setMatchChart] = useState<BirthChart | null>(null);
  const [compatibility, setCompatibility] = useState<CompatibilityScore | null>(null);

  useEffect(() => {
    if (id && user) {
      loadProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
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
      if (userResult.data.birth_date && typeof userResult.data.birth_date === 'string') {
        const parts = userResult.data.birth_date.split('-').map(Number);
        const [year, month, day] = parts;
        if (year && month && day && !isNaN(year) && !isNaN(month) && !isNaN(day)) {
          const birthDate = new Date(year, month - 1, day);
          localChart1 = calculateNatalChart(
            birthDate,
            userResult.data.birth_time,
            userResult.data.birth_latitude || 45.5,
            userResult.data.birth_longitude || -73.5
          );
        }
      }

      // Match's chart - use local calculation
      if (matchResult.data.birth_date && typeof matchResult.data.birth_date === 'string') {
        const parts = matchResult.data.birth_date.split('-').map(Number);
        const [year, month, day] = parts;
        if (year && month && day && !isNaN(year) && !isNaN(month) && !isNaN(day)) {
          const birthDate = new Date(year, month - 1, day);
          localChart2 = calculateNatalChart(
            birthDate,
            matchResult.data.birth_time,
            matchResult.data.birth_latitude || 45.5,
            matchResult.data.birth_longitude || -73.5
          );
        }
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

  const categories = useMemo(
    () => generateCategoryDescriptions(userChart, matchChart, compatibility, t),
    [userChart, matchChart, compatibility, t]
  );
  const aspects = useMemo(
    () => generateAspectDescriptions(userChart, matchChart, compatibility, t),
    [userChart, matchChart, compatibility, t]
  );

  // Beginner-friendly explainers for each compatibility category
  const categoryExplainers: Record<string, string> = useMemo(() => ({
    [t('emotional')]: t('emotionalExplainer') || "How well you understand each other's feelings and emotional needs",
    [t('communication')]: t('communicationExplainer') || 'How naturally you exchange ideas and resolve differences',
    [t('passion')]: t('passionExplainer') || 'The spark and physical chemistry between you',
    [t('longTerm')]: t('longTermExplainer') || 'How well you can build a lasting, committed relationship',
    [t('values')]: t('valuesExplainer') || 'Whether you share the same priorities and vision for life',
    [t('growth')]: t('growthExplainer') || 'How much you inspire each other to evolve and improve',
  }), [t]);

  // Explainers for aspect types
  const aspectTypeExplainers: Record<string, string> = useMemo(() => ({
    harmonious: t('harmonious_explainer') || 'Easy flow -- these energies complement each other',
    intense: t('intense_explainer') || 'Magnetic pull -- powerful but requires awareness',
    challenging: t('challenging_explainer') || 'Growth edge -- differences that push you both forward',
  }), [t]);

  if (error) {
    return (
      <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
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
    <LinearGradient colors={[...AppTheme.gradients.screen]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.inlineHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.inlineBackButton} onPress={() => router.back()}>
            <Text style={styles.inlineBackText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.inlineHeaderTitle}>{t('compatibilityAnalysis')}</Text>
          <View style={styles.inlineHeaderSpacer} />
        </View>

        {/* Cosmic Bond Celebration Banner */}
        {matchProfile && !loading && compatibility && (
          <View style={styles.celebrationBanner}>
            <Text style={styles.celebrationEmoji}>
              {compatibility.overall >= 80 ? '\u{1F496}' : compatibility.overall >= 60 ? '\u{2728}' : '\u{1F30C}'}
            </Text>
            <Text style={styles.celebrationTitle}>
              {t('matchDetailCelebration') || 'Your Cosmic Bond'}
            </Text>
            <Text style={styles.celebrationDesc}>
              {t('matchDetailCelebrationDesc') || 'The universe brought your paths together. Explore what the stars reveal about your connection.'}
            </Text>
          </View>
        )}

        {/* Match Header */}
        {matchProfile && (
          <View style={styles.matchHeader}>
            <View style={styles.matchHeaderTop}>
              <Text style={styles.matchName}>{matchProfile.name}</Text>
              {user && (
                <BlockReportMenu
                  userId={user.id}
                  targetUserId={matchProfile.id}
                  targetUserName={matchProfile.name}
                  showUnmatch={false}
                  onBlock={() => router.replace('/(tabs)/matches')}
                />
              )}
            </View>
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
          <ScoreRing score={compatibility?.overall || 0} loading={loading} label={t('overallCompatibility')} t={t} />
          <Text style={styles.subtitle}>
            {t('synastrySubtitle')}
          </Text>
        </View>

        {/* Category Breakdown */}
        {!loading && categories.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('compatibilityBreakdown')}</Text>
            {isPremium ? (
              // Premium users see all categories
              categories.map((category) => (
                <CategoryCard key={category.name} category={category} explainer={categoryExplainers[category.name]} />
              ))
            ) : (
              // Free users see only first 2 categories + unlock prompt
              <>
                {categories.slice(0, 2).map((category) => (
                  <CategoryCard key={category.name} category={category} explainer={categoryExplainers[category.name]} />
                ))}
                <TouchableOpacity
                  style={styles.unlockMoreContainer}
                  onPress={() => triggerPaywall('synastry')}
                >
                  <View style={styles.lockedCategoriesPreview}>
                    {categories.slice(2).map((category) => (
                      <View key={category.name} style={styles.lockedCategoryRow}>
                        <Text style={styles.lockedCategoryIcon}>{category.icon}</Text>
                        <Text style={styles.lockedCategoryName}>{category.name}</Text>
                        <Text style={styles.lockedScore}>???</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.unlockPrompt}>
                    <Text style={styles.unlockIcon}>✨</Text>
                    <Text style={styles.unlockTitle}>{t('unlockFullCompatibility')}</Text>
                    <Text style={styles.unlockSubtitle}>{t('unlockCompatibilityDesc')}</Text>
                    <View style={styles.unlockButtonContainer}>
                      <Text style={styles.unlockButtonText}>{t('viewAllPlans')}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Key Aspects - Premium Feature */}
        {!loading && aspects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('keyAspects')}</Text>
            {isPremium ? (
              <View style={styles.aspectsContainer}>
                {aspects.map((aspect, index) => (
                  <AspectRow key={index} aspect={aspect} typeExplainer={aspectTypeExplainers[aspect.type]} />
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

        {/* Legend with beginner-friendly explainer */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>{t('legendExplainerTitle') || 'Reading Your Chart'}</Text>
          <Text style={styles.legendDesc}>{t('legendExplainerDesc') || 'Planetary aspects show how your planets interact. Think of each pairing as a conversation between two cosmic energies.'}</Text>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#4ade80' }]}>△</Text>
            <View style={styles.legendTextWrap}>
              <Text style={styles.legendText}>{t('harmonious')}</Text>
              <Text style={styles.legendSubtext}>{t('harmonious_explainer') || 'Easy flow'}</Text>
            </View>
          </View>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#f59e0b' }]}>☆</Text>
            <View style={styles.legendTextWrap}>
              <Text style={styles.legendText}>{t('neutral')}</Text>
              <Text style={styles.legendSubtext}>{t('intense_explainer') || 'Magnetic pull'}</Text>
            </View>
          </View>
          <View style={styles.legendRow}>
            <Text style={[styles.legendSymbol, { color: '#ef4444' }]}>□</Text>
            <View style={styles.legendTextWrap}>
              <Text style={styles.legendText}>{t('challenging')}</Text>
              <Text style={styles.legendSubtext}>{t('challenging_explainer') || 'Growth edge'}</Text>
            </View>
          </View>
        </View>

        {/* Conversation Starter Hint */}
        {matchProfile && compatibility && (
          <View style={styles.conversationHint}>
            <Text style={styles.conversationHintIcon}>{'\u{1F4A1}'}</Text>
            <Text style={styles.conversationHintText}>
              {compatibility.passion >= 75
                ? (t('matchDetailConversationHint', { sign: matchProfile.sun_sign || '', category: t('passion').toLowerCase() }) || `Start the conversation \u2014 your charts suggest strong passion compatibility`)
                : compatibility.communication >= 75
                  ? (t('matchDetailConversationHint', { sign: matchProfile.sun_sign || '', category: t('communication').toLowerCase() }) || `Start the conversation \u2014 your charts suggest strong communication compatibility`)
                  : (t('matchDetailIcebreaker', { sign: matchProfile.sun_sign || '' }) || `Say something about their ${matchProfile.sun_sign} energy`)}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.messageButton} onPress={handleSendMessage}>
            <Text style={styles.messageButtonEmoji}>💬</Text>
            <Text style={styles.messageButtonText}>{t('sendFirstMessage') || 'Send a Message'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.datePlannerButton}
            onPress={() => router.push(`/premium-screens/date-planner?matchId=${id}` as any)}
          >
            <Text style={styles.datePlannerIcon}>📅</Text>
            <Text style={styles.datePlannerText}>{t('planADate')}</Text>
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
    paddingBottom: 48,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  inlineBackButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.colors.cardBg,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorder,
  },
  inlineBackText: {
    color: AppTheme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
  inlineHeaderTitle: {
    flex: 1,
    marginHorizontal: 12,
    color: AppTheme.colors.textPrimary,
    ...AppTheme.type.section,
    fontWeight: '700',
    textAlign: 'center',
  },
  inlineHeaderSpacer: {
    width: 42,
  },
  matchHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  matchHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 12,
  },
  matchName: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  signRow: {
    flexDirection: 'row',
    gap: 8,
  },
  signBadge: {
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: AppTheme.radius.pill,
    color: AppTheme.colors.coral,
    fontSize: 13,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.22)',
    overflow: 'hidden',
  },
  scoreSection: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  scoreRing: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreInner: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 5,
    borderColor: AppTheme.colors.coral,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 12,
    backgroundColor: 'rgba(232, 93, 117, 0.06)',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.30,
    shadowRadius: 24,
    elevation: 8,
  },
  scoreNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  scorePercent: {
    fontSize: 24,
    color: AppTheme.colors.coral,
    marginTop: 10,
    fontWeight: '700',
  },
  scoreLabel: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2.5,
  },
  scoreVerdict: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  subtitle: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
    marginBottom: 18,
    fontWeight: '700',
  },
  categoryCard: {
    flexDirection: 'row',
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorderElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
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
    marginBottom: 6,
  },
  categoryName: {
    ...AppTheme.type.body,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
  },
  categoryScoreWrap: {
    alignItems: 'flex-end',
  },
  categoryScore: {
    fontSize: 18,
    fontWeight: '800',
  },
  categoryScoreLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  categoryExplainer: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 4,
    fontSize: 11,
  },
  categoryDescription: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
  },
  aspectsContainer: {
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorderElevated,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  aspectRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.colors.cardBorder,
  },
  aspectSymbolWrap: {
    alignItems: 'center',
    width: 42,
    paddingTop: 2,
  },
  aspectSymbol: {
    fontSize: 20,
    textAlign: 'center',
  },
  aspectTypeLabel: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  aspectExplainer: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    fontStyle: 'italic',
    fontSize: 11,
    marginTop: 3,
  },
  aspectContent: {
    flex: 1,
  },
  aspectName: {
    ...AppTheme.type.body,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 3,
  },
  aspectDescription: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
  },
  premiumLock: {
    backgroundColor: 'rgba(232, 93, 117, 0.06)',
    borderRadius: AppTheme.radius.lg,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.22)',
    alignItems: 'center',
    gap: 10,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  lockIcon: {
    fontSize: 36,
  },
  lockText: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
  },
  unlockButton: {
    color: AppTheme.colors.coral,
    ...AppTheme.type.body,
    fontWeight: '700',
    marginTop: 8,
  },
  unlockMoreContainer: {
    marginTop: 4,
  },
  lockedCategoriesPreview: {
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    marginBottom: 14,
    opacity: 0.55,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorder,
  },
  lockedCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.colors.cardBorder,
  },
  lockedCategoryIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  lockedCategoryName: {
    flex: 1,
    ...AppTheme.type.body,
    color: AppTheme.colors.textMuted,
  },
  lockedScore: {
    ...AppTheme.type.body,
    color: 'rgba(255,255,255,0.20)',
    fontWeight: '700',
  },
  unlockPrompt: {
    backgroundColor: 'rgba(232, 93, 117, 0.08)',
    borderRadius: AppTheme.radius.xl,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.25)',
    alignItems: 'center',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  unlockIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  unlockTitle: {
    ...AppTheme.type.heading,
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  unlockSubtitle: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  unlockButtonContainer: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: AppTheme.radius.pill,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.40,
    shadowRadius: 12,
    elevation: 6,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    ...AppTheme.type.body,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  legend: {
    marginHorizontal: 20,
    backgroundColor: AppTheme.colors.cardBg,
    borderRadius: AppTheme.radius.lg,
    padding: 18,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: AppTheme.colors.cardBorder,
  },
  legendTitle: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  legendDesc: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  legendSymbol: {
    fontSize: 16,
    width: 26,
  },
  legendTextWrap: {
    flex: 1,
  },
  legendText: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
    fontWeight: '600',
  },
  legendSubtext: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  actions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  messageButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 18,
    borderRadius: AppTheme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  messageButtonEmoji: {
    fontSize: 20,
  },
  messageButtonText: {
    color: '#FFFFFF',
    ...AppTheme.type.bodyLarge,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  datePlannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppTheme.colors.premiumCosmicSoft,
    paddingVertical: 16,
    borderRadius: AppTheme.radius.pill,
    gap: 8,
    borderWidth: 1,
    borderColor: AppTheme.colors.premiumCosmicBorder,
  },
  datePlannerIcon: {
    fontSize: 18,
  },
  datePlannerText: {
    color: AppTheme.colors.cosmic,
    ...AppTheme.type.body,
    fontWeight: '700',
  },
  backButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  backButtonText: {
    color: AppTheme.colors.textMuted,
    ...AppTheme.type.body,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: AppTheme.colors.danger,
    ...AppTheme.type.body,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: AppTheme.colors.coral,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: AppTheme.radius.pill,
    marginBottom: 12,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 10,
    elevation: 6,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  celebrationBanner: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 32,
  },
  celebrationEmoji: {
    fontSize: 36,
    marginBottom: 10,
  },
  celebrationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  celebrationDesc: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 300,
  },
  conversationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(124, 108, 255, 0.08)',
    borderRadius: AppTheme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(124, 108, 255, 0.16)',
    gap: 10,
  },
  conversationHintIcon: {
    fontSize: 18,
  },
  conversationHintText: {
    flex: 1,
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 19,
    fontStyle: 'italic',
  },
});
