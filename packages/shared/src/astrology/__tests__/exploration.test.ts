// Exploration-questions picker tests:
//   - Always returns exactly 10 questions, in stable order.
//   - Deterministic: same inputs → same output, every time.
//   - Zone score level (high/mid/low) routes to the right key.
//   - Total score routes the overall-question bucket.
//   - Missing zones / missing total fall through to 'mid' rather than
//     dropping items, so the surface always renders 10.
//   - readingFrame is echoed on each question but does not affect the keys.

import { describe, expect, it } from 'vitest';

import {
  allExplorationKeys,
  buildExplorationQuestions,
  EXPLORATION_ZONE_ORDER,
  type ExplorationQuestion,
  type ExplorationZoneKey,
  type ExplorationZoneScore,
} from '../exploration';

function zone(
  emotional: number,
  communication: number,
  attraction: number,
  stability: number,
): ExplorationZoneScore[] {
  return [
    { key: 'emotional', score: emotional },
    { key: 'communication', score: communication },
    { key: 'attraction', score: attraction },
    { key: 'stability', score: stability },
  ];
}

describe('buildExplorationQuestions', () => {
  it('returns exactly 10 questions', () => {
    const out = buildExplorationQuestions({
      zoneScores: zone(80, 60, 40, 90),
      totalScore: 72,
    });
    expect(out).toHaveLength(10);
  });

  it('is fully deterministic across repeated calls', () => {
    const input = {
      zoneScores: zone(72, 51, 30, 88),
      totalScore: 64,
      readingFrame: 'friendship' as const,
    };
    const a = buildExplorationQuestions(input);
    const b = buildExplorationQuestions(input);
    expect(a).toEqual(b);
  });

  it('emits the four zone questions first in EXPLORATION_ZONE_ORDER, then six overall questions', () => {
    const out = buildExplorationQuestions({
      zoneScores: zone(50, 50, 50, 50),
      totalScore: 50,
    });

    const zoneScopes = out.slice(0, 4).map((q) => q.scope);
    expect(zoneScopes).toEqual([...EXPLORATION_ZONE_ORDER]);

    const overallScopes = out.slice(4).map((q) => q.scope);
    expect(overallScopes).toEqual(Array(6).fill('overall'));

    out.forEach((q, i) => expect(q.order).toBe(i + 1));
  });

  it('routes each zone to the right level key based on its score', () => {
    const out = buildExplorationQuestions({
      zoneScores: zone(85, 60, 30, 100),
      totalScore: 70,
    });

    const byZone = (key: ExplorationZoneKey) =>
      out.find((q): q is ExplorationQuestion => q.scope === key)!;

    expect(byZone('emotional').translationKey).toBe('exploration_emotional_high');
    expect(byZone('emotional').level).toBe('high');
    expect(byZone('communication').translationKey).toBe('exploration_communication_mid');
    expect(byZone('communication').level).toBe('mid');
    expect(byZone('attraction').translationKey).toBe('exploration_attraction_low');
    expect(byZone('attraction').level).toBe('low');
    expect(byZone('stability').translationKey).toBe('exploration_stability_high');
    expect(byZone('stability').level).toBe('high');
  });

  it('routes overall questions through the totalScore bucket', () => {
    const high = buildExplorationQuestions({
      zoneScores: zone(50, 50, 50, 50),
      totalScore: 80,
    }).slice(4);
    expect(high.map((q) => q.translationKey)).toEqual([
      'exploration_overall_high_1',
      'exploration_overall_high_2',
      'exploration_overall_high_3',
      'exploration_overall_high_4',
      'exploration_overall_high_5',
      'exploration_overall_high_6',
    ]);

    const mid = buildExplorationQuestions({
      zoneScores: zone(50, 50, 50, 50),
      totalScore: 50,
    }).slice(4);
    expect(mid.every((q) => q.translationKey.startsWith('exploration_overall_mid_'))).toBe(true);

    const low = buildExplorationQuestions({
      zoneScores: zone(50, 50, 50, 50),
      totalScore: 20,
    }).slice(4);
    expect(low.every((q) => q.translationKey.startsWith('exploration_overall_low_'))).toBe(true);
  });

  it('falls back to mid when zone data is missing rather than dropping items', () => {
    const out = buildExplorationQuestions({ zoneScores: null, totalScore: null });
    expect(out).toHaveLength(10);
    // Every zone question lands on the mid key.
    for (const zoneKey of EXPLORATION_ZONE_ORDER) {
      const q = out.find((it) => it.scope === zoneKey);
      expect(q?.translationKey).toBe(`exploration_${zoneKey}_mid`);
      expect(q?.level).toBe('mid');
    }
    // Overall also falls back to mid.
    expect(
      out.slice(4).every((q) => q.translationKey.startsWith('exploration_overall_mid_')),
    ).toBe(true);
  });

  it('falls back to mid for any zone whose score is missing, partial, or NaN', () => {
    const out = buildExplorationQuestions({
      zoneScores: [
        { key: 'emotional', score: 85 },
        // communication absent
        { key: 'attraction', score: Number.NaN },
        { key: 'stability', score: 30 },
      ],
      totalScore: 60,
    });
    const find = (k: ExplorationZoneKey) => out.find((q) => q.scope === k)!;
    expect(find('emotional').level).toBe('high');
    expect(find('communication').level).toBe('mid');
    expect(find('attraction').level).toBe('mid');
    expect(find('stability').level).toBe('low');
  });

  it('clamps out-of-range scores and respects level boundaries', () => {
    const out = buildExplorationQuestions({
      zoneScores: zone(150, -10, 70, 45),
      totalScore: 200,
    });
    const find = (k: ExplorationZoneKey) => out.find((q) => q.scope === k)!;
    expect(find('emotional').level).toBe('high'); // 150 clamps to 100
    expect(find('communication').level).toBe('low'); // -10 clamps to 0
    expect(find('attraction').level).toBe('high'); // exactly 70 = high boundary
    expect(find('stability').level).toBe('mid'); // exactly 45 = mid boundary
    expect(out.slice(4).every((q) => q.level === 'high')).toBe(true);
  });

  it('echoes readingFrame on every question without changing the keys', () => {
    const input = {
      zoneScores: zone(80, 80, 80, 80),
      totalScore: 80,
    };
    const love = buildExplorationQuestions({ ...input, readingFrame: 'love' });
    const business = buildExplorationQuestions({ ...input, readingFrame: 'business' });

    expect(love.every((q) => q.frame === 'love')).toBe(true);
    expect(business.every((q) => q.frame === 'business')).toBe(true);
    // Keys are identical across frames in the MVP.
    expect(love.map((q) => q.translationKey)).toEqual(business.map((q) => q.translationKey));
  });

  it('assigns the right tone to each level', () => {
    const out = buildExplorationQuestions({
      zoneScores: zone(85, 50, 20, 80),
      totalScore: 50,
    });
    const find = (k: ExplorationZoneKey) => out.find((q) => q.scope === k)!;
    expect(find('emotional').tone).toBe('deepening');
    expect(find('communication').tone).toBe('supportive');
    expect(find('attraction').tone).toBe('watch');
    expect(find('stability').tone).toBe('deepening');
    expect(out.slice(4).every((q) => q.tone === 'supportive')).toBe(true);
  });

  it('only ever emits keys from the declared pool', () => {
    const pool = new Set(allExplorationKeys());
    const samples = [
      { zoneScores: zone(10, 90, 50, 70), totalScore: 30 },
      { zoneScores: zone(90, 10, 70, 50), totalScore: 70 },
      { zoneScores: zone(50, 50, 50, 50), totalScore: 50 },
      { zoneScores: null, totalScore: null },
    ];
    for (const input of samples) {
      const out = buildExplorationQuestions(input);
      for (const q of out) {
        expect(pool.has(q.translationKey)).toBe(true);
      }
    }
  });

  it('exposes 30 unique keys in allExplorationKeys()', () => {
    const keys = allExplorationKeys();
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(30);
  });
});
