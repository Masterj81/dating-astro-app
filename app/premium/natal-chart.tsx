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

type PlanetPosition = {
  planet: string;
  planetKey: string;
  sign: string;
  degree: number;
  house: number;
  emoji: string;
};

type NatalChartData = {
  sun_sign: string;
  moon_sign: string;
  rising_sign: string;
  mercury_sign?: string;
  venus_sign?: string;
  mars_sign?: string;
  jupiter_sign?: string;
  saturn_sign?: string;
  birth_date: string;
  birth_time: string;
  birth_city: string;
};

type TranslateFunction = (key: string, options?: Record<string, string | number>) => string;

// Get element for a sign
const getElement = (sign: string): string => {
  const fireSign = ['Aries', 'Leo', 'Sagittarius'];
  const earthSigns = ['Taurus', 'Virgo', 'Capricorn'];
  const airSigns = ['Gemini', 'Libra', 'Aquarius'];
  const waterSigns = ['Cancer', 'Scorpio', 'Pisces'];

  if (fireSign.includes(sign)) return 'fire';
  if (earthSigns.includes(sign)) return 'earth';
  if (airSigns.includes(sign)) return 'air';
  if (waterSigns.includes(sign)) return 'water';
  return 'unknown';
};

// Get modality for a sign
const getModality = (sign: string): string => {
  const cardinalSigns = ['Aries', 'Cancer', 'Libra', 'Capricorn'];
  const fixedSigns = ['Taurus', 'Leo', 'Scorpio', 'Aquarius'];
  const mutableSigns = ['Gemini', 'Virgo', 'Sagittarius', 'Pisces'];

  if (cardinalSigns.includes(sign)) return 'cardinal';
  if (fixedSigns.includes(sign)) return 'fixed';
  if (mutableSigns.includes(sign)) return 'mutable';
  return 'unknown';
};

function NatalChartScreenContent() {
  const [chartData, setChartData] = useState<NatalChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>('sun');
  const { user } = useAuth();
  const { t } = useLanguage();

  const signs = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
                 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

  // Generate planetary positions
  const getPlanetaryPositions = (data: NatalChartData): PlanetPosition[] => {
    return [
      { planet: t('sun'), planetKey: 'sun', sign: data.sun_sign || 'Unknown', degree: 15, house: 1, emoji: '☀️' },
      { planet: t('moon'), planetKey: 'moon', sign: data.moon_sign || 'Unknown', degree: 22, house: 4, emoji: '🌙' },
      { planet: t('rising'), planetKey: 'rising', sign: data.rising_sign || 'Unknown', degree: 8, house: 1, emoji: '⬆️' },
      { planet: t('mercury') || 'Mercury', planetKey: 'mercury', sign: data.mercury_sign || signs[Math.floor(Math.random() * 12)], degree: 12, house: 3, emoji: '☿️' },
      { planet: t('venus') || 'Venus', planetKey: 'venus', sign: data.venus_sign || signs[Math.floor(Math.random() * 12)], degree: 28, house: 7, emoji: '♀️' },
      { planet: t('mars') || 'Mars', planetKey: 'mars', sign: data.mars_sign || signs[Math.floor(Math.random() * 12)], degree: 5, house: 10, emoji: '♂️' },
      { planet: t('jupiter') || 'Jupiter', planetKey: 'jupiter', sign: data.jupiter_sign || signs[Math.floor(Math.random() * 12)], degree: 19, house: 9, emoji: '♃' },
      { planet: t('saturn') || 'Saturn', planetKey: 'saturn', sign: data.saturn_sign || signs[Math.floor(Math.random() * 12)], degree: 3, house: 11, emoji: '♄' },
    ];
  };

  useEffect(() => {
    loadChartData();
  }, [user]);

  const loadChartData = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('sun_sign, moon_sign, rising_sign, birth_date, birth_time, birth_city')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      setChartData(data);
    }
    setLoading(false);
  };

  // Get sign description
  const getSignDescription = (sign: string): string => {
    const key = `${sign.toLowerCase()}Desc`;
    return t(key) || getDefaultDescription(sign);
  };

  const getDefaultDescription = (sign: string): string => {
    const defaults: Record<string, string> = {
      'Aries': 'Bold, ambitious, and competitive',
      'Taurus': 'Reliable, patient, and sensual',
      'Gemini': 'Curious, adaptable, and communicative',
      'Cancer': 'Nurturing, intuitive, and protective',
      'Leo': 'Dramatic, creative, and confident',
      'Virgo': 'Analytical, practical, and helpful',
      'Libra': 'Diplomatic, fair, and social',
      'Scorpio': 'Intense, passionate, and perceptive',
      'Sagittarius': 'Adventurous, optimistic, and philosophical',
      'Capricorn': 'Disciplined, ambitious, and responsible',
      'Aquarius': 'Independent, original, and humanitarian',
      'Pisces': 'Compassionate, artistic, and intuitive',
    };
    return defaults[sign] || 'Mysterious and unique';
  };

  // Get detailed interpretation for Sun sign
  const getSunInterpretation = (sign: string): string => {
    const key = `sunIn${sign}`;
    return t(key) || getDefaultSunInterpretation(sign);
  };

  const getDefaultSunInterpretation = (sign: string): string => {
    const interpretations: Record<string, string> = {
      'Aries': 'Your Sun in Aries makes you a natural leader with pioneering spirit. You approach life with courage and enthusiasm, always ready to take on new challenges. Your identity is tied to being first, being bold, and blazing trails for others to follow.',
      'Taurus': 'With your Sun in Taurus, you embody stability and sensuality. You find your identity through building lasting things - relationships, homes, careers. Your approach to life is patient and methodical, valuing quality over quantity.',
      'Gemini': 'Your Gemini Sun gives you a curious, adaptable nature. You identify with being the communicator, the connector of ideas and people. Your mind is quick and versatile, always seeking new information and experiences.',
      'Cancer': 'With the Sun in Cancer, your identity is deeply connected to home, family, and emotional security. You are naturally nurturing and protective, with strong intuitive abilities that guide your path through life.',
      'Leo': 'Your Leo Sun makes you naturally magnetic and creative. You identify with being a source of warmth and inspiration to others. Your life purpose involves creative self-expression and leading with your heart.',
      'Virgo': 'With your Sun in Virgo, you find identity through service and improvement. You have a keen eye for detail and a desire to be useful. Your life purpose involves analyzing, healing, and perfecting.',
      'Libra': 'Your Libra Sun gives you a strong sense of justice and beauty. You identify with being a peacemaker and connector. Your life purpose involves creating harmony and bringing people together.',
      'Scorpio': 'With the Sun in Scorpio, you have a deep, transformative nature. You identify with going beneath the surface to uncover hidden truths. Your life purpose involves transformation and regeneration.',
      'Sagittarius': 'Your Sagittarius Sun makes you a natural philosopher and explorer. You identify with the quest for meaning and truth. Your life purpose involves expanding horizons - both physical and mental.',
      'Capricorn': 'With your Sun in Capricorn, you identify with achievement and mastery. You are naturally ambitious and disciplined, with a strong sense of responsibility. Your life purpose involves building something lasting.',
      'Aquarius': 'Your Aquarius Sun gives you a unique, progressive nature. You identify with being different and ahead of your time. Your life purpose involves innovation and humanitarian progress.',
      'Pisces': 'With the Sun in Pisces, you have a deeply compassionate and artistic nature. You identify with the interconnectedness of all things. Your life purpose involves healing, creativity, and spiritual growth.',
    };
    return interpretations[sign] || 'Your Sun sign reveals your core identity and life purpose.';
  };

  // Get detailed interpretation for Moon sign
  const getMoonInterpretation = (sign: string): string => {
    const key = `moonIn${sign}`;
    return t(key) || getDefaultMoonInterpretation(sign);
  };

  const getDefaultMoonInterpretation = (sign: string): string => {
    const interpretations: Record<string, string> = {
      'Aries': 'Your Moon in Aries gives you passionate, fiery emotions. You need excitement and action to feel emotionally fulfilled. You process feelings quickly and directly, preferring to confront issues head-on.',
      'Taurus': 'With your Moon in Taurus, you have deep emotional needs for security and comfort. You process feelings slowly and need time to adjust to changes. Sensual pleasures and material stability soothe your soul.',
      'Gemini': 'Your Gemini Moon makes you emotionally versatile and communicative. You need mental stimulation to feel emotionally balanced. Talking through your feelings helps you process them.',
      'Cancer': 'With the Moon in its home sign of Cancer, your emotional nature is powerful and intuitive. You have deep needs for nurturing and being nurtured. Your moods are influenced by those around you.',
      'Leo': 'Your Leo Moon gives you a generous, warm emotional nature. You need appreciation and recognition to feel emotionally secure. Creative expression is essential for your emotional well-being.',
      'Virgo': 'With your Moon in Virgo, you process emotions through analysis and problem-solving. You need order and usefulness to feel emotionally balanced. Helping others soothes your soul.',
      'Libra': 'Your Libra Moon gives you a strong need for harmony in relationships. You process emotions through relating to others. Beauty and balance are essential for your emotional well-being.',
      'Scorpio': 'With the Moon in Scorpio, you have intense, deep emotions. You need emotional authenticity and depth in relationships. You process feelings through transformation and letting go.',
      'Sagittarius': 'Your Sagittarius Moon gives you an optimistic emotional nature. You need freedom and adventure to feel emotionally fulfilled. Philosophy and humor help you process difficult feelings.',
      'Capricorn': 'With your Moon in Capricorn, you have controlled, reserved emotions. You need achievement and structure to feel secure. You process feelings through work and practical action.',
      'Aquarius': 'Your Aquarius Moon gives you a detached, intellectual approach to emotions. You need freedom and friendship to feel emotionally balanced. You process feelings through understanding them objectively.',
      'Pisces': 'With the Moon in Pisces, you have boundless compassion and sensitivity. You need spiritual connection and creative outlets. You absorb others\' emotions easily and need time alone to recharge.',
    };
    return interpretations[sign] || 'Your Moon sign reveals your emotional needs and inner self.';
  };

  // Get detailed interpretation for Rising sign
  const getRisingInterpretation = (sign: string): string => {
    const key = `risingIn${sign}`;
    return t(key) || getDefaultRisingInterpretation(sign);
  };

  const getDefaultRisingInterpretation = (sign: string): string => {
    const interpretations: Record<string, string> = {
      'Aries': 'With Aries Rising, you come across as confident, direct, and energetic. People see you as a leader and pioneer. You approach new situations with courage and enthusiasm.',
      'Taurus': 'Your Taurus Rising gives you a calm, grounded presence. Others see you as reliable and sensual. You approach life at your own steady pace, valuing comfort and beauty.',
      'Gemini': 'With Gemini Rising, you appear curious, witty, and versatile. People see you as communicative and youthful. You approach life with mental agility and adaptability.',
      'Cancer': 'Your Cancer Rising gives you a nurturing, protective presence. Others see you as caring and emotionally intuitive. You approach new situations with sensitivity and caution.',
      'Leo': 'With Leo Rising, you have a magnetic, dramatic presence. People see you as confident and creative. You approach life as if you\'re on stage, naturally drawing attention.',
      'Virgo': 'Your Virgo Rising gives you a modest, helpful presence. Others see you as analytical and detail-oriented. You approach life with practicality and a desire to be useful.',
      'Libra': 'With Libra Rising, you appear charming, diplomatic, and balanced. People see you as fair and aesthetically minded. You approach life seeking harmony and partnership.',
      'Scorpio': 'Your Scorpio Rising gives you an intense, mysterious presence. Others sense your depth and power. You approach life with penetrating awareness and emotional intensity.',
      'Sagittarius': 'With Sagittarius Rising, you appear optimistic, adventurous, and philosophical. People see you as fun-loving and wise. You approach life as a grand adventure.',
      'Capricorn': 'Your Capricorn Rising gives you a serious, ambitious presence. Others see you as responsible and mature. You approach life with determination and long-term vision.',
      'Aquarius': 'With Aquarius Rising, you appear unique, friendly, and progressive. People see you as independent and innovative. You approach life as an individual, not following the crowd.',
      'Pisces': 'Your Pisces Rising gives you a dreamy, compassionate presence. Others see you as artistic and spiritually inclined. You approach life with imagination and sensitivity.',
    };
    return interpretations[sign] || 'Your Rising sign shapes how others perceive you and how you approach life.';
  };

  // Calculate element counts
  const calculateElements = (positions: PlanetPosition[]) => {
    const counts = { fire: 0, earth: 0, air: 0, water: 0 };
    positions.forEach(pos => {
      const element = getElement(pos.sign);
      if (element in counts) {
        counts[element as keyof typeof counts]++;
      }
    });
    return counts;
  };

  // Calculate modality counts
  const calculateModalities = (positions: PlanetPosition[]) => {
    const counts = { cardinal: 0, fixed: 0, mutable: 0 };
    positions.forEach(pos => {
      const modality = getModality(pos.sign);
      if (modality in counts) {
        counts[modality as keyof typeof counts]++;
      }
    });
    return counts;
  };

  // Get element interpretation
  const getElementInterpretation = (elements: { fire: number; earth: number; air: number; water: number }): string => {
    const dominant = Object.entries(elements).sort((a, b) => b[1] - a[1])[0];
    const key = `dominant${dominant[0].charAt(0).toUpperCase() + dominant[0].slice(1)}`;
    return t(key) || getDefaultElementInterpretation(dominant[0]);
  };

  const getDefaultElementInterpretation = (element: string): string => {
    const interpretations: Record<string, string> = {
      'fire': 'With a dominance of Fire in your chart, you are naturally enthusiastic, creative, and action-oriented. You lead with passion and inspire others with your energy and vision.',
      'earth': 'With a dominance of Earth in your chart, you are practical, grounded, and reliable. You build things that last and approach life with patience and determination.',
      'air': 'With a dominance of Air in your chart, you are intellectual, communicative, and social. You process life through ideas and connections, always seeking understanding.',
      'water': 'With a dominance of Water in your chart, you are emotional, intuitive, and empathetic. You navigate life through feelings and have deep psychological insight.',
    };
    return interpretations[element] || '';
  };

  // Get modality interpretation
  const getModalityInterpretation = (modalities: { cardinal: number; fixed: number; mutable: number }): string => {
    const dominant = Object.entries(modalities).sort((a, b) => b[1] - a[1])[0];
    const key = `dominant${dominant[0].charAt(0).toUpperCase() + dominant[0].slice(1)}`;
    return t(key) || getDefaultModalityInterpretation(dominant[0]);
  };

  const getDefaultModalityInterpretation = (modality: string): string => {
    const interpretations: Record<string, string> = {
      'cardinal': 'With a dominance of Cardinal signs, you are an initiator and leader. You start new projects and inspire action in others. Change and new beginnings energize you.',
      'fixed': 'With a dominance of Fixed signs, you are determined, persistent, and reliable. Once you commit to something, you see it through. Stability and loyalty define you.',
      'mutable': 'With a dominance of Mutable signs, you are adaptable, flexible, and versatile. You handle change well and can see multiple perspectives. You are the editors and refiners of the zodiac.',
    };
    return interpretations[modality] || '';
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
        </View>
      </LinearGradient>
    );
  }

  const positions = chartData ? getPlanetaryPositions(chartData) : [];
  const elements = calculateElements(positions);
  const modalities = calculateModalities(positions);

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('fullNatalChart')}</Text>
          <Text style={styles.subtitle}>{t('natalChartSubtitle')}</Text>
        </View>

        {/* Birth Info */}
        {chartData && (
          <View style={styles.birthInfo}>
            <Text style={styles.birthInfoTitle}>{t('birthDetails')}</Text>
            <View style={styles.birthInfoRow}>
              <Text style={styles.birthInfoLabel}>📅</Text>
              <Text style={styles.birthInfoValue}>{chartData.birth_date || t('notSet')}</Text>
            </View>
            <View style={styles.birthInfoRow}>
              <Text style={styles.birthInfoLabel}>🕐</Text>
              <Text style={styles.birthInfoValue}>{chartData.birth_time || t('notSet')}</Text>
            </View>
            <View style={styles.birthInfoRow}>
              <Text style={styles.birthInfoLabel}>📍</Text>
              <Text style={styles.birthInfoValue}>{chartData.birth_city || t('notSet')}</Text>
            </View>
          </View>
        )}

        {/* Chart Wheel Visual */}
        <View style={styles.chartWheel}>
          <View style={styles.wheelOuter}>
            <View style={styles.wheelInner}>
              <Text style={styles.wheelCenter}>✦</Text>
            </View>
            <Text style={[styles.wheelSign, { top: 5, left: '45%' }]}>♈</Text>
            <Text style={[styles.wheelSign, { top: '15%', right: '10%' }]}>♉</Text>
            <Text style={[styles.wheelSign, { top: '40%', right: 0 }]}>♊</Text>
            <Text style={[styles.wheelSign, { bottom: '40%', right: 0 }]}>♋</Text>
            <Text style={[styles.wheelSign, { bottom: '15%', right: '10%' }]}>♌</Text>
            <Text style={[styles.wheelSign, { bottom: 5, left: '45%' }]}>♍</Text>
            <Text style={[styles.wheelSign, { bottom: '15%', left: '10%' }]}>♎</Text>
            <Text style={[styles.wheelSign, { bottom: '40%', left: 0 }]}>♏</Text>
            <Text style={[styles.wheelSign, { top: '40%', left: 0 }]}>♐</Text>
            <Text style={[styles.wheelSign, { top: '15%', left: '10%' }]}>♑</Text>
          </View>
        </View>

        {/* Sun Sign Interpretation */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.interpretationHeader}
            onPress={() => setExpandedSection(expandedSection === 'sun' ? null : 'sun')}
          >
            <View style={styles.interpretationHeaderLeft}>
              <Text style={styles.interpretationEmoji}>☀️</Text>
              <View>
                <Text style={styles.interpretationTitle}>{t('sunSign') || 'Sun Sign'}</Text>
                <Text style={styles.interpretationSign}>{chartData?.sun_sign || 'Unknown'}</Text>
              </View>
            </View>
            <Text style={styles.expandIcon}>{expandedSection === 'sun' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSection === 'sun' && (
            <View style={styles.interpretationContent}>
              <Text style={styles.interpretationLabel}>{t('coreIdentity') || 'Core Identity & Life Purpose'}</Text>
              <Text style={styles.interpretationText}>
                {getSunInterpretation(chartData?.sun_sign || '')}
              </Text>
              <View style={styles.keyTraits}>
                <Text style={styles.keyTraitsTitle}>{t('keyTraits') || 'Key Traits'}</Text>
                <Text style={styles.keyTraitsText}>{getSignDescription(chartData?.sun_sign || '')}</Text>
              </View>
              <View style={styles.elementBadge}>
                <Text style={styles.elementBadgeText}>
                  {t(getElement(chartData?.sun_sign || ''))} {t('element') || 'Element'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Moon Sign Interpretation */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.interpretationHeader}
            onPress={() => setExpandedSection(expandedSection === 'moon' ? null : 'moon')}
          >
            <View style={styles.interpretationHeaderLeft}>
              <Text style={styles.interpretationEmoji}>🌙</Text>
              <View>
                <Text style={styles.interpretationTitle}>{t('moonSign') || 'Moon Sign'}</Text>
                <Text style={styles.interpretationSign}>{chartData?.moon_sign || 'Unknown'}</Text>
              </View>
            </View>
            <Text style={styles.expandIcon}>{expandedSection === 'moon' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSection === 'moon' && (
            <View style={styles.interpretationContent}>
              <Text style={styles.interpretationLabel}>{t('emotionalNature') || 'Emotional Nature & Inner Self'}</Text>
              <Text style={styles.interpretationText}>
                {getMoonInterpretation(chartData?.moon_sign || '')}
              </Text>
              <View style={styles.keyTraits}>
                <Text style={styles.keyTraitsTitle}>{t('emotionalNeeds') || 'Emotional Needs'}</Text>
                <Text style={styles.keyTraitsText}>{getSignDescription(chartData?.moon_sign || '')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Rising Sign Interpretation */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.interpretationHeader}
            onPress={() => setExpandedSection(expandedSection === 'rising' ? null : 'rising')}
          >
            <View style={styles.interpretationHeaderLeft}>
              <Text style={styles.interpretationEmoji}>⬆️</Text>
              <View>
                <Text style={styles.interpretationTitle}>{t('risingSign') || 'Rising Sign'}</Text>
                <Text style={styles.interpretationSign}>{chartData?.rising_sign || 'Unknown'}</Text>
              </View>
            </View>
            <Text style={styles.expandIcon}>{expandedSection === 'rising' ? '−' : '+'}</Text>
          </TouchableOpacity>
          {expandedSection === 'rising' && (
            <View style={styles.interpretationContent}>
              <Text style={styles.interpretationLabel}>{t('publicPersona') || 'Public Persona & First Impressions'}</Text>
              <Text style={styles.interpretationText}>
                {getRisingInterpretation(chartData?.rising_sign || '')}
              </Text>
              <View style={styles.keyTraits}>
                <Text style={styles.keyTraitsTitle}>{t('howOthersSeeYou') || 'How Others See You'}</Text>
                <Text style={styles.keyTraitsText}>{getSignDescription(chartData?.rising_sign || '')}</Text>
              </View>
            </View>
          )}
        </View>

        {/* All Planetary Positions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('planetaryPositions')}</Text>
          {positions.map((pos, index) => (
            <View key={index} style={styles.planetRow}>
              <Text style={styles.planetEmoji}>{pos.emoji}</Text>
              <View style={styles.planetInfo}>
                <Text style={styles.planetName}>{pos.planet}</Text>
                <Text style={styles.planetDetail}>
                  {t(pos.sign.toLowerCase()) || pos.sign} {pos.degree}° • {t('house')} {pos.house}
                </Text>
              </View>
            </View>
          ))}
        </View>

        {/* Elements & Modalities Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('elementsModalities')}</Text>

          {/* Elements */}
          <View style={styles.analysisCard}>
            <Text style={styles.analysisTitle}>{t('elementBalance') || 'Element Balance'}</Text>
            <View style={styles.elementsRow}>
              <View style={[styles.elementCard, elements.fire >= 3 && styles.elementCardDominant]}>
                <Text style={styles.elementEmoji}>🔥</Text>
                <Text style={styles.elementName}>{t('fire')}</Text>
                <Text style={styles.elementCount}>{elements.fire}</Text>
              </View>
              <View style={[styles.elementCard, elements.earth >= 3 && styles.elementCardDominant]}>
                <Text style={styles.elementEmoji}>🌍</Text>
                <Text style={styles.elementName}>{t('earth')}</Text>
                <Text style={styles.elementCount}>{elements.earth}</Text>
              </View>
              <View style={[styles.elementCard, elements.air >= 3 && styles.elementCardDominant]}>
                <Text style={styles.elementEmoji}>💨</Text>
                <Text style={styles.elementName}>{t('air')}</Text>
                <Text style={styles.elementCount}>{elements.air}</Text>
              </View>
              <View style={[styles.elementCard, elements.water >= 3 && styles.elementCardDominant]}>
                <Text style={styles.elementEmoji}>💧</Text>
                <Text style={styles.elementName}>{t('water')}</Text>
                <Text style={styles.elementCount}>{elements.water}</Text>
              </View>
            </View>
            <Text style={styles.analysisText}>{getElementInterpretation(elements)}</Text>
          </View>

          {/* Modalities */}
          <View style={styles.analysisCard}>
            <Text style={styles.analysisTitle}>{t('modalityBalance') || 'Modality Balance'}</Text>
            <View style={styles.modalitiesRow}>
              <View style={[styles.modalityCard, modalities.cardinal >= 3 && styles.modalityCardDominant]}>
                <Text style={styles.modalityEmoji}>🚀</Text>
                <Text style={styles.modalityName}>{t('cardinal') || 'Cardinal'}</Text>
                <Text style={styles.modalityCount}>{modalities.cardinal}</Text>
              </View>
              <View style={[styles.modalityCard, modalities.fixed >= 3 && styles.modalityCardDominant]}>
                <Text style={styles.modalityEmoji}>🏔️</Text>
                <Text style={styles.modalityName}>{t('fixed') || 'Fixed'}</Text>
                <Text style={styles.modalityCount}>{modalities.fixed}</Text>
              </View>
              <View style={[styles.modalityCard, modalities.mutable >= 3 && styles.modalityCardDominant]}>
                <Text style={styles.modalityEmoji}>🌊</Text>
                <Text style={styles.modalityName}>{t('mutable') || 'Mutable'}</Text>
                <Text style={styles.modalityCount}>{modalities.mutable}</Text>
              </View>
            </View>
            <Text style={styles.analysisText}>{getModalityInterpretation(modalities)}</Text>
          </View>
        </View>

        {/* Overall Summary */}
        <View style={styles.section}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t('cosmicSummary') || 'Your Cosmic Summary'}</Text>
            <Text style={styles.summaryText}>
              {t('cosmicSummaryText', {
                sun: chartData?.sun_sign || 'Unknown',
                moon: chartData?.moon_sign || 'Unknown',
                rising: chartData?.rising_sign || 'Unknown'
              }) || `As a ${chartData?.sun_sign || 'Unknown'} Sun with ${chartData?.moon_sign || 'Unknown'} Moon and ${chartData?.rising_sign || 'Unknown'} Rising, you possess a unique blend of energies. Your Sun drives your conscious self, your Moon nurtures your emotional world, and your Rising shapes how you navigate life's journey.`}
            </Text>
          </View>
        </View>

        {/* Premium Badge */}
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumIcon}>⭐</Text>
          <Text style={styles.premiumText}>{t('premiumFeature')}</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 60,
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
  birthInfo: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  birthInfoTitle: {
    fontSize: 14,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  birthInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  birthInfoLabel: {
    fontSize: 18,
  },
  birthInfoValue: {
    fontSize: 15,
    color: '#ccc',
  },
  chartWheel: {
    alignItems: 'center',
    marginBottom: 24,
  },
  wheelOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wheelInner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wheelCenter: {
    fontSize: 32,
    color: '#e94560',
  },
  wheelSign: {
    position: 'absolute',
    fontSize: 16,
    color: '#e94560',
    opacity: 0.7,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  interpretationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  interpretationHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  interpretationEmoji: {
    fontSize: 32,
  },
  interpretationTitle: {
    fontSize: 14,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  interpretationSign: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  expandIcon: {
    fontSize: 24,
    color: '#e94560',
    fontWeight: 'bold',
  },
  interpretationContent: {
    backgroundColor: 'rgba(233, 69, 96, 0.08)',
    borderRadius: 0,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    padding: 16,
    marginTop: -8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: 'rgba(233, 69, 96, 0.2)',
  },
  interpretationLabel: {
    fontSize: 12,
    color: '#e94560',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  interpretationText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 24,
    marginBottom: 16,
  },
  keyTraits: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  keyTraitsTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  keyTraitsText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  elementBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  elementBadgeText: {
    fontSize: 12,
    color: '#e94560',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  planetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  planetEmoji: {
    fontSize: 24,
    marginRight: 16,
    width: 40,
    textAlign: 'center',
  },
  planetInfo: {
    flex: 1,
  },
  planetName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  planetDetail: {
    fontSize: 14,
    color: '#888',
  },
  analysisCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  analysisTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  analysisText: {
    fontSize: 14,
    color: '#ccc',
    lineHeight: 20,
    marginTop: 12,
  },
  elementsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  elementCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  elementCardDominant: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  elementEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  elementName: {
    fontSize: 11,
    color: '#888',
    textTransform: 'capitalize',
  },
  elementCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalitiesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalityCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modalityCardDominant: {
    borderColor: '#9b59b6',
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
  },
  modalityEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  modalityName: {
    fontSize: 11,
    color: '#888',
  },
  modalityCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  summaryCard: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.2)',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 24,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
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

export default function NatalChartScreen() {
  return (
    <PremiumGate feature="natal-chart">
      <NatalChartScreenContent />
    </PremiumGate>
  );
}
