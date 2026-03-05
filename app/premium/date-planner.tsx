import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import PremiumGate from '../../components/PremiumGate';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  calculateDateScores,
  DateScore,
  formatHourRange,
  getTop5Dates,
} from '../../services/datePlannerService';
import { BirthChart } from '../../services/astrologyService';
import { calculateNatalChart } from '../../services/astrology';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function getScoreColor(score: number): string {
  if (score >= 85) return '#4ade80';
  if (score >= 75) return '#a3e635';
  if (score >= 65) return '#facc15';
  if (score >= 55) return '#fb923c';
  return '#f87171';
}

function getScoreEmoji(score: number): string {
  if (score >= 85) return '✨';
  if (score >= 75) return '⭐';
  if (score >= 65) return '👍';
  if (score >= 55) return '👌';
  return '😐';
}

function DateCard({ dateScore, isSelected, onPress }: {
  dateScore: DateScore;
  isSelected: boolean;
  onPress: () => void;
}) {
  const { t } = useLanguage();
  const date = dateScore.date;
  const dayNum = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];

  return (
    <TouchableOpacity
      style={[
        styles.dateCard,
        isSelected && styles.dateCardSelected,
        { borderLeftColor: getScoreColor(dateScore.overallScore) },
      ]}
      onPress={onPress}
    >
      <View style={styles.dateInfo}>
        <Text style={styles.dateDay}>{t(weekday)}</Text>
        <Text style={styles.dateNum}>{dayNum}</Text>
      </View>
      <View style={styles.dateScore}>
        <Text style={styles.scoreEmoji}>{getScoreEmoji(dateScore.overallScore)}</Text>
        <Text style={[styles.scoreValue, { color: getScoreColor(dateScore.overallScore) }]}>
          {dateScore.overallScore}%
        </Text>
      </View>
      <View style={styles.dateMoon}>
        <Text style={styles.moonSign}>🌙 {dateScore.moonSign}</Text>
      </View>
    </TouchableOpacity>
  );
}

function DateDetailView({ dateScore }: { dateScore: DateScore }) {
  const { t } = useLanguage();
  const date = dateScore.date;

  const formatDate = (d: Date) => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'];
    const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return `${t(weekdays[d.getDay()])}, ${t(months[d.getMonth()])} ${d.getDate()}`;
  };

  return (
    <View style={styles.detailContainer}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailDate}>{formatDate(date)}</Text>
        <View style={[styles.detailScoreBadge, { backgroundColor: getScoreColor(dateScore.overallScore) }]}>
          <Text style={styles.detailScoreText}>{dateScore.overallScore}%</Text>
        </View>
      </View>

      <Text style={styles.detailDescription}>
        {t(dateScore.description)}
      </Text>

      {/* Score Breakdown */}
      <View style={styles.breakdownSection}>
        <Text style={styles.sectionTitle}>{t('scoreBreakdown')}</Text>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('moonPhase')}</Text>
          <Text style={styles.breakdownValue}>{dateScore.moonPhaseScore}%</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('venus')}</Text>
          <Text style={styles.breakdownValue}>{dateScore.venusScore}%</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{t('mars')}</Text>
          <Text style={styles.breakdownValue}>{dateScore.marsScore}%</Text>
        </View>
      </View>

      {/* Cosmic Info */}
      <View style={styles.cosmicSection}>
        <View style={styles.cosmicItem}>
          <Text style={styles.cosmicEmoji}>🌙</Text>
          <View>
            <Text style={styles.cosmicLabel}>{t('moonIn')}</Text>
            <Text style={styles.cosmicValue}>{dateScore.moonSign}</Text>
          </View>
        </View>
        <View style={styles.cosmicItem}>
          <Text style={styles.cosmicEmoji}>💕</Text>
          <View>
            <Text style={styles.cosmicLabel}>{t('venusIn')}</Text>
            <Text style={styles.cosmicValue}>{dateScore.venusSign}</Text>
          </View>
        </View>
      </View>

      {/* Best Hours */}
      <View style={styles.hoursSection}>
        <Text style={styles.sectionTitle}>{t('bestHours')}</Text>
        {dateScore.bestHours.map((hour, index) => (
          <View key={index} style={styles.hourRow}>
            <Text style={styles.hourIcon}>⏰</Text>
            <Text style={styles.hourText}>
              {formatHourRange(hour.start, hour.end)}
            </Text>
            {index === 0 && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t('recommended')}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

function DatePlannerContent() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { matchId } = useLocalSearchParams<{ matchId?: string }>();

  const [loading, setLoading] = useState(true);
  const [dateScores, setDateScores] = useState<DateScore[]>([]);
  const [selectedDate, setSelectedDate] = useState<DateScore | null>(null);
  const [matchName, setMatchName] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [user, matchId]);

  const loadData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      // Load user's birth chart
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('birth_date, birth_time, birth_latitude, birth_longitude')
        .eq('id', user.id)
        .single();

      let userChart: BirthChart | undefined;
      if (userProfile?.birth_date) {
        const [year, month, day] = userProfile.birth_date.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day);
        const localChart = calculateNatalChart(
          birthDate,
          userProfile.birth_time,
          userProfile.birth_latitude || 45.5,
          userProfile.birth_longitude || -73.5
        );
        userChart = {
          sun: { ...localChart.sun, longitude: localChart.sun.longitude },
          moon: { ...localChart.moon, longitude: localChart.moon.longitude },
          rising: { ...localChart.rising, longitude: localChart.rising.longitude },
          planets: {
            mercury: { ...localChart.mercury, longitude: localChart.mercury.longitude },
            venus: { ...localChart.venus, longitude: localChart.venus.longitude },
            mars: { ...localChart.mars, longitude: localChart.mars.longitude },
            jupiter: { ...localChart.jupiter, longitude: localChart.jupiter.longitude },
            saturn: { ...localChart.saturn, longitude: localChart.saturn.longitude },
          },
          coordinates: { latitude: userProfile.birth_latitude || 45.5, longitude: userProfile.birth_longitude || -73.5 },
          julianDay: 0,
        } as BirthChart;
      }

      // Load match's birth chart if provided
      let matchChart: BirthChart | undefined;
      if (matchId) {
        const { data: matchProfile } = await supabase
          .from('profiles')
          .select('name, birth_date, birth_time, birth_latitude, birth_longitude')
          .eq('id', matchId)
          .single();

        if (matchProfile) {
          setMatchName(matchProfile.name);
          if (matchProfile.birth_date) {
            const [year, month, day] = matchProfile.birth_date.split('-').map(Number);
            const birthDate = new Date(year, month - 1, day);
            const localChart = calculateNatalChart(
              birthDate,
              matchProfile.birth_time,
              matchProfile.birth_latitude || 45.5,
              matchProfile.birth_longitude || -73.5
            );
            matchChart = {
              sun: { ...localChart.sun, longitude: localChart.sun.longitude },
              moon: { ...localChart.moon, longitude: localChart.moon.longitude },
              rising: { ...localChart.rising, longitude: localChart.rising.longitude },
              planets: {
                mercury: { ...localChart.mercury, longitude: localChart.mercury.longitude },
                venus: { ...localChart.venus, longitude: localChart.venus.longitude },
                mars: { ...localChart.mars, longitude: localChart.mars.longitude },
                jupiter: { ...localChart.jupiter, longitude: localChart.jupiter.longitude },
                saturn: { ...localChart.saturn, longitude: localChart.saturn.longitude },
              },
              coordinates: { latitude: matchProfile.birth_latitude || 45.5, longitude: matchProfile.birth_longitude || -73.5 },
              julianDay: 0,
            } as BirthChart;
          }
        }
      }

      // Calculate scores
      const scores = calculateDateScores(userChart, matchChart, 30);
      setDateScores(scores);

      // Select the best date by default
      const topDates = getTop5Dates(scores);
      if (topDates.length > 0) {
        setSelectedDate(topDates[0]);
      }
    } catch (error) {
      console.error('Error loading date planner data:', error);
    }

    setLoading(false);
  };

  const top5Dates = getTop5Dates(dateScores);

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#e94560" />
          <Text style={styles.loadingText}>{t('calculatingDates')}</Text>
        </View>
      </LinearGradient>
    );
  }

  const renderContent = () => (
    <View>
      {/* Top 5 Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            ✨ {t('top5Dates')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.top5Container}
          >
            {top5Dates.map((dateScore, index) => (
              <DateCard
                key={index}
                dateScore={dateScore}
                isSelected={selectedDate?.date.getTime() === dateScore.date.getTime()}
                onPress={() => setSelectedDate(dateScore)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Selected Date Detail */}
        {selectedDate && (
          <View style={styles.section}>
            <DateDetailView dateScore={selectedDate} />
          </View>
        )}

        {/* All Dates Calendar */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('next30Days')}</Text>
          <View style={styles.calendarGrid}>
            {dateScores.map((dateScore, index) => {
              const isToday = dateScore.date.toDateString() === new Date().toDateString();
              const isSelected = selectedDate?.date.getTime() === dateScore.date.getTime();

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.calendarDay,
                    isToday && styles.calendarDayToday,
                    isSelected && styles.calendarDaySelected,
                  ]}
                  onPress={() => setSelectedDate(dateScore)}
                >
                  <Text style={[styles.calendarDayNum, isToday && styles.calendarDayNumToday]}>
                    {dateScore.date.getDate()}
                  </Text>
                  <View
                    style={[
                      styles.calendarDot,
                      { backgroundColor: getScoreColor(dateScore.overallScore) },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>{t('scoreLegend')}</Text>
          <View style={styles.legendItems}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4ade80' }]} />
              <Text style={styles.legendText}>85%+ {t('excellent')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#facc15' }]} />
              <Text style={styles.legendText}>65-84% {t('good')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#f87171' }]} />
              <Text style={styles.legendText}>&lt;65% {t('challenging')}</Text>
            </View>
          </View>
        </View>
    </View>
  );

  const sections = [{ key: 'content' }];

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      {/* Header - outside FlatList */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.title}>{t('datePlanner')}</Text>
          {matchName && (
            <Text style={styles.subtitle}>
              {t('planningWith')} {matchName}
            </Text>
          )}
        </View>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item) => item.key}
        renderItem={() => renderContent()}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      />
    </LinearGradient>
  );
}

export default function DatePlannerScreen() {
  return (
    <PremiumGate feature="date-planner">
      <DatePlannerContent />
    </PremiumGate>
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
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  backText: {
    color: '#fff',
    fontSize: 24,
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  top5Container: {
    paddingHorizontal: 20,
    gap: 12,
  },
  dateCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    width: 100,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  dateCardSelected: {
    backgroundColor: 'rgba(233, 69, 96, 0.15)',
    borderColor: '#e94560',
  },
  dateInfo: {
    alignItems: 'center',
    marginBottom: 8,
  },
  dateDay: {
    fontSize: 12,
    color: '#888',
    textTransform: 'uppercase',
  },
  dateNum: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  dateScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreEmoji: {
    fontSize: 14,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  dateMoon: {
    marginTop: 8,
  },
  moonSign: {
    fontSize: 11,
    color: '#888',
  },
  detailContainer: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailDate: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  detailScoreBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  detailScoreText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  detailDescription: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
    marginBottom: 20,
  },
  breakdownSection: {
    marginBottom: 20,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#888',
  },
  breakdownValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  cosmicSection: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 20,
  },
  cosmicItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
  },
  cosmicEmoji: {
    fontSize: 24,
  },
  cosmicLabel: {
    fontSize: 11,
    color: '#666',
    textTransform: 'uppercase',
  },
  cosmicValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
  },
  hoursSection: {},
  hourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  hourIcon: {
    fontSize: 18,
  },
  hourText: {
    fontSize: 16,
    color: '#fff',
    flex: 1,
  },
  recommendedBadge: {
    backgroundColor: '#4ade80',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recommendedText: {
    fontSize: 10,
    color: '#000',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },
  calendarDay: {
    width: 40,
    height: 50,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayToday: {
    borderWidth: 1,
    borderColor: '#e94560',
  },
  calendarDaySelected: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  calendarDayNum: {
    fontSize: 14,
    color: '#ccc',
    fontWeight: '500',
  },
  calendarDayNumToday: {
    color: '#e94560',
  },
  calendarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  legend: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 16,
  },
  legendTitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  legendItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
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
    color: '#666',
  },
});
