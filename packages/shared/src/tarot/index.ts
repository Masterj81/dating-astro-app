/**
 * Tarot — the canonical surface both apps import.
 *
 * Before this package the deck existed twice: `apps/web/src/lib/tarotEngine.ts`
 * and `apps/mobile/services/tarotEngine.ts`, each with its own copy of 78 cards
 * and 312 meanings. Importing both side by side showed the structure had held —
 * same ids, same order, same draw for the same seed — but the PROSE had already
 * drifted on three cards, because someone softened the fatalism on web and the
 * change never reached mobile. Two corpora means the next edit drifts too, and
 * translating them would have meant paying for every sentence twice.
 *
 * LOCALISATION IS EXPLICIT, NEVER SILENT.
 * English and French are written by hand. The other six product locales resolve
 * to English and SAY SO: `isFallback` is on the reading and on every card, so a
 * screen can render the note that admits it rather than pretending the corpus
 * is translated. The alternative — quietly serving English under a Japanese
 * interface — is the kind of false promise this repo has been unwinding all
 * year. It also means no reader ever meets a blank card or a `[missing "..."]`:
 * there is always prose, and there is always a flag saying which language it is.
 */
import { CORPUS_EN } from './content-en';
import { CORPUS_FR } from './content-fr';
import { DECK, DECK_SIZE, MAJOR_ARCANA_SIZE, MINOR_SUITS, SUIT_SIZE } from './deck';
import {
  CARDS_PER_PERIOD,
  drawSpread,
  isoWeek,
  periodKey,
  pickMeaning,
  seededRandom,
  shuffle,
  SPREAD_POSITIONS,
} from './engine';
import type {
  CardMeanings,
  DrawnCard,
  Orientation,
  ReadingMode,
  ReadingPeriod,
  SpreadPosition,
  TarotCardId,
  TarotCardShape,
  TarotCorpus,
  TarotLocale,
  TarotReading,
  TarotSuit,
  TarotWrittenLocale,
} from './types';

export type {
  CardMeanings,
  DrawnCard,
  Orientation,
  ReadingMode,
  ReadingPeriod,
  SpreadPosition,
  TarotCardId,
  TarotCardShape,
  TarotCorpus,
  TarotLocale,
  TarotReading,
  TarotSuit,
  TarotWrittenLocale,
};

export {
  CARDS_PER_PERIOD,
  DECK,
  DECK_SIZE,
  MAJOR_ARCANA_SIZE,
  MINOR_SUITS,
  SPREAD_POSITIONS,
  SUIT_SIZE,
  drawSpread,
  isoWeek,
  periodKey,
  pickMeaning,
  seededRandom,
  shuffle,
};

export { CORPUS_EN } from './content-en';
export { CORPUS_FR } from './content-fr';

/** The locales the corpus is written in, in the order a fallback prefers. */
export const WRITTEN_TAROT_LOCALES: readonly TarotWrittenLocale[] = ['en', 'fr'] as const;

const CORPORA: Record<TarotWrittenLocale, TarotCorpus> = {
  en: CORPUS_EN,
  fr: CORPUS_FR,
};

export type ResolvedCorpus = {
  corpus: TarotCorpus;
  /** The language the reader is actually being shown. */
  resolvedLocale: TarotWrittenLocale;
  /** True when `resolvedLocale` is not the locale that was asked for. */
  isFallback: boolean;
};

/**
 * Pick the corpus for a locale, and report honestly when it is not the one
 * that was asked for. Callers are expected to surface `isFallback` — see
 * `ConversationGuideOverview`, which renders its English corpus with
 * `lang="en"` and an on-screen note for exactly this reason.
 */
export function resolveTarotCorpus(locale: TarotLocale | string): ResolvedCorpus {
  const written = WRITTEN_TAROT_LOCALES.find((l) => l === locale);
  if (written) {
    return { corpus: CORPORA[written], resolvedLocale: written, isFallback: false };
  }
  return { corpus: CORPUS_EN, resolvedLocale: 'en', isFallback: true };
}

/** One card, fully resolved: shape, name, orientation-aware meaning. */
export function resolveCard(options: {
  id: TarotCardId;
  mode: ReadingMode;
  reversed: boolean;
  locale: TarotLocale | string;
}): DrawnCard {
  const shape = DECK.find((c) => c.id === options.id);
  if (!shape) {
    // Unreachable through the public API — `TarotCardId` is a closed union and
    // the deck is generated from it — but a thrown error beats a blank card if
    // some caller ever hands us a string from the network.
    throw new Error(`Unknown tarot card id: ${String(options.id)}`);
  }
  const { corpus, isFallback } = resolveTarotCorpus(options.locale);
  return {
    ...shape,
    name: corpus.names[options.id],
    reversed: options.reversed,
    meaning: pickMeaning(corpus.meanings[options.id], options.mode, options.reversed),
    isFallback,
  };
}

/**
 * The reading, end to end. Deterministic for a given
 * (userId, mode, period, period key) — the same person opening the screen
 * twice in a week sees the same cards, which is what makes it a reading and
 * not a slot machine.
 *
 * `locale` changes the words and NEVER the draw: the seed does not include it,
 * so a reader switching language sees their own cards translated rather than a
 * different spread. That is a deliberate property and a test asserts it.
 */
export function generateReading(options: {
  userId: string;
  mode: ReadingMode;
  period: ReadingPeriod;
  locale: TarotLocale | string;
  now?: Date;
}): TarotReading {
  const { cards, seed } = drawSpread({
    userId: options.userId,
    mode: options.mode,
    period: options.period,
    now: options.now,
  });

  const resolved = cards.map(({ position, shape, reversed }) => ({
    position,
    card: resolveCard({
      id: shape.id,
      mode: options.mode,
      reversed,
      locale: options.locale,
    }),
  }));

  return {
    mode: options.mode,
    period: options.period,
    locale: (options.locale as TarotLocale) ?? 'en',
    cards: resolved,
    seed,
    generatedAt: (options.now ?? new Date()).toISOString(),
    isFallback: resolved.some((entry) => entry.card.isFallback),
  };
}

/**
 * Card art lives in the Supabase `tarot` storage bucket. The base URL is a
 * parameter rather than a constant because the two apps reach it differently —
 * web had the project URL hard-coded in source, mobile builds it from
 * `EXPO_PUBLIC_SUPABASE_URL`. Baking one project's URL into a shared package
 * would make this code wrong for anyone who ever points the app at another
 * environment, which is precisely the sort of quiet substitution this codebase
 * keeps finding.
 */
export function getCardImageUrl(storageBaseUrl: string, imageFile: string): string {
  return `${storageBaseUrl.replace(/\/+$/, '')}/${imageFile}`;
}

/** `https://<project>.supabase.co` → the public tarot bucket root. */
export function tarotBucketUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/tarot`;
}
