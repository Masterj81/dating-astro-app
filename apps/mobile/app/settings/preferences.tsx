import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../contexts/LanguageContext';
import { supabase } from '../../services/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────
type Preferences = {
  minAge: number;
  maxAge: number;
  maxDistance: number;
  showMe: 'men' | 'women' | 'everyone';
  zodiacFilter: string[];
  elementFilter: string[];
  onlyHighCompatibility: boolean;
};

const DEFAULTS: Preferences = {
  minAge: 18,
  maxAge: 50,
  maxDistance: 50,
  showMe: 'everyone',
  zodiacFilter: [],
  elementFilter: [],
  onlyHighCompatibility: false,
};

// ── Constants ──────────────────────────────────────────────────────
const ALL_ELEMENTS = ['fire', 'earth', 'air', 'water'] as const;

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
] as const;

const ELEMENTS = [
  { name: 'Fire', emoji: '🔥', signs: ['Aries', 'Leo', 'Sagittarius'] },
  { name: 'Earth', emoji: '🌍', signs: ['Taurus', 'Virgo', 'Capricorn'] },
  { name: 'Air', emoji: '💨', signs: ['Gemini', 'Libra', 'Aquarius'] },
  { name: 'Water', emoji: '💧', signs: ['Cancer', 'Scorpio', 'Pisces'] },
] as const;

const DISTANCE_STEPS = [1, 5, 10, 15, 25, 50, 75, 100, 150, 200];

// ── Helpers ────────────────────────────────────────────────────────
const storageKey = (uid: string) => `discovery_preferences_${uid}`;

const safeStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const sanitizeStoredPreferences = (value: unknown): Partial<Preferences> => {
  if (!value || typeof value !== 'object') return {};

  const obj = value as Record<string, unknown>;

  return {
    zodiacFilter: safeStringArray(obj.zodiacFilter),
    elementFilter: safeStringArray(obj.elementFilter),
    onlyHighCompatibility:
      typeof obj.onlyHighCompatibility === 'boolean'
        ? obj.onlyHighCompatibility
        : DEFAULTS.onlyHighCompatibility,
  };
};

const lookingForToShowMe = (lf: unknown): Preferences['showMe'] => {
  const n = safeStringArray(lf).map(v => v.toLowerCase());
  if (n.length === 1 && n[0] === 'male') return 'men';
  if (n.length === 1 && n[0] === 'female') return 'women';
  return 'everyone';
};

const showMeToLookingFor = (s: Preferences['showMe']) => {
  if (s === 'men') return ['male'];
  if (s === 'women') return ['female'];
  return ['male', 'female', 'non-binary', 'other'];
};

const elementsToFilter = (pe: unknown) => {
  const n = safeStringArray(pe).map(v => v.toLowerCase());
  if (!n.length || n.length === ALL_ELEMENTS.length) return [];
  return n.map(v => v.charAt(0).toUpperCase() + v.slice(1));
};

// ── Stepper Component (pure JS, no native deps) ───────────────────
function Stepper({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  suffix?: string;
}) {
  const dec = () => onValueChange(Math.max(min, value - step));
  const inc = () => onValueChange(Math.min(max, value + step));

  return (
    <View style={s.stepper}>
      <TouchableOpacity
        style={[s.stepBtn, value <= min && s.stepBtnDisabled]}
        onPress={dec}
        disabled={value <= min}
      >
        <Text style={s.stepBtnText}>-</Text>
      </TouchableOpacity>
      <Text style={s.stepValue}>
        {value}{suffix || ''}
      </Text>
      <TouchableOpacity
        style={[s.stepBtn, value >= max && s.stepBtnDisabled]}
        onPress={inc}
        disabled={value >= max}
      >
        <Text style={s.stepBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Distance Picker ────────────────────────────────────────────────
function DistancePicker({
  value,
  onValueChange,
}: {
  value: number;
  onValueChange: (v: number) => void;
}) {
  return (
    <View style={s.distanceRow}>
      {DISTANCE_STEPS.map(d => (
        <TouchableOpacity
          key={d}
          style={[s.distanceChip, value === d && s.distanceChipActive]}
          onPress={() => onValueChange(d)}
        >
          <Text style={[s.distanceText, value === d && s.distanceTextActive]}>
            {d}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────
export default function PreferencesScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({ ...DEFAULTS });

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    if (!user) { setLoading(false); return; }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('min_age, max_age, max_distance, looking_for, preferred_elements')
        .eq('id', user.id)
        .maybeSingle();

      let stored: Partial<Preferences> = {};
      try {
        const raw = await AsyncStorage.getItem(storageKey(user.id));
        if (raw) {
          stored = sanitizeStoredPreferences(JSON.parse(raw));
        }
      } catch { /* corrupted storage */ }

      setPrefs(prev => ({
        ...prev,
        ...stored,
        minAge: typeof data?.min_age === 'number' ? data.min_age : prev.minAge,
        maxAge: typeof data?.max_age === 'number' ? data.max_age : prev.maxAge,
        maxDistance: typeof data?.max_distance === 'number' ? data.max_distance : prev.maxDistance,
        showMe: lookingForToShowMe(data?.looking_for),
        elementFilter: elementsToFilter(data?.preferred_elements),
        zodiacFilter: safeStringArray(stored.zodiacFilter),
        onlyHighCompatibility:
          typeof stored.onlyHighCompatibility === 'boolean'
            ? stored.onlyHighCompatibility
            : prev.onlyHighCompatibility,
      }));
    } catch (err) {
      console.error('[Preferences] load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const payload = {
        id: user.id,
        email: user.email ?? null,
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        min_age: prefs.minAge,
        max_age: prefs.maxAge,
        max_distance: prefs.maxDistance,
        looking_for: showMeToLookingFor(prefs.showMe),
        preferred_elements: prefs.elementFilter.length
          ? prefs.elementFilter.map(v => v.toLowerCase())
          : [...ALL_ELEMENTS],
      };

      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload, { onConflict: 'id' })
        .select('id');

      if (error || !data?.length) {
        Alert.alert(t('error'), error?.message || t('somethingWrong'));
        return;
      }

      await AsyncStorage.setItem(
        storageKey(user.id),
        JSON.stringify({
          zodiacFilter: prefs.zodiacFilter,
          onlyHighCompatibility: prefs.onlyHighCompatibility,
        })
      );

      Alert.alert(t('success'), t('preferencesUpdated') || 'Preferences updated', [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert(t('error'), err?.message || t('somethingWrong'));
    } finally {
      setSaving(false);
    }
  };

  const toggleZodiac = (sign: string) => {
    setPrefs(p => ({
      ...p,
      zodiacFilter: p.zodiacFilter.includes(sign)
        ? p.zodiacFilter.filter(x => x !== sign)
        : [...p.zodiacFilter, sign],
    }));
  };

  const toggleElement = (element: string) => {
    const el = ELEMENTS.find(e => e.name === element);
    if (!el) return;
    setPrefs(p => {
      const active = p.elementFilter.includes(element);
      return {
        ...p,
        elementFilter: active
          ? p.elementFilter.filter(e => e !== element)
          : [...p.elementFilter, element],
        zodiacFilter: active
          ? p.zodiacFilter.filter(x => !(el.signs as readonly string[]).includes(x))
          : [...new Set([...p.zodiacFilter, ...(el.signs as readonly string[])])],
      };
    });
  };

  const clearFilters = () => setPrefs(p => ({ ...p, zodiacFilter: [], elementFilter: [] }));
  const zodiacFilter = safeStringArray(prefs.zodiacFilter);
  const elementFilter = safeStringArray(prefs.elementFilter);

  // ── Loading ──
  if (loading) {
    return (
      <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={s.container}>
        <ActivityIndicator size="large" color="#e94560" style={{ marginTop: 100 }} />
      </LinearGradient>
    );
  }

  // ── Render ──
  return (
    <LinearGradient colors={['#0f0f1a', '#1a1a2e', '#16213e']} style={s.container}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('discoveryPreferences') || 'Preferences'}</Text>
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.saveText}>{t('save') || 'Save'}</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Age Range */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('ageRange') || 'Age Range'}</Text>
          <View style={s.ageRow}>
            <View style={s.ageCol}>
              <Text style={s.label}>{t('minimum') || 'Min'}</Text>
              <Stepper
                value={prefs.minAge}
                min={18}
                max={prefs.maxAge - 1}
                onValueChange={v => setPrefs(p => ({ ...p, minAge: v }))}
              />
            </View>
            <Text style={s.ageSep}>-</Text>
            <View style={s.ageCol}>
              <Text style={s.label}>{t('maximum') || 'Max'}</Text>
              <Stepper
                value={prefs.maxAge}
                min={prefs.minAge + 1}
                max={99}
                onValueChange={v => setPrefs(p => ({ ...p, maxAge: v }))}
              />
            </View>
          </View>
        </View>

        {/* Distance */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('maxDistance') || 'Maximum Distance'}</Text>
          <Text style={s.bigValue}>{prefs.maxDistance} km</Text>
          <DistancePicker
            value={prefs.maxDistance}
            onValueChange={v => setPrefs(p => ({ ...p, maxDistance: v }))}
          />
        </View>

        {/* Show Me */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('showMe') || 'Show Me'}</Text>
          <View style={s.optionRow}>
            {(['men', 'women', 'everyone'] as const).map(opt => (
              <TouchableOpacity
                key={opt}
                style={[s.optionBtn, prefs.showMe === opt && s.optionBtnActive]}
                onPress={() => setPrefs(p => ({ ...p, showMe: opt }))}
              >
                <Text style={[s.optionText, prefs.showMe === opt && s.optionTextActive]}>
                  {t(opt) || opt.charAt(0).toUpperCase() + opt.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Elements */}
        <View style={s.section}>
          <View style={s.sectionRow}>
            <Text style={s.sectionTitle}>{t('filterByElement') || 'Filter by Element'}</Text>
            {(elementFilter.length > 0 || zodiacFilter.length > 0) && (
              <TouchableOpacity onPress={clearFilters}>
                <Text style={s.clearText}>{t('clearAll') || 'Clear'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.elementGrid}>
            {ELEMENTS.map(el => (
              <TouchableOpacity
                key={el.name}
                style={[s.elementCard, elementFilter.includes(el.name) && s.cardActive]}
                onPress={() => toggleElement(el.name)}
              >
                <Text style={s.elementEmoji}>{el.emoji}</Text>
                <Text style={[s.elementName, elementFilter.includes(el.name) && s.textActive]}>
                  {t(el.name.toLowerCase()) || el.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Zodiac Signs */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>{t('filterByZodiac') || 'Filter by Zodiac Sign'}</Text>
          <Text style={s.hint}>{t('zodiacFilterHint') || 'Only show profiles with these sun signs'}</Text>
          <View style={s.zodiacGrid}>
            {ZODIAC_SIGNS.map(sign => (
              <TouchableOpacity
                key={sign.name}
                style={[s.zodiacCard, zodiacFilter.includes(sign.name) && s.cardActive]}
                onPress={() => toggleZodiac(sign.name)}
              >
                <Text style={s.zodiacEmoji}>{sign.emoji}</Text>
                <Text style={[s.zodiacName, zodiacFilter.includes(sign.name) && s.textActive]}>
                  {t(sign.name.toLowerCase()) || sign.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* High Compatibility Toggle */}
        <View style={s.section}>
          <TouchableOpacity
            style={s.compatRow}
            onPress={() => setPrefs(p => ({ ...p, onlyHighCompatibility: !p.onlyHighCompatibility }))}
          >
            <View style={s.compatLeft}>
              <Text style={{ fontSize: 28 }}>💫</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.compatTitle}>
                  {t('highCompatibilityOnly') || 'High Compatibility Only'}
                </Text>
                <Text style={s.hint}>
                  {t('highCompatibilityHint') || 'Only show 70%+ compatibility'}
                </Text>
              </View>
            </View>
            <View style={[s.checkbox, prefs.onlyHighCompatibility && s.checkboxActive]}>
              {prefs.onlyHighCompatibility && <Text style={s.checkmark}>✓</Text>}
            </View>
          </TouchableOpacity>
        </View>

        {/* Active Filters Summary */}
        {(zodiacFilter.length > 0 || prefs.onlyHighCompatibility) && (
          <View style={s.summary}>
            <Text style={s.summaryTitle}>{t('activeFilters') || 'Active Filters'}</Text>
            <Text style={s.summaryText}>
              {zodiacFilter.length > 0 && `${zodiacFilter.length} ${t('zodiacSigns') || 'signs'}`}
              {prefs.zodiacFilter.length > 0 && prefs.onlyHighCompatibility && ' · '}
              {prefs.onlyHighCompatibility && (t('highCompatibility') || '70%+')}
            </Text>
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  backText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '600', color: '#fff' },
  saveBtn: { backgroundColor: '#e94560', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, minWidth: 70, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Section
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#fff', marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  hint: { fontSize: 13, color: '#888', marginBottom: 12 },
  label: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 8 },
  clearText: { fontSize: 14, color: '#e94560' },

  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(233,69,96,0.15)', justifyContent: 'center', alignItems: 'center' },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { color: '#e94560', fontSize: 24, fontWeight: '600', lineHeight: 28 },
  stepValue: { fontSize: 32, fontWeight: 'bold', color: '#e94560', minWidth: 50, textAlign: 'center' },

  // Age
  ageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  ageCol: { alignItems: 'center' },
  ageSep: { fontSize: 24, color: '#666', marginTop: 20 },

  // Distance
  bigValue: { fontSize: 36, fontWeight: 'bold', color: '#e94560', textAlign: 'center', marginBottom: 16 },
  distanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  distanceChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1.5, borderColor: 'transparent' },
  distanceChipActive: { borderColor: '#e94560', backgroundColor: 'rgba(233,69,96,0.15)' },
  distanceText: { fontSize: 14, color: '#888', fontWeight: '500' },
  distanceTextActive: { color: '#e94560' },

  // Options (Show Me)
  optionRow: { flexDirection: 'row', gap: 10 },
  optionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  optionBtnActive: { borderColor: '#e94560', backgroundColor: 'rgba(233,69,96,0.1)' },
  optionText: { fontSize: 15, color: '#888', fontWeight: '500' },
  optionTextActive: { color: '#e94560' },

  // Elements
  elementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  elementCard: { width: '47%', flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'transparent', gap: 10 },
  elementEmoji: { fontSize: 24 },
  elementName: { fontSize: 15, color: '#888', fontWeight: '500' },

  // Zodiac
  zodiacGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zodiacCard: { width: '22%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 2, borderColor: 'transparent' },
  zodiacEmoji: { fontSize: 20, marginBottom: 4 },
  zodiacName: { fontSize: 10, color: '#888', textAlign: 'center' },

  // Shared active states
  cardActive: { borderColor: '#e94560', backgroundColor: 'rgba(233,69,96,0.1)' },
  textActive: { color: '#e94560' },

  // Compatibility
  compatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.05)', padding: 16, borderRadius: 16 },
  compatLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  compatTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#666', justifyContent: 'center', alignItems: 'center' },
  checkboxActive: { backgroundColor: '#e94560', borderColor: '#e94560' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // Summary
  summary: { backgroundColor: 'rgba(233,69,96,0.1)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(233,69,96,0.2)' },
  summaryTitle: { fontSize: 14, fontWeight: '600', color: '#e94560', marginBottom: 4 },
  summaryText: { fontSize: 13, color: '#ccc' },
});
