// Sign-on-cusp interpretations — the shape.
//
// The key format is the one the product spec asked for:
//   natalHouseCuspInterpretation_{house}_{sign}
// e.g. natalHouseCuspInterpretation_10_cancer
//
// It is a TEMPLATE LITERAL TYPE on purpose. `HouseCuspCorpus` is
// `Record<HouseCuspKey, string>` over all 12 x 12 combinations, so a corpus
// missing `natalHouseCuspInterpretation_7_pisces` does not compile. That is
// the strongest possible version of "never leave a visible missing key": the
// hole is caught by `tsc`, before a validator, a test or a reader ever sees it.

export type HouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type HouseCuspSign =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

export type HouseCuspKey = `natalHouseCuspInterpretation_${HouseNumber}_${HouseCuspSign}`;

/** All 144 keys. A partial corpus is a compile error, not a runtime blank. */
export type HouseCuspCorpus = Record<HouseCuspKey, string>;

/**
 * Locales the corpus is actually WRITTEN in.
 *
 * Not the app's eight locales, and deliberately so — see the header of
 * `content-en.ts`. A locale appears here only once its 144 entries exist,
 * because a half-filled locale is worse than an honest fallback.
 */
export type HouseCuspLocale = 'en' | 'fr' | 'es' | 'pt' | 'de' | 'ja' | 'zh' | 'ar';

/**
 * What the resolver returns. `locale` is the language of `text`, which is not
 * necessarily the language that was asked for — `isFallback` says so, and the
 * web renderer puts it on the paragraph as `lang` so a screen reader does not
 * read English prose with a German voice.
 */
export type HouseCuspInterpretation = {
  key: HouseCuspKey;
  house: HouseNumber;
  sign: HouseCuspSign;
  text: string;
  locale: HouseCuspLocale;
  requestedLocale: string;
  isFallback: boolean;
};

export const HOUSE_NUMBERS: readonly HouseNumber[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

/**
 * Lowercased sign keys, in zodiac order.
 *
 * A test asserts this matches `ZODIAC_SIGNS` from `../chart` exactly, so the
 * two orders can never drift; it is duplicated rather than imported because
 * `chart.ts` pulls in the astronomy engine and this module has no reason to.
 */
export const HOUSE_CUSP_SIGNS: readonly HouseCuspSign[] = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
];
