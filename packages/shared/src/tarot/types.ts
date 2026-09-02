/**
 * Tarot — the shapes, and the contract that makes an incomplete corpus a
 * compile error rather than a blank card.
 *
 * `TarotCardId` is a union of all 78 literal ids. Every corpus is typed as
 * `Record<TarotCardId, ...>`, so forgetting one card fails `tsc` instead of
 * rendering an empty meaning to a paying reader. The ids are generated from
 * the same rule the two legacy engines used (`major-00`..`major-21`, then each
 * suit `01`..`14`) and in the same ORDER, because the seeded shuffle reads the
 * deck positionally: reordering this list would silently change every reading.
 */

export type TarotSuit = 'major' | 'cups' | 'wands' | 'swords' | 'pents';

/** The two lenses a reader can hold a card in. */
export type ReadingMode = 'love' | 'general';

/**
 * Spread positions, in draw order.
 *
 * These are NOT past/present/future. The old engine used that framing and the
 * web V2 chrome already relabelled it editorially — "what is present", "what
 * asks for attention", "what supports connection" — because a tarot feature
 * that claims to show your future is making a prediction, which this product
 * does not do. The canonical names now say what the positions actually mean,
 * and the old remap in TarotReadingOverview disappears with them.
 */
export type SpreadPosition = 'present' | 'attention' | 'connection' | 'advice';

export type Orientation = 'upright' | 'reversed';

/** All eight product locales. */
export type TarotLocale = 'en' | 'fr' | 'es' | 'pt' | 'de' | 'ja' | 'zh' | 'ar';

/**
 * The locales the corpus is actually WRITTEN in. Everything else resolves to
 * English and says so — see `resolveCard` and `isFallback`. A silent fallback
 * would be a false promise of localisation; an explicit one is a fact the UI
 * can render.
 */
export type TarotWrittenLocale = 'en' | 'fr';

export type TarotCardId =
  | 'major-00'
  | 'major-01'
  | 'major-02'
  | 'major-03'
  | 'major-04'
  | 'major-05'
  | 'major-06'
  | 'major-07'
  | 'major-08'
  | 'major-09'
  | 'major-10'
  | 'major-11'
  | 'major-12'
  | 'major-13'
  | 'major-14'
  | 'major-15'
  | 'major-16'
  | 'major-17'
  | 'major-18'
  | 'major-19'
  | 'major-20'
  | 'major-21'
  | 'cups-01'
  | 'cups-02'
  | 'cups-03'
  | 'cups-04'
  | 'cups-05'
  | 'cups-06'
  | 'cups-07'
  | 'cups-08'
  | 'cups-09'
  | 'cups-10'
  | 'cups-11'
  | 'cups-12'
  | 'cups-13'
  | 'cups-14'
  | 'wands-01'
  | 'wands-02'
  | 'wands-03'
  | 'wands-04'
  | 'wands-05'
  | 'wands-06'
  | 'wands-07'
  | 'wands-08'
  | 'wands-09'
  | 'wands-10'
  | 'wands-11'
  | 'wands-12'
  | 'wands-13'
  | 'wands-14'
  | 'swords-01'
  | 'swords-02'
  | 'swords-03'
  | 'swords-04'
  | 'swords-05'
  | 'swords-06'
  | 'swords-07'
  | 'swords-08'
  | 'swords-09'
  | 'swords-10'
  | 'swords-11'
  | 'swords-12'
  | 'swords-13'
  | 'swords-14'
  | 'pents-01'
  | 'pents-02'
  | 'pents-03'
  | 'pents-04'
  | 'pents-05'
  | 'pents-06'
  | 'pents-07'
  | 'pents-08'
  | 'pents-09'
  | 'pents-10'
  | 'pents-11'
  | 'pents-12'
  | 'pents-13'
  | 'pents-14';

/** Structure only. Not a word of prose lives here — that is the corpus. */
export type TarotCardShape = {
  id: TarotCardId;
  suit: TarotSuit;
  /** 0-21 for the majors, 1-14 within a suit (11-14 are Page/Knight/Queen/King). */
  number: number;
  imageFile: string;
};

export type CardMeanings = {
  love: Record<Orientation, string>;
  general: Record<Orientation, string>;
};

/**
 * One language's complete corpus. Both records are keyed by the id union, so
 * the compiler refuses a corpus that is missing a card.
 */
export type TarotCorpus = {
  names: Record<TarotCardId, string>;
  meanings: Record<TarotCardId, CardMeanings>;
};

/** A card as the UI receives it: shape, resolved prose, and orientation. */
export type DrawnCard = TarotCardShape & {
  name: string;
  reversed: boolean;
  meaning: string;
  /** True when the prose came from English because this locale is unwritten. */
  isFallback: boolean;
};

export type TarotReading = {
  mode: ReadingMode;
  period: ReadingPeriod;
  locale: TarotLocale;
  cards: Array<{ position: SpreadPosition; card: DrawnCard }>;
  /** The period key the draw was seeded with, e.g. "2026-M9". */
  seed: string;
  generatedAt: string;
  /** True when any card fell back to English. */
  isFallback: boolean;
};

export type ReadingPeriod = 'weekly' | 'monthly';
