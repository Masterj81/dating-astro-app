// Sign-on-cusp interpretations — public surface.
//
// WHAT THIS MODULE PROMISES
// -------------------------
// It answers one question: "the reader has house N with sign S on its cusp —
// what does that colouring mean?" It decides WHAT the text says. It does not
// decide WHETHER the reader may see it, and it cannot: the caller has to hand
// it a house number and a sign that were computed from real birth data.
//
// WHAT IT REFUSES TO DO
// ---------------------
// It never guesses. An unknown sign, a house outside 1-12, a partial cusp
// array — each returns null, and a null renders as nothing. There is no
// "default interpretation", because a default here would be exactly the class
// of bug the natal-integrity work spent months removing: a plausible value
// standing in for an absent one, raising no error.
//
// The one fallback that DOES exist is linguistic, not astrological: a reader
// whose language has no corpus yet gets the English text, and
// `isFallback` says so out loud. Language is a translation gap. A sign is
// data. The two are not the same kind of missing, and only the first is safe
// to substitute.

import {
  HOUSE_CUSP_CORPUS,
  HOUSE_CUSP_FALLBACK_LOCALE,
  HOUSE_CUSP_LOCALES,
} from './contract';
import {
  HOUSE_CUSP_SIGNS,
  HOUSE_NUMBERS,
  type HouseCuspInterpretation,
  type HouseCuspKey,
  type HouseCuspLocale,
  type HouseCuspSign,
  type HouseNumber,
} from './types';

export {
  HOUSE_CUSP_CORPUS,
  HOUSE_CUSP_FALLBACK_LOCALE,
  HOUSE_CUSP_LOCALES,
} from './contract';
export { HOUSE_CUSP_SIGNS, HOUSE_NUMBERS } from './types';
export type {
  HouseCuspCorpus,
  HouseCuspInterpretation,
  HouseCuspKey,
  HouseCuspLocale,
  HouseCuspSign,
  HouseNumber,
} from './types';

/** `natalHouseCuspInterpretation_10_cancer`, built in exactly one place. */
export function houseCuspKey(house: HouseNumber, sign: HouseCuspSign): HouseCuspKey {
  return `natalHouseCuspInterpretation_${house}_${sign}`;
}

function normalizeHouse(value: unknown): HouseNumber | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  return (HOUSE_NUMBERS as readonly number[]).includes(value)
    ? (value as HouseNumber)
    : null;
}

/** Accepts `'Cancer'`, `'cancer'` or `' CANCER '`; rejects anything else. */
function normalizeSign(value: unknown): HouseCuspSign | null {
  if (typeof value !== 'string') return null;
  const lowered = value.trim().toLowerCase();
  return (HOUSE_CUSP_SIGNS as readonly string[]).includes(lowered)
    ? (lowered as HouseCuspSign)
    : null;
}

/**
 * `'fr-CA'` and `'fr'` both mean French. An unknown tag is not an error — it
 * means the corpus has no such language yet, which the caller learns from
 * `isFallback` rather than from a thrown exception.
 */
function normalizeLocale(value: unknown): HouseCuspLocale | null {
  if (typeof value !== 'string') return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return (HOUSE_CUSP_LOCALES as readonly string[]).includes(base)
    ? (base as HouseCuspLocale)
    : null;
}

export type HouseCuspInput = {
  house: number | null | undefined;
  /** The sign on this cusp, as returned by `signsOnCusps`. */
  sign: string | null | undefined;
  /** The reader's locale. Unknown or absent falls back to English. */
  locale?: string | null;
};

/**
 * The interpretation for one house cusp, or null when there is nothing
 * truthful to say.
 *
 * Null when: the house is not 1-12, the sign is not one of the twelve, or
 * either is missing. Callers render nothing in that case — never a placeholder.
 */
export function resolveHouseCuspInterpretation(
  input: HouseCuspInput,
): HouseCuspInterpretation | null {
  const house = normalizeHouse(input.house);
  const sign = normalizeSign(input.sign);
  if (house === null || sign === null) return null;

  const requestedLocale =
    typeof input.locale === 'string' && input.locale.trim() ? input.locale.trim() : '';
  const resolved = normalizeLocale(requestedLocale) ?? HOUSE_CUSP_FALLBACK_LOCALE;
  const key = houseCuspKey(house, sign);
  const text = HOUSE_CUSP_CORPUS[resolved][key];

  return {
    key,
    house,
    sign,
    text,
    locale: resolved,
    requestedLocale,
    isFallback: normalizeLocale(requestedLocale) === null,
  };
}

/**
 * The twelve interpretations for a full cusp array, or null.
 *
 * Twelve or nothing, deliberately — the same rule the wheel and the houses
 * section already follow. Half a ring of interpretations would imply the other
 * six were computed and found empty, which is not what happened.
 *
 * Index 0 is house 1. `signsOnCusps` produces exactly this shape.
 */
export function resolveHouseCuspInterpretations(
  cuspSigns: readonly (string | null | undefined)[] | null | undefined,
  locale?: string | null,
): HouseCuspInterpretation[] | null {
  if (!Array.isArray(cuspSigns) || cuspSigns.length !== 12) return null;
  const out: HouseCuspInterpretation[] = [];
  for (let i = 0; i < 12; i += 1) {
    const entry = resolveHouseCuspInterpretation({
      house: i + 1,
      sign: cuspSigns[i],
      locale,
    });
    if (!entry) return null;
    out.push(entry);
  }
  return out;
}

/** Every string in one language — for the tests and the content validator. */
export function allHouseCuspStrings(locale: HouseCuspLocale): string[] {
  const corpus = HOUSE_CUSP_CORPUS[locale];
  return Object.keys(corpus)
    .sort()
    .map((key) => corpus[key as HouseCuspKey]);
}
