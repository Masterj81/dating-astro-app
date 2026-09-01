import * as Astronomy from 'astronomy-engine';
import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';

// Which reference frame are JUNO's longitudes in?
//
// Western (tropical) astrology measures ecliptic longitude from the vernal
// point OF THE DATE. A chart computed against the fixed J2000 equinox is
// wrong by the accumulated precession — about 1° every 72 years, so roughly
// 0.4° for a 1990 birth and 0.36° the other way for 2026.
//
// That is small enough never to move a Sun sign, and large enough to move a
// degree readout and to flip a placement that sits within half a degree of a
// cusp. It is worth pinning down rather than assuming, because
// `astronomy-engine` mixes conventions across its API: `SunPosition` is
// documented as ecliptic-of-date, while `Ecliptic()` converts an equatorial
// vector using the J2000 ecliptic plane.
//
// The test is exact and needs no external ephemeris: AT the instant of the
// March equinox, the Sun's tropical longitude is 0° BY DEFINITION. Anything
// else is the frame offset, measured directly.

const YEARS = [1970, 1990, 2010, 2026];

/** Signed difference from 0°, in the range (-180, 180]. */
function offsetFromAries(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

describe('the reference frame of the longitudes', () => {
  it.each(YEARS)('the Sun reads 0° at the %i March equinox', (year) => {
    const equinox = Astronomy.Seasons(year).mar_equinox.date;
    const chart = computeNatalChart({
      date: equinox.toISOString().slice(0, 10),
      time: equinox.toISOString().slice(11, 16),
      timezone: 'UTC',
      latitude: 0,
      longitude: 0,
    });

    // Within 1 arc-minute of the vernal point. A J2000-referred longitude
    // would be off by ~0.4° here, which is 24 arc-minutes — this assertion
    // would fail loudly.
    expect(Math.abs(offsetFromAries(chart.sun.longitude))).toBeLessThan(1 / 60);
  });

  it('planets share the Sun\'s frame', () => {
    // If the Sun were of-date and the planets J2000, every planet would sit a
    // constant precession offset away from where an ephemeris puts it, and
    // aspects between the Sun and a planet would carry that error. Compare
    // the same body through both code paths at one instant.
    const t = Astronomy.MakeTime(new Date(Date.UTC(1990, 7, 5, 12, 30)));
    const viaEcliptic = Astronomy.Ecliptic(
      Astronomy.GeoVector(Astronomy.Body.Mars, t, true),
    ).elon;

    const chart = computeNatalChart({
      date: '1990-08-05',
      time: '12:30',
      timezone: 'UTC',
      latitude: 0,
      longitude: 0,
    });

    expect(chart.mars.longitude).toBeCloseTo(
      ((viaEcliptic % 360) + 360) % 360,
      2,
    );
  });
});
