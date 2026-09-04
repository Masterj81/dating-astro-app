import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  formatBirthCitySuggestion,
  hasHomonyms,
  minimumQueryLength,
  normalizeCityQuery,
  type BirthCitySuggestion,
} from '@astro/shared/geo';
import { createRemoteBirthCityProvider } from '@astro/shared/geo/provider';

import { AppTheme } from '../constants/theme';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabase';

const DEBOUNCE_MS = 350;
const MAX_SUGGESTIONS = 5;

/**
 * The endpoint is OURS. The Geoapify key lives in the edge function and is
 * never bundled: neither Geoapify nor LocationIQ can meaningfully restrict a
 * key shipped inside an APK — Geoapify's documented mobile control is a
 * User-Agent substring, and LocationIQ states outright that a referrer "can be
 * spoofed". On a 3,000 credit/day free tier a lifted key is an off switch for
 * our own onboarding, not an abstract leak.
 */
const ENDPOINT = `${process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''}/functions/v1/suggest-birth-cities`;

type BirthCityPickerProps = {
  value: string;
  onValueChange: (value: string) => void;
  selected: BirthCitySuggestion | null;
  onSelect: (suggestion: BirthCitySuggestion | null) => void;
  errorText?: string;
  testID?: string;
};

/**
 * Birth city field — the mobile half of the same rule the web enforces.
 *
 * A typed name is not a birthplace. `selected` is the only thing that carries
 * coordinates, and editing the text after choosing clears it: a field reading
 * "Paris, Texas" while holding the coordinates of Paris, France is not a
 * cosmetic mismatch. Birth longitude enters local sidereal time degree for
 * degree, so it is a different ascendant, different houses, different MC.
 *
 * The caller gates its "next" on `selected`, never on the text. Web and mobile
 * must agree here — a validator fails the build if they drift.
 */
export default function BirthCityPicker({
  value,
  onValueChange,
  selected,
  onSelect,
  errorText,
  testID,
}: BirthCityPickerProps) {
  const { t, language } = useLanguage();
  const [remote, setRemote] = useState<BirthCitySuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalized = normalizeCityQuery(value);
  const longEnough = normalized.length >= minimumQueryLength(normalized);

  // One source: the provider, through our own endpoint. There is no bundled
  // catalog to fall back on, because a second resolution path is a second set
  // of coordinates for the same city — and this repo has already shipped 69
  // profiles stored at a fallback city's coordinates.
  const suggestions = remote ?? [];
  const hasSuggestions = suggestions.length > 0;
  const ambiguous = hasHomonyms(suggestions);
  const notFound =
    longEnough && !loading && remote !== null && !hasSuggestions && !selected && !unavailable;

  const provider = useMemo(
    () => createRemoteBirthCityProvider({ endpoint: ENDPOINT }),
    [],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!longEnough || selected) {
      setRemote(null);
      setLoading(false);
      setUnavailable(false);
      return;
    }

    let cancelled = false;
    timer.current = setTimeout(async () => {
      setLoading(true);
      setUnavailable(false);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const result = await provider({
          // The body carries the city text and the interface language. There is
          // nowhere in `BirthCityQuery` to put anything identifying.
          text: value,
          lang: String(language ?? 'en').slice(0, 2),
          limit: MAX_SUGGESTIONS,
        });
        if (cancelled) return;
        if (result.ok) {
          setRemote(result.suggestions);
        } else if (result.reason === 'invalid_query') {
          setRemote(null);
        } else {
          // No local list to fall back to. Say so plainly rather than showing
          // an empty box that reads as "your city does not exist".
          setRemote(null);
          setUnavailable(true);
        }
        void token;
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, longEnough, selected, language, provider]);

  const handleChange = useCallback(
    (next: string) => {
      onValueChange(next);
      // Editing after choosing invalidates the choice. A stale coordinate is
      // worse than none: it is confidently wrong.
      if (selected) onSelect(null);
    },
    [onSelect, onValueChange, selected],
  );

  const choose = useCallback(
    (suggestion: BirthCitySuggestion) => {
      onSelect(suggestion);
      onValueChange(formatBirthCitySuggestion(suggestion));
      setFocused(false);
    },
    [onSelect, onValueChange],
  );

  const showList = focused && hasSuggestions && !selected;

  return (
    <View>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, selected ? styles.inputResolved : null]}
          placeholder={t('birthCityPlaceholder') || 'e.g., Paris, France'}
          placeholderTextColor="#666"
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          autoCapitalize="words"
          autoCorrect={false}
          testID={testID}
        />
        {loading ? (
          <ActivityIndicator
            size="small"
            color={AppTheme.colors.gold}
            style={styles.spinner}
          />
        ) : null}
      </View>

      {loading ? (
        <Text style={styles.hint}>{t('birthCitySearching') || 'Searching cities…'}</Text>
      ) : null}

      {selected ? (
        <Text style={styles.resolved}>
          ✓ {t('birthCityResolved') || 'Birthplace confirmed.'}
        </Text>
      ) : null}

      {showList ? (
        <View style={styles.list}>
          {suggestions.map((suggestion) => (
            <TouchableOpacity
              key={suggestion.id}
              onPress={() => choose(suggestion)}
              style={styles.option}
              activeOpacity={0.7}
              testID={`birth-city-option-${suggestion.id}`}
            >
              <Text style={styles.optionText}>
                {formatBirthCitySuggestion(suggestion)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {showList && ambiguous ? (
        <Text style={styles.hint}>
          {t('birthCityAmbiguous') || 'Several cities share this name. Pick the right one.'}
        </Text>
      ) : null}

      {unavailable ? (
        <Text style={styles.hint}>
          {t('birthCityUnavailable') || 'City search is unavailable. Try again in a moment.'}
        </Text>
      ) : null}

      {notFound ? (
        <Text style={styles.hint}>
          {t('birthCityNotFound') ||
            "We couldn't find that city. Try adding the country or region."}
        </Text>
      ) : null}

      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

      {/* Geoapify's free plan requires visible attribution, and the data under
          it is OpenStreetMap. Both ride with the field that uses them. */}
      <Text style={styles.attribution}>
        {t('birthCityAttribution') ||
          'City search powered by Geoapify · data © OpenStreetMap contributors.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: AppTheme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingRight: 44,
    fontSize: 16,
    color: AppTheme.colors.textPrimary,
  },
  inputResolved: { borderColor: AppTheme.colors.goldBorder },
  spinner: { position: 'absolute', right: 14 },
  list: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: AppTheme.colors.goldBorder,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: AppTheme.colors.canvasAlt,
  },
  option: { paddingHorizontal: 16, paddingVertical: 13 },
  optionText: { fontSize: 15, color: AppTheme.colors.textPrimary },
  resolved: { marginTop: 8, fontSize: 12, color: AppTheme.colors.goldMuted },
  hint: { marginTop: 8, fontSize: 12, lineHeight: 18, color: AppTheme.colors.textMuted },
  error: { marginTop: 8, fontSize: 12, color: AppTheme.colors.danger },
  attribution: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 15,
    color: AppTheme.colors.textMuted,
  },
});
