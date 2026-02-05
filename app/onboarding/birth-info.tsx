import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { calculateNatalChart } from '../../services/astrology';
import { geocodeCity } from '../../services/geocoding';
import { supabase } from '../../services/supabase';
import { validateBirthDate } from '../../utils/validation';
import { useAuth } from '../_layout';

export default function BirthInfoScreen() {
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { t } = useLanguage(); // Use t from context for reactive translations

  const handleContinue = async () => {
    if (!birthDate) {
      Alert.alert(t('error'), t('enterBirthDate'));
      return;
    }

    const birthDateResult = validateBirthDate(birthDate);
    if (!birthDateResult.valid) {
      Alert.alert(t('error'), t(birthDateResult.error!));
      return;
    }

    setLoading(true);

    try {
      const [month, day, year] = birthDate.split('/');
      const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

      const geoResult = await geocodeCity(birthCity || 'Montreal');
      const cityCoords = { latitude: geoResult.latitude, longitude: geoResult.longitude };

      const chart = calculateNatalChart(
        parsedDate,
        birthTime || null,
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
          birth_time: birthTime || null,
          birth_city: birthCity || null,
          birth_latitude: cityCoords.latitude,
          birth_longitude: cityCoords.longitude,
          sun_sign: chart.sun.sign,
          moon_sign: chart.moon.sign,
          rising_sign: chart.rising.sign,
          birth_chart: birthChartData,
          age: birthDateResult.age,
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) {
        Alert.alert(t('error'), error.message);
      } else {
        Alert.alert(
          t('chartReady'),
          `${t('sun')}: ${chart.sun.sign}\n${t('moon')}: ${chart.moon.sign}\n${t('rising')}: ${chart.rising.sign}`,
          [{ text: t('continue'), onPress: () => router.replace('/') }]
        );
      }
    } catch (err) {
      Alert.alert(t('error'), t('invalidDateFormat'));
    }

    setLoading(false);
  };

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
                <TextInput
                  style={styles.input}
                  placeholder={t('birthDatePlaceholder')}
                  placeholderTextColor="#666"
                  value={birthDate}
                  onChangeText={setBirthDate}
                  keyboardType="numeric"
                />
                <Text style={styles.hint}>{t('birthDateHint')}</Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('birthTime')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('birthTimePlaceholder')}
                  placeholderTextColor="#666"
                  value={birthTime}
                  onChangeText={setBirthTime}
                />
                <Text style={styles.hint}>
                  {t('birthTimeHint')}
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>{t('birthCity')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('birthCityPlaceholder')}
                  placeholderTextColor="#666"
                  value={birthCity}
                  onChangeText={setBirthCity}
                  autoCapitalize="words"
                />
                <Text style={styles.hint}>
                  {t('birthCityHint')}
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
                onPress={() => router.back()}
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
  },
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
