import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import { isRisingTrustworthy, resolveTrustedRisingSign } from '../rising';

// A chart written by the OLD mobile build: the engine reported the truth
// (confidence low, rising could not be computed) but the facade substituted
// Aries before anything was persisted. This is the shape sitting in the
// database for every account that skipped its birth time.
const POISONED_STORED_CHART = {
  sun: { sign: 'Leo', degree: 12, longitude: 132 },
  moon: { sign: 'Pisces', degree: 3, longitude: 333 },
  rising: { sign: 'Aries', degree: 0, longitude: 0 },
  confidence: 'low',
  chartVersion: 2,
};

const HONEST_CHART = {
  sun: { sign: 'Leo', degree: 12, longitude: 132 },
  moon: { sign: 'Pisces', degree: 3, longitude: 333 },
  rising: { sign: 'Scorpio', degree: 18, longitude: 228 },
  confidence: 'high',
  chartVersion: 2,
};

describe('the engine never invents an ascendant', () => {
  it('returns rising null when no birth time was given', () => {
    const chart = computeNatalChart({
      date: '1990-08-05',
      time: null,
      timezone: 'America/Montreal',
      latitude: 45.5017,
      longitude: -73.5673,
    });

    expect(chart.rising).toBeNull();
    expect(chart.mc).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.confidence).toBe('low');
    expect(chart.warnings).toContain('missing_birth_time');
  });

  it('still computes sun, moon and the planets without a birth time', () => {
    const chart = computeNatalChart({
      date: '1990-08-05',
      time: null,
      timezone: 'America/Montreal',
      latitude: 45.5017,
      longitude: -73.5673,
    });

    expect(chart.sun.sign).toBeTruthy();
    expect(chart.moon.sign).toBeTruthy();
    expect(chart.mercury.sign).toBeTruthy();
    expect(chart.venus.sign).toBeTruthy();
    expect(chart.mars.sign).toBeTruthy();
  });

  it('computes a real ascendant when the birth time is known', () => {
    const chart = computeNatalChart({
      date: '1990-08-05',
      time: '14:30',
      timezone: 'America/Montreal',
      latitude: 45.5017,
      longitude: -73.5673,
    });

    expect(chart.rising).not.toBeNull();
    expect(chart.rising?.sign).toBeTruthy();
    expect(chart.confidence).toBe('high');
    expect(chart.warnings).not.toContain('missing_birth_time');
  });

  it('never returns Aries-at-zero-degrees as a stand-in', () => {
    // The old fallback was exactly { sign: 'Aries', degree: 0, longitude: 0 }.
    // Sweep a year of birth dates with no time and assert the engine never
    // produces that shape for the ascendant.
    for (let month = 1; month <= 12; month++) {
      const chart = computeNatalChart({
        date: `1992-${String(month).padStart(2, '0')}-15`,
        time: null,
        timezone: 'Europe/Paris',
        latitude: 48.8566,
        longitude: 2.3522,
      });
      expect(chart.rising, `month ${month}`).toBeNull();
    }
  });
});

describe('isRisingTrustworthy', () => {
  it('refuses a sign stored against a null birth time', () => {
    // The historical poisoning case. No migration has run; the row still says
    // Aries. birth_time proves it cannot be real.
    expect(
      isRisingTrustworthy({
        birthTime: null,
        storedRisingSign: 'Aries',
        birthChart: POISONED_STORED_CHART,
      })
    ).toBe(false);
  });

  it('refuses a sign stored against an empty birth time', () => {
    expect(isRisingTrustworthy({ birthTime: '   ', storedRisingSign: 'Aries' })).toBe(false);
  });

  it('accepts a sign backed by a real birth time', () => {
    expect(isRisingTrustworthy({ birthTime: '14:30', storedRisingSign: 'Scorpio' })).toBe(true);
  });

  it('refuses when there is nothing to show at all', () => {
    expect(isRisingTrustworthy({ birthTime: '14:30', storedRisingSign: null })).toBe(false);
    expect(isRisingTrustworthy({})).toBe(false);
  });

  it('refuses a low-confidence chart even when birth_time is not visible', () => {
    // The discovery deck cannot read birth_time. A poisoned chart still
    // confesses `confidence: 'low'`, because the old facade substituted the
    // placement AFTER the engine had reported the truth.
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: POISONED_STORED_CHART,
      })
    ).toBe(false);
  });

  it('refuses a chart carrying a missing_birth_time warning', () => {
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: { ...HONEST_CHART, warnings: ['missing_birth_time'] },
      })
    ).toBe(false);
  });

  it('refuses a chart whose rising is explicitly null', () => {
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: { ...HONEST_CHART, rising: null },
      })
    ).toBe(false);
  });

  it('accepts a high-confidence chart with a real placement', () => {
    expect(
      isRisingTrustworthy({ storedRisingSign: 'Scorpio', birthChart: HONEST_CHART })
    ).toBe(true);
  });

  it('refuses a legacy chart that never recorded its confidence', () => {
    // Absence of proof is absence of a rising sign — a v1 row cannot tell us
    // whether a birth time existed, so it stays hidden.
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: { sun: { sign: 'Leo' }, rising: { sign: 'Aries' }, chartVersion: 1 },
      })
    ).toBe(false);
  });

  it('refuses when only a bare sign is available, as on the discovery deck', () => {
    // get_discoverable_profiles returns neither birth_time nor birth_chart.
    expect(isRisingTrustworthy({ storedRisingSign: 'Aries' })).toBe(false);
    expect(isRisingTrustworthy({ storedRisingSign: 'Scorpio' })).toBe(false);
  });

  it('lets a present birth time override a pessimistic chart', () => {
    // birth_time is the direct evidence; a stale stored confidence must not
    // hide an ascendant we can prove was computable.
    expect(
      isRisingTrustworthy({
        birthTime: '09:15',
        storedRisingSign: 'Virgo',
        birthChart: POISONED_STORED_CHART,
      })
    ).toBe(true);
  });

  it('survives garbage without throwing', () => {
    for (const birthChart of [null, undefined, 42, 'nope', [], { rising: 'nope' }]) {
      expect(() => isRisingTrustworthy({ storedRisingSign: 'Aries', birthChart })).not.toThrow();
      expect(isRisingTrustworthy({ storedRisingSign: 'Aries', birthChart })).toBe(false);
    }
  });
});

describe('resolveTrustedRisingSign', () => {
  it('returns null rather than a fabricated sign', () => {
    expect(
      resolveTrustedRisingSign({ birthTime: null, storedRisingSign: 'Aries' })
    ).toBeNull();
  });

  it('returns the stored sign when it is trustworthy', () => {
    expect(
      resolveTrustedRisingSign({ birthTime: '14:30', storedRisingSign: ' Scorpio ' })
    ).toBe('Scorpio');
  });

  it('falls back to the chart placement when no column value exists', () => {
    expect(
      resolveTrustedRisingSign({ birthTime: '14:30', birthChart: HONEST_CHART })
    ).toBe('Scorpio');
  });

  it('never returns a value the trust check rejected', () => {
    expect(
      resolveTrustedRisingSign({ storedRisingSign: 'Aries', birthChart: POISONED_STORED_CHART })
    ).toBeNull();
  });
});
