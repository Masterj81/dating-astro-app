import { describe, expect, it } from 'vitest';

import {
  COACH_DISCLAIMER,
  COACH_FREE_SITUATION,
  COACH_SIGNS,
  COACH_SITUATIONS,
  COACH_SITUATION_KEYS,
  allCoachStrings,
  buildCoachCard,
  getCoachSituation,
  isCoachSituationLocked,
  resolveCoachSign,
  resolveCoachSituation,
} from '../index';
import type { CoachSign, CoachSituationKey } from '../index';

describe('coach corpus coverage', () => {
  it('covers all twelve signs', () => {
    expect(COACH_SIGNS).toHaveLength(12);
    expect(new Set(COACH_SIGNS).size).toBe(12);
  });

  it('gives every sign a line for every P0 situation', () => {
    for (const sign of COACH_SIGNS) {
      for (const situation of COACH_SITUATION_KEYS) {
        const card = buildCoachCard({ sign, situation });
        expect(card.copyText.length, `${sign}/${situation}`).toBeGreaterThan(20);
      }
    }
  });

  it('exposes exactly one free situation, and it is "start"', () => {
    const free = COACH_SITUATIONS.filter((s) => s.access === 'free');
    expect(free).toHaveLength(1);
    expect(COACH_FREE_SITUATION).toBe('start');
    expect(isCoachSituationLocked('start')).toBe(false);
  });

  it('locks every other P0 situation', () => {
    for (const key of COACH_SITUATION_KEYS) {
      if (key === COACH_FREE_SITUATION) continue;
      expect(isCoachSituationLocked(key), key).toBe(true);
    }
  });

  it('orders situations 1..n with no gaps or duplicates', () => {
    const orders = COACH_SITUATIONS.map((s) => s.order).sort((a, b) => a - b);
    expect(orders).toEqual(COACH_SITUATIONS.map((_, i) => i + 1));
  });

  it('enumerates every corpus string exactly once', () => {
    const strings = allCoachStrings();
    // 1 disclaimer + 4 frames x 2 + 12 signs x (3 + 4 lines)
    expect(strings).toHaveLength(1 + 4 * 2 + 12 * 7);
    expect(new Set(strings.map((s) => s.path)).size).toBe(strings.length);
    for (const { path, value } of strings) {
      expect(value.trim(), path).not.toBe('');
    }
  });
});

describe('buildCoachCard', () => {
  it('is deterministic', () => {
    const a = buildCoachCard({ sign: 'cancer', situation: 'repair' });
    const b = buildCoachCard({ sign: 'cancer', situation: 'repair' });
    expect(a).toEqual(b);
  });

  it('returns five ordered sections with exactly one copyable', () => {
    const card = buildCoachCard({ sign: 'aries', situation: 'start' });
    expect(card.sections.map((s) => s.id)).toEqual([
      'rhythm',
      'works',
      'avoid',
      'line',
      'reflect',
    ]);
    expect(card.sections.map((s) => s.order)).toEqual([1, 2, 3, 4, 5]);
    const copyable = card.sections.filter((s) => s.copyable);
    expect(copyable).toHaveLength(1);
    expect(copyable[0].id).toBe('line');
    expect(card.copyText).toBe(copyable[0].body);
  });

  it('carries a heading i18n key on every section and never raw prose', () => {
    const card = buildCoachCard({ sign: 'libra', situation: 'boundary' });
    for (const section of card.sections) {
      expect(section.labelKey).toMatch(/^conversationGuideSection[A-Z]/);
      expect(section.body.length).toBeGreaterThan(20);
    }
  });

  it('always attaches the disclaimer', () => {
    for (const sign of COACH_SIGNS) {
      const card = buildCoachCard({ sign, situation: 'clarity' });
      expect(card.disclaimer).toBe(COACH_DISCLAIMER);
    }
  });

  it('reports the situation access so the screen never re-derives it', () => {
    expect(buildCoachCard({ sign: 'leo', situation: 'start' }).access).toBe('free');
    expect(buildCoachCard({ sign: 'leo', situation: 'clarity' }).access).toBe('locked');
  });

  it('produces a different line for each situation of the same sign', () => {
    const lines = COACH_SITUATION_KEYS.map(
      (situation) => buildCoachCard({ sign: 'virgo', situation }).copyText,
    );
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('throws rather than rendering an unknown sign', () => {
    expect(() =>
      buildCoachCard({ sign: 'ophiuchus' as CoachSign, situation: 'start' }),
    ).toThrow(/Unknown Conversation Guide sign/);
  });

  it('throws rather than rendering an unknown situation', () => {
    expect(() =>
      buildCoachCard({ sign: 'aries', situation: 'vent' as CoachSituationKey }),
    ).toThrow(/Unknown Conversation Guide situation/);
  });
});

describe('untrusted input resolution', () => {
  it('accepts the capitalisation used by profiles.sun_sign', () => {
    expect(resolveCoachSign('Cancer')).toBe('cancer');
    expect(resolveCoachSign('  PISCES ')).toBe('pisces');
  });

  it('returns null instead of guessing', () => {
    expect(resolveCoachSign('ophiuchus')).toBeNull();
    expect(resolveCoachSign('')).toBeNull();
    expect(resolveCoachSign(null)).toBeNull();
    expect(resolveCoachSign(undefined)).toBeNull();
    expect(resolveCoachSign(42 as unknown as string)).toBeNull();
  });

  it('resolves and rejects situations the same way', () => {
    expect(resolveCoachSituation('Repair')).toBe('repair');
    expect(resolveCoachSituation('flirt')).toBeNull();
    expect(resolveCoachSituation(undefined)).toBeNull();
  });

  it('exposes situation metadata by key', () => {
    expect(getCoachSituation('boundary').labelKey).toBe(
      'conversationGuideSituationBoundary',
    );
  });
});

describe('voice guarantees enforced at the unit level', () => {
  // The full lint lives in scripts/validate-coach-content.mjs, which also runs
  // in CI. These two assertions are duplicated here on purpose: a corpus edit
  // made without running the validator still fails `npm run test`.
  const BANNED = [
    /\bsoulmates?\b/i,
    /\bsoul mate\b/i,
    /\bperfect match\b/i,
    /\bguarantee[ds]\b/i,
    /\bdestin(?:y|ed)\b/i,
    /\bmeant to be\b/i,
    /\balways\b/i,
    /\btoxic\b/i,
    /\b(?:they|he|she|you) will\b/i,
  ];

  it('contains no promissory or deterministic language', () => {
    for (const { path, value } of allCoachStrings()) {
      // The disclaimer is the one place "guarantee" may appear, negated.
      const subject = path === 'disclaimer' ? value.replace(/does not guarantee/gi, '') : value;
      for (const pattern of BANNED) {
        expect(pattern.test(subject), `${path} matched ${pattern}`).toBe(false);
      }
    }
  });

  it('hedges every descriptive claim about a sign', () => {
    const HEDGE = /\b(?:may|might|can|often|usually|generally|sometimes|tends? to)\b/i;
    for (const { path, value } of allCoachStrings()) {
      if (!/^signs\.[a-z]+\.(rhythm|works|avoid)$/.test(path)) continue;
      expect(HEDGE.test(value), `${path} has no modal hedge`).toBe(true);
    }
  });
});
