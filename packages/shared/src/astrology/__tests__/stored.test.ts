// Stored-chart compatibility tests.
//
// Locks down:
//   - v1 mobile JSONB (no outer planets) hydrates with uranus/neptune/pluto
//     as null — never a fabricated position.
//   - Edge/web-written charts (lowercase signs) hydrate too.
//   - Placements missing `longitude` are reconstructed losslessly from
//     sign + degree.
//   - Garbage / non-chart values return null instead of throwing.
//   - Fresh chart → toStoredBirthChart → hydrateStoredChart round-trips.
//   - A hydrated legacy chart flows through computeSynastry without crashing
//     and without outer-planet interpretive aspects from the legacy side.

import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import { computeSynastry } from '../synastry';
import {
  STORED_CHART_VERSION,
  hydrateStoredChart,
  parseStoredPlacement,
  toStoredBirthChart,
} from '../stored';

/** A faithful copy of what mobile onboarding wrote before chart model v2. */
const LEGACY_V1_BIRTH_CHART = {
  sun: { sign: 'Cancer', degree: 12.51, longitude: 102.51 },
  moon: { sign: 'Pisces', degree: 3.2, longitude: 333.2 },
  rising: { sign: 'Libra', degree: 21.7, longitude: 201.7 },
  planets: {
    mercury: { sign: 'Gemini', degree: 28.1, longitude: 88.1 },
    venus: { sign: 'Leo', degree: 5.9, longitude: 125.9 },
    mars: { sign: 'Aries', degree: 17.3, longitude: 17.3 },
    jupiter: { sign: 'Cancer', degree: 9.8, longitude: 99.8 },
    saturn: { sign: 'Capricorn', degree: 25.4, longitude: 295.4 },
  },
  coordinates: { latitude: 45.5017, longitude: -73.5673 },
  timezone: 'America/Montreal',
  confidence: 'high',
  chartVersion: 1,
} as const;

describe('parseStoredPlacement', () => {
  it('accepts a complete placement', () => {
    const p = parseStoredPlacement({ sign: 'Cancer', degree: 15, longitude: 105 });
    expect(p).toEqual({ sign: 'Cancer', degree: 15, longitude: 105 });
  });

  it('reconstructs longitude losslessly from sign + degree', () => {
    const p = parseStoredPlacement({ sign: 'Cancer', degree: 15 });
    expect(p?.longitude).toBe(105); // Cancer starts at 90 + 15
  });

  it('normalizes lowercase edge-function signs', () => {
    const p = parseStoredPlacement({ sign: 'aquarius', degree: 3.2, longitude: 303.2 });
    expect(p?.sign).toBe('Aquarius');
  });

  it('returns null instead of inventing data', () => {
    expect(parseStoredPlacement(null)).toBeNull();
    expect(parseStoredPlacement({})).toBeNull();
    expect(parseStoredPlacement({ sign: 'NotASign', degree: 5 })).toBeNull();
    expect(parseStoredPlacement({ sign: 'Cancer' })).toBeNull(); // no degree, no longitude
  });
});

describe('hydrateStoredChart — legacy v1 shape', () => {
  it('hydrates every inner planet and leaves outer planets null', () => {
    const chart = hydrateStoredChart(LEGACY_V1_BIRTH_CHART);
    expect(chart).not.toBeNull();
    expect(chart!.sun.longitude).toBe(102.51);
    expect(chart!.moon.sign).toBe('Pisces');
    expect(chart!.mercury.longitude).toBe(88.1);
    expect(chart!.saturn.sign).toBe('Capricorn');
    expect(chart!.rising?.sign).toBe('Libra');
    // The whole point: absent outer planets stay null.
    expect(chart!.uranus).toBeNull();
    expect(chart!.neptune).toBeNull();
    expect(chart!.pluto).toBeNull();
    expect(chart!.timezone).toBe('America/Montreal');
    expect(chart!.confidence).toBe('high');
  });

  it('tolerates a lowercase-sign chart (edge/web writer)', () => {
    const lowercase = JSON.parse(JSON.stringify(LEGACY_V1_BIRTH_CHART));
    lowercase.sun.sign = 'cancer';
    lowercase.planets.mercury.sign = 'gemini';
    const chart = hydrateStoredChart(lowercase);
    expect(chart?.sun.sign).toBe('Cancer');
    expect(chart?.mercury.sign).toBe('Gemini');
  });

  it('returns null for non-chart values', () => {
    expect(hydrateStoredChart(null)).toBeNull();
    expect(hydrateStoredChart('not a chart')).toBeNull();
    expect(hydrateStoredChart({})).toBeNull();
    expect(hydrateStoredChart({ sun: LEGACY_V1_BIRTH_CHART.sun })).toBeNull(); // no moon
  });

  it('flows through computeSynastry without outer aspects from the legacy side', () => {
    const legacy = hydrateStoredChart(LEGACY_V1_BIRTH_CHART)!;
    const fresh = computeNatalChart({
      date: '1992-09-15',
      time: '10:00',
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const result = computeSynastry(legacy, fresh);
    for (const frame of ['love', 'friendship', 'business'] as const) {
      expect(result.frames[frame].score).toBeGreaterThanOrEqual(0);
      expect(result.frames[frame].score).toBeLessThanOrEqual(100);
    }
    // Interpretive aspects may exist (the fresh chart HAS outer planets),
    // but none can involve an outer planet on the legacy chart's side
    // (bodyA is chart1 = legacy by convention).
    for (const aspect of result.interpretiveAspects) {
      expect(['uranus', 'neptune', 'pluto']).not.toContain(aspect.bodyA);
      expect(aspect.contribution).toBe(0);
    }
  });

  it('two legacy charts → synastry works with zero interpretive aspects', () => {
    const a = hydrateStoredChart(LEGACY_V1_BIRTH_CHART)!;
    const b = hydrateStoredChart({
      ...LEGACY_V1_BIRTH_CHART,
      sun: { sign: 'Scorpio', degree: 10, longitude: 220 },
    })!;
    const result = computeSynastry(a, b);
    expect(result.interpretiveAspects).toEqual([]);
    expect(result.frames.love.score).toBeGreaterThanOrEqual(0);
  });
});

describe('round-trip: computeNatalChart → toStoredBirthChart → hydrateStoredChart', () => {
  const input = {
    date: '1990-07-04',
    time: '14:30',
    timezone: 'America/New_York',
    latitude: 40.7128,
    longitude: -74.006,
  };

  it('preserves all longitudes, includes outer planets, stamps v2', () => {
    const fresh = computeNatalChart(input);
    const stored = toStoredBirthChart(fresh);
    expect(stored.chartVersion).toBe(STORED_CHART_VERSION);
    expect(stored.planets.uranus).toBeDefined();
    expect(stored.planets.neptune).toBeDefined();
    expect(stored.planets.pluto).toBeDefined();

    // Simulate the JSONB round-trip through Postgres.
    const hydrated = hydrateStoredChart(JSON.parse(JSON.stringify(stored)))!;
    expect(hydrated.sun.longitude).toBe(fresh.sun.longitude);
    expect(hydrated.moon.longitude).toBe(fresh.moon.longitude);
    expect(hydrated.uranus?.longitude).toBe(fresh.uranus?.longitude);
    expect(hydrated.neptune?.longitude).toBe(fresh.neptune?.longitude);
    expect(hydrated.pluto?.longitude).toBe(fresh.pluto?.longitude);
    expect(hydrated.rising?.longitude).toBe(fresh.rising?.longitude);
    expect(hydrated.timezone).toBe(fresh.timezone);
  });

  it('a hydrated v1 chart re-serializes WITHOUT fabricated outer planets', () => {
    const legacy = hydrateStoredChart(LEGACY_V1_BIRTH_CHART)!;
    const stored = toStoredBirthChart(legacy);
    expect(stored.planets.uranus).toBeUndefined();
    expect(stored.planets.neptune).toBeUndefined();
    expect(stored.planets.pluto).toBeUndefined();
  });

  it('hydrates a directly-serialized NatalChart (planets at top level)', () => {
    const fresh = computeNatalChart(input);
    const hydrated = hydrateStoredChart(JSON.parse(JSON.stringify(fresh)))!;
    expect(hydrated.sun.longitude).toBe(fresh.sun.longitude);
    expect(hydrated.pluto?.longitude).toBe(fresh.pluto?.longitude);
    expect(hydrated.houses).toEqual(fresh.houses);
  });
});
