// The corpora, type-checked.
//
// `content-en.ts` and `content-fr.ts` import nothing so the validator can load
// them under Node's type stripping. This file is where they meet their type:
// assigning them to `Record<HouseCuspLocale, HouseCuspCorpus>` makes every one
// of the 144 keys a compile-time obligation, per language. Delete an entry and
// `npm run typecheck` fails before any test runs.

import { HOUSE_CUSP_CONTENT_EN } from './content-en';
import { HOUSE_CUSP_CONTENT_FR } from './content-fr';
import {
  HOUSE_CUSP_CONTENT_AR,
  HOUSE_CUSP_CONTENT_DE,
  HOUSE_CUSP_CONTENT_ES,
  HOUSE_CUSP_CONTENT_JA,
  HOUSE_CUSP_CONTENT_PT,
  HOUSE_CUSP_CONTENT_ZH,
} from './content-localized';
import type { HouseCuspCorpus, HouseCuspLocale } from './types';

export const HOUSE_CUSP_CORPUS: Record<HouseCuspLocale, HouseCuspCorpus> = {
  en: HOUSE_CUSP_CONTENT_EN,
  fr: HOUSE_CUSP_CONTENT_FR,
  es: HOUSE_CUSP_CONTENT_ES,
  pt: HOUSE_CUSP_CONTENT_PT,
  de: HOUSE_CUSP_CONTENT_DE,
  ja: HOUSE_CUSP_CONTENT_JA,
  zh: HOUSE_CUSP_CONTENT_ZH,
  ar: HOUSE_CUSP_CONTENT_AR,
};

/**
 * The languages the corpus is actually written in, in preference order.
 *
 * Adding a language is one file plus one entry here. Until then the resolver
 * falls back to English and SAYS SO through `isFallback`, rather than showing
 * a blank or a raw key.
 */
export const HOUSE_CUSP_LOCALES: readonly HouseCuspLocale[] = [
  'en',
  'fr',
  'es',
  'pt',
  'de',
  'ja',
  'zh',
  'ar',
];

export const HOUSE_CUSP_FALLBACK_LOCALE: HouseCuspLocale = 'en';
