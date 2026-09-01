import { describe, expect, it } from 'vitest';
import { ZODIAC_SIGNS } from '../chart';
import {
  HOUSE_CUSP_CORPUS,
  HOUSE_CUSP_FALLBACK_LOCALE,
  HOUSE_CUSP_LOCALES,
  HOUSE_CUSP_SIGNS,
  HOUSE_NUMBERS,
  allHouseCuspStrings,
  houseCuspKey,
  resolveHouseCuspInterpretation,
  resolveHouseCuspInterpretations,
  type HouseCuspLocale,
} from '../house-cusps';

const EXPECTED_KEYS = HOUSE_NUMBERS.flatMap((house) =>
  HOUSE_CUSP_SIGNS.map((sign) => houseCuspKey(house, sign)),
);

/** Deterministic language claims fail here, not in the reader's face. */
const BANNED = {
  en: [
    'always',
    'never',
    'destiny',
    'destined',
    'soulmate',
    'soul mate',
    'guaranteed',
    'guarantee',
    'fated',
    'perfect match',
    'you will',
    'will be',
  ],
  fr: [
    'toujours',
    'jamais',
    'destin',
    'ame soeur',
    'garanti',
    'vous devez',
    'il faut que',
    'vous serez',
  ],
  es: ['siempre', 'nunca', 'destino', 'alma gemela', 'garantizado', 'seras'],
  pt: ['sempre', 'nunca', 'destino', 'alma gemea', 'garantido', 'voce sera'],
  de: ['immer', 'nie', 'schicksal', 'seelenpartner', 'garantiert', 'du wirst'],
  ja: ['運命', '必ず', '絶対', 'いつも', '決して', 'ソウルメイト'],
  zh: ['命运', '注定', '保证', '永远', '从不', '灵魂伴侣'],
  ar: ['القدر', 'مضمون', 'دائما', 'أبدا', 'توأم الروح'],
} satisfies Record<HouseCuspLocale, string[]>;

/** At least one of these has to be present: no verdicts, only tendencies. */
const HEDGES = {
  en: ['may', 'can', 'often', 'tends to', 'tend to', 'might', 'usually'],
  // 'pouvez'/'pourriez' are the second-person forms of the same modal — the
  // corpus addresses the reader directly, so leaving them out would have
  // failed entries that hedge perfectly well.
  fr: [
    'peut',
    'peuvent',
    'pouvez',
    'pourrait',
    'pourriez',
    'souvent',
    'parfois',
    'tendance',
    'en général',
  ],
  // `suelen` / `costumam` / `tende` are the "tends to" of these languages and
  // hedge exactly as well as the modal verbs. Written accent-free because the
  // check strips accents: "as vezes" here is what "às vezes" becomes, and
  // before that stripping existed the entry could never match anything.
  es: ['puede', 'pueden', 'podria', 'a menudo', 'a veces', 'suele', 'suelen', 'tiende', 'tienden'],
  pt: ['pode', 'podem', 'poderia', 'muitas vezes', 'as vezes', 'costuma', 'costumam', 'tende', 'tendem'],
  de: ['kann', 'konn', 'oft', 'manchmal', 'haufig'],
  ja: ['かもしれません', 'ことがあります', 'よく', '場合があります'],
  zh: ['可能', '常常', '有时'],
  ar: ['قد', 'يمكن', 'أحيانا'],
} satisfies Record<HouseCuspLocale, string[]>;

/** Not therapy, and it must not read as therapy. */
const CLINICAL = [
  'diagnos',
  'disorder',
  'depress',
  'anxiety',
  'anxiete',
  'trauma',
  'therapy',
  'therapie',
  'addict',
  'patholog',
  'toxic',
  'toxique',
  'narciss',
];

/** A sign on a cusp says nothing about a planet or a degree. Naming one here
 *  would describe data this corpus was never handed. */
const OUT_OF_SCOPE = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
  'ascendant',
  'midheaven',
  'soleil',
  'lune',
  'mercure',
  'vénus',
  'jupiter',
  'saturne',
  'ascendant',
  'milieu du ciel',
  '°',
];

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function sentenceCount(text: string): number {
  return (text.match(/[.!?。！？](\s|$)/g) ?? []).length;
}

/** Japanese, Chinese and Arabic are not tokenised by `\b` in JS regex. */
const SPACE_DELIMITED: readonly HouseCuspLocale[] = ['en', 'fr', 'es', 'pt', 'de'];

/**
 * Does `text` use `word` as a word, rather than merely contain its letters?
 *
 * A plain `includes` fails German "Harmonie" on the banned "nie", and Spanish
 * "clandestino" on "destino". The match is anchored at a word START and left
 * open at the end, so inflections still get caught: "garanti" finds
 * "garantie", "destin" finds "destinée", and neither finds a word that merely
 * ends in those letters. Scripts without word boundaries fall back to
 * substring matching, which is the right test for them.
 */
function usesWord(text: string, word: string, locale: HouseCuspLocale): boolean {
  if (!SPACE_DELIMITED.includes(locale)) return text.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}`, 'u').test(text);
}

describe('house-cusp corpus — coverage', () => {
  it('declares exactly the locales it has content for', () => {
    expect([...HOUSE_CUSP_LOCALES]).toEqual(Object.keys(HOUSE_CUSP_CORPUS));
    expect(HOUSE_CUSP_LOCALES).toContain(HOUSE_CUSP_FALLBACK_LOCALE);
  });

  it('covers 12 houses x 12 signs = 144 keys', () => {
    expect(EXPECTED_KEYS).toHaveLength(144);
    expect(new Set(EXPECTED_KEYS).size).toBe(144);
  });

  it('uses the sign order of the engine, lowercased', () => {
    expect(HOUSE_CUSP_SIGNS.map((s) => s[0].toUpperCase() + s.slice(1))).toEqual([
      ...ZODIAC_SIGNS,
    ]);
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s has all 144 keys and no extras', (locale) => {
    const keys = Object.keys(HOUSE_CUSP_CORPUS[locale]).sort();
    expect(keys).toEqual([...EXPECTED_KEYS].sort());
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s has no empty or padded entry', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      expect(text.length, key).toBeGreaterThan(40);
      expect(text, key).toBe(text.trim());
      expect(text, key).not.toContain('[missing');
      expect(text, key).not.toContain('natalHouseCuspInterpretation');
      expect(text, key).not.toContain('&apos;');
      expect(text, key).not.toContain('undefined');
    }
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s reuses no text twice', (locale) => {
    const texts = allHouseCuspStrings(locale);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s opens its readings more than one way', (locale) => {
    // Equal-house cusps always land on twelve consecutive, DISTINCT signs, so a
    // reader opening their chart sees all twelve cards at once. When every
    // reading in a language shared one sentence frame, that frame appeared
    // twelve times on one screen — the only repetition an individual reader
    // could actually perceive. Twelve frames, one per house, is the fix; ten is
    // the floor so a future edit cannot quietly collapse them back to one.
    const openings = new Set(
      Object.values(HOUSE_CUSP_CORPUS[locale] as Record<string, string>).map((t) => t.slice(0, 16)),
    );
    expect(openings.size, `${locale} has ${openings.size} distinct openings`).toBeGreaterThanOrEqual(10);
  });

  it('gives every house its own frame, so no two houses read alike', () => {
    // Same sign, different house: the opening must differ. This is what makes
    // the twelve cards on screen look like twelve readings.
    for (const locale of HOUSE_CUSP_LOCALES) {
      const corpus = HOUSE_CUSP_CORPUS[locale] as Record<string, string>;
      for (const sign of HOUSE_CUSP_SIGNS) {
        const openings = HOUSE_NUMBERS.map((h) =>
          corpus[`natalHouseCuspInterpretation_${h}_${sign}`].slice(0, 16),
        );
        expect(new Set(openings).size, `${locale}/${sign}`).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('says something different in each written language', () => {
    // An entry identical to its English twin means a forgotten
    // translation, which the key-count check alone would happily pass.
    for (const key of EXPECTED_KEYS) {
      for (const locale of HOUSE_CUSP_LOCALES) {
        if (locale === 'en') continue;
        expect(HOUSE_CUSP_CORPUS[locale][key], `${locale}/${key}`).not.toBe(
          HOUSE_CUSP_CORPUS.en[key],
        );
      }
    }
  });
});

describe('house-cusp corpus — voice', () => {
  it.each([...HOUSE_CUSP_LOCALES])('%s hedges every claim', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      // Accents stripped on BOTH sides, like the banned-word check. Without it
      // a list entry such as "as vezes" silently never matches the "as vezes"
      // in the text, and the guard is one entry weaker than it reads.
      const lowered = stripAccents(text.toLowerCase());
      const hedged = HEDGES[locale].some((word) => lowered.includes(stripAccents(word)));
      expect(hedged, `${key} states a certainty: ${text}`).toBe(true);
    }
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s uses no deterministic vocabulary', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      const lowered = stripAccents(text.toLowerCase());
      for (const banned of BANNED[locale]) {
        expect(usesWord(lowered, stripAccents(banned), locale), `${key}: "${banned}"`).toBe(
          false,
        );
      }
    }
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s uses no clinical vocabulary', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      const lowered = stripAccents(text.toLowerCase());
      for (const word of CLINICAL) {
        // Substring on purpose here: these are stems ("diagnos", "depress")
        // meant to catch every inflection, and none of them is a fragment of
        // an innocent word in the five latin-script locales.
        expect(lowered.includes(stripAccents(word)), `${key}: "${word}"`).toBe(false);
      }
    }
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s stays inside sign-on-cusp scope', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      const lowered = stripAccents(text.toLowerCase());
      for (const word of OUT_OF_SCOPE) {
        const stripped = stripAccents(word);
        const present =
          stripped === '°'
            ? lowered.includes(stripped)
            : new RegExp(`\\b${stripped}\\b`).test(lowered);
        expect(present, `${key} names "${word}", which it has no data for`).toBe(false);
      }
    }
  });

  it.each([...HOUSE_CUSP_LOCALES])('%s stays between one and three sentences', (locale) => {
    for (const [key, text] of Object.entries(HOUSE_CUSP_CORPUS[locale])) {
      const sentences = sentenceCount(text);
      expect(sentences, `${key} has ${sentences} sentences`).toBeGreaterThanOrEqual(1);
      expect(sentences, `${key} has ${sentences} sentences`).toBeLessThanOrEqual(3);
      // A character cap as well as a word cap: Japanese and Chinese have no
      // spaces, so `split(/\s+/)` returns 1 for them and the word cap alone
      // would pass whatever it was given. A guard that cannot fail is not one.
      expect(text.length, `${key} is ${text.length} characters`).toBeLessThanOrEqual(400);
      if (SPACE_DELIMITED.includes(locale)) {
        expect(text.split(/\s+/).length, key).toBeLessThanOrEqual(75);
      }
    }
  });
});

describe('resolveHouseCuspInterpretation', () => {
  it('returns the text for a real house and sign', () => {
    const result = resolveHouseCuspInterpretation({ house: 10, sign: 'Cancer', locale: 'en' });
    expect(result?.key).toBe('natalHouseCuspInterpretation_10_cancer');
    expect(result?.house).toBe(10);
    expect(result?.sign).toBe('cancer');
    expect(result?.text).toBe(
      HOUSE_CUSP_CORPUS.en.natalHouseCuspInterpretation_10_cancer,
    );
    expect(result?.isFallback).toBe(false);
  });

  it('accepts the sign in any casing, as `signsOnCusps` capitalises it', () => {
    const a = resolveHouseCuspInterpretation({ house: 7, sign: 'Aries', locale: 'en' });
    const b = resolveHouseCuspInterpretation({ house: 7, sign: ' aries ', locale: 'en' });
    expect(a?.text).toBe(b?.text);
  });

  it.each([0, 13, -1, 1.5, Number.NaN])('refuses house %s', (house) => {
    expect(resolveHouseCuspInterpretation({ house, sign: 'Cancer' })).toBeNull();
  });

  it.each(['Ophiuchus', '', 'cancerr', 'Cancer ascendant'])(
    'refuses the sign %s rather than guessing',
    (sign) => {
      expect(resolveHouseCuspInterpretation({ house: 10, sign })).toBeNull();
    },
  );

  it('refuses missing data instead of substituting a default', () => {
    expect(resolveHouseCuspInterpretation({ house: null, sign: 'Cancer' })).toBeNull();
    expect(resolveHouseCuspInterpretation({ house: 10, sign: null })).toBeNull();
    expect(resolveHouseCuspInterpretation({ house: undefined, sign: undefined })).toBeNull();
  });

  it('answers in French for a French reader', () => {
    const result = resolveHouseCuspInterpretation({ house: 10, sign: 'Cancer', locale: 'fr' });
    expect(result?.locale).toBe('fr');
    expect(result?.isFallback).toBe(false);
    expect(result?.text).toBe(HOUSE_CUSP_CORPUS.fr.natalHouseCuspInterpretation_10_cancer);
  });

  it('treats fr-CA and fr_FR as French', () => {
    for (const locale of ['fr-CA', 'fr_FR', 'FR']) {
      expect(resolveHouseCuspInterpretation({ house: 4, sign: 'Capricorn', locale })?.locale).toBe(
        'fr',
      );
    }
  });

  it('answers directly for every app locale', () => {
    for (const locale of ['de', 'ja', 'zh', 'ar', 'es', 'pt']) {
      const result = resolveHouseCuspInterpretation({ house: 1, sign: 'Leo', locale });
      expect(result?.locale, locale).toBe(locale);
      expect(result?.isFallback, locale).toBe(false);
      expect(result?.requestedLocale, locale).toBe(locale);
    }
  });

  it('falls back to English for a language with no corpus, and says so', () => {
    const result = resolveHouseCuspInterpretation({ house: 1, sign: 'Leo', locale: 'it' });
    expect(result?.locale).toBe('en');
    expect(result?.isFallback).toBe(true);
    expect(result?.requestedLocale).toBe('it');
  });

  it('falls back to English when no locale is given at all', () => {
    const result = resolveHouseCuspInterpretation({ house: 1, sign: 'Leo' });
    expect(result?.locale).toBe('en');
    expect(result?.isFallback).toBe(true);
  });

  it('covers every combination without a hole', () => {
    for (const house of HOUSE_NUMBERS) {
      for (const sign of HOUSE_CUSP_SIGNS) {
        for (const locale of HOUSE_CUSP_LOCALES) {
          const result = resolveHouseCuspInterpretation({ house, sign, locale });
          expect(result?.text, `${house}/${sign}/${locale}`).toBeTruthy();
        }
      }
    }
  });
});

describe('resolveHouseCuspInterpretations', () => {
  const twelve = [...ZODIAC_SIGNS];

  it('returns twelve entries, house 1 first', () => {
    const all = resolveHouseCuspInterpretations(twelve, 'en');
    expect(all).toHaveLength(12);
    expect(all?.[0].house).toBe(1);
    expect(all?.[0].sign).toBe('aries');
    expect(all?.[11].house).toBe(12);
    expect(all?.[11].sign).toBe('pisces');
  });

  it('refuses a partial ring — twelve or nothing', () => {
    expect(resolveHouseCuspInterpretations(twelve.slice(0, 11), 'en')).toBeNull();
    expect(resolveHouseCuspInterpretations([], 'en')).toBeNull();
    expect(resolveHouseCuspInterpretations(null, 'en')).toBeNull();
    expect(resolveHouseCuspInterpretations(undefined, 'en')).toBeNull();
  });

  it('refuses the whole ring when one cusp is unreadable', () => {
    // Widened on purpose: the resolver takes `string`, because in production
    // the signs arrive from a stored chart and are not narrowed by the time
    // they get here. A `ZodiacSign[]` here would test a stricter caller than
    // the real one.
    const broken: string[] = [...twelve];
    broken[6] = 'Ophiuchus';
    expect(resolveHouseCuspInterpretations(broken, 'en')).toBeNull();
  });

  it('is deterministic', () => {
    const a = resolveHouseCuspInterpretations(twelve, 'fr');
    const b = resolveHouseCuspInterpretations(twelve, 'fr');
    expect(a).toEqual(b);
  });
});

describe('allHouseCuspStrings', () => {
  it.each([...HOUSE_CUSP_LOCALES])('returns the 144 %s strings', (locale) => {
    expect(allHouseCuspStrings(locale)).toHaveLength(144);
  });
});
