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

type LuckyDay = {
  date: number;
  dayName: string;
  energy: number;
  bestFor: string[];
  avoid: string[];
  luckyHour: string;
};

type CategoryDays = {
  category: string;
  emoji: string;
  days: number[];
  description: string;
};

function LuckyDaysScreenContent() {
  const [loading, setLoading] = useState(true);
  const [sunSign, setSunSign] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('love');
  const { user } = useAuth();
  const { t } = useLanguage();

  const today = new Date();
  const currentDay = today.getDate();

  const getMonthName = (monthIndex: number): string => {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    return t(months[monthIndex]) || months[monthIndex];
  };

  const getDayName = (dayIndex: number): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return t(days[dayIndex]) || days[dayIndex];
  };

  const currentMonthName = getMonthName(today.getMonth());
  const currentYear = today.getFullYear();
  const currentMonth = `${currentMonthName} ${currentYear}`;

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

  const categories: CategoryDays[] = [
    {
      category: 'love',
      emoji: '💕',
      days: [3, 7, 14, 18, 21, 25],
      description: t('loveDaysDesc'),
    },
    {
      category: 'career',
      emoji: '💼',
      days: [2, 5, 10, 15, 22, 28],
      description: t('careerDaysDesc'),
    },
    {
      category: 'money',
      emoji: '💰',
      days: [1, 8, 12, 19, 24, 29],
      description: t('moneyDaysDesc'),
    },
    {
      category: 'health',
      emoji: '🧘',
      days: [4, 9, 13, 17, 23, 27],
      description: t('healthDaysDesc'),
    },
    {
      category: 'creativity',
      emoji: '🎨',
      days: [6, 11, 16, 20, 26, 30],
      description: t('creativityDaysDesc'),
    },
  ];

  const getDaysInMonth = (): number => {
    return new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  };

  const getDayEnergy = (day: number): number => {
    // Generate consistent energy based on day
    const energyPattern = [3, 4, 5, 4, 3, 4, 5, 4, 3, 5];
    return energyPattern[day % 10];
  };

  const getDayDetails = (day: number): LuckyDay => {
    const date = new Date(today.getFullYear(), today.getMonth(), day);

    const bestForOptions = [
      [t('startingProjects'), t('networking')],
      [t('romance'), t('creativity')],
      [t('finances'), t('career')],
      [t('health'), t('selfCare')],
      [t('communication'), t('learning')],
    ];

    const avoidOptions = [
      [t('majorDecisions')],
      [t('conflicts')],
      [t('newContracts')],
      [t('overexertion')],
      [],
    ];

    return {
      date: day,
      dayName: getDayName(date.getDay()),
      energy: getDayEnergy(day),
      bestFor: bestForOptions[day % 5],
      avoid: avoidOptions[day % 5],
      luckyHour: `${9 + (day % 8)}:00 ${day % 2 === 0 ? 'AM' : 'PM'}`,
    };
  };

  const isLuckyDay = (day: number, category: string): boolean => {
    const cat = categories.find(c => c.category === category);
    return cat ? cat.days.includes(day) : false;
  };

  const getNextLuckyDay = (category: string): number | null => {
    const cat = categories.find(c => c.category === category);
    if (!cat) return null;

    const nextDays = cat.days.filter(d => d > currentDay);
    return nextDays.length > 0 ? nextDays[0] : cat.days[0];
  };

  const renderEnergyStars = (energy: number) => {
    return '★'.repeat(energy) + '☆'.repeat(5 - energy);
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Add empty days for first week
    for (let i = 0; i < firstDay; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Fill remaining days
    while (currentWeek.length < 7 && currentWeek.length > 0) {
      currentWeek.push(null);
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  const selectedCat = categories.find(c => c.category === selectedCategory);
  const nextLucky = getNextLuckyDay(selectedCategory);
  const weeks = renderCalendar();
  const dayDetails = selectedDay ? getDayDetails(selectedDay) : null;

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('luckyDaysCalculator')}</Text>
          <Text style={styles.subtitle}>{currentMonth}</Text>
        </View>

        {/* Sign Info */}
        <View style={styles.signCard}>
          <Text style={styles.signEmoji}>🍀</Text>
          <View style={styles.signInfo}>
            <Text style={styles.signLabel}>{t('luckyDaysFor')}</Text>
            <Text style={styles.signName}>{sunSign ? t(sunSign.toLowerCase()) : t('unknown')}</Text>
          </View>
        </View>

        {/* Category Selector */}
        <View style={styles.categoryContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.category}
                style={[styles.categoryButton, selectedCategory === cat.category && styles.categoryButtonActive]}
                onPress={() => setSelectedCategory(cat.category)}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryLabel, selectedCategory === cat.category && styles.categoryLabelActive]}>
                  {t(cat.category)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Next Lucky Day */}
        {nextLucky && (
          <View style={styles.nextLuckyCard}>
            <Text style={styles.nextLuckyLabel}>{t('nextLuckyDay')}</Text>
            <View style={styles.nextLuckyContent}>
              <Text style={styles.nextLuckyEmoji}>{selectedCat?.emoji}</Text>
              <Text style={styles.nextLuckyDate}>
                {currentMonthName} {nextLucky}
              </Text>
            </View>
            <Text style={styles.nextLuckyDesc}>{selectedCat?.description}</Text>
          </View>
        )}

        {/* Calendar */}
        <View style={styles.calendarSection}>
          <Text style={styles.sectionTitle}>{t('monthlyCalendar')}</Text>

          {/* Weekday Headers */}
          <View style={styles.weekdayRow}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
              <Text key={i} style={styles.weekdayText}>{day}</Text>
            ))}
          </View>

          {/* Calendar Grid */}
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.weekRow}>
              {week.map((day, dayIndex) => {
                const isLucky = day ? isLuckyDay(day, selectedCategory) : false;
                const isToday = day === currentDay;
                const isPast = day ? day < currentDay : false;

                return (
                  <TouchableOpacity
                    key={dayIndex}
                    style={[
                      styles.dayCell,
                      isLucky && styles.luckyDay,
                      isToday && styles.todayCell,
                      isPast && styles.pastDay,
                    ]}
                    onPress={() => day && setSelectedDay(day)}
                    disabled={!day}
                  >
                    {day && (
                      <>
                        <Text style={[
                          styles.dayText,
                          isLucky && styles.luckyDayText,
                          isToday && styles.todayText,
                          isPast && styles.pastDayText,
                        ]}>
                          {day}
                        </Text>
                        {isLucky && <Text style={styles.luckyDot}>★</Text>}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#9333ea' }]} />
              <Text style={styles.legendText}>{t('luckyDay')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#e94560' }]} />
              <Text style={styles.legendText}>{t('today')}</Text>
            </View>
          </View>
        </View>

        {/* Day Details */}
        {dayDetails && (
          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsDate}>
                {currentMonthName} {dayDetails.date}
              </Text>
              <Text style={styles.detailsDay}>{dayDetails.dayName}</Text>
            </View>

            <View style={styles.energyRow}>
              <Text style={styles.energyLabel}>{t('dayEnergy')}</Text>
              <Text style={styles.energyStars}>{renderEnergyStars(dayDetails.energy)}</Text>
            </View>

            <View style={styles.luckyHourRow}>
              <Text style={styles.luckyHourLabel}>⏰ {t('luckyHour')}</Text>
              <Text style={styles.luckyHourValue}>{dayDetails.luckyHour}</Text>
            </View>

            {dayDetails.bestFor.length > 0 && (
              <View style={styles.bestForSection}>
                <Text style={styles.bestForTitle}>✅ {t('bestFor')}</Text>
                <View style={styles.tagRow}>
                  {dayDetails.bestFor.map((item, i) => (
                    <View key={i} style={styles.bestTag}>
                      <Text style={styles.bestTagText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {dayDetails.avoid.length > 0 && (
              <View style={styles.avoidSection}>
                <Text style={styles.avoidTitle}>⚠️ {t('avoid')}</Text>
                <View style={styles.tagRow}>
                  {dayDetails.avoid.map((item, i) => (
                    <View key={i} style={styles.avoidTag}>
                      <Text style={styles.avoidTagText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Lucky Days List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('allLuckyDays')} - {t(selectedCategory)}</Text>
          <View style={styles.luckyDaysList}>
            {selectedCat?.days.map((day, index) => {
              const isPast = day < currentDay;
              return (
                <View key={index} style={[styles.luckyDayItem, isPast && styles.luckyDayPast]}>
                  <Text style={[styles.luckyDayNumber, isPast && styles.luckyDayNumberPast]}>{day}</Text>
                  <Text style={styles.luckyDayMonth}>{currentMonthName}</Text>
                  {isPast && <Text style={styles.passedLabel}>{t('passed')}</Text>}
                </View>
              );
            })}
          </View>
        </View>

        {/* Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 {t('luckyDaysTips')}</Text>
          <Text style={styles.tipsText}>• {t('luckyTip1')}</Text>
          <Text style={styles.tipsText}>• {t('luckyTip2')}</Text>
          <Text style={styles.tipsText}>• {t('luckyTip3')}</Text>
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
  subtitle: {
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
    marginBottom: 20,
  },
  signEmoji: {
    fontSize: 32,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  categoryContainer: {
    marginBottom: 20,
  },
  categoryScroll: {
    paddingHorizontal: 20,
    gap: 10,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  categoryButtonActive: {
    backgroundColor: 'rgba(147, 51, 234, 0.3)',
    borderWidth: 1,
    borderColor: '#9333ea',
  },
  categoryEmoji: {
    fontSize: 18,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#888',
  },
  categoryLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },
  nextLuckyCard: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.3)',
  },
  nextLuckyLabel: {
    fontSize: 12,
    color: '#4ade80',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  nextLuckyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  nextLuckyEmoji: {
    fontSize: 28,
  },
  nextLuckyDate: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  nextLuckyDesc: {
    fontSize: 13,
    color: '#aaa',
    lineHeight: 18,
  },
  calendarSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 2,
  },
  luckyDay: {
    backgroundColor: 'rgba(147, 51, 234, 0.3)',
    borderWidth: 1,
    borderColor: '#9333ea',
  },
  todayCell: {
    backgroundColor: 'rgba(233, 69, 96, 0.3)',
    borderWidth: 2,
    borderColor: '#e94560',
  },
  pastDay: {
    opacity: 0.4,
  },
  dayText: {
    fontSize: 14,
    color: '#fff',
  },
  luckyDayText: {
    fontWeight: 'bold',
    color: '#9333ea',
  },
  todayText: {
    fontWeight: 'bold',
    color: '#e94560',
  },
  pastDayText: {
    color: '#666',
  },
  luckyDot: {
    fontSize: 8,
    color: '#9333ea',
    position: 'absolute',
    bottom: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#888',
  },
  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsDate: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  detailsDay: {
    fontSize: 14,
    color: '#888',
  },
  energyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  energyLabel: {
    fontSize: 14,
    color: '#888',
  },
  energyStars: {
    fontSize: 16,
    color: '#fbbf24',
    letterSpacing: 2,
  },
  luckyHourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(147, 51, 234, 0.15)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  luckyHourLabel: {
    fontSize: 13,
    color: '#9333ea',
  },
  luckyHourValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  bestForSection: {
    marginBottom: 12,
  },
  bestForTitle: {
    fontSize: 13,
    color: '#4ade80',
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bestTag: {
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  bestTagText: {
    fontSize: 12,
    color: '#4ade80',
  },
  avoidSection: {},
  avoidTitle: {
    fontSize: 13,
    color: '#fbbf24',
    marginBottom: 8,
  },
  avoidTag: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  avoidTagText: {
    fontSize: 12,
    color: '#fbbf24',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  luckyDaysList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  luckyDayItem: {
    backgroundColor: 'rgba(147, 51, 234, 0.2)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
  },
  luckyDayPast: {
    opacity: 0.5,
    borderColor: 'transparent',
  },
  luckyDayNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#9333ea',
  },
  luckyDayNumberPast: {
    color: '#666',
  },
  luckyDayMonth: {
    fontSize: 10,
    color: '#888',
  },
  passedLabel: {
    fontSize: 8,
    color: '#666',
    marginTop: 2,
  },
  tipsCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fbbf24',
    marginBottom: 12,
  },
  tipsText: {
    fontSize: 13,
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 6,
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

export default function LuckyDaysScreen() {
  return (
    <PremiumGate feature="lucky-days">
      <LuckyDaysScreenContent />
    </PremiumGate>
  );
}
