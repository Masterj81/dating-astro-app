/**
 * Birth city — the shared rules both apps obey.
 *
 * ONE SOURCE, ON PURPOSE
 * ----------------------
 * Cities are resolved by Geoapify, through our own edge function, and by
 * nothing else. There is no bundled catalog and no on-device geocoder: a second
 * resolution path is a second set of coordinates for the same city, and a
 * reader resolved through one path today and the other tomorrow gets two
 * different ascendants for one birthplace.
 *
 * That is not hypothetical. This repo shipped a 44-city coordinate cache and a
 * Montreal fallback, and a census on 1 Sep 2026 found 69 profiles stored at
 * Montreal's exact coordinates — Sofia, Varna, Vienna, Verona, Lima, Tampa,
 * every one trivially resolvable, none ever asked about. Birth longitude enters
 * local sidereal time degree for degree, so a substituted city relocates every
 * angle in the chart.
 *
 * WHAT LIVES HERE
 * ---------------
 * The rules that must be identical on web and mobile: how a query is
 * normalised, how short is too short, what a label looks like, and — the one
 * that matters most — what counts as a usable coordinate. The transport lives
 * in `./provider`.
 *
 * A birthplace is either resolved or absent. There is no third state and there
 * is certainly no default.
 */
import type { BirthCitySuggestion } from './types';

export type { BirthCitySuggestion, CountryCode } from './types';

/**
 * Below this we do not search at all: two characters match half the planet,
 * teach the reader nothing, and cost a provider credit each.
 */
export const MIN_CITY_QUERY_LENGTH = 3;

/** Longest query we will look at. Beyond this it is a paste, not a city. */
export const MAX_CITY_QUERY_LENGTH = 120;

/**
 * Latin letters NFD cannot reach.
 *
 * `\u00f8` is not "o with a stroke" to Unicode — it is its own letter and NFD
 * leaves it whole, so a normaliser whitelisting [a-z] deletes it and
 * Kobenhavn becomes "k benhavn".
 */
const NON_DECOMPOSABLE: Record<string, string> = {
  '\u00f8': 'o', '\u00e6': 'ae', '\u0153': 'oe', '\u00df': 'ss',
  '\u00fe': 'th', '\u00f0': 'd', '\u0142': 'l', '\u0111': 'd',
  '\u0127': 'h', '\u0131': 'i', '\u014b': 'n', '\u0259': 'e',
};

/** Combining diacritics, stripped after NFD. */
const COMBINING = /[\u0300-\u036f]/g;

/**
 * ASCII punctuation minus the hyphen (Trois-Rivieres keeps its own), plus the
 * general and CJK punctuation blocks. Everything NOT listed survives — which is
 * the point: Tokyo, Seoul, Moscow and Cairo write their names in scripts a
 * Latin whitelist would erase.
 */
const PUNCTUATION =
  /[\u0021-\u002c\u002e\u002f\u003a-\u0040\u005b-\u0060\u007b-\u007e\u2000-\u206f\u3000-\u303f]/g;

/** Han, Hiragana, Katakana, Hangul — scripts whose names are short by nature. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

/**
 * Fold a typed query into something comparable: lowercase, unaccented,
 * punctuation-free, single-spaced — and script-preserving.
 *
 * The combining-diacritic range is written as a character class rather than a
 * `\p{Diacritic}` property escape because this runs on Hermes as well as V8.
 */
export function normalizeCityQuery(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(
      /[\u00f8\u00e6\u0153\u00df\u00fe\u00f0\u0142\u0111\u0127\u0131\u014b\u0259]/g,
      (c) => NON_DECOMPOSABLE[c] ?? c,
    )
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    // Back to a composed form. NFD splits Hangul into conjoining jamo as well
    // as Latin accents, so a two-character Korean city would otherwise leave
    // here as five code units that look identical to what was typed — and
    // count as five against the minimum-length rule.
    .normalize('NFC')
    .trim();
}

/**
 * How many characters this particular query needs before we search.
 *
 * Three is right for a Latin query. It is wrong for a Chinese city name, which
 * is routinely two characters and complete. Holding every script to a Latin
 * word-length rule is how you build an app that only works in English.
 */
export function minimumQueryLength(normalizedQuery: string): number {
  return CJK.test(normalizedQuery) ? 2 : MIN_CITY_QUERY_LENGTH;
}

/** `Montreal, Quebec, Canada` — the region is skipped where a country has none. */
export function formatBirthCitySuggestion(
  suggestion: Pick<BirthCitySuggestion, 'name' | 'admin1' | 'country'>,
): string {
  return [suggestion.name, suggestion.admin1, suggestion.country]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(', ');
}

/**
 * Coordinates we are willing to store.
 *
 * `0, 0` is rejected on purpose. It is a real point in the Gulf of Guinea and
 * no city is there, so in practice it only ever arrives as the result of
 * `Number(undefined) || 0` — a null coalesced into a place. That exact shape
 * has been in this repo before, and the engine happily computed an ascendant
 * for it.
 */
export function isUsableBirthCoordinate(
  latitude: unknown,
  longitude: unknown,
): latitude is number {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

/**
 * True when the list holds two cities bearing the same name.
 *
 * The UI must not let that resolve silently. Showing "Paris" and quietly
 * meaning France is how someone born in Paris, Texas ends up with an ascendant
 * computed 7,700 km away — and the provider returns both, one after the other,
 * without comment.
 */
export function hasHomonyms(suggestions: readonly BirthCitySuggestion[]): boolean {
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    const key = normalizeCityQuery(suggestion.name);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

/**
 * Guard for anything arriving from outside: a provider response, a stored
 * profile, a persisted draft. Returns the suggestion unchanged, or null.
 *
 * Never repairs. A suggestion with a broken coordinate is not a suggestion
 * with a small problem — it is not a place.
 */
export function validateBirthCitySuggestion(value: unknown): BirthCitySuggestion | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<BirthCitySuggestion>;
  if (typeof s.name !== 'string' || s.name.trim() === '') return null;
  if (typeof s.country !== 'string' || s.country.trim() === '') return null;
  if (!isUsableBirthCoordinate(s.latitude, s.longitude)) return null;
  // One source now. A stored value from the catalog era must not validate:
  // those rows carried coordinates from a table this app no longer ships.
  if (s.source !== 'remote') return null;
  return {
    id:
      typeof s.id === 'string' && s.id
        ? s.id
        : `${normalizeCityQuery(s.name)}|${s.countryCode ?? ''}`,
    name: s.name.trim(),
    admin1: typeof s.admin1 === 'string' ? s.admin1 : '',
    country: s.country.trim(),
    countryCode: typeof s.countryCode === 'string' ? s.countryCode.toUpperCase() : '',
    latitude: s.latitude as number,
    longitude: s.longitude as number,
    ...(typeof s.timezone === 'string' && s.timezone ? { timezone: s.timezone } : null),
    source: 'remote',
  };
}
