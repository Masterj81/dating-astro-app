import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showAlert } from '../../utils/alert';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateNatalChart } from '../../services/astrology';
import { geocodeCity } from '../../services/geocoding';
import { supabase } from '../../services/supabase';
import { AppTheme } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { buttonPress, errorNotification } from '../../services/haptics';

// Generate arrays for dropdowns
const MONTHS = [
  { label: 'January', value: '01' },
  { label: 'February', value: '02' },
  { label: 'March', value: '03' },
  { label: 'April', value: '04' },
  { label: 'May', value: '05' },
  { label: 'June', value: '06' },
  { label: 'July', value: '07' },
  { label: 'August', value: '08' },
  { label: 'September', value: '09' },
  { label: 'October', value: '10' },
  { label: 'November', value: '11' },
  { label: 'December', value: '12' },
];

const DAYS = Array.from({ length: 31 }, (_, i) => ({
  label: String(i + 1),
  value: String(i + 1).padStart(2, '0'),
}));

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => ({
  label: String(currentYear - 18 - i),
  value: String(currentYear - 18 - i),
}));

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  label: i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`,
  value: String(i).padStart(2, '0'),
}));

const MINUTES = Array.from({ length: 60 }, (_, i) => ({
  label: String(i).padStart(2, '0'),
  value: String(i).padStart(2, '0'),
}));

type ShowMeOption = 'men' | 'women' | 'everyone';

const SHOW_ME_OPTIONS: ShowMeOption[] = ['men', 'women', 'everyone'];

const mapLookingForToShowMe = (lookingFor?: string[] | null): ShowMeOption => {
  const normalized = (lookingFor || []).map((value) => value.toLowerCase());
  if (normalized.length === 1 && normalized[0] === 'male') {
    return 'men';
  }
  if (normalized.length === 1 && normalized[0] === 'female') {
    return 'women';
  }
  return 'everyone';
};

const mapShowMeToLookingFor = (showMe: ShowMeOption) => {
  if (showMe === 'men') {
    return ['male'];
  }
  if (showMe === 'women') {
    return ['female'];
  }
  return ['male', 'female', 'non-binary', 'other'];
};

const pickerMode = undefined; // Let each platform use its default picker mode

const TOTAL_STEPS = 3;

// Zodiac sign emoji helper
const getZodiacEmoji = (sign: string): string => {
  const map: Record<string, string> = {
    Aries: '\u2648', Taurus: '\u2649', Gemini: '\u264A', Cancer: '\u264B',
    Leo: '\u264C', Virgo: '\u264D', Libra: '\u264E', Scorpio: '\u264F',
    Sagittarius: '\u2650', Capricorn: '\u2651', Aquarius: '\u2652', Pisces: '\u2653',
  };
  return map[sign] || '';
};

// Progress indicator component -- now reflects multi-step wizard
function ProgressBar({ step, total }: { step: number; total: number }) {
  const { t } = useLanguage();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: step / total,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step, total, widthAnim]);

  return (
    <View style={progressStyles.container}>
      <Text style={progressStyles.label}>
        {t('onboardingStep')?.replace('{{current}}', String(step)).replace('{{total}}', String(total)) || `Step ${step} of ${total}`}
      </Text>
      <View style={progressStyles.track}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[
              progressStyles.segment,
              i < step && progressStyles.segmentFilled,
              i === step - 1 && progressStyles.segmentCurrent,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 16,
  },
  label: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
    width: '70%',
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  segmentFilled: {
    backgroundColor: AppTheme.colors.coral,
  },
  segmentCurrent: {
    backgroundColor: AppTheme.colors.coral,
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
});

// Section divider with icon
function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <View style={sectionStyles.container}>
      <Text style={sectionStyles.icon}>{icon}</Text>
      <Text style={sectionStyles.title}>{title}</Text>
      {subtitle && <Text style={sectionStyles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  icon: {
    fontSize: 28,
    marginBottom: 8,
  },
  title: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: AppTheme.colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 12,
    lineHeight: 18,
  },
});

// Chart reveal overlay shown after calculation
function ChartRevealOverlay({
  visible,
  chart,
  onContinue,
}: {
  visible: boolean;
  chart: { sun: { sign: string }; moon: { sign: string }; rising: { sign: string } } | null;
  onContinue: () => void;
}) {
  const { t } = useLanguage();
  const overlayFade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const sunFade = useRef(new Animated.Value(0)).current;
  const moonFade = useRef(new Animated.Value(0)).current;
  const risingFade = useRef(new Animated.Value(0)).current;
  const btnFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && chart) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(overlayFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(cardScale, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
        ]),
        Animated.timing(sunFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(moonFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(risingFade, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(btnFade, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, [visible, chart]);

  if (!visible || !chart) return null;

  const placements = [
    { label: t('sun'), sign: chart.sun.sign, emoji: getZodiacEmoji(chart.sun.sign), anim: sunFade, desc: t('sunRevealDesc') || 'Your core identity' },
    { label: t('moon'), sign: chart.moon.sign, emoji: getZodiacEmoji(chart.moon.sign), anim: moonFade, desc: t('moonRevealDesc') || 'Your emotional world' },
    { label: t('rising'), sign: chart.rising.sign, emoji: getZodiacEmoji(chart.rising.sign), anim: risingFade, desc: t('risingRevealDesc') || 'How others see you' },
  ];

  return (
    <Animated.View style={[revealStyles.overlay, { opacity: overlayFade }]}>
      <Animated.View style={[revealStyles.card, { transform: [{ scale: cardScale }] }]}>
        <Text style={revealStyles.title}>{t('chartReady')}</Text>
        <Text style={revealStyles.subtitle}>{t('chartRevealSubtitle') || 'Here is your cosmic blueprint'}</Text>

        <View style={revealStyles.placements}>
          {placements.map((p) => (
            <Animated.View key={p.label} style={[revealStyles.placementRow, { opacity: p.anim }]}>
              <Text style={revealStyles.placementEmoji}>{p.emoji}</Text>
              <View style={revealStyles.placementInfo}>
                <Text style={revealStyles.placementLabel}>{p.label}</Text>
                <Text style={revealStyles.placementSign}>{p.sign}</Text>
                <Text style={revealStyles.placementDesc}>{p.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View style={{ opacity: btnFade, width: '100%' }}>
          <TouchableOpacity style={revealStyles.button} onPress={onContinue} activeOpacity={0.8}>
            <LinearGradient
              colors={[...AppTheme.gradients.cta]}
              style={revealStyles.buttonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={revealStyles.buttonText}>{t('letsGoDiscover') || "Let's Find Your Matches"}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const revealStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 10, 22, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(20, 22, 42, 0.95)',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.25)',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
  },
  placements: {
    width: '100%',
    gap: 16,
    marginBottom: 28,
  },
  placementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  placementEmoji: {
    fontSize: 28,
    marginRight: 14,
  },
  placementInfo: {
    flex: 1,
  },
  placementLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  placementSign: {
    color: AppTheme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  placementDesc: {
    color: AppTheme.colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default function BirthInfoScreen() {
  const [step, setStep] = useState(1);
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthHour, setBirthHour] = useState('');
  const [birthMinute, setBirthMinute] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [gender, setGender] = useState('');
  const [showMe, setShowMe] = useState<ShowMeOption>('everyone');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [calculatingPhase, setCalculatingPhase] = useState('');
  const [showReveal, setShowReveal] = useState(false);
  const [revealChart, setRevealChart] = useState<{ sun: { sign: string }; moon: { sign: string }; rising: { sign: string } } | null>(null);
  const [birthDateError, setBirthDateError] = useState('');
  const [genderError, setGenderError] = useState('');
  const { user, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const animateStepTransition = useCallback(() => {
    formFade.setValue(0);
    formSlide.setValue(20);
    Animated.parallel([
      Animated.timing(formFade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(formSlide, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [formFade, formSlide]);

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(formFade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(formSlide, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Gentle pulse on the zodiac ring
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- animation refs are stable
  }, []);

  // Load existing birth data on mount
  useEffect(() => {
    const loadExistingData = async () => {
      if (!user?.id) {
        setInitialLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('birth_date, birth_time, birth_city, looking_for, gender')
          .eq('id', user.id)
          .maybeSingle();

        if (data && !error) {
          if (data.birth_date) {
            const [year, month, day] = data.birth_date.split('-');
            setBirthYear(year);
            setBirthMonth(month);
            setBirthDay(day);
          }
          if (data.birth_time) {
            const [hour, minute] = data.birth_time.split(':');
            setBirthHour(hour);
            setBirthMinute(minute);
          }
          if (data.birth_city) {
            setBirthCity(data.birth_city);
          }
          if (data.looking_for) {
            setShowMe(mapLookingForToShowMe(data.looking_for));
          }
          if (data.gender) {
            setGender(data.gender);
          }
        }
      } catch (_err) {
        // Silently fail - user can still enter new data
      } finally {
        setInitialLoading(false);
      }
    };

    loadExistingData();
  }, [user?.id]);

  // Clear inline errors when user changes values
  const handleBirthMonthChange = (v: string) => { setBirthMonth(v); if (birthDateError) setBirthDateError(''); };
  const handleBirthDayChange = (v: string) => { setBirthDay(v); if (birthDateError) setBirthDateError(''); };
  const handleBirthYearChange = (v: string) => { setBirthYear(v); if (birthDateError) setBirthDateError(''); };
  const handleGenderChange = (v: string) => { setGender(v); if (genderError) setGenderError(''); };

  // Calculate age from birth date
  const calculateAge = (year: number, month: number, day: number): number => {
    const today = new Date();
    const birthDate = new Date(year, month - 1, day);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Step 1 validation: birthday (inline errors instead of alerts)
  const handleStep1Next = () => {
    if (!birthMonth || !birthDay || !birthYear) {
      setBirthDateError(t('enterBirthDate'));
      errorNotification();
      return;
    }
    const year = parseInt(birthYear);
    const month = parseInt(birthMonth);
    const day = parseInt(birthDay);
    const age = calculateAge(year, month, day);
    if (age < 18) {
      setBirthDateError(t('mustBe18'));
      errorNotification();
      return;
    }
    setBirthDateError('');
    buttonPress();
    setStep(2);
    animateStepTransition();
  };

  // Step 2 validation: time + city (optional, can skip)
  const handleStep2Next = () => {
    buttonPress();
    setStep(3);
    animateStepTransition();
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      animateStepTransition();
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      showAlert(t('error'), 'User not authenticated. Please log in again.');
      router.replace('/auth/login');
      return;
    }

    if (!gender) {
      setGenderError(t('selectGenderError'));
      errorNotification();
      return;
    }
    setGenderError('');

    const year = parseInt(birthYear);
    const month = parseInt(birthMonth);
    const day = parseInt(birthDay);
    const age = calculateAge(year, month, day);

    buttonPress();
    setLoading(true);
    setCalculatingPhase(t('calculatingChart') || 'Reading the stars...');

    try {
      const formattedDate = `${birthYear}-${birthMonth}-${birthDay}`;
      const parsedDate = new Date(year, month - 1, day);
      const birthTime = birthHour && birthMinute ? `${birthHour}:${birthMinute}` : null;

      // Show phased loading messages
      const phases = [
        t('calculatingChart') || 'Reading the stars...',
        t('calculatingPhase2') || 'Mapping your planets...',
        t('calculatingPhase3') || 'Aligning your cosmic blueprint...',
      ];
      let phaseIndex = 0;
      const phaseInterval = setInterval(() => {
        phaseIndex = (phaseIndex + 1) % phases.length;
        setCalculatingPhase(phases[phaseIndex]);
      }, 1200);

      const geoResult = await geocodeCity(birthCity || 'Montreal');
      const cityCoords = { latitude: geoResult.latitude, longitude: geoResult.longitude };

      const chart = calculateNatalChart(
        parsedDate,
        birthTime,
        cityCoords.latitude,
        cityCoords.longitude
      );

      // Transform local chart to match BirthChart format for synastry
      const birthChartData = {
        sun: chart.sun,
        moon: chart.moon,
        rising: chart.rising,
        planets: {
          mercury: chart.mercury,
          venus: chart.venus,
          mars: chart.mars,
          jupiter: chart.jupiter,
          saturn: chart.saturn,
        },
        coordinates: cityCoords,
      };

      const { error } = await supabase
        .from('profiles')
        .update({
          birth_date: formattedDate,
          birth_time: birthTime,
          birth_city: birthCity || null,
          gender,
          looking_for: mapShowMeToLookingFor(showMe),
          birth_latitude: cityCoords.latitude,
          birth_longitude: cityCoords.longitude,
          sun_sign: chart.sun.sign,
          moon_sign: chart.moon.sign,
          rising_sign: chart.rising.sign,
          birth_chart: birthChartData,
          age: age,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      clearInterval(phaseInterval);

      if (error) {
        showAlert(t('error'), error.message);
        setLoading(false);
        setCalculatingPhase('');
      } else {
        // Refresh the profile in auth context so onboardingCompleted is updated
        await refreshProfile();

        setLoading(false);
        setCalculatingPhase('');

        // Show animated chart reveal instead of a plain alert
        setRevealChart(chart);
        setShowReveal(true);
      }
    } catch (err: any) {
      const message = err?.message || '';
      let userMessage: string;

      if (message.toLowerCase().includes('geocod') || message.toLowerCase().includes('city') || message.toLowerCase().includes('location')) {
        userMessage = t('geocodingFailed') || 'We couldn\'t locate that city. Try adding the country (e.g., "Paris, France").';
      } else if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch') || message.toLowerCase().includes('timeout')) {
        userMessage = t('networkErrorRetry') || 'Connection lost. Please check your network and try again.';
      } else {
        userMessage = t('chartCalculationFailed') || 'We couldn\'t read your stars this time. Please check your birth city and try again.';
      }

      showAlert(t('oops') || 'Oops', userMessage);
      setLoading(false);
      setCalculatingPhase('');
    }
  };

  const handleRevealContinue = () => {
    router.replace('/(tabs)/discover');
  };

  if (initialLoading) {
    return (
      <LinearGradient
        colors={[...AppTheme.gradients.screen]}
        style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}
      >
        <Text style={{ fontSize: 32, marginBottom: 16 }}>{'\u2728'}</Text>
        <ActivityIndicator size="large" color={AppTheme.colors.coral} />
        <Text style={{ color: AppTheme.colors.textMuted, fontSize: 13, marginTop: 14, letterSpacing: 0.5 }}>
          {t('preparingYourStars') || 'Preparing your stars\u2026'}
        </Text>
      </LinearGradient>
    );
  }

  // Step titles and subtitles for the header
  const stepHeaders: Record<number, { icon: string; title: string; subtitle: string }> = {
    1: {
      icon: '\uD83C\uDF1F',
      title: t('yourBirthChart') || 'When Were You Born?',
      subtitle: t('birthChartSubtitle') || 'Your birth moment holds the key to your unique cosmic blueprint',
    },
    2: {
      icon: '\uD83C\uDF19',
      title: t('stepTwoTitle') || 'Refine Your Chart',
      subtitle: t('stepTwoSubtitle') || 'These details unlock your Moon and Rising signs for deeper, more accurate matches',
    },
    3: {
      icon: '\u2728',
      title: t('stepThreeTitle') || 'One Last Thing',
      subtitle: t('stepThreeSubtitle') || 'Help us find the right people for you',
    },
  };

  const currentHeader = stepHeaders[step];

  return (
    <LinearGradient
      colors={[...AppTheme.gradients.screen]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {/* Progress indicator */}
            <ProgressBar step={step} total={TOTAL_STEPS} />

            {/* Header with animations */}
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Animated.Text
                style={[
                  styles.zodiacRing,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                {'\u2648 \u2649 \u264A \u264B \u264C \u264D \u264E \u264F \u2650 \u2651 \u2652 \u2653'}
              </Animated.Text>
              <Text style={styles.stepIcon}>{currentHeader.icon}</Text>
              <Text style={styles.title}>{currentHeader.title}</Text>
              <Text style={styles.subtitle}>{currentHeader.subtitle}</Text>
            </Animated.View>

            {/* Form with staggered animation */}
            <Animated.View
              style={[
                styles.form,
                {
                  opacity: formFade,
                  transform: [{ translateY: formSlide }],
                },
              ]}
            >
              {/* ========= STEP 1: Birthday ========= */}
              {step === 1 && (
                <>
                  <SectionHeader
                    icon={'\uD83C\uDF82'}
                    title={t('birthDateSectionTitle') || 'The Day You Arrived'}
                    subtitle={t('birthDateSectionSubtitle') || 'This is how we calculate your Sun sign -- the heart of who you are'}
                  />

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('birthDateRequired')}</Text>
                    <View style={styles.pickerRow}>
                      <View style={styles.pickerFieldLarge}>
                        <Text style={styles.pickerFieldLabel}>{t('month')}</Text>
                        <View style={styles.pickerWrapper}>
                          <Picker
                            selectedValue={birthMonth}
                            onValueChange={handleBirthMonthChange}
                            mode={pickerMode}
                            style={styles.picker}
                            dropdownIconColor="#e94560"
                            itemStyle={styles.pickerItem}
                          >
                            <Picker.Item label={t('month')} value="" style={styles.pickerItemPlaceholder} />
                            {MONTHS.map((m) => (
                              <Picker.Item key={m.value} label={m.label} value={m.value} style={styles.pickerItem} />
                            ))}
                          </Picker>
                        </View>
                      </View>
                      <View style={styles.pickerFieldSmall}>
                        <Text style={styles.pickerFieldLabel}>{t('day')}</Text>
                        <View style={styles.pickerWrapperSmall}>
                          <Picker
                            selectedValue={birthDay}
                            onValueChange={handleBirthDayChange}
                            mode={pickerMode}
                            style={styles.picker}
                            dropdownIconColor="#e94560"
                            itemStyle={styles.pickerItem}
                          >
                            <Picker.Item label={t('day')} value="" style={styles.pickerItemPlaceholder} />
                            {DAYS.map((d) => (
                              <Picker.Item key={d.value} label={d.label} value={d.value} style={styles.pickerItem} />
                            ))}
                          </Picker>
                        </View>
                      </View>
                    </View>
                    <View style={styles.pickerRow}>
                      <View style={styles.pickerFieldLarge}>
                        <Text style={styles.pickerFieldLabel}>{t('year')}</Text>
                        <View style={styles.pickerWrapper}>
                          <Picker
                            selectedValue={birthYear}
                            onValueChange={handleBirthYearChange}
                            mode={pickerMode}
                            style={styles.picker}
                            dropdownIconColor="#e94560"
                            itemStyle={styles.pickerItem}
                          >
                            <Picker.Item label={t('year')} value="" style={styles.pickerItemPlaceholder} />
                            {YEARS.map((y) => (
                              <Picker.Item key={y.value} label={y.label} value={y.value} style={styles.pickerItem} />
                            ))}
                          </Picker>
                        </View>
                      </View>
                    </View>
                  </View>

                  {birthDateError ? (
                    <Text style={styles.fieldError}>{birthDateError}</Text>
                  ) : null}

                  <View style={styles.infoBox}>
                    <Text style={styles.infoIcon}>{'\uD83D\uDD12'}</Text>
                    <Text style={styles.infoText}>
                      {t('birthDataPrivacy')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.button}
                    onPress={handleStep1Next}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={[...AppTheme.gradients.cta]}
                      style={styles.buttonGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text style={styles.buttonText}>{t('continue') || 'Continue'}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}

              {/* ========= STEP 2: Birth Time + City ========= */}
              {step === 2 && (
                <>
                  <SectionHeader
                    icon={'\uD83C\uDF19'}
                    title={t('birthTimeSectionTitle') || 'The Exact Moment'}
                    subtitle={t('stepTwoBirthTimeHint') || 'Your birth time reveals your Moon and Rising signs. Even an approximate time helps!'}
                  />

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('birthTime')}</Text>
                    <View style={styles.pickerRow}>
                      <View style={styles.pickerWrapper}>
                        <Picker
                          selectedValue={birthHour}
                          onValueChange={setBirthHour}
                          mode={pickerMode}
                          style={styles.picker}
                          dropdownIconColor="#e94560"
                          itemStyle={styles.pickerItem}
                        >
                          <Picker.Item label={t('hour')} value="" style={styles.pickerItemPlaceholder} />
                          {HOURS.map((h) => (
                            <Picker.Item key={h.value} label={h.label} value={h.value} style={styles.pickerItem} />
                          ))}
                        </Picker>
                      </View>
                      <View style={styles.pickerWrapperSmall}>
                        <Picker
                          selectedValue={birthMinute}
                          onValueChange={setBirthMinute}
                          mode={pickerMode}
                          style={styles.picker}
                          dropdownIconColor="#e94560"
                          itemStyle={styles.pickerItem}
                        >
                          <Picker.Item label={t('min')} value="" style={styles.pickerItemPlaceholder} />
                          {MINUTES.map((m) => (
                            <Picker.Item key={m.value} label={m.label} value={m.value} style={styles.pickerItem} />
                          ))}
                        </Picker>
                      </View>
                    </View>
                    <Text style={styles.hint}>
                      {t('birthTimeSectionHint') || 'Check your birth certificate or ask a parent'}
                    </Text>
                  </View>

                  {/* Visual divider */}
                  <View style={styles.sectionDivider} />

                  <SectionHeader
                    icon={'\uD83C\uDF0D'}
                    title={t('birthPlaceSectionTitle') || 'Where It All Began'}
                    subtitle={t('birthCityOptionalHint') || 'Helps pinpoint your rising sign'}
                  />

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('birthCity')}</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., Paris, France"
                      placeholderTextColor="#666"
                      value={birthCity}
                      onChangeText={setBirthCity}
                      autoCapitalize="words"
                    />
                    <Text style={styles.hint}>
                      {t('birthCityFormatHint') || 'Include country if the city name is common (e.g., "Springfield, IL, USA")'}
                    </Text>
                  </View>

                  <View style={styles.infoBoxSubtle}>
                    <Text style={styles.infoText}>
                      {t('stepTwoEncouragement') || "Don't worry if you're not sure -- we'll still build a great chart with what you have."}
                    </Text>
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                      <Text style={styles.backBtnText}>{t('back') || 'Back'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { flex: 1 }]}
                      onPress={handleStep2Next}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[...AppTheme.gradients.cta]}
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        <Text style={styles.buttonText}>{t('continue') || 'Continue'}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.skipLink}
                    onPress={handleStep2Next}
                  >
                    <Text style={styles.skipLinkText}>{t('skipForNow') || 'Skip for now'}</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ========= STEP 3: Gender + Preference ========= */}
              {step === 3 && (
                <>
                  <SectionHeader
                    icon={'\u2728'}
                    title={t('aboutYouSectionTitle') || 'About You'}
                    subtitle={t('aboutYouSectionSubtitle') || 'Almost there -- just two quick questions'}
                  />

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('genderLabel')}</Text>
                    <View style={styles.genderOptions}>
                      {[
                        { value: 'male', label: t('genderOption_male') },
                        { value: 'female', label: t('genderOption_female') },
                        { value: 'non-binary', label: t('genderOption_nonBinary') },
                        { value: 'other', label: t('genderOption_other') },
                      ].map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.genderOption,
                            gender === option.value && styles.preferenceOptionActive,
                          ]}
                          onPress={() => handleGenderChange(option.value)}
                        >
                          <Text
                            style={[
                              styles.genderOptionText,
                              gender === option.value && styles.preferenceOptionTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {genderError ? <Text style={styles.fieldError}>{genderError}</Text> : null}
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>{t('datingPreference')}</Text>
                    <Text style={styles.preferenceHint}>{t('datingPreferenceHint')}</Text>
                    <View style={styles.preferenceOptions}>
                      {SHOW_ME_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={[
                            styles.preferenceOption,
                            showMe === option && styles.preferenceOptionActive,
                          ]}
                          onPress={() => setShowMe(option)}
                        >
                          <Text
                            style={[
                              styles.preferenceOptionText,
                              showMe === option && styles.preferenceOptionTextActive,
                            ]}
                          >
                            {t(option)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
                      <Text style={styles.backBtnText}>{t('back') || 'Back'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { flex: 1 }]}
                      onPress={handleSubmit}
                      disabled={loading}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={[...AppTheme.gradients.cta]}
                        style={styles.buttonGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {loading ? (
                          <View style={styles.loadingRow}>
                            <ActivityIndicator color="#fff" />
                            <Text style={styles.loadingText}>{calculatingPhase}</Text>
                          </View>
                        ) : (
                          <Text style={styles.buttonText}>{t('calculateMyChart')}</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Chart reveal overlay */}
      <ChartRevealOverlay
        visible={showReveal}
        chart={revealChart}
        onContinue={handleRevealContinue}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  } as any,
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  zodiacRing: {
    fontSize: 14,
    color: '#e94560',
    marginBottom: 12,
    letterSpacing: 4,
    opacity: 0.7,
  },
  stepIcon: {
    fontSize: 32,
    marginBottom: 10,
  },
  title: {
    ...AppTheme.type.title,
    color: AppTheme.colors.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: AppTheme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
    fontStyle: 'italic',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    padding: 20,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 12,
    marginHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: AppTheme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  pickerFieldLarge: {
    flex: 1,
  },
  pickerFieldSmall: {
    flex: 0.82,
  },
  pickerFieldLabel: {
    color: AppTheme.colors.textMuted,
    fontSize: 11,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pickerWrapper: {
    flex: 1,
    backgroundColor: '#f6f1ea',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerWrapperSmall: {
    flex: 0.82,
    backgroundColor: '#f6f1ea',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    color: '#1c1a24',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'android' && {
      minHeight: 54,
    }),
    ...(Platform.OS === 'web' && {
      height: 50,
      paddingHorizontal: 12,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: '#f6f1ea',
      color: '#1c1a24',
      fontSize: 14,
      width: '100%',
      borderRadius: 12,
    }),
  } as any,
  pickerItem: {
    color: '#1c1a24',
  },
  pickerItemPlaceholder: {
    color: '#7f6f77',
  },
  preferenceHint: {
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  preferenceOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  genderOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  preferenceOption: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderOption: {
    minWidth: '47%',
    flexGrow: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preferenceOptionActive: {
    backgroundColor: 'rgba(233, 69, 96, 0.16)',
    borderColor: 'rgba(233, 69, 96, 0.55)',
  },
  preferenceOptionText: {
    color: '#d3d0da',
    fontSize: 14,
    fontWeight: '600',
  },
  genderOptionText: {
    color: '#d3d0da',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  preferenceOptionTextActive: {
    color: '#fff4f6',
  },
  hint: {
    color: AppTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  fieldError: {
    color: '#e94560',
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.08)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.15)',
  },
  infoBoxSubtle: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    color: AppTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  button: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: AppTheme.colors.coral,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonGradient: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  backBtn: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backBtnText: {
    color: AppTheme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  skipLink: {
    marginTop: 14,
    padding: 10,
    alignItems: 'center',
  },
  skipLinkText: {
    color: AppTheme.colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
