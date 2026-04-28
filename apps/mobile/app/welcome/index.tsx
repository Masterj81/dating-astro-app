import { Picker } from '@react-native-picker/picker';
import { Link, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme, SCREEN_GRADIENT } from '../../constants/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { savePreSignupDraft, loadPreSignupDraft } from '../../utils/onboardingDraft';
import { buttonPress } from '../../services/haptics';

// -- Pickers data ----------------------------------------------------------

const MONTHS_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS = MONTHS_LABELS.map((label, i) => ({
  label,
  value: String(i + 1).padStart(2, '0'),
}));

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

// -- Subtle starfield background ------------------------------------------

function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        key: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: 1 + Math.random() * 2,
        opacity: 0.18 + Math.random() * 0.4,
      })),
    [],
  );
  const twinkle = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 2400, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0.6, duration: 2400, useNativeDriver: true }),
      ]),
    ).start();
  }, [twinkle]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {stars.map((s) => (
        <Animated.View
          key={s.key}
          style={[
            styles.star,
            {
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              borderRadius: s.size / 2,
              opacity: Animated.multiply(twinkle, s.opacity),
            },
          ]}
        />
      ))}
    </View>
  );
}

// -- Screen ----------------------------------------------------------------

export default function WelcomeIndex() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthHour, setBirthHour] = useState('');
  const [birthMinute, setBirthMinute] = useState('');
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthCity, setBirthCity] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load any in-progress draft so refresh is non-destructive.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadPreSignupDraft();
      if (cancelled || !draft) return;
      if (draft.birthMonth) setBirthMonth(String(draft.birthMonth));
      if (draft.birthDay) setBirthDay(String(draft.birthDay));
      if (draft.birthYear) setBirthYear(String(draft.birthYear));
      if (draft.birthHour) setBirthHour(String(draft.birthHour));
      if (draft.birthMinute) setBirthMinute(String(draft.birthMinute));
      if (draft.birthCity) setBirthCity(String(draft.birthCity));
      if (draft.timeUnknown) setTimeUnknown(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dateComplete = !!birthMonth && !!birthDay && !!birthYear;
  const cityComplete = birthCity.trim().length >= 2;
  const timeComplete = timeUnknown || (!!birthHour && !!birthMinute);
  const canContinue = dateComplete && cityComplete && timeComplete;

  const handleContinue = async () => {
    if (!canContinue || submitting) return;
    buttonPress();
    setSubmitting(true);
    try {
      await savePreSignupDraft({
        birthMonth,
        birthDay,
        birthYear,
        birthHour: timeUnknown ? '' : birthHour,
        birthMinute: timeUnknown ? '' : birthMinute,
        timeUnknown,
        birthCity: birthCity.trim(),
      });
      router.push('/welcome/preview');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkipToSignup = () => {
    buttonPress();
    router.push('/auth/signup');
  };

  return (
    <LinearGradient colors={SCREEN_GRADIENT} style={styles.container}>
      <Starfield />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{t('welcomeEyebrow') || 'Before you sign in'}</Text>
            <Text style={styles.title}>
              {t('welcomeTitle') || 'Let’s map your sky.'}
            </Text>
            <Text style={styles.subtitle}>
              {t('welcomeSubtitle') ||
                'A few details. We’ll draw your chart and show who the cosmos brings near you.'}
            </Text>
          </View>

          {/* 1. Birth date */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('welcomeBornOn') || 'You were born on'}</Text>
            <View style={styles.pickerRow}>
              <View style={[styles.pickerCol, styles.pickerColWide]}>
                <Picker
                  selectedValue={birthMonth}
                  onValueChange={setBirthMonth}
                  itemStyle={styles.pickerItem}
                  style={styles.picker}
                  dropdownIconColor={AppTheme.colors.textPrimary}
                >
                  <Picker.Item label={t('welcomeMonth') || 'Month'} value="" color={AppTheme.colors.textMuted} />
                  {MONTHS.map((m) => (
                    <Picker.Item key={m.value} label={m.label} value={m.value} color={AppTheme.colors.textPrimary} />
                  ))}
                </Picker>
              </View>
              <View style={styles.pickerCol}>
                <Picker
                  selectedValue={birthDay}
                  onValueChange={setBirthDay}
                  itemStyle={styles.pickerItem}
                  style={styles.picker}
                  dropdownIconColor={AppTheme.colors.textPrimary}
                >
                  <Picker.Item label={t('welcomeDay') || 'Day'} value="" color={AppTheme.colors.textMuted} />
                  {DAYS.map((d) => (
                    <Picker.Item key={d.value} label={d.label} value={d.value} color={AppTheme.colors.textPrimary} />
                  ))}
                </Picker>
              </View>
              <View style={styles.pickerCol}>
                <Picker
                  selectedValue={birthYear}
                  onValueChange={setBirthYear}
                  itemStyle={styles.pickerItem}
                  style={styles.picker}
                  dropdownIconColor={AppTheme.colors.textPrimary}
                >
                  <Picker.Item label={t('welcomeYear') || 'Year'} value="" color={AppTheme.colors.textMuted} />
                  {YEARS.map((y) => (
                    <Picker.Item key={y.value} label={y.label} value={y.value} color={AppTheme.colors.textPrimary} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          {/* 2. Birth time */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('welcomeBornAt') || 'At this time'}</Text>
            <Text style={styles.sectionHelper}>
              {t('welcomeBornAtHelper') ||
                'Your rising sign is set in minutes. Without an exact time, we’ll skip it.'}
            </Text>

            {!timeUnknown ? (
              <View style={styles.pickerRow}>
                <View style={styles.pickerCol}>
                  <Picker
                    selectedValue={birthHour}
                    onValueChange={setBirthHour}
                    itemStyle={styles.pickerItem}
                    style={styles.picker}
                    dropdownIconColor={AppTheme.colors.textPrimary}
                  >
                    <Picker.Item label={t('welcomeHour') || 'Hour'} value="" color={AppTheme.colors.textMuted} />
                    {HOURS.map((h) => (
                      <Picker.Item key={h.value} label={h.label} value={h.value} color={AppTheme.colors.textPrimary} />
                    ))}
                  </Picker>
                </View>
                <View style={styles.pickerCol}>
                  <Picker
                    selectedValue={birthMinute}
                    onValueChange={setBirthMinute}
                    itemStyle={styles.pickerItem}
                    style={styles.picker}
                    dropdownIconColor={AppTheme.colors.textPrimary}
                  >
                    <Picker.Item label={t('welcomeMinute') || 'Minute'} value="" color={AppTheme.colors.textMuted} />
                    {MINUTES.map((m) => (
                      <Picker.Item key={m.value} label={m.label} value={m.value} color={AppTheme.colors.textPrimary} />
                    ))}
                  </Picker>
                </View>
              </View>
            ) : (
              <View style={styles.timeUnknownPanel}>
                <Text style={styles.timeUnknownText}>
                  {t('welcomeTimeSkipped') || 'No exact time — we’ll work without your rising sign.'}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => {
                buttonPress();
                setTimeUnknown((v) => !v);
                if (!timeUnknown) {
                  setBirthHour('');
                  setBirthMinute('');
                }
              }}
              hitSlop={6}
              style={styles.toggleRow}
            >
              <View style={[styles.checkbox, timeUnknown && styles.checkboxOn]}>
                {timeUnknown ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.toggleText}>
                {t('welcomeTimeUnknown') || 'I don’t know my exact time'}
              </Text>
            </Pressable>
          </View>

          {/* 3. Birth city */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('welcomeBornIn') || 'In this city'}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('welcomeBornInPlaceholder') || 'Paris, France'}
              placeholderTextColor={AppTheme.colors.textMuted}
              value={birthCity}
              onChangeText={setBirthCity}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
            />
          </View>

          {/* CTA */}
          <View style={styles.ctaWrap}>
            <TouchableOpacity
              style={[styles.cta, !canContinue && styles.ctaDisabled]}
              onPress={handleContinue}
              disabled={!canContinue || submitting}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={canContinue ? [...AppTheme.gradients.cta] : [AppTheme.colors.panelStrong, AppTheme.colors.panelStrong]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{t('welcomeDrawChart') || 'Draw my chart'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSkipToSignup} hitSlop={8} style={styles.skipBtn}>
              <Text style={styles.skipText}>{t('welcomeSkip') || 'Skip and sign up'}</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('alreadyHaveAccount') || 'Already have an account?'}</Text>
            <Link href="/auth/login" asChild>
              <TouchableOpacity hitSlop={8}>
                <Text style={styles.footerLink}>{t('signIn') || 'Sign in'}</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
  },
  star: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
  },

  hero: {
    marginBottom: 36,
  },
  eyebrow: {
    ...AppTheme.type.meta,
    color: AppTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    marginBottom: 14,
  },
  title: {
    ...AppTheme.type.hero,
    color: AppTheme.colors.textPrimary,
    marginBottom: 12,
  },
  subtitle: {
    ...AppTheme.type.bodyLarge,
    color: AppTheme.colors.textSecondary,
  },

  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    ...AppTheme.type.section,
    color: AppTheme.colors.textPrimary,
    marginBottom: 6,
  },
  sectionHelper: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
    marginBottom: 12,
  },

  pickerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerCol: {
    flex: 1,
    backgroundColor: AppTheme.colors.panel,
    borderColor: AppTheme.colors.border,
    borderWidth: 1,
    borderRadius: AppTheme.radius.md,
    overflow: 'hidden',
  },
  pickerColWide: { flex: 1.5 },
  picker: {
    color: AppTheme.colors.textPrimary,
    backgroundColor: 'transparent',
  },
  pickerItem: {
    color: AppTheme.colors.textPrimary,
    fontSize: 16,
  },

  timeUnknownPanel: {
    backgroundColor: AppTheme.colors.panel,
    borderColor: AppTheme.colors.border,
    borderWidth: 1,
    borderRadius: AppTheme.radius.md,
    padding: 14,
  },
  timeUnknownText: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textSecondary,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AppTheme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: AppTheme.colors.coral,
    borderColor: AppTheme.colors.coral,
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  toggleText: {
    ...AppTheme.type.body,
    color: AppTheme.colors.textSecondary,
  },

  input: {
    backgroundColor: AppTheme.colors.panel,
    borderColor: AppTheme.colors.border,
    borderWidth: 1,
    borderRadius: AppTheme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: AppTheme.colors.textPrimary,
    ...AppTheme.type.bodyLarge,
  },

  ctaWrap: {
    marginTop: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  cta: {
    width: '100%',
    borderRadius: AppTheme.radius.pill,
    overflow: 'hidden',
    ...AppTheme.shadow.ctaGlow,
  },
  ctaDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: AppTheme.colors.textOnAccent,
    ...AppTheme.type.bodyLarge,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  skipBtn: {
    marginTop: 14,
    paddingVertical: 8,
  },
  skipText: {
    color: AppTheme.colors.textMuted,
    ...AppTheme.type.caption,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.textMuted,
  },
  footerLink: {
    ...AppTheme.type.caption,
    color: AppTheme.colors.coral,
    fontWeight: '700',
  },
});
