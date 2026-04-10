import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PremiumGate from '../../components/PremiumGate';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

type AspectType = {
  planet1Key: string;
  planet2Key: string;
  sign1: string;
  sign2: string;
  orb: number;
  influence: 'harmonious' | 'challenging' | 'neutral';
  descriptionKey: string;
};

type CompatibilityArea = {
  area: string;
  score: number;
  emoji: string;
  description: string;
};

type SynastryContentProps = {
  onLoadingChange?: (loading: boolean) => void;
};

function SynastryScreenContent({ onLoadingChange }: SynastryContentProps) {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [matchProfile, setMatchProfile] = useState<any>(null);
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  // Fade animation for smooth entry
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(loading);
  }, [loading, onLoadingChange]);

  // Fade in when content is ready
  useEffect(() => {
    if (!loading) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [loading, fadeAnim]);

  useEffect(() => {
    loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [matchId, user]);

  const loadProfiles = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      // Load user's profile
      const { data: userData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (userData) {
        setUserProfile(userData);
      }

      // Load match's profile if matchId provided
      if (matchId) {
        const { data: matchData } = await supabase
          .from('discoverable_profiles')
          .select('*')
          .eq('id', matchId)
          .maybeSingle();

        if (matchData) {
          setMatchProfile(matchData);
        }
      } else {
        // Demo profile for display
        setMatchProfile({
          name: 'Luna',
          sun_sign: 'Pisces',
          moon_sign: 'Cancer',
          rising_sign: 'Scorpio',
        });
      }
    } catch (err) {
      console.error('Error loading synastry profiles:', err);
    }

    setLoading(false);
  };

  const calculateOverallScore = (): number => {
    if (!userProfile || !matchProfile) return 75;

    // Simplified compatibility calculation
    const elements: Record<string, string> = {
      Aries: 'fire', Taurus: 'earth', Gemini: 'air', Cancer: 'water',
      Leo: 'fire', Virgo: 'earth', Libra: 'air', Scorpio: 'water',
      Sagittarius: 'fire', Capricorn: 'earth', Aquarius: 'air', Pisces: 'water',
    };

    const el1 = elements[userProfile.sun_sign] || 'fire';
    const el2 = elements[matchProfile.sun_sign] || 'water';

    const compatibility: Record<string, Record<string, number>> = {
      fire: { fire: 85, earth: 55, air: 92, water: 45 },
      earth: { fire: 55, earth: 88, air: 50, water: 90 },
      air: { fire: 92, earth: 50, air: 82, water: 60 },
      water: { fire: 45, earth: 90, air: 60, water: 88 },
    };

    return compatibility[el1]?.[el2] || 75;
  };

  const getCompatibilityAreas = (): CompatibilityArea[] => {
    return [
      {
        area: t('emotionalConnection') || 'Emotional Connection',
        score: 88,
        emoji: '💕',
        description: t('emotionalDesc') || 'Your Moon signs create a deep emotional bond. You understand each other\'s needs intuitively.',
      },
      {
        area: t('communication') || 'Communication',
        score: 75,
        emoji: '💬',
        description: t('communicationDesc') || 'Mercury aspects suggest lively conversations with occasional misunderstandings to work through.',
      },
      {
        area: t('passion') || 'Passion & Attraction',
        score: 92,
        emoji: '🔥',
        description: t('passionDesc') || 'Venus-Mars aspects indicate strong physical chemistry and romantic attraction.',
      },
      {
        area: t('longTermPotential') || 'Long-term Potential',
        score: 82,
        emoji: '🏠',
        description: t('longTermDesc') || 'Saturn aspects suggest a relationship that can stand the test of time with commitment.',
      },
      {
        area: t('sharedValues') || 'Shared Values',
        score: 79,
        emoji: '⚖️',
        description: t('valuesDesc') || 'Jupiter placements show aligned beliefs and a shared vision for the future.',
      },
      {
        area: t('growthPotential') || 'Growth & Transformation',
        score: 85,
        emoji: '🦋',
        description: t('growthDesc') || 'Pluto aspects indicate this relationship will transform you both in meaningful ways.',
      },
    ];
  };

  const getAspects = (): AspectType[] => {
    return [
      {
        planet1Key: 'sun',
        planet2Key: 'moon',
        sign1: userProfile?.sun_sign || 'Cancer',
        sign2: matchProfile?.moon_sign || 'Leo',
        orb: 2.5,
        influence: 'harmonious',
        descriptionKey: 'emotionalDesc',
      },
      {
        planet1Key: 'venus',
        planet2Key: 'mars',
        sign1: userProfile?.venus_sign || userProfile?.sun_sign || 'Gemini',
        sign2: matchProfile?.mars_sign || matchProfile?.sun_sign || 'Virgo',
        orb: 1.2,
        influence: 'harmonious',
        descriptionKey: 'passionDesc',
      },
      {
        planet1Key: 'mercury',
        planet2Key: 'mercury',
        sign1: userProfile?.mercury_sign || userProfile?.sun_sign || 'Cancer',
        sign2: matchProfile?.mercury_sign || matchProfile?.sun_sign || 'Sagittarius',
        orb: 3.8,
        influence: 'challenging',
        descriptionKey: 'communicationDesc',
      },
      {
        planet1Key: 'moon',
        planet2Key: 'venus',
        sign1: userProfile?.moon_sign || 'Aquarius',
        sign2: matchProfile?.venus_sign || matchProfile?.sun_sign || 'Leo',
        orb: 4.1,
        influence: 'harmonious',
        descriptionKey: 'emotionalDesc',
      },
      {
        planet1Key: 'saturn',
        planet2Key: 'sun',
        sign1: userProfile?.saturn_sign || userProfile?.sun_sign || 'Leo',
        sign2: matchProfile?.sun_sign || 'Aries',
        orb: 2.9,
        influence: 'neutral',
        descriptionKey: 'longTermDesc',
      },
    ];
  };

  const getInfluenceColor = (influence: string): string => {
    switch (influence) {
      case 'harmonious': return '#4ade80';
      case 'challenging': return '#f87171';
      default: return '#fbbf24';
    }
  };

  // Memoize before any early returns to respect React hooks rules
  const overallScore = useMemo(() => calculateOverallScore(), [userProfile, matchProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  const areas = useMemo(() => getCompatibilityAreas(), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const aspects = useMemo(() => getAspects(), [userProfile, matchProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallbacks for web where SafeAreaProvider may not work
  const topInset = insets?.top ?? 0;
  const bottomInset = insets?.bottom ?? 0;

  // Loading is now handled by PremiumGate via onLoadingChange callback
  if (loading) {
    return null; // PremiumGate shows the unified loading UI
  }

  const renderContent = () => {
    // If we are here, loading is false, but data might still be missing
    if (!userProfile || !matchProfile) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>🔮</Text>
          <Text style={styles.errorText}>
            {!userProfile ? t('profileDataMissing') || 'Your profile data is missing.' : t('matchDataMissing') || 'Match profile data is missing.'}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadProfiles}>
            <Text style={styles.retryText}>{t('retryLoading') || 'Retry Loading'}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.contentWrapper}>
        {/* Profiles Comparison */}
        <View style={styles.profilesSection}>
        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{userProfile?.name || t('you')}</Text>
          <View style={styles.profileSigns}>
            <Text style={styles.profileSign}>☀️ {userProfile?.sun_sign || '?'}</Text>
            <Text style={styles.profileSign}>🌙 {userProfile?.moon_sign || '?'}</Text>
            <Text style={styles.profileSign}>⬆️ {userProfile?.rising_sign || '?'}</Text>
          </View>
        </View>

        <View style={styles.vsContainer}>
          <Text style={styles.vsText}>💕</Text>
        </View>

        <View style={styles.profileCard}>
          <Text style={styles.profileName}>{matchProfile?.name || t('match')}</Text>
          <View style={styles.profileSigns}>
            <Text style={styles.profileSign}>☀️ {matchProfile?.sun_sign || '?'}</Text>
            <Text style={styles.profileSign}>🌙 {matchProfile?.moon_sign || '?'}</Text>
            <Text style={styles.profileSign}>⬆️ {matchProfile?.rising_sign || '?'}</Text>
          </View>
        </View>
      </View>

      {/* Overall Score */}
      <View style={styles.scoreSection}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreNumber}>{overallScore}%</Text>
          <Text style={styles.scoreLabel}>{t('cosmicCompatibility') || 'Cosmic Match'}</Text>
        </View>
        <Text style={styles.scoreDescription}>
          {overallScore >= 80
            ? t('highCompatibility') || 'Exceptional cosmic alignment! You share a powerful connection.'
            : overallScore >= 60
            ? t('goodCompatibility') || 'Strong potential for a meaningful relationship.'
            : t('growthCompatibility') || 'This pairing offers opportunities for growth and learning.'}
        </Text>
      </View>

      {/* Compatibility Areas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('compatibilityBreakdown') || 'Compatibility Breakdown'}</Text>
        {areas.map((area, index) => (
          <View key={index} style={styles.areaCard}>
            <View style={styles.areaHeader}>
              <Text style={styles.areaEmoji}>{area.emoji}</Text>
              <Text style={styles.areaName}>{area.area}</Text>
              <Text style={styles.areaScore}>{area.score}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${area.score}%` }]} />
            </View>
            <Text style={styles.areaDescription}>{area.description}</Text>
          </View>
        ))}
      </View>

      {/* Planetary Aspects */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('keyAspects') || 'Key Planetary Aspects'}</Text>
        {aspects.map((aspect, index) => (
          <View key={index} style={styles.aspectRow}>
            <View style={[styles.aspectDot, { backgroundColor: getInfluenceColor(aspect.influence) }]} />
            <View style={styles.aspectInfo}>
              <Text style={styles.aspectTitle}>
                {t(aspect.planet1Key)} ({t(aspect.sign1.toLowerCase()) || aspect.sign1}) • {t(aspect.planet2Key)} ({t(aspect.sign2.toLowerCase()) || aspect.sign2})
              </Text>
              <Text style={styles.aspectOrb}>{t('orb') || 'Orb'}: {aspect.orb}° • {t(aspect.influence) || aspect.influence}</Text>
              <Text style={styles.aspectDesc}>{t(aspect.descriptionKey) || aspect.descriptionKey}</Text>
            </View>
          </View>
        ))}

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
            <Text style={styles.legendText}>{t('harmonious') || 'Harmonious'}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#f87171' }]} />
            <Text style={styles.legendText}>{t('challenging') || 'Challenging'}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#fbbf24' }]} />
            <Text style={styles.legendText}>{t('neutral') || 'Neutral'}</Text>
          </View>
        </View>
      </View>

      {/* Relationship Advice */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('cosmicAdvice') || 'Cosmic Advice'}</Text>
        <View style={styles.adviceCard}>
          <Text style={styles.adviceEmoji}>✨</Text>
          <Text style={styles.adviceTitle}>{t('strengthenBond') || 'Strengthen Your Bond'}</Text>
          <Text style={styles.adviceText}>
            {t('adviceText') || 'Focus on open communication during Mercury retrograde periods. Plan romantic activities during Venus transits for maximum connection. Your composite chart suggests Sunday evenings are ideal for quality time together.'}
          </Text>
        </View>
      </View>
      </View>
    );
  };

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
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
          <Text style={styles.title}>{t('advancedSynastry')}</Text>
          <Text style={styles.subtitle}>{t('synastrySubtitle') || 'Deep compatibility analysis'}</Text>
        </View>

        
          {renderContent()}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
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
  contentWrapper: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  errorContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorText: {
    color: AppTheme.colors.danger,
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: 'rgba(232, 93, 117, 0.16)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.28)',
  },
  retryText: {
    color: AppTheme.colors.coral,
    fontWeight: '600',
    fontSize: 14,
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
  profilesSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  profileCard: {
    flex: 1,
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
    marginBottom: 8,
  },
  profileSigns: {
    gap: 4,
  },
  profileSign: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
  },
  vsContainer: {
    paddingHorizontal: 12,
  },
  vsText: {
    fontSize: 24,
  },
  scoreSection: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  scoreCircle: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(232, 93, 117, 0.14)',
    borderWidth: 4,
    borderColor: AppTheme.colors.coral,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreNumber: {
    fontSize: 40,
    fontWeight: 'bold',
    color: AppTheme.colors.coral,
  },
  scoreLabel: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreDescription: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
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
  areaCard: {
    backgroundColor: AppTheme.colors.panel,
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  areaEmoji: {
    fontSize: 20,
    marginRight: 10,
  },
  areaName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  areaScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppTheme.colors.coral,
  },
  progressBar: {
    height: 6,
    backgroundColor: AppTheme.colors.panelStrong,
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: AppTheme.colors.coral,
    borderRadius: 3,
  },
  areaDescription: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    lineHeight: 18,
  },
  aspectRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.colors.border,
  },
  aspectDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    marginTop: 4,
  },
  aspectInfo: {
    flex: 1,
  },
  aspectTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: AppTheme.colors.textPrimary,
  },
  aspectOrb: {
    fontSize: 12,
    color: AppTheme.colors.textMuted,
  },
  aspectDesc: {
    fontSize: 13,
    color: AppTheme.colors.textSecondary,
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: AppTheme.colors.textSecondary,
  },
  adviceCard: {
    backgroundColor: 'rgba(232, 93, 117, 0.12)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 93, 117, 0.22)',
  },
  adviceEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  adviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: AppTheme.colors.coral,
    marginBottom: 8,
  },
  adviceText: {
    fontSize: 14,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default function SynastryScreen() {
  const [isDataLoading, setIsDataLoading] = useState(true);

  return (
    <PremiumGate feature="synastry" isDataLoading={isDataLoading}>
      <SynastryScreenContent onLoadingChange={setIsDataLoading} />
    </PremiumGate>
  );
}
