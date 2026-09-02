import { describe, expect, it } from 'vitest';

import {
  CARDS_PER_PERIOD,
  CORPUS_EN,
  CORPUS_FR,
  DECK,
  DECK_SIZE,
  MAJOR_ARCANA_SIZE,
  MINOR_SUITS,
  SPREAD_POSITIONS,
  SUIT_SIZE,
  drawSpread,
  generateReading,
  getCardImageUrl,
  isoWeek,
  periodKey,
  resolveCard,
  resolveTarotCorpus,
  seededRandom,
  shuffle,
  tarotBucketUrl,
  WRITTEN_TAROT_LOCALES,
} from '../index';
import type { TarotCardId, TarotCorpus } from '../types';

const CORPORA: Array<[string, TarotCorpus]> = [
  ['en', CORPUS_EN],
  ['fr', CORPUS_FR],
];

describe('the deck', () => {
  it('is 78 cards', () => {
    expect(DECK).toHaveLength(DECK_SIZE);
    expect(DECK_SIZE).toBe(78);
  });

  it('is 22 majors and four suits of 14', () => {
    const majors = DECK.filter((c) => c.suit === 'major');
    expect(majors).toHaveLength(MAJOR_ARCANA_SIZE);
    expect(majors).toHaveLength(22);
    for (const suit of MINOR_SUITS) {
      expect(DECK.filter((c) => c.suit === suit)).toHaveLength(SUIT_SIZE);
    }
    expect(DECK.filter((c) => c.suit !== 'major')).toHaveLength(56);
  });

  it('has unique ids', () => {
    const ids = DECK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the exact order the shuffle depends on', () => {
    // The seeded shuffle reads this array positionally. Reordering it changes
    // every reading anyone has ever been shown for a given seed, silently.
    const expected: string[] = [];
    for (let n = 0; n < 22; n += 1) expected.push(`major-${String(n).padStart(2, '0')}`);
    for (const suit of MINOR_SUITS) {
      for (let n = 1; n <= 14; n += 1) expected.push(`${suit}-${String(n).padStart(2, '0')}`);
    }
    expect(DECK.map((c) => c.id)).toEqual(expected);
  });

  it('numbers majors 0-21 and minors 1-14', () => {
    for (const card of DECK) {
      if (card.suit === 'major') {
        expect(card.number).toBeGreaterThanOrEqual(0);
        expect(card.number).toBeLessThanOrEqual(21);
      } else {
        expect(card.number).toBeGreaterThanOrEqual(1);
        expect(card.number).toBeLessThanOrEqual(14);
      }
    }
  });

  it('points every card at its own image file', () => {
    const files = DECK.map((c) => c.imageFile);
    expect(new Set(files).size).toBe(files.length);
    for (const card of DECK) {
      expect(card.imageFile).toBe(`${card.id}.jpg`);
    }
  });
});

describe.each(CORPORA)('the %s corpus', (locale, corpus) => {
  it('names all 78 cards, with no blanks and no duplicates', () => {
    const names = DECK.map((c) => corpus.names[c.id]);
    expect(names).toHaveLength(78);
    for (const name of names) {
      expect(typeof name).toBe('string');
      expect(name.trim().length).toBeGreaterThan(2);
    }
    expect(new Set(names).size).toBe(78);
  });

  it('carries four meanings for every card', () => {
    for (const card of DECK) {
      const m = corpus.meanings[card.id];
      expect(m, `${locale} ${card.id}`).toBeDefined();
      for (const mode of ['love', 'general'] as const) {
        for (const orientation of ['upright', 'reversed'] as const) {
          const text = m[mode][orientation];
          expect(typeof text, `${locale} ${card.id} ${mode}.${orientation}`).toBe('string');
          expect(text.trim().length, `${locale} ${card.id} ${mode}.${orientation}`)
            .toBeGreaterThan(20);
        }
      }
    }
  });

  it('never repeats the same sentence across cards', () => {
    // Duplicated prose is how a 78-card corpus quietly becomes a 12-card one.
    const all: string[] = [];
    for (const card of DECK) {
      const m = corpus.meanings[card.id];
      all.push(m.love.upright, m.love.reversed, m.general.upright, m.general.reversed);
    }
    expect(all).toHaveLength(312);
    expect(new Set(all).size).toBe(312);
  });

  it('holds no predictive, fatalistic or clinical vocabulary', () => {
    const banned =
      locale === 'fr'
        ? ['destin', 'inévitable', 'malchance', 'âme sœur', 'toxique', 'tu dois', 'il faut', 'garanti', 'va arriver', 'jamais']
        : ['will happen', 'guaranteed', 'destined', 'destiny', 'soulmate', 'toxic', 'you must', 'inevitable', 'bad luck', 'doomed'];
    const offences: string[] = [];
    for (const card of DECK) {
      const m = corpus.meanings[card.id];
      for (const text of [m.love.upright, m.love.reversed, m.general.upright, m.general.reversed]) {
        const low = text.toLowerCase();
        for (const word of banned) {
          if (low.includes(word)) offences.push(`${card.id}: "${word}" in "${text}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});

describe('the generator', () => {
  it('is deterministic for a seed', () => {
    const a = seededRandom('juno');
    const b = seededRandom('juno');
    const one = Array.from({ length: 20 }, () => a());
    const two = Array.from({ length: 20 }, () => b());
    expect(one).toEqual(two);
  });

  it('differs for different seeds', () => {
    const a = Array.from({ length: 10 }, seededRandom('juno-a'));
    const b = Array.from({ length: 10 }, seededRandom('juno-b'));
    expect(a).not.toEqual(b);
  });

  it('stays inside [0, 1)', () => {
    const rng = seededRandom('bounds');
    for (let i = 0; i < 5000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform across ten buckets', () => {
    const rng = seededRandom('uniformity');
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i += 1) buckets[Math.floor(rng() * 10)] += 1;
    for (const count of buckets) {
      // Expected 10_000 each; ±5% is a very loose net that still catches the
      // old LCG, whose low bits were rounding noise past 2^53.
      expect(count).toBeGreaterThan(9500);
      expect(count).toBeLessThan(10_500);
    }
  });
});

describe('the shuffle', () => {
  it('keeps every card exactly once', () => {
    const out = shuffle(DECK, seededRandom('shuffle'));
    expect(out).toHaveLength(78);
    expect(new Set(out.map((c) => c.id)).size).toBe(78);
  });

  it('actually reorders', () => {
    const out = shuffle(DECK, seededRandom('shuffle'));
    expect(out.map((c) => c.id)).not.toEqual(DECK.map((c) => c.id));
  });

  it('gives every card a fair chance at the first position', () => {
    // This is the test the old `sort(() => rng() - 0.5)` could not pass. Over
    // 78_000 draws each card should lead about 1_000 times; a biased shuffle
    // parks the same handful at the front.
    const counts = new Map<string, number>();
    const draws = 78_000;
    for (let i = 0; i < draws; i += 1) {
      const first = shuffle(DECK, seededRandom(`fair-${i}`))[0]!;
      counts.set(first.id, (counts.get(first.id) ?? 0) + 1);
    }
    expect(counts.size).toBe(78);
    for (const [id, count] of counts) {
      expect(count, `${id} led ${count} times of ${draws}`).toBeGreaterThan(800);
      expect(count, `${id} led ${count} times of ${draws}`).toBeLessThan(1200);
    }
  });
});

describe('period keys', () => {
  it('numbers ISO weeks the way the standard does', () => {
    // 1 Jan 2026 is a Thursday, so it belongs to week 1 of 2026.
    expect(isoWeek(new Date(2026, 0, 1))).toEqual({ year: 2026, week: 1 });
    // 4 Jan 2027 is a Monday: week 1 of 2027.
    expect(isoWeek(new Date(2027, 0, 4))).toEqual({ year: 2027, week: 1 });
    // 31 Dec 2026 is a Thursday, still week 53 of 2026.
    expect(isoWeek(new Date(2026, 11, 31)).year).toBe(2026);
  });

  it('holds a weekly reading still for seven days', () => {
    const monday = new Date(2026, 8, 7);
    const sunday = new Date(2026, 8, 13);
    expect(periodKey('weekly', monday)).toBe(periodKey('weekly', sunday));
    const nextMonday = new Date(2026, 8, 14);
    expect(periodKey('weekly', nextMonday)).not.toBe(periodKey('weekly', monday));
  });

  it('holds a monthly reading still for a month', () => {
    expect(periodKey('monthly', new Date(2026, 8, 1))).toBe(
      periodKey('monthly', new Date(2026, 8, 30)),
    );
    expect(periodKey('monthly', new Date(2026, 8, 30))).not.toBe(
      periodKey('monthly', new Date(2026, 9, 1)),
    );
  });
});

describe('the draw', () => {
  const now = new Date(2026, 8, 2);

  it('deals four cards weekly and three monthly', () => {
    expect(drawSpread({ userId: 'u', mode: 'love', period: 'weekly', now }).cards).toHaveLength(4);
    expect(drawSpread({ userId: 'u', mode: 'love', period: 'monthly', now }).cards).toHaveLength(3);
    expect(CARDS_PER_PERIOD).toEqual({ weekly: 4, monthly: 3 });
  });

  it('fills the positions in spread order', () => {
    const weekly = drawSpread({ userId: 'u', mode: 'love', period: 'weekly', now });
    expect(weekly.cards.map((c) => c.position)).toEqual([...SPREAD_POSITIONS]);
    const monthly = drawSpread({ userId: 'u', mode: 'love', period: 'monthly', now });
    expect(monthly.cards.map((c) => c.position)).toEqual(SPREAD_POSITIONS.slice(0, 3));
  });

  it('never deals the same card twice in one spread', () => {
    for (let i = 0; i < 500; i += 1) {
      const { cards } = drawSpread({ userId: `u${i}`, mode: 'love', period: 'weekly', now });
      expect(new Set(cards.map((c) => c.shape.id)).size).toBe(cards.length);
    }
  });

  it('gives the same person the same cards all period', () => {
    const early = drawSpread({ userId: 'stable', mode: 'love', period: 'monthly', now: new Date(2026, 8, 2) });
    const late = drawSpread({ userId: 'stable', mode: 'love', period: 'monthly', now: new Date(2026, 8, 27) });
    expect(early.cards.map((c) => `${c.shape.id}:${c.reversed}`)).toEqual(
      late.cards.map((c) => `${c.shape.id}:${c.reversed}`),
    );
  });

  it('gives different people different cards', () => {
    const a = drawSpread({ userId: 'person-a', mode: 'love', period: 'monthly', now });
    const b = drawSpread({ userId: 'person-b', mode: 'love', period: 'monthly', now });
    expect(a.cards.map((c) => c.shape.id)).not.toEqual(b.cards.map((c) => c.shape.id));
  });

  it('separates the love and general spreads', () => {
    const love = drawSpread({ userId: 'u', mode: 'love', period: 'monthly', now });
    const general = drawSpread({ userId: 'u', mode: 'general', period: 'monthly', now });
    expect(love.cards.map((c) => c.shape.id)).not.toEqual(general.cards.map((c) => c.shape.id));
  });

  it('reverses roughly three cards in ten', () => {
    let reversed = 0;
    let total = 0;
    for (let i = 0; i < 4000; i += 1) {
      for (const card of drawSpread({ userId: `r${i}`, mode: 'love', period: 'weekly', now }).cards) {
        total += 1;
        if (card.reversed) reversed += 1;
      }
    }
    const share = reversed / total;
    expect(share).toBeGreaterThan(0.26);
    expect(share).toBeLessThan(0.34);
  });
});

describe('localisation', () => {
  it('resolves the two written locales without a fallback', () => {
    for (const locale of WRITTEN_TAROT_LOCALES) {
      const resolved = resolveTarotCorpus(locale);
      expect(resolved.isFallback).toBe(false);
      expect(resolved.resolvedLocale).toBe(locale);
    }
  });

  it('falls back to English for the other six, and admits it', () => {
    for (const locale of ['es', 'pt', 'de', 'ja', 'zh', 'ar']) {
      const resolved = resolveTarotCorpus(locale);
      expect(resolved.isFallback).toBe(true);
      expect(resolved.resolvedLocale).toBe('en');
      expect(resolved.corpus).toBe(CORPUS_EN);
    }
  });

  it('falls back for an unknown locale rather than throwing', () => {
    expect(resolveTarotCorpus('kl').isFallback).toBe(true);
  });

  it('translates the words without changing the cards', () => {
    // The seed excludes the locale on purpose: switching language shows the
    // same reader the same spread, translated — not a different spread.
    const now = new Date(2026, 8, 2);
    const en = generateReading({ userId: 'u', mode: 'love', period: 'weekly', locale: 'en', now });
    const fr = generateReading({ userId: 'u', mode: 'love', period: 'weekly', locale: 'fr', now });
    expect(fr.cards.map((c) => c.card.id)).toEqual(en.cards.map((c) => c.card.id));
    expect(fr.cards.map((c) => c.card.reversed)).toEqual(en.cards.map((c) => c.card.reversed));
    expect(fr.cards.map((c) => c.card.name)).not.toEqual(en.cards.map((c) => c.card.name));
  });

  it('flags a fallback reading on the reading and on every card', () => {
    const ja = generateReading({ userId: 'u', mode: 'love', period: 'weekly', locale: 'ja' });
    expect(ja.isFallback).toBe(true);
    expect(ja.cards.every((c) => c.card.isFallback)).toBe(true);
    const fr = generateReading({ userId: 'u', mode: 'love', period: 'weekly', locale: 'fr' });
    expect(fr.isFallback).toBe(false);
  });
});

describe('resolveCard', () => {
  it('returns the upright meaning upright and the reversed one reversed', () => {
    const id: TarotCardId = 'major-13';
    const up = resolveCard({ id, mode: 'love', reversed: false, locale: 'en' });
    const down = resolveCard({ id, mode: 'love', reversed: true, locale: 'en' });
    expect(up.meaning).toBe(CORPUS_EN.meanings[id].love.upright);
    expect(down.meaning).toBe(CORPUS_EN.meanings[id].love.reversed);
    expect(up.meaning).not.toBe(down.meaning);
  });

  it('separates the love and general lenses', () => {
    const id: TarotCardId = 'cups-02';
    const love = resolveCard({ id, mode: 'love', reversed: false, locale: 'en' });
    const general = resolveCard({ id, mode: 'general', reversed: false, locale: 'en' });
    expect(love.meaning).not.toBe(general.meaning);
  });

  it('never returns an empty name or meaning, in either language', () => {
    for (const locale of ['en', 'fr', 'ja']) {
      for (const card of DECK) {
        for (const mode of ['love', 'general'] as const) {
          for (const reversed of [false, true]) {
            const drawn = resolveCard({ id: card.id, mode, reversed, locale });
            expect(drawn.name.trim()).not.toBe('');
            expect(drawn.meaning.trim()).not.toBe('');
            expect(drawn.meaning).not.toContain('[missing');
            expect(drawn.meaning).not.toContain('undefined');
          }
        }
      }
    }
  });

  it('throws on an id that is not in the deck', () => {
    expect(() =>
      resolveCard({ id: 'cups-99' as TarotCardId, mode: 'love', reversed: false, locale: 'en' }),
    ).toThrow(/Unknown tarot card id/);
  });
});

describe('card art urls', () => {
  it('builds the bucket root from a project url', () => {
    expect(tarotBucketUrl('https://abc.supabase.co')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/tarot',
    );
    expect(tarotBucketUrl('https://abc.supabase.co/')).toBe(
      'https://abc.supabase.co/storage/v1/object/public/tarot',
    );
  });

  it('joins without doubling the slash', () => {
    expect(getCardImageUrl('https://x/tarot', 'major-00.jpg')).toBe('https://x/tarot/major-00.jpg');
    expect(getCardImageUrl('https://x/tarot/', 'major-00.jpg')).toBe('https://x/tarot/major-00.jpg');
  });
});
