import { LinearGradient } from 'expo-linear-gradient';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { showAlert } from '../../utils/alert';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateNatalChart } from '../../services/astrology';
import { geocodeCity } from '../../services/geocoding';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

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

export default function BirthInfoScreen() {
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthHour, setBirthHour] = useState('');
  const [birthMinute, setBirthMinute] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const { user, refreshProfile } = useAuth();
  const { t } = useLanguage();

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
          .select('birth_date, birth_time, birth_city')
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
        }
      } catch (_err) {
        // Silently fail - user can still enter new data
      } finally {
        setInitialLoading(false);
      }
    };

    loadExistingData();
  }, [user?.id]);

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

  const handleContinue = async () => {
    if (!user?.id) {
      showAlert(t('error'), 'User not authenticated. Please log in again.');
      router.replace('/auth/login');
      return;
    }

    if (!birthMonth || !birthDay || !birthYear) {
      showAlert(t('error'), t('enterBirthDate'));
      return;
    }

    const year = parseInt(birthYear);
    const month = parseInt(birthMonth);
    const day = parseInt(birthDay);
    const age = calculateAge(year, month, day);

    if (age < 18) {
      showAlert(t('error'), t('mustBe18'));
      return;
    }

    setLoading(true);

    try {
      const formattedDate = `${birthYear}-${birthMonth}-${birthDay}`;
      const parsedDate = new Date(year, month - 1, day);
      const birthTime = birthHour && birthMinute ? `${birthHour}:${birthMinute}` : null;

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

      if (error) {
        showAlert(t('error'), error.message);
      } else {
        // Refresh the profile in auth context so onboardingCompleted is updated
        await refreshProfile();
        showAlert(
          t('chartReady'),
          `${t('sun')}: ${chart.sun.sign}\n${t('moon')}: ${chart.moon.sign}\n${t('rising')}: ${chart.rising.sign}`,
          [{ text: t('continue'), onPress: () => router.replace('/(tabs)/discover') }]
        );
      }
    } catch (_err) {
      showAlert(t('error'), t('invalidDateFormat'));
    }

    setLoading(false);
  };

  if (initialLoading) {
    return (
      <LinearGradient
        colors={['#0f0f1a', '#1a1a2e', '#16213e']}
        style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}
      >
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={['#0f0f1a', '#1a1a2e', '#16213e']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.zodiacRing}>♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓</Text>
              <Text style={styles.title}>{t('yourBirthChart')}</Text>
              <Text style={styles.subtitle}>
                {t('birthChartSubtitle')}
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('birthDateRequired')}</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={birthMonth}
                      onValueChange={setBirthMonth}
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
                  <View style={styles.pickerWrapperSmall}>
                    <Picker
                      selectedValue={birthDay}
                      onValueChange={setBirthDay}
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
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={birthYear}
                      onValueChange={setBirthYear}
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

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('birthTime')}</Text>
                <View style={styles.pickerRow}>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={birthHour}
                      onValueChange={setBirthHour}
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
                  {t('birthTimeHint')}
                </Text>
              </View>

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
                  Include country if city name is common (e.g., {'"'}Springfield, IL, USA{'"'})
                </Text>
              </View>

              <View style={styles.infoBox}>
                <Text style={styles.infoIcon}>🔒</Text>
                <Text style={styles.infoText}>
                  {t('birthDataPrivacy')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.button}
                onPress={handleContinue}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#e94560', '#c23a51']}
                  style={styles.buttonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t('calculateMyChart')}</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => {
                  // Use replace to go to login, as back() may not work on web
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/auth/login');
                  }
                }}
              >
                <Text style={styles.skipText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    marginBottom: 40,
  },
  zodiacRing: {
    fontSize: 16,
    color: '#e94560',
    marginBottom: 16,
    letterSpacing: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  pickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerWrapper: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#2d2d44' : 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickerWrapperSmall: {
    flex: 0.6,
    backgroundColor: Platform.OS === 'web' ? '#2d2d44' : 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  picker: {
    color: Platform.OS === 'web' ? '#000' : '#fff',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      height: 50,
      paddingHorizontal: 12,
      border: 'none',
      cursor: 'pointer',
      backgroundColor: '#fff',
      color: '#000',
      fontSize: 14,
      width: '100%',
      borderRadius: 12,
    }),
  } as any,
  pickerItem: {
    color: '#000',
  },
  pickerItemPlaceholder: {
    color: '#666',
  },
  hint: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    lineHeight: 18,
  },
  button: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    padding: 12,
    alignItems: 'center',
  },
  skipText: {
    color: '#666',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
