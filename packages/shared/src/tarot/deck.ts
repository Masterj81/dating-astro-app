/**
 * The 78-card deck — structure only.
 *
 * ORDER IS LOAD-BEARING. `drawReading` shuffles this array with a seeded
 * generator, so moving a card changes every reading anyone has ever been
 * shown for a given seed. The order is the one both legacy engines built:
 * majors 0-21, then Cups, Wands, Swords, Pentacles, each 1-14. A test asserts
 * it against that exact sequence.
 *
 * No prose here. Names and meanings live in the per-language corpora so that
 * adding a language never touches the deck, and so a missing translation is a
 * compile error rather than an English word leaking into a French reading.
 */
import type { TarotCardShape } from './types';

export const DECK: readonly TarotCardShape[] = [
  { id: 'major-00', suit: 'major', number: 0, imageFile: 'major-00.jpg' },
  { id: 'major-01', suit: 'major', number: 1, imageFile: 'major-01.jpg' },
  { id: 'major-02', suit: 'major', number: 2, imageFile: 'major-02.jpg' },
  { id: 'major-03', suit: 'major', number: 3, imageFile: 'major-03.jpg' },
  { id: 'major-04', suit: 'major', number: 4, imageFile: 'major-04.jpg' },
  { id: 'major-05', suit: 'major', number: 5, imageFile: 'major-05.jpg' },
  { id: 'major-06', suit: 'major', number: 6, imageFile: 'major-06.jpg' },
  { id: 'major-07', suit: 'major', number: 7, imageFile: 'major-07.jpg' },
  { id: 'major-08', suit: 'major', number: 8, imageFile: 'major-08.jpg' },
  { id: 'major-09', suit: 'major', number: 9, imageFile: 'major-09.jpg' },
  { id: 'major-10', suit: 'major', number: 10, imageFile: 'major-10.jpg' },
  { id: 'major-11', suit: 'major', number: 11, imageFile: 'major-11.jpg' },
  { id: 'major-12', suit: 'major', number: 12, imageFile: 'major-12.jpg' },
  { id: 'major-13', suit: 'major', number: 13, imageFile: 'major-13.jpg' },
  { id: 'major-14', suit: 'major', number: 14, imageFile: 'major-14.jpg' },
  { id: 'major-15', suit: 'major', number: 15, imageFile: 'major-15.jpg' },
  { id: 'major-16', suit: 'major', number: 16, imageFile: 'major-16.jpg' },
  { id: 'major-17', suit: 'major', number: 17, imageFile: 'major-17.jpg' },
  { id: 'major-18', suit: 'major', number: 18, imageFile: 'major-18.jpg' },
  { id: 'major-19', suit: 'major', number: 19, imageFile: 'major-19.jpg' },
  { id: 'major-20', suit: 'major', number: 20, imageFile: 'major-20.jpg' },
  { id: 'major-21', suit: 'major', number: 21, imageFile: 'major-21.jpg' },
  { id: 'cups-01', suit: 'cups', number: 1, imageFile: 'cups-01.jpg' },
  { id: 'cups-02', suit: 'cups', number: 2, imageFile: 'cups-02.jpg' },
  { id: 'cups-03', suit: 'cups', number: 3, imageFile: 'cups-03.jpg' },
  { id: 'cups-04', suit: 'cups', number: 4, imageFile: 'cups-04.jpg' },
  { id: 'cups-05', suit: 'cups', number: 5, imageFile: 'cups-05.jpg' },
  { id: 'cups-06', suit: 'cups', number: 6, imageFile: 'cups-06.jpg' },
  { id: 'cups-07', suit: 'cups', number: 7, imageFile: 'cups-07.jpg' },
  { id: 'cups-08', suit: 'cups', number: 8, imageFile: 'cups-08.jpg' },
  { id: 'cups-09', suit: 'cups', number: 9, imageFile: 'cups-09.jpg' },
  { id: 'cups-10', suit: 'cups', number: 10, imageFile: 'cups-10.jpg' },
  { id: 'cups-11', suit: 'cups', number: 11, imageFile: 'cups-11.jpg' },
  { id: 'cups-12', suit: 'cups', number: 12, imageFile: 'cups-12.jpg' },
  { id: 'cups-13', suit: 'cups', number: 13, imageFile: 'cups-13.jpg' },
  { id: 'cups-14', suit: 'cups', number: 14, imageFile: 'cups-14.jpg' },
  { id: 'wands-01', suit: 'wands', number: 1, imageFile: 'wands-01.jpg' },
  { id: 'wands-02', suit: 'wands', number: 2, imageFile: 'wands-02.jpg' },
  { id: 'wands-03', suit: 'wands', number: 3, imageFile: 'wands-03.jpg' },
  { id: 'wands-04', suit: 'wands', number: 4, imageFile: 'wands-04.jpg' },
  { id: 'wands-05', suit: 'wands', number: 5, imageFile: 'wands-05.jpg' },
  { id: 'wands-06', suit: 'wands', number: 6, imageFile: 'wands-06.jpg' },
  { id: 'wands-07', suit: 'wands', number: 7, imageFile: 'wands-07.jpg' },
  { id: 'wands-08', suit: 'wands', number: 8, imageFile: 'wands-08.jpg' },
  { id: 'wands-09', suit: 'wands', number: 9, imageFile: 'wands-09.jpg' },
  { id: 'wands-10', suit: 'wands', number: 10, imageFile: 'wands-10.jpg' },
  { id: 'wands-11', suit: 'wands', number: 11, imageFile: 'wands-11.jpg' },
  { id: 'wands-12', suit: 'wands', number: 12, imageFile: 'wands-12.jpg' },
  { id: 'wands-13', suit: 'wands', number: 13, imageFile: 'wands-13.jpg' },
  { id: 'wands-14', suit: 'wands', number: 14, imageFile: 'wands-14.jpg' },
  { id: 'swords-01', suit: 'swords', number: 1, imageFile: 'swords-01.jpg' },
  { id: 'swords-02', suit: 'swords', number: 2, imageFile: 'swords-02.jpg' },
  { id: 'swords-03', suit: 'swords', number: 3, imageFile: 'swords-03.jpg' },
  { id: 'swords-04', suit: 'swords', number: 4, imageFile: 'swords-04.jpg' },
  { id: 'swords-05', suit: 'swords', number: 5, imageFile: 'swords-05.jpg' },
  { id: 'swords-06', suit: 'swords', number: 6, imageFile: 'swords-06.jpg' },
  { id: 'swords-07', suit: 'swords', number: 7, imageFile: 'swords-07.jpg' },
  { id: 'swords-08', suit: 'swords', number: 8, imageFile: 'swords-08.jpg' },
  { id: 'swords-09', suit: 'swords', number: 9, imageFile: 'swords-09.jpg' },
  { id: 'swords-10', suit: 'swords', number: 10, imageFile: 'swords-10.jpg' },
  { id: 'swords-11', suit: 'swords', number: 11, imageFile: 'swords-11.jpg' },
  { id: 'swords-12', suit: 'swords', number: 12, imageFile: 'swords-12.jpg' },
  { id: 'swords-13', suit: 'swords', number: 13, imageFile: 'swords-13.jpg' },
  { id: 'swords-14', suit: 'swords', number: 14, imageFile: 'swords-14.jpg' },
  { id: 'pents-01', suit: 'pents', number: 1, imageFile: 'pents-01.jpg' },
  { id: 'pents-02', suit: 'pents', number: 2, imageFile: 'pents-02.jpg' },
  { id: 'pents-03', suit: 'pents', number: 3, imageFile: 'pents-03.jpg' },
  { id: 'pents-04', suit: 'pents', number: 4, imageFile: 'pents-04.jpg' },
  { id: 'pents-05', suit: 'pents', number: 5, imageFile: 'pents-05.jpg' },
  { id: 'pents-06', suit: 'pents', number: 6, imageFile: 'pents-06.jpg' },
  { id: 'pents-07', suit: 'pents', number: 7, imageFile: 'pents-07.jpg' },
  { id: 'pents-08', suit: 'pents', number: 8, imageFile: 'pents-08.jpg' },
  { id: 'pents-09', suit: 'pents', number: 9, imageFile: 'pents-09.jpg' },
  { id: 'pents-10', suit: 'pents', number: 10, imageFile: 'pents-10.jpg' },
  { id: 'pents-11', suit: 'pents', number: 11, imageFile: 'pents-11.jpg' },
  { id: 'pents-12', suit: 'pents', number: 12, imageFile: 'pents-12.jpg' },
  { id: 'pents-13', suit: 'pents', number: 13, imageFile: 'pents-13.jpg' },
  { id: 'pents-14', suit: 'pents', number: 14, imageFile: 'pents-14.jpg' },
] as const;

/** 22 majors, 56 minors, 78 total — asserted, not assumed. */
export const DECK_SIZE = 78;
export const MAJOR_ARCANA_SIZE = 22;
export const SUIT_SIZE = 14;
export const MINOR_SUITS = ['cups', 'wands', 'swords', 'pents'] as const;
