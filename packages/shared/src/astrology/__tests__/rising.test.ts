import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import {
  isRisingTrustworthy,
  resolveTrustedRisingSign,
  risingNeedsLocationConfirmation,
} from '../rising';

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

  it('accepts a legacy chart that never recorded its confidence', () => {
    // A v1 row cannot say whether a birth time existed. Until 2026-08-30 that
    // was decisive and the placement stayed hidden. It no longer is: the row
    // itself is now covered by the database trigger, so the surviving sign
    // proves a birth time was there. Nothing in this chart contradicts it.
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Scorpio',
        birthChart: { sun: { sign: 'Leo' }, rising: { sign: 'Scorpio' }, chartVersion: 1 },
      })
    ).toBe(true);
  });

  it('accepts a bare sign, as on the discovery deck', () => {
    // get_discoverable_profiles returns neither birth_time nor birth_chart —
    // only the column. That used to mean "unprovable, therefore hidden",
    // which cost every real ascendant on the deck.
    //
    // Migration 20260830000001 enforces `birth_time IS NULL ⟹ rising_sign IS
    // NULL` at the database level, so the column now carries its own proof.
    // If that trigger is ever dropped, THIS is the assertion that should flip
    // back to false — and rising.ts rule 5 with it.
    expect(isRisingTrustworthy({ storedRisingSign: 'Scorpio' })).toBe(true);
  });

  it('still refuses a bare sign the moment anything contradicts it', () => {
    // The relaxation above only applies when nothing objects. A visible empty
    // birth_time, a chart that admits it computed no ascendant, or a
    // low-confidence chart each outrank the column.
    expect(isRisingTrustworthy({ storedRisingSign: 'Aries', birthTime: null })).toBe(false);
    expect(
      isRisingTrustworthy({ storedRisingSign: 'Aries', birthChart: POISONED_STORED_CHART })
    ).toBe(false);
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: { ...HONEST_CHART, rising: null },
      })
    ).toBe(false);
    expect(
      isRisingTrustworthy({
        storedRisingSign: 'Aries',
        birthChart: { ...HONEST_CHART, warnings: ['missing_birth_time'] },
      })
    ).toBe(false);
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
    // An unreadable birth_chart is not a contradiction — it is noise. It must
    // not crash, and it must not veto the column, which carries its own proof.
    for (const birthChart of [null, undefined, 42, 'nope', [], { rising: 'nope' }]) {
      expect(() =>
        isRisingTrustworthy({ storedRisingSign: 'Scorpio', birthChart })
      ).not.toThrow();
      expect(isRisingTrustworthy({ storedRisingSign: 'Scorpio', birthChart })).toBe(true);
    }
    // ...and with no sign either, there is still nothing to show.
    for (const birthChart of [null, undefined, 42, 'nope', []]) {
      expect(isRisingTrustworthy({ storedRisingSign: null, birthChart })).toBe(false);
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

// ---------------------------------------------------------------------------
// The birthplace, added 2026-09-01 (migration 20260901000002).
// ---------------------------------------------------------------------------
// The ascendant depends on the PLACE as much as the clock: birth longitude
// enters local sidereal time degree for degree, so Montréal against Paris is
// 76° — more than two and a half signs. Four code paths used to substitute a
// location rather than admit they had none.

const PLACED = {
  birthTime: '14:30',
  birthLatitude: 48.8566,
  birthLongitude: 2.3522,
  storedRisingSign: 'Scorpio',
};

describe('a birth time alone no longer proves an ascendant', () => {
  it('hides the sign when the caller can see the coordinates and there are none', () => {
    expect(
      isRisingTrustworthy({ ...PLACED, birthLatitude: null, birthLongitude: null }),
    ).toBe(false);
    expect(
      resolveTrustedRisingSign({ ...PLACED, birthLatitude: null, birthLongitude: null }),
    ).toBeNull();
  });

  it('hides it when only one of the two coordinates is missing', () => {
    expect(isRisingTrustworthy({ ...PLACED, birthLatitude: null })).toBe(false);
    expect(isRisingTrustworthy({ ...PLACED, birthLongitude: null })).toBe(false);
  });

  it('accepts a genuine 0 — the prime meridian and the equator are places', () => {
    // `calculate-chart` used `!lat || !lng`, which replaced CORRECT data with
    // invented data for anyone born on the meridian.
    expect(
      isRisingTrustworthy({ ...PLACED, birthLatitude: 0, birthLongitude: 0 }),
    ).toBe(true);
  });

  it('still trusts a bare sign when the caller cannot see the coordinates', () => {
    // Discover reads through `get_discoverable_profiles`, which returns
    // neither birth_time nor birth_chart nor the coordinates. It relies on the
    // database invariant instead — which is why 20260901000002 MOVES suspect
    // signs out of `rising_sign` rather than flagging them.
    expect(isRisingTrustworthy({ storedRisingSign: 'Scorpio' })).toBe(true);
  });

  it('keeps showing a real ascendant', () => {
    expect(isRisingTrustworthy(PLACED)).toBe(true);
    expect(resolveTrustedRisingSign(PLACED)).toBe('Scorpio');
  });
});

describe('asking for the birth city, and only when it would help', () => {
  const SET_ASIDE = {
    birthTime: '14:30',
    birthLatitude: null,
    birthLongitude: null,
    storedRisingSign: null,
    unconfirmedRisingSign: 'Scorpio',
  };

  it('asks when there is a set-aside ascendant and no place', () => {
    expect(risingNeedsLocationConfirmation(SET_ASIDE)).toBe(true);
  });

  it('reads the set-aside placement from the chart too', () => {
    expect(
      risingNeedsLocationConfirmation({
        birthTime: '14:30',
        birthLatitude: null,
        birthLongitude: null,
        birthChart: { rising: null, rising_unconfirmed: { sign: 'Scorpio', degree: 18 } },
      }),
    ).toBe(true);
  });

  it('does not ask someone who never gave a birth time', () => {
    // The city would not help them; the clock is what blocks. Sending them to
    // fix the wrong field is the mistake this whole state exists to avoid.
    expect(risingNeedsLocationConfirmation({ ...SET_ASIDE, birthTime: null })).toBe(false);
  });

  it('does not ask someone whose chart is fine', () => {
    expect(risingNeedsLocationConfirmation(PLACED)).toBe(false);
  });

  it('does not ask when there is nothing to recompute', () => {
    expect(
      risingNeedsLocationConfirmation({
        birthTime: '14:30',
        birthLatitude: null,
        birthLongitude: null,
      }),
    ).toBe(false);
  });

  it('stays silent for a caller that cannot see the coordinates', () => {
    // Failing towards "no CTA" is the safe direction: showing one to someone
    // whose chart is perfectly fine would be its own small lie.
    expect(
      risingNeedsLocationConfirmation({ birthTime: '14:30', unconfirmedRisingSign: 'Scorpio' }),
    ).toBe(false);
  });

  it('never returns the set-aside sign as a displayable placement', () => {
    expect(resolveTrustedRisingSign(SET_ASIDE)).toBeNull();
  });
});
