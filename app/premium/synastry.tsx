import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
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

type AspectType = {
  planet1: string;
  planet2: string;
  aspect: string;
  orb: number;
  influence: 'harmonious' | 'challenging' | 'neutral';
  description: string;
};

type CompatibilityArea = {
  area: string;
  score: number;
  emoji: string;
  description: string;
};

function SynastryScreenContent() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [matchProfile, setMatchProfile] = useState<any>(null);
  const { user } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    loadProfiles();
  }, [matchId, user]);

  const loadProfiles = async () => {
    if (!user) return;
    setLoading(true);

    // Load user's profile
    const { data: userData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (userData) {
      setUserProfile(userData);
    }

    // Load match's profile if matchId provided
    if (matchId) {
      const { data: matchData } = await supabase
        .from('discoverable_profiles')
        .select('*')
        .eq('id', matchId)
        .single();

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
        planet1: 'Sun',
        planet2: 'Moon',
        aspect: 'Trine',
        orb: 2.5,
        influence: 'harmonious',
        description: 'Natural understanding and emotional support',
      },
      {
        planet1: 'Venus',
        planet2: 'Mars',
        aspect: 'Conjunction',
        orb: 1.2,
        influence: 'harmonious',
        description: 'Strong romantic and physical attraction',
      },
      {
        planet1: 'Mercury',
        planet2: 'Mercury',
        aspect: 'Square',
        orb: 3.8,
        influence: 'challenging',
        description: 'Different communication styles to navigate',
      },
      {
        planet1: 'Moon',
        planet2: 'Venus',
        aspect: 'Sextile',
        orb: 4.1,
        influence: 'harmonious',
        description: 'Affectionate and nurturing connection',
      },
      {
        planet1: 'Saturn',
        planet2: 'Sun',
        aspect: 'Trine',
        orb: 2.9,
        influence: 'neutral',
        description: 'Stability and mutual respect in the relationship',
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

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  const overallScore = calculateOverallScore();
  const areas = getCompatibilityAreas();
  const aspects = getAspects();

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('advancedSynastry')}</Text>
          <Text style={styles.subtitle}>{t('synastrySubtitle') || 'Deep compatibility analysis'}</Text>
        </View>

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
                  {aspect.planet1} {aspect.aspect} {aspect.planet2}
                </Text>
                <Text style={styles.aspectOrb}>{t('orb') || 'Orb'}: {aspect.orb}°</Text>
                <Text style={styles.aspectDesc}>{aspect.description}</Text>
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
  profilesSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  profileCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  profileSigns: {
    gap: 4,
  },
  profileSign: {
    fontSize: 13,
    color: '#888',
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
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderWidth: 4,
    borderColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreNumber: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#e94560',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scoreDescription: {
    fontSize: 15,
    color: '#ccc',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    color: '#fff',
  },
  areaScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#e94560',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e94560',
    borderRadius: 3,
  },
  areaDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  aspectRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
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
    color: '#fff',
  },
  aspectOrb: {
    fontSize: 12,
    color: '#666',
  },
  aspectDesc: {
    fontSize: 13,
    color: '#888',
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
    color: '#888',
  },
  adviceCard: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.2)',
  },
  adviceEmoji: {
    fontSize: 32,
    marginBottom: 12,
  },
  adviceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 8,
  },
  adviceText: {
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default function SynastryScreen() {
  return (
    <PremiumGate feature="synastry">
      <SynastryScreenContent />
    </PremiumGate>
  );
}
