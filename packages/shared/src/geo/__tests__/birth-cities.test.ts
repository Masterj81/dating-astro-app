import { describe, expect, it } from 'vitest';

import {
  formatBirthCitySuggestion,
  hasHomonyms,
  isUsableBirthCoordinate,
  MAX_CITY_QUERY_LENGTH,
  MIN_CITY_QUERY_LENGTH,
  minimumQueryLength,
  normalizeCityQuery,
  validateBirthCitySuggestion,
} from '../index';
import type { BirthCitySuggestion } from '../types';

const city = (
  name: string,
  overrides: Partial<BirthCitySuggestion> = {},
): BirthCitySuggestion => ({
  id: `${name}-id`,
  name,
  admin1: 'Region',
  country: 'Country',
  countryCode: 'XX',
  latitude: 42.6977,
  longitude: 23.3219,
  source: 'remote',
  ...overrides,
});

describe('normalizeCityQuery', () => {
  it('folds case and accents', () => {
    expect(normalizeCityQuery('Montr\u00e9al')).toBe('montreal');
    expect(normalizeCityQuery('S\u00c3O PAULO')).toBe('sao paulo');
    expect(normalizeCityQuery('Z\u00fcrich')).toBe('zurich');
  });

  it('keeps the letters NFD cannot decompose', () => {
    // A whitelist of [a-z] turned this into "k benhavn", which matched nothing.
    expect(normalizeCityQuery('K\u00f8benhavn')).toBe('kobenhavn');
    expect(normalizeCityQuery('Troms\u00f8')).toBe('tromso');
    expect(normalizeCityQuery('\u00c6beltoft')).toBe('aebeltoft');
    expect(normalizeCityQuery('Stra\u00dfe')).toBe('strasse');
    expect(normalizeCityQuery('\u0141\u00f3d\u017a')).toBe('lodz');
  });

  it('does not erase scripts that are not Latin', () => {
    expect(normalizeCityQuery('\u6771\u4eac')).toBe('\u6771\u4eac');
    expect(normalizeCityQuery('\uc11c\uc6b8')).toBe('\uc11c\uc6b8');
    expect(normalizeCityQuery('\u041c\u043e\u0441\u043a\u0432\u0430')).toBe(
      '\u043c\u043e\u0441\u043a\u0432\u0430',
    );
  });

  it('recomposes, so a two-character Korean name stays two characters', () => {
    // NFD splits Hangul into conjoining jamo; without the NFC pass this was
    // five code units and passed the length rule for the wrong reason.
    expect(normalizeCityQuery('\uc11c\uc6b8')).toHaveLength(2);
  });

  it('drops punctuation and collapses whitespace, but keeps hyphens', () => {
    expect(normalizeCityQuery('  Paris,   France ')).toBe('paris france');
    expect(normalizeCityQuery('Trois-Rivi\u00e8res')).toBe('trois-rivieres');
  });

  it('survives an empty or whitespace query', () => {
    expect(normalizeCityQuery('')).toBe('');
    expect(normalizeCityQuery('   ')).toBe('');
  });
});

describe('minimumQueryLength', () => {
  it('asks for three Latin characters', () => {
    expect(MIN_CITY_QUERY_LENGTH).toBe(3);
    expect(minimumQueryLength('par')).toBe(3);
  });

  it('accepts two for CJK, which is a whole city name', () => {
    expect(minimumQueryLength('\u6771\u4eac')).toBe(2);
    expect(minimumQueryLength('\uc11c\uc6b8')).toBe(2);
  });

  it('has a ceiling', () => {
    expect(MAX_CITY_QUERY_LENGTH).toBe(120);
  });
});

describe('formatBirthCitySuggestion', () => {
  it('reads city, region, country', () => {
    expect(
      formatBirthCitySuggestion({ name: 'Montr\u00e9al', admin1: 'Qu\u00e9bec', country: 'Canada' }),
    ).toBe('Montr\u00e9al, Qu\u00e9bec, Canada');
  });

  it('skips a region a country does not have', () => {
    expect(
      formatBirthCitySuggestion({ name: 'Singapore', admin1: '', country: 'Singapore' }),
    ).toBe('Singapore, Singapore');
  });
});

describe('isUsableBirthCoordinate', () => {
  it('accepts a real place', () => {
    expect(isUsableBirthCoordinate(45.5019, -73.5674)).toBe(true);
    expect(isUsableBirthCoordinate(-33.8688, 151.2093)).toBe(true);
  });

  it('rejects 0,0 — a coalesced null wearing a location', () => {
    expect(isUsableBirthCoordinate(0, 0)).toBe(false);
  });

  it('accepts a genuine zero on one axis only', () => {
    // Greenwich longitude is real; London sits on it.
    expect(isUsableBirthCoordinate(51.4779, 0)).toBe(true);
  });

  it('rejects NaN, Infinity, null, undefined and strings', () => {
    expect(isUsableBirthCoordinate(Number.NaN, 10)).toBe(false);
    expect(isUsableBirthCoordinate(10, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isUsableBirthCoordinate(null, 10)).toBe(false);
    expect(isUsableBirthCoordinate(undefined, undefined)).toBe(false);
    expect(isUsableBirthCoordinate('45.5', '-73.5')).toBe(false);
  });

  it('rejects coordinates off the planet', () => {
    expect(isUsableBirthCoordinate(91, 0)).toBe(false);
    expect(isUsableBirthCoordinate(0, 181)).toBe(false);
  });
});

describe('hasHomonyms', () => {
  it('flags two cities bearing the same name', () => {
    expect(hasHomonyms([city('Paris'), city('Paris', { id: 'tx' })])).toBe(true);
  });

  it('matches across accents and case', () => {
    expect(hasHomonyms([city('Montr\u00e9al'), city('MONTREAL', { id: 'b' })])).toBe(true);
  });

  it('does not flag distinct cities', () => {
    expect(hasHomonyms([city('Paris'), city('Lyon')])).toBe(false);
  });

  it('does not flag an empty or single list', () => {
    expect(hasHomonyms([])).toBe(false);
    expect(hasHomonyms([city('Paris')])).toBe(false);
  });
});

describe('validateBirthCitySuggestion', () => {
  const good = city('Sofia', { admin1: 'Sofia-grad', country: 'Bulgaria', countryCode: 'BG' });

  it('passes a well-formed suggestion through', () => {
    expect(validateBirthCitySuggestion(good)?.name).toBe('Sofia');
  });

  it('refuses one with no coordinates, rather than repairing it', () => {
    expect(validateBirthCitySuggestion({ ...good, latitude: undefined })).toBeNull();
    expect(validateBirthCitySuggestion({ ...good, latitude: 0, longitude: 0 })).toBeNull();
    expect(validateBirthCitySuggestion({ ...good, longitude: '23.3' })).toBeNull();
  });

  it('refuses one with no name or country', () => {
    expect(validateBirthCitySuggestion({ ...good, name: '  ' })).toBeNull();
    expect(validateBirthCitySuggestion({ ...good, country: '' })).toBeNull();
  });

  it('refuses a suggestion stored during the catalog era', () => {
    // Those rows carried coordinates from a bundled table this app no longer
    // ships; re-validating them as current would resurrect that source.
    expect(validateBirthCitySuggestion({ ...good, source: 'catalog' })).toBeNull();
    expect(validateBirthCitySuggestion({ ...good, source: 'nominatim' })).toBeNull();
    expect(validateBirthCitySuggestion({ ...good, source: 'device' })).toBeNull();
  });

  it('refuses junk', () => {
    for (const junk of [null, undefined, 'Sofia', 42, [], {}]) {
      expect(validateBirthCitySuggestion(junk)).toBeNull();
    }
  });
});
