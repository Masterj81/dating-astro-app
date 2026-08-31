import { describe, expect, it } from 'vitest';

import { computeEqualHouses, computeNatalChart, ZODIAC_SIGNS } from '../chart';
import {
  areHousesTrustworthy,
  houseOfLongitude,
  planetsByHouse,
  resolveBirthDataState,
  resolveHouseCusps,
  resolveRisingLongitude,
  signsOnCusps,
} from '../houses';

// A birth with everything known: time, place, and therefore angles.
const FULL_BIRTH = {
  date: '1990-08-05',
  time: '14:30',
  timezone: 'Europe/Paris',
  latitude: 48.8566,
  longitude: 2.3522,
};

const COMPLETE_INPUT = {
  birthTime: '14:30',
  birthLatitude: 48.8566,
  birthLongitude: 2.3522,
  storedRisingSign: 'Scorpio',
  birthChart: {
    sun: { sign: 'Leo', degree: 12, longitude: 132 },
    moon: { sign: 'Pisces', degree: 3, longitude: 333 },
    rising: { sign: 'Scorpio', degree: 18, longitude: 228 },
    confidence: 'high',
    chartVersion: 2,
  },
};

describe('the three birth-data states', () => {
  it('reports missing_birth_time when there is no clock', () => {
    expect(
      resolveBirthDataState({ ...COMPLETE_INPUT, birthTime: null }),
    ).toBe('missing_birth_time');
    expect(
      resolveBirthDataState({ ...COMPLETE_INPUT, birthTime: '   ' }),
    ).toBe('missing_birth_time');
  });

  it('blames the clock first when BOTH the clock and the place are missing', () => {
    // Sending someone to add their birth city when the time is what blocks
    // them is telling them to fix the wrong field.
    expect(
      resolveBirthDataState({
        ...COMPLETE_INPUT,
        birthTime: null,
        birthLatitude: null,
        birthLongitude: null,
      }),
    ).toBe('missing_birth_time');
  });

  it('reports missing_birth_place when the clock is known but the place is not', () => {
    // THE STATE IMPLEMENTATIONS FORGET. This reader supplied their birth time
    // and believes they gave everything; they are exactly the population that
    // used to receive a Greenwich ascendant with no way of knowing.
    expect(
      resolveBirthDataState({ ...COMPLETE_INPUT, birthLatitude: null }),
    ).toBe('missing_birth_place');
    expect(
      resolveBirthDataState({ ...COMPLETE_INPUT, birthLongitude: null }),
    ).toBe('missing_birth_place');
    expect(
      resolveBirthDataState({
        ...COMPLETE_INPUT,
        birthLatitude: undefined,
        birthLongitude: undefined,
      }),
    ).toBe('missing_birth_place');
  });

  it('treats a guessed timezone as a missing place, not a complete chart', () => {
    // confidence 'low' with a birth time means the zone was guessed from the
    // device because no birth city was given. One hour of error is ~15° of
    // ascendant — half a house.
    expect(
      resolveBirthDataState({
        ...COMPLETE_INPUT,
        birthChart: { ...COMPLETE_INPUT.birthChart, confidence: 'low' },
      }),
    ).toBe('missing_birth_place');
  });

  it('accepts a real birthplace on the equator and on the prime meridian', () => {
    // `calculate-chart` used `if (!lat || !lng)`, which treats a genuine 0 as
    // absent and overwrote correct data for anyone born on the meridian or the
    // equator. Zero is a coordinate.
    expect(
      resolveBirthDataState({ ...COMPLETE_INPUT, birthLatitude: 0, birthLongitude: 0 }),
    ).toBe('complete');
  });

  it('reports complete only when both are present', () => {
    expect(resolveBirthDataState(COMPLETE_INPUT)).toBe('complete');
  });
});

describe('houses are harder to earn than a rising sign', () => {
  it('refuses houses when the place is unknown, even with a trustworthy rising', () => {
    const input = { ...COMPLETE_INPUT, birthLatitude: null, birthLongitude: null };
    // The rising itself is still fine — the birth time proves it.
    expect(areHousesTrustworthy(input)).toBe(false);
    expect(resolveHouseCusps(input)).toBeNull();
  });

  it('refuses houses when the chart admits it could not compute them', () => {
    expect(
      areHousesTrustworthy({
        ...COMPLETE_INPUT,
        birthTime: undefined,
        storedRisingSign: null,
        birthChart: {
          ...COMPLETE_INPUT.birthChart,
          warnings: ['houses_unavailable_without_birth_time'],
        },
      }),
    ).toBe(false);
  });

  it('refuses houses for a chart whose rising the engine returned as null', () => {
    expect(
      areHousesTrustworthy({
        ...COMPLETE_INPUT,
        birthTime: undefined,
        storedRisingSign: null,
        birthChart: { ...COMPLETE_INPUT.birthChart, rising: null },
      }),
    ).toBe(false);
  });

  it('grants houses when the clock and the place are both proven', () => {
    expect(areHousesTrustworthy(COMPLETE_INPUT)).toBe(true);
    expect(resolveHouseCusps(COMPLETE_INPUT)).toHaveLength(12);
  });
});

describe('the ascendant longitude never comes from a bare sign', () => {
  it('refuses a rising that carries no degree', () => {
    // A sign is 30° wide. A cusp built on one is wrong by up to a whole house.
    expect(resolveRisingLongitude({ rising: { sign: 'Scorpio' } })).toBeNull();
  });

  it('never derives cusps from profiles.rising_sign alone', () => {
    const cusps = resolveHouseCusps({
      birthTime: '14:30',
      birthLatitude: 48.8566,
      birthLongitude: 2.3522,
      storedRisingSign: 'Scorpio',
      birthChart: undefined,
    });
    expect(cusps).toBeNull();
  });

  it('reconstructs the longitude losslessly from sign + degree', () => {
    expect(resolveRisingLongitude({ rising: { sign: 'Scorpio', degree: 18 } })).toBe(228);
    expect(resolveRisingLongitude({ rising: { sign: 'Aries', degree: 0 } })).toBe(0);
  });

  it('does not mistake an unknown sign for 0° Aries', () => {
    // placementToLongitude returns 0 for a sign it does not know, which is a
    // real longitude and would be indistinguishable from a failure.
    expect(resolveRisingLongitude({ rising: { sign: 'Ophiuchus', degree: 0 } })).toBeNull();
  });
});

describe('cusp derivation matches the engine exactly', () => {
  it('reproduces computeNatalChart().houses from the stored rising alone', () => {
    // This is the whole reason no migration is needed: `toStoredBirthChart`
    // drops `houses`, but the equal-house system makes them recoverable from
    // the rising placement that IS stored.
    const chart = computeNatalChart(FULL_BIRTH);
    expect(chart.houses).not.toBeNull();
    expect(chart.rising).not.toBeNull();

    const derived = resolveHouseCusps({
      birthTime: FULL_BIRTH.time,
      birthLatitude: FULL_BIRTH.latitude,
      birthLongitude: FULL_BIRTH.longitude,
      birthChart: { ...chart, confidence: chart.confidence },
    });

    expect(derived).toEqual(chart.houses);
  });

  it('keeps the house system equidistant at 30 degrees', () => {
    // The derivation in houses.ts is only valid while houses are equal. If
    // Placidus ever lands, this fails and the cusps must be persisted for real.
    const cusps = computeEqualHouses(228);
    for (let i = 0; i < 12; i++) {
      const next = cusps[(i + 1) % 12];
      const span = ((next - cusps[i]) % 360 + 360) % 360;
      expect(span).toBeCloseTo(30, 9);
    }
  });

  it('prefers cusps the engine actually stored over derived ones', () => {
    const stored = computeEqualHouses(100);
    const cusps = resolveHouseCusps({
      ...COMPLETE_INPUT,
      birthChart: { ...COMPLETE_INPUT.birthChart, houses: stored },
    });
    expect(cusps).toEqual(stored);
  });
});

describe('placing a planet in a house', () => {
  const cusps = computeEqualHouses(228); // ASC 18° Scorpio

  it('puts a planet exactly on a cusp in the house that cusp opens', () => {
    expect(houseOfLongitude(cusps, 228)).toBe(1);
    expect(houseOfLongitude(cusps, 258)).toBe(2);
  });

  it('separates the two sides of a cusp by a hundredth of a degree', () => {
    expect(houseOfLongitude(cusps, 257.99)).toBe(1);
    expect(houseOfLongitude(cusps, 258.0)).toBe(2);
  });

  it('wraps correctly across 360/0', () => {
    // Houses 5 and 6 straddle the Aries point for this ascendant.
    expect(houseOfLongitude(cusps, 359.99)).toBe(healthyHouse(cusps, 359.99));
    expect(houseOfLongitude(cusps, 0)).toBe(healthyHouse(cusps, 0));
    expect(houseOfLongitude(cusps, 0.01)).toBe(healthyHouse(cusps, 0.01));
  });

  it('normalises out-of-range longitudes rather than failing', () => {
    expect(houseOfLongitude(cusps, 228 + 360)).toBe(1);
    expect(houseOfLongitude(cusps, -132)).toBe(1); // -132 ≡ 228
  });

  it('tiles the whole circle with no gap and no overlap', () => {
    const seen = new Set<number>();
    for (let lon = 0; lon < 360; lon += 0.25) {
      const house = houseOfLongitude(cusps, lon);
      expect(house).not.toBeNull();
      seen.add(house as number);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('returns null rather than guessing on a malformed cusp array', () => {
    expect(houseOfLongitude([], 100)).toBeNull();
    expect(houseOfLongitude(cusps.slice(0, 11), 100)).toBeNull();
    expect(houseOfLongitude(cusps, Number.NaN)).toBeNull();
    expect(houseOfLongitude([...cusps.slice(0, 11), Number.NaN], 100)).toBeNull();
  });
});

describe('grouping planets by house', () => {
  const chart = computeNatalChart(FULL_BIRTH);

  it('returns nothing at all when the cusps are not trustworthy', () => {
    // A caller that forgets to check the gate gets an empty map, never a
    // plausible arrangement.
    expect(planetsByHouse(chart, null).size).toBe(0);
  });

  it('places every planet the chart carries, and only those', () => {
    const byHouse = planetsByHouse(chart, chart.houses);
    const placed = [...byHouse.values()].flat();
    expect(placed).toHaveLength(10); // 7 inner + 3 outer, all present on a fresh chart
    for (const house of byHouse.keys()) {
      expect(house).toBeGreaterThanOrEqual(1);
      expect(house).toBeLessThanOrEqual(12);
    }
  });

  it('skips outer planets a legacy chart never stored', () => {
    const legacy = { ...chart, uranus: null, neptune: null, pluto: null };
    const placed = [...planetsByHouse(legacy, chart.houses).values()].flat();
    expect(placed).toHaveLength(7);
    expect(placed).not.toContain('pluto');
  });
});

describe('signs on the cusps', () => {
  it('returns null when there are no trustworthy cusps', () => {
    expect(signsOnCusps(null)).toBeNull();
    expect(signsOnCusps([1, 2, 3])).toBeNull();
  });

  it('uses the canonical zodiac order', () => {
    const signs = signsOnCusps(computeEqualHouses(0));
    expect(signs).toEqual([...ZODIAC_SIGNS]);
  });

  it('gives twelve consecutive signs for equal houses', () => {
    // A property of the equal-house system: each cusp lands in the next sign.
    const signs = signsOnCusps(computeEqualHouses(228));
    expect(signs).not.toBeNull();
    expect(signs).toHaveLength(12);
    expect(new Set(signs).size).toBe(12);
    expect(signs?.[0]).toBe('Scorpio');
  });
});

/** Independent reimplementation, used only to cross-check the wrap cases. */
function healthyHouse(cusps: number[], longitude: number): number {
  const rel = (((longitude - cusps[0]) % 360) + 360) % 360;
  return Math.floor(rel / 30) + 1;
}
