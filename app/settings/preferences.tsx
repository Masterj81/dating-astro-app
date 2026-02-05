import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../_layout';

type Preferences = {
  minAge: number;
  maxAge: number;
  maxDistance: number;
  showMe: 'men' | 'women' | 'everyone';
  zodiacFilter: string[];
  elementFilter: string[];
  onlyHighCompatibility: boolean;
};

const ZODIAC_SIGNS = [
  { name: 'Aries', emoji: '♈', element: 'fire' },
  { name: 'Taurus', emoji: '♉', element: 'earth' },
  { name: 'Gemini', emoji: '♊', element: 'air' },
  { name: 'Cancer', emoji: '♋', element: 'water' },
  { name: 'Leo', emoji: '♌', element: 'fire' },
  { name: 'Virgo', emoji: '♍', element: 'earth' },
  { name: 'Libra', emoji: '♎', element: 'air' },
  { name: 'Scorpio', emoji: '♏', element: 'water' },
  { name: 'Sagittarius', emoji: '♐', element: 'fire' },
  { name: 'Capricorn', emoji: '♑', element: 'earth' },
  { name: 'Aquarius', emoji: '♒', element: 'air' },
  { name: 'Pisces', emoji: '♓', element: 'water' },
];

const ELEMENTS = [
  { name: 'Fire', emoji: '🔥', signs: ['Aries', 'Leo', 'Sagittarius'] },
  { name: 'Earth', emoji: '🌍', signs: ['Taurus', 'Virgo', 'Capricorn'] },
  { name: 'Air', emoji: '💨', signs: ['Gemini', 'Libra', 'Aquarius'] },
  { name: 'Water', emoji: '💧', signs: ['Cancer', 'Scorpio', 'Pisces'] },
];

export default function PreferencesScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    minAge: 18,
    maxAge: 50,
    maxDistance: 50,
    showMe: 'everyone',
    zodiacFilter: [],
    elementFilter: [],
    onlyHighCompatibility: false,
  });

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', user.id)
      .single();

    if (data?.preferences) {
      setPreferences({ ...preferences, ...data.preferences });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        preferences,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      Alert.alert(t('error'), t('somethingWrong'));
    } else {
      Alert.alert(t('success'), t('preferencesUpdated') || 'Preferences updated', [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    }
  };

  const toggleZodiacFilter = (sign: string) => {
    setPreferences(prev => ({
      ...prev,
      zodiacFilter: prev.zodiacFilter.includes(sign)
        ? prev.zodiacFilter.filter(s => s !== sign)
        : [...prev.zodiacFilter, sign],
    }));
  };

  const toggleElementFilter = (element: string) => {
    const elementData = ELEMENTS.find(e => e.name === element);
    if (!elementData) return;

    setPreferences(prev => {
      const isSelected = prev.elementFilter.includes(element);
      if (isSelected) {
        // Remove element and its signs
        return {
          ...prev,
          elementFilter: prev.elementFilter.filter(e => e !== element),
          zodiacFilter: prev.zodiacFilter.filter(s => !elementData.signs.includes(s)),
        };
      } else {
        // Add element and its signs
        return {
          ...prev,
          elementFilter: [...prev.elementFilter, element],
          zodiacFilter: [...new Set([...prev.zodiacFilter, ...elementData.signs])],
        };
      }
    });
  };

  const clearFilters = () => {
    setPreferences(prev => ({
      ...prev,
      zodiacFilter: [],
      elementFilter: [],
    }));
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
        <ActivityIndicator size="large" color="#e94560" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{t('discoveryPreferences') || 'Preferences'}</Text>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>{t('save') || 'Save'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Age Range */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('ageRange') || 'Age Range'}</Text>
          <View style={styles.rangeDisplay}>
            <Text style={styles.rangeValue}>{preferences.minAge}</Text>
            <Text style={styles.rangeSeparator}>-</Text>
            <Text style={styles.rangeValue}>{preferences.maxAge}</Text>
            <Text style={styles.rangeUnit}>{t('yearsOld') || 'years old'}</Text>
          </View>

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>{t('minimum') || 'Min'}</Text>
            <Slider
              style={styles.slider}
              minimumValue={18}
              maximumValue={preferences.maxAge - 1}
              step={1}
              value={preferences.minAge}
              onValueChange={(value) => setPreferences(prev => ({ ...prev, minAge: value }))}
              minimumTrackTintColor="#e94560"
              maximumTrackTintColor="#333"
              thumbTintColor="#e94560"
            />
          </View>

          <View style={styles.sliderContainer}>
            <Text style={styles.sliderLabel}>{t('maximum') || 'Max'}</Text>
            <Slider
              style={styles.slider}
              minimumValue={preferences.minAge + 1}
              maximumValue={99}
              step={1}
              value={preferences.maxAge}
              onValueChange={(value) => setPreferences(prev => ({ ...prev, maxAge: value }))}
              minimumTrackTintColor="#e94560"
              maximumTrackTintColor="#333"
              thumbTintColor="#e94560"
            />
          </View>
        </View>

        {/* Distance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('maxDistance') || 'Maximum Distance'}</Text>
          <View style={styles.rangeDisplay}>
            <Text style={styles.rangeValue}>{preferences.maxDistance}</Text>
            <Text style={styles.rangeUnit}>km</Text>
          </View>

          <Slider
            style={styles.fullSlider}
            minimumValue={1}
            maximumValue={200}
            step={1}
            value={preferences.maxDistance}
            onValueChange={(value) => setPreferences(prev => ({ ...prev, maxDistance: value }))}
            minimumTrackTintColor="#e94560"
            maximumTrackTintColor="#333"
            thumbTintColor="#e94560"
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderEndLabel}>1 km</Text>
            <Text style={styles.sliderEndLabel}>200 km</Text>
          </View>
        </View>

        {/* Show Me */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('showMe') || 'Show Me'}</Text>
          <View style={styles.optionButtons}>
            {(['men', 'women', 'everyone'] as const).map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionButton,
                  preferences.showMe === option && styles.optionButtonActive,
                ]}
                onPress={() => setPreferences(prev => ({ ...prev, showMe: option }))}
              >
                <Text style={[
                  styles.optionText,
                  preferences.showMe === option && styles.optionTextActive,
                ]}>
                  {t(option) || option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Elements Filter */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('filterByElement') || 'Filter by Element'}</Text>
            {(preferences.elementFilter.length > 0 || preferences.zodiacFilter.length > 0) && (
              <TouchableOpacity onPress={clearFilters}>
                <Text style={styles.clearText}>{t('clearAll') || 'Clear all'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionSubtitle}>
            {t('elementFilterHint') || 'Select elements to filter by their zodiac signs'}
          </Text>
          <View style={styles.elementGrid}>
            {ELEMENTS.map((element) => (
              <TouchableOpacity
                key={element.name}
                style={[
                  styles.elementCard,
                  preferences.elementFilter.includes(element.name) && styles.elementCardActive,
                ]}
                onPress={() => toggleElementFilter(element.name)}
              >
                <Text style={styles.elementEmoji}>{element.emoji}</Text>
                <Text style={[
                  styles.elementName,
                  preferences.elementFilter.includes(element.name) && styles.elementNameActive,
                ]}>
                  {t(element.name.toLowerCase()) || element.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Zodiac Filter */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('filterByZodiac') || 'Filter by Zodiac Sign'}</Text>
          <Text style={styles.sectionSubtitle}>
            {t('zodiacFilterHint') || 'Only show profiles with these sun signs'}
          </Text>
          <View style={styles.zodiacGrid}>
            {ZODIAC_SIGNS.map((sign) => (
              <TouchableOpacity
                key={sign.name}
                style={[
                  styles.zodiacCard,
                  preferences.zodiacFilter.includes(sign.name) && styles.zodiacCardActive,
                ]}
                onPress={() => toggleZodiacFilter(sign.name)}
              >
                <Text style={styles.zodiacEmoji}>{sign.emoji}</Text>
                <Text style={[
                  styles.zodiacName,
                  preferences.zodiacFilter.includes(sign.name) && styles.zodiacNameActive,
                ]}>
                  {t(sign.name.toLowerCase()) || sign.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Compatibility Filter */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.compatibilityRow}
            onPress={() => setPreferences(prev => ({
              ...prev,
              onlyHighCompatibility: !prev.onlyHighCompatibility,
            }))}
          >
            <View style={styles.compatibilityLeft}>
              <Text style={styles.compatibilityIcon}>💫</Text>
              <View>
                <Text style={styles.compatibilityTitle}>
                  {t('highCompatibilityOnly') || 'High Compatibility Only'}
                </Text>
                <Text style={styles.compatibilitySubtitle}>
                  {t('highCompatibilityHint') || 'Only show profiles with 70%+ compatibility'}
                </Text>
              </View>
            </View>
            <View style={[
              styles.checkbox,
              preferences.onlyHighCompatibility && styles.checkboxActive,
            ]}>
              {preferences.onlyHighCompatibility && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Active Filters Summary */}
        {(preferences.zodiacFilter.length > 0 || preferences.onlyHighCompatibility) && (
          <View style={styles.filterSummary}>
            <Text style={styles.filterSummaryTitle}>
              {t('activeFilters') || 'Active Filters'}
            </Text>
            <Text style={styles.filterSummaryText}>
              {preferences.zodiacFilter.length > 0 && (
                `${preferences.zodiacFilter.length} ${t('zodiacSigns') || 'zodiac signs'}`
              )}
              {preferences.zodiacFilter.length > 0 && preferences.onlyHighCompatibility && ' • '}
              {preferences.onlyHighCompatibility && (t('highCompatibility') || 'High compatibility')}
            </Text>
          </View>
        )}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
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
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#e94560',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  clearText: {
    fontSize: 14,
    color: '#e94560',
  },
  rangeDisplay: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 8,
  },
  rangeValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#e94560',
  },
  rangeSeparator: {
    fontSize: 24,
    color: '#666',
    marginHorizontal: 8,
  },
  rangeUnit: {
    fontSize: 16,
    color: '#888',
    marginLeft: 8,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sliderLabel: {
    width: 40,
    fontSize: 14,
    color: '#888',
  },
  slider: {
    flex: 1,
    height: 40,
  },
  fullSlider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
  },
  sliderEndLabel: {
    fontSize: 12,
    color: '#666',
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonActive: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  optionText: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  optionTextActive: {
    color: '#e94560',
  },
  elementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  elementCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 10,
  },
  elementCardActive: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  elementEmoji: {
    fontSize: 24,
  },
  elementName: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
  },
  elementNameActive: {
    color: '#e94560',
  },
  zodiacGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  zodiacCard: {
    width: '23%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  zodiacCardActive: {
    borderColor: '#e94560',
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  zodiacEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  zodiacName: {
    fontSize: 10,
    color: '#888',
    textAlign: 'center',
  },
  zodiacNameActive: {
    color: '#e94560',
  },
  compatibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
  },
  compatibilityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  compatibilityIcon: {
    fontSize: 28,
  },
  compatibilityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  compatibilitySubtitle: {
    fontSize: 13,
    color: '#888',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterSummary: {
    marginHorizontal: 20,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(233, 69, 96, 0.2)',
  },
  filterSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e94560',
    marginBottom: 4,
  },
  filterSummaryText: {
    fontSize: 13,
    color: '#ccc',
  },
});
