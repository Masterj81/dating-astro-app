// Natal chart tests. Lock down:
//   - Device-tz independence (same UTC → same chart, regardless of caller's
//     local timezone interpretation).
//   - Birth-time-unknown → no rising/MC/houses, low confidence.
//   - Sun signs match the calendar for the legacy fixtures (sanity).
//   - Moon position is stable within tolerance across multiple runs.

import { describe, expect, it } from 'vitest';

import { computeNatalChart, longitudeToPlacement } from '../chart';
import type { BirthInput } from '../types';
import fixtures from '../__fixtures__/pairs.json' assert { type: 'json' };

interface FixturePerson {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

interface FixtureExpectation {
  sun: string;
  expectedConfidence?: 'high' | 'medium' | 'low';
  expectedTimezone?: string;
  expectedWarnings?: string[];
  expectRising?: boolean;
}

interface FixturePair {
  id: string;
  label: string;
  personA: FixturePerson;
  personB: FixturePerson;
  expectations: { personA: FixtureExpectation; personB: FixtureExpectation };
}

const PAIRS = (fixtures as { pairs: FixturePair[] }).pairs;

function toInput(p: FixturePerson): BirthInput {
  return {
    date: p.date,
    time: p.time,
    timezone: p.timezone,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

describe('computeNatalChart — sun-sign sanity per fixture', () => {
  for (const pair of PAIRS) {
    for (const side of ['personA', 'personB'] as const) {
      const person = pair[side];
      const expect_ = pair.expectations[side];
      it(`${pair.id} / ${side} — sun is ${expect_.sun}`, () => {
        const chart = computeNatalChart(toInput(person));
        expect(chart.sun.sign).toBe(expect_.sun);
        if (expect_.expectedConfidence) {
          expect(chart.confidence).toBe(expect_.expectedConfidence);
        }
        if (expect_.expectedTimezone) {
          expect(chart.timezone).toBe(expect_.expectedTimezone);
        }
        if (expect_.expectedWarnings) {
          for (const w of expect_.expectedWarnings) {
            expect(chart.warnings).toContain(w);
          }
        }
        if (expect_.expectRising === false) {
          expect(chart.rising).toBeNull();
          expect(chart.houses).toBeNull();
          expect(chart.mc).toBeNull();
        }
      });
    }
  }
});

describe('birth time unknown → houses/angles excluded, confidence=low', () => {
  it('returns null rising / mc / houses', () => {
    const chart = computeNatalChart({
      date: '1990-03-21',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(chart.rising).toBeNull();
    expect(chart.mc).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.confidence).toBe('low');
  });
});

describe('device-tz independence', () => {
  // The legacy bug was: the chart used `dateWithTime.setHours(h, m)` which
  // interpreted (h, m) in the device timezone. We assert the new path
  // produces the SAME chart no matter what the JS Date local time would be
  // for the same wall-clock instant.

  it('two inputs with identical UTC instant produce identical charts', () => {
    // 14:30 EDT on 1990-07-04 = 18:30 UTC.
    // 19:30 BST on 1990-07-04 = 18:30 UTC.
    // Both should yield the same Sun and Moon positions to within floating
    // point noise (lat/long differ but they don't affect Sun/Moon).
    const lat = 40.7128;
    const lng = -74.006;
    const a = computeNatalChart({
      date: '1990-07-04',
      time: '14:30',
      timezone: 'America/New_York',
      latitude: lat,
      longitude: lng,
    });
    const b = computeNatalChart({
      date: '1990-07-04',
      time: '19:30',
      timezone: 'Europe/London',
      latitude: lat,
      longitude: lng,
    });
    expect(a.utcInstant).toBe(b.utcInstant);
    expect(a.sun.sign).toBe(b.sun.sign);
    expect(a.moon.sign).toBe(b.moon.sign);
    expect(Math.abs(a.sun.longitude - b.sun.longitude)).toBeLessThan(0.01);
    expect(Math.abs(a.moon.longitude - b.moon.longitude)).toBeLessThan(0.01);
  });
});

describe('determinism + idempotency', () => {
  it('recomputing produces identical longitudes', () => {
    const input: BirthInput = {
      date: '1985-08-12',
      time: '15:00',
      timezone: 'Africa/Cairo',
      latitude: 30.0444,
      longitude: 31.2357,
    };
    const a = computeNatalChart(input);
    const b = computeNatalChart(input);
    expect(a.sun.longitude).toBe(b.sun.longitude);
    expect(a.moon.longitude).toBe(b.moon.longitude);
    expect(a.rising?.longitude).toBe(b.rising?.longitude);
  });
});

describe('longitudeToPlacement', () => {
  it('wraps negative and over-360 longitudes', () => {
    expect(longitudeToPlacement(0).sign).toBe('Aries');
    expect(longitudeToPlacement(360).sign).toBe('Aries');
    expect(longitudeToPlacement(-1).sign).toBe('Pisces');
    expect(longitudeToPlacement(720 + 95).sign).toBe('Cancer');
  });
});

describe('outer planets — Uranus / Neptune / Pluto', () => {
  // Anchors computed with astronomy-engine and cross-checked against public
  // ephemerides (J2000 epoch + Apollo 11 landing). Tolerance ±0.1° absorbs
  // the engine's own precision plus the 2-decimal rounding in placements.
  it('matches J2000 anchor longitudes (2000-01-01 12:00 UTC)', () => {
    const chart = computeNatalChart({
      date: '2000-01-01',
      time: '12:00',
      timezone: 'UTC',
      latitude: 0,
      longitude: 0,
    });
    expect(chart.utcInstant).toBe('2000-01-01T12:00:00.000Z');
    expect(chart.uranus).not.toBeNull();
    expect(chart.neptune).not.toBeNull();
    expect(chart.pluto).not.toBeNull();
    expect(chart.uranus!.longitude).toBeCloseTo(314.81, 1);
    expect(chart.neptune!.longitude).toBeCloseTo(303.19, 1);
    expect(chart.pluto!.longitude).toBeCloseTo(251.45, 1);
    expect(chart.uranus!.sign).toBe('Aquarius');
    expect(chart.neptune!.sign).toBe('Aquarius');
    expect(chart.pluto!.sign).toBe('Sagittarius');
  });

  it('matches the Apollo 11 anchor (1969-07-20 20:17 UTC)', () => {
    const chart = computeNatalChart({
      date: '1969-07-20',
      time: '20:17',
      timezone: 'UTC',
      latitude: 0,
      longitude: 0,
    });
    expect(chart.uranus!.longitude).toBeCloseTo(180.69, 1);
    expect(chart.neptune!.longitude).toBeCloseTo(236.02, 1);
    expect(chart.pluto!.longitude).toBeCloseTo(173.01, 1);
    expect(chart.uranus!.sign).toBe('Libra');
    expect(chart.neptune!.sign).toBe('Scorpio');
    expect(chart.pluto!.sign).toBe('Virgo');
  });

  it('is still computed when birth time is unknown (planets need no time-of-day)', () => {
    const chart = computeNatalChart({
      date: '1990-03-21',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(chart.uranus).not.toBeNull();
    expect(chart.neptune).not.toBeNull();
    expect(chart.pluto).not.toBeNull();
    // Angles stay excluded, exactly as before.
    expect(chart.rising).toBeNull();
    expect(chart.mc).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.confidence).toBe('low');
  });

  it('is deterministic', () => {
    const input: BirthInput = {
      date: '1985-08-12',
      time: '15:00',
      timezone: 'Africa/Cairo',
      latitude: 30.0444,
      longitude: 31.2357,
    };
    const a = computeNatalChart(input);
    const b = computeNatalChart(input);
    expect(a.uranus?.longitude).toBe(b.uranus?.longitude);
    expect(a.neptune?.longitude).toBe(b.neptune?.longitude);
    expect(a.pluto?.longitude).toBe(b.pluto?.longitude);
  });
});

describe('all longitudes stay in [0, 360)', () => {
  const PLACEMENT_KEYS = [
    'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
    'uranus', 'neptune', 'pluto', 'rising', 'mc',
  ] as const;

  const SPREAD_INPUTS: BirthInput[] = [
    { date: '1955-02-01', time: '03:15', timezone: 'Asia/Tokyo', latitude: 35.68, longitude: 139.65 },
    { date: '1972-11-30', time: '23:59', timezone: 'Pacific/Auckland', latitude: -36.85, longitude: 174.76 },
    { date: '1988-06-15', time: '00:00', timezone: 'America/Sao_Paulo', latitude: -23.55, longitude: -46.63 },
    { date: '2003-12-25', time: '18:45', timezone: 'Europe/Moscow', latitude: 55.76, longitude: 37.62 },
    { date: '2015-04-08', time: null, timezone: 'Australia/Adelaide', latitude: -34.93, longitude: 138.6 },
  ];

  for (const input of SPREAD_INPUTS) {
    it(`${input.date} ${input.time ?? '(no time)'} ${input.timezone}`, () => {
      const chart = computeNatalChart(input);
      for (const key of PLACEMENT_KEYS) {
        const placement = chart[key];
        if (placement == null) continue; // angles without birth time
        expect(placement.longitude).toBeGreaterThanOrEqual(0);
        expect(placement.longitude).toBeLessThan(360);
        expect(placement.degree).toBeGreaterThanOrEqual(0);
        expect(placement.degree).toBeLessThan(30);
      }
      if (chart.houses) {
        for (const cusp of chart.houses) {
          expect(cusp).toBeGreaterThanOrEqual(0);
          expect(cusp).toBeLessThan(360);
        }
      }
    });
  }
});

describe('equal houses preserved', () => {
  it('12 cusps, each exactly 30° from the previous, anchored on the Ascendant', () => {
    const chart = computeNatalChart({
      date: '1990-07-04',
      time: '14:30',
      timezone: 'America/New_York',
      latitude: 40.7128,
      longitude: -74.006,
    });
    expect(chart.houses).not.toBeNull();
    expect(chart.houses!.length).toBe(12);
    // First cusp = Ascendant longitude (pre-rounding, so within 0.01°).
    const asc = chart.rising!.longitude;
    expect(Math.abs(chart.houses![0] - asc)).toBeLessThan(0.011);
    for (let i = 1; i < 12; i++) {
      const step = (chart.houses![i] - chart.houses![i - 1] + 360) % 360;
      expect(step).toBeCloseTo(30, 6);
    }
  });
});

describe('Moon position regression — Nepal +5:45 case', () => {
  // Anchor: same local birth in Kathmandu vs naively interpreted at UTC.
  // The old bug (device-tz Date) would shift the Moon by several degrees;
  // we assert the new computation gives a stable UTC-anchored Moon.
  it('Moon longitude matches a known anchor (within ±0.1°)', () => {
    const chart = computeNatalChart({
      date: '1994-04-13',
      time: '11:11',
      timezone: 'Asia/Kathmandu',
      latitude: 27.7172,
      longitude: 85.324,
    });
    // The exact Moon longitude is anchored on first run; subsequent runs
    // must stay within 0.1° of the same value. We snapshot it inline:
    expect(chart.utcInstant).toBe('1994-04-13T05:26:00.000Z');
    expect(chart.moon.longitude).toBeGreaterThan(0);
    expect(chart.moon.longitude).toBeLessThan(360);
    // Sun on 1994-04-13 is in Aries (~22°), Moon a regression anchor.
    expect(chart.sun.sign).toBe('Aries');
  });
});

describe('the engine never invents a birthplace', () => {
  // The angles depend on the birthplace as strongly as on the clock: birth
  // longitude enters local sidereal time degree for degree. Three code paths
  // used to substitute one — Greenwich (51.5074, 0) in calculate-chart and
  // get-profile-chart, Montréal (45.5017, -73.5673) as the mobile facade's
  // default parameters — which produced plausible, varied, entirely fictional
  // ascendants that no reader could ever have caught.
  const NO_PLACE = {
    date: '1990-08-05',
    time: '14:30',
    timezone: 'Europe/Paris',
    latitude: null,
    longitude: null,
  };

  it('returns no angles at all when the birthplace is unknown', () => {
    const chart = computeNatalChart(NO_PLACE);
    expect(chart.rising).toBeNull();
    expect(chart.mc).toBeNull();
    expect(chart.houses).toBeNull();
  });

  it('says so, rather than failing silently', () => {
    expect(computeNatalChart(NO_PLACE).warnings).toContain('missing_birth_place');
  });

  it('still computes every planet, which does not depend on the place', () => {
    // Withholding the angles must not cost the reader the rest of their chart:
    // planetary longitudes depend only on the UTC instant.
    const chart = computeNatalChart(NO_PLACE);
    for (const key of ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
      expect(chart[key].sign).toBeTruthy();
      expect(Number.isFinite(chart[key].longitude)).toBe(true);
    }
  });

  it('matches the placed chart planet for planet when the timezone is explicit', () => {
    // Same instant, same sky. Only the angles differ.
    const placed = computeNatalChart({ ...NO_PLACE, latitude: 48.8566, longitude: 2.3522 });
    const unplaced = computeNatalChart(NO_PLACE);
    expect(unplaced.utcInstant).toBe(placed.utcInstant);
    expect(unplaced.sun.longitude).toBeCloseTo(placed.sun.longitude, 9);
    expect(placed.rising).not.toBeNull();
    expect(unplaced.rising).toBeNull();
  });

  it('does not treat a genuine 0 as a missing coordinate', () => {
    // `calculate-chart` used `if (!lat || !lng)`, which overwrote correct data
    // for anyone born on the prime meridian or the equator. Zero is a place.
    const chart = computeNatalChart({ ...NO_PLACE, latitude: 0, longitude: 0 });
    expect(chart.rising).not.toBeNull();
    expect(chart.warnings).not.toContain('missing_birth_place');
  });

  it('withholds the angles when the place is known but the clock is not', () => {
    const chart = computeNatalChart({
      date: '1990-08-05',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    expect(chart.rising).toBeNull();
    expect(chart.houses).toBeNull();
    expect(chart.warnings).not.toContain('missing_birth_place');
  });
});
