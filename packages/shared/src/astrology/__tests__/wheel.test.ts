import { describe, expect, it } from 'vitest';

import { computeNatalChart, ZODIAC_SIGNS } from '../chart';
import { resolveTrustedMidheaven } from '../houses';
import {
  buildNatalWheelData,
  glyphOffsetDegrees,
  WHEEL_BODIES,
  wheelInternals,
} from '../wheel';

const FULL_BIRTH = {
  date: '1990-08-05',
  time: '14:30',
  timezone: 'Europe/Paris',
  latitude: 48.8566,
  longitude: 2.3522,
};

const CHART = computeNatalChart(FULL_BIRTH);

const NO_TIME = computeNatalChart({ ...FULL_BIRTH, time: null });
const NO_PLACE = computeNatalChart({ ...FULL_BIRTH, latitude: null, longitude: null });

const SIZE = 320;
const CENTER = SIZE / 2;

/** Distance from the wheel centre. */
function radiusOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x - CENTER, point.y - CENTER);
}

/** Screen angle of a point, degrees, math convention (0 = right, CCW). */
function angleOf(point: { x: number; y: number }): number {
  const deg = (Math.atan2(CENTER - point.y, point.x - CENTER) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

describe('orientation: the ascendant is on the left, longitude runs counter-clockwise', () => {
  it('puts the ascendant at 180° — the left of the wheel', () => {
    const wheel = buildNatalWheelData(CHART, {
      size: SIZE,
      rising: CHART.rising,
      cusps: CHART.houses,
    });
    expect(wheel.anchor).toBe('ascendant');
    const asc = wheel.angles.find((a) => a.key === 'asc');
    expect(asc).toBeTruthy();
    expect(asc!.angle).toBeCloseTo(180, 6);
    // And geometrically: left of centre, level with it.
    expect(asc!.outer.x).toBeLessThan(CENTER);
    expect(asc!.outer.y).toBeCloseTo(CENTER, 1);
  });

  it('anchors on 0° Aries when there is no ascendant, and says so', () => {
    const wheel = buildNatalWheelData(NO_TIME, { size: SIZE, rising: NO_TIME.rising });
    expect(wheel.anchor).toBe('aries');
    expect(wheel.zodiac[0].startAngle).toBeCloseTo(180, 6);
  });

  it('advances counter-clockwise as longitude increases', () => {
    // Aries starts at the left; Taurus must be 30° further round, and on
    // screen that means BELOW the left-hand point (y grows downward).
    const wheel = buildNatalWheelData(null, { size: SIZE });
    const aries = wheel.zodiac[0];
    const taurus = wheel.zodiac[1];
    expect(wheelInternals.norm360(taurus.startAngle - aries.startAngle)).toBeCloseTo(30, 6);
    expect(taurus.divider.outer.y).toBeGreaterThan(aries.divider.outer.y);
  });
});

describe('the zodiac ring', () => {
  const wheel = buildNatalWheelData(null, { size: SIZE });

  it('has twelve sectors in the canonical order', () => {
    expect(wheel.zodiac.map((s) => s.sign)).toEqual([...ZODIAC_SIGNS]);
  });

  it('gives every sector exactly thirty degrees', () => {
    for (const sector of wheel.zodiac) {
      expect(wheelInternals.norm360(sector.endAngle - sector.startAngle)).toBeCloseTo(30, 6);
    }
  });

  it('keeps every label inside the zodiac band', () => {
    for (const sector of wheel.zodiac) {
      const r = radiusOf(sector.label);
      expect(r).toBeGreaterThan(wheel.geometry.zodiacInner - 1);
      expect(r).toBeLessThan(wheel.geometry.zodiacOuter + 1);
    }
  });
});

describe('the cardinal points land where they should', () => {
  // Anchored on Aries so the mapping is unambiguous: 0° Aries at the left,
  // then counter-clockwise. Screen y grows downward.
  const cases = [
    { longitude: 0, name: '0° Aries', expect: 'left' },
    { longitude: 90, name: '0° Cancer', expect: 'bottom' },
    { longitude: 180, name: '0° Libra', expect: 'right' },
    { longitude: 270, name: '0° Capricorn', expect: 'top' },
  ] as const;

  it.each(cases)('$name sits at the $expect', ({ longitude, expect: where }) => {
    const single = {
      ...CHART,
      sun: { sign: 'Aries' as const, degree: 0, longitude },
      moon: null,
      mercury: null,
      venus: null,
      mars: null,
      jupiter: null,
      saturn: null,
      uranus: null,
      neptune: null,
      pluto: null,
    };
    const wheel = buildNatalWheelData(single as never, { size: SIZE, showAspects: false });
    const sun = wheel.planets.find((p) => p.key === 'sun');
    expect(sun).toBeTruthy();
    const { x, y } = sun!.glyph;
    if (where === 'left') {
      expect(x).toBeLessThan(CENTER);
      expect(y).toBeCloseTo(CENTER, 1);
    } else if (where === 'bottom') {
      expect(y).toBeGreaterThan(CENTER);
      expect(x).toBeCloseTo(CENTER, 1);
    } else if (where === 'right') {
      expect(x).toBeGreaterThan(CENTER);
      expect(y).toBeCloseTo(CENTER, 1);
    } else {
      expect(y).toBeLessThan(CENTER);
      expect(x).toBeCloseTo(CENTER, 1);
    }
  });
});

describe('planets: present ones are placed, absent ones are absent', () => {
  it('plots every body a complete chart carries', () => {
    const wheel = buildNatalWheelData(CHART, { size: SIZE });
    expect(wheel.planets.map((p) => p.key).sort()).toEqual([...WHEEL_BODIES].sort());
  });

  it('omits a legacy null rather than inventing a position', () => {
    // A pre-v2 stored chart has no outer planets. They must vanish from the
    // wheel, not appear at 0° Aries.
    const legacy = { ...CHART, uranus: null, neptune: null, pluto: null };
    const wheel = buildNatalWheelData(legacy, { size: SIZE });
    const keys = wheel.planets.map((p) => p.key);
    expect(keys).not.toContain('uranus');
    expect(keys).not.toContain('neptune');
    expect(keys).not.toContain('pluto');
    expect(keys).toHaveLength(7);
  });

  it('draws nothing at all for a null chart', () => {
    const wheel = buildNatalWheelData(null, { size: SIZE });
    expect(wheel.planets).toEqual([]);
    expect(wheel.aspects).toEqual([]);
    // The zodiac ring still exists — it is not a claim about anyone.
    expect(wheel.zodiac).toHaveLength(12);
  });

  it('keeps the tick on the TRUE longitude even when the glyph moves', () => {
    // The anchor must match what the wheel was built with — passing `rising`
    // here and comparing against an Aries-anchored wheel would only prove the
    // test was wrong.
    const wheel = buildNatalWheelData(CHART, { size: SIZE, rising: CHART.rising });
    for (const planet of wheel.planets) {
      const expected = wheelInternals.screenAngle(planet.longitude, CHART.rising!.longitude);
      expect(angleOf(planet.tickOuter)).toBeCloseTo(expected, 1);
    }
  });

  it('re-anchors every tick when the wheel turns on Aries instead', () => {
    const wheel = buildNatalWheelData(CHART, { size: SIZE });
    expect(wheel.anchor).toBe('aries');
    for (const planet of wheel.planets) {
      expect(angleOf(planet.tickOuter)).toBeCloseTo(
        wheelInternals.screenAngle(planet.longitude, 0),
        1,
      );
    }
  });
});

describe('de-clustering: a stellium stays readable without lying', () => {
  /** Four bodies within four degrees — unreadable if drawn where they are. */
  const STELLIUM = {
    ...CHART,
    sun: { sign: 'Leo' as const, degree: 12, longitude: 132 },
    moon: { sign: 'Leo' as const, degree: 13, longitude: 133 },
    mercury: { sign: 'Leo' as const, degree: 14, longitude: 134 },
    venus: { sign: 'Leo' as const, degree: 15, longitude: 135 },
    mars: null,
    jupiter: null,
    saturn: null,
    uranus: null,
    neptune: null,
    pluto: null,
  };

  it('separates the glyphs by at least the minimum', () => {
    const wheel = buildNatalWheelData(STELLIUM as never, {
      size: SIZE,
      rising: CHART.rising,
      minGlyphSeparation: 7,
      showAspects: false,
    });
    const angles = wheel.planets.map((p) => angleOf(p.glyph)).sort((a, b) => a - b);
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeGreaterThan(6);
    }
  });

  it('flags the moved glyphs so a leader line can be drawn', () => {
    const wheel = buildNatalWheelData(STELLIUM as never, {
      size: SIZE,
      rising: CHART.rising,
      showAspects: false,
    });
    expect(wheel.planets.some((p) => p.nudged)).toBe(true);
    for (const planet of wheel.planets) {
      const offset = glyphOffsetDegrees(planet, wheel.geometry);
      if (!planet.nudged) expect(offset).toBeLessThan(0.01);
    }
  });

  it('does not move anything in a well-spread chart', () => {
    const spread = {
      ...CHART,
      sun: { sign: 'Aries' as const, degree: 0, longitude: 0 },
      moon: { sign: 'Cancer' as const, degree: 0, longitude: 90 },
      mercury: { sign: 'Libra' as const, degree: 0, longitude: 180 },
      venus: { sign: 'Capricorn' as const, degree: 0, longitude: 270 },
      mars: null, jupiter: null, saturn: null,
      uranus: null, neptune: null, pluto: null,
    };
    const wheel = buildNatalWheelData(spread as never, { size: SIZE, showAspects: false });
    expect(wheel.planets.every((p) => !p.nudged)).toBe(true);
  });
});

describe('angles and houses appear only when they were proven', () => {
  it('draws both for a complete chart', () => {
    const wheel = buildNatalWheelData(CHART, {
      size: SIZE,
      rising: CHART.rising,
      mc: resolveTrustedMidheaven({
        birthTime: FULL_BIRTH.time,
        birthLatitude: FULL_BIRTH.latitude,
        birthLongitude: FULL_BIRTH.longitude,
        birthChart: CHART,
      }),
      cusps: CHART.houses,
    });
    expect(wheel.angles.map((a) => a.key).sort()).toEqual(['asc', 'mc']);
    expect(wheel.houses).toHaveLength(12);
    expect(wheel.houses.map((h) => h.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('draws neither without a birth time', () => {
    const wheel = buildNatalWheelData(NO_TIME, {
      size: SIZE,
      rising: NO_TIME.rising,
      mc: NO_TIME.mc,
      cusps: NO_TIME.houses,
    });
    expect(wheel.angles).toEqual([]);
    expect(wheel.houses).toEqual([]);
    // The planets are still there: they never depended on the clock.
    expect(wheel.planets.length).toBeGreaterThan(0);
  });

  it('draws neither without a birthplace', () => {
    const wheel = buildNatalWheelData(NO_PLACE, {
      size: SIZE,
      rising: NO_PLACE.rising,
      mc: NO_PLACE.mc,
      cusps: NO_PLACE.houses,
    });
    expect(wheel.angles).toEqual([]);
    expect(wheel.houses).toEqual([]);
    expect(wheel.planets.length).toBeGreaterThan(0);
  });

  it('refuses a malformed cusp array rather than drawing part of a ring', () => {
    const wheel = buildNatalWheelData(CHART, {
      size: SIZE,
      rising: CHART.rising,
      cusps: [1, 2, 3],
    });
    expect(wheel.houses).toEqual([]);
  });

  it('puts the first house below the ascendant', () => {
    // Houses run counter-clockwise from the ASC at the left, so the middle of
    // the first house is below and left of centre.
    const wheel = buildNatalWheelData(CHART, {
      size: SIZE,
      rising: CHART.rising,
      cusps: CHART.houses,
    });
    const first = wheel.houses[0];
    expect(first.numberAt.y).toBeGreaterThan(CENTER);
    expect(first.numberAt.x).toBeLessThan(CENTER);
  });
});

describe('aspects', () => {
  /** Exactly 120° apart — a trine, well inside orb. */
  const TIGHT = {
    ...CHART,
    sun: { sign: 'Aries' as const, degree: 0, longitude: 0 },
    moon: { sign: 'Leo' as const, degree: 0, longitude: 120 },
    mercury: null, venus: null, mars: null, jupiter: null,
    saturn: null, uranus: null, neptune: null, pluto: null,
  };

  /** 100° apart — no major aspect has an orb that wide. */
  const OUT_OF_ORB = {
    ...TIGHT,
    moon: { sign: 'Cancer' as const, degree: 10, longitude: 100 },
  };

  it('draws a chord for a tight aspect', () => {
    const wheel = buildNatalWheelData(TIGHT as never, { size: SIZE });
    expect(wheel.aspects).toHaveLength(1);
    expect(wheel.aspects[0].name).toBe('trine');
    expect(wheel.aspects[0].kind).toBe('harmonious');
    expect(wheel.aspects[0].orb).toBeCloseTo(0, 6);
  });

  it('draws nothing for a separation outside every orb', () => {
    const wheel = buildNatalWheelData(OUT_OF_ORB as never, { size: SIZE });
    expect(wheel.aspects).toEqual([]);
  });

  it('anchors chords on the TRUE positions, not the nudged glyphs', () => {
    const wheel = buildNatalWheelData(TIGHT as never, { size: SIZE });
    const chord = wheel.aspects[0];
    const sun = wheel.planets.find((p) => p.key === 'sun')!;
    expect(angleOf(chord.from)).toBeCloseTo(sun.angle, 1);
  });

  it('keeps only the tightest, so the hub stays readable', () => {
    const wheel = buildNatalWheelData(CHART, { size: SIZE, maxAspects: 3 });
    expect(wheel.aspects.length).toBeLessThanOrEqual(3);
    const orbs = wheel.aspects.map((a) => a.orb);
    expect([...orbs].sort((a, b) => a - b)).toEqual(orbs);
  });

  it('can be turned off entirely', () => {
    expect(buildNatalWheelData(CHART, { size: SIZE, showAspects: false }).aspects).toEqual([]);
  });

  it('never draws an aspect to a body the chart does not carry', () => {
    const legacy = { ...CHART, pluto: null };
    const wheel = buildNatalWheelData(legacy, { size: SIZE, maxAspects: 50 });
    for (const aspect of wheel.aspects) {
      expect(aspect.bodyA).not.toBe('pluto');
      expect(aspect.bodyB).not.toBe('pluto');
    }
  });
});

describe('geometry is deterministic and scales', () => {
  it('is identical across two calls', () => {
    const options = { size: SIZE, rising: CHART.rising, cusps: CHART.houses };
    expect(buildNatalWheelData(CHART, options)).toEqual(buildNatalWheelData(CHART, options));
  });

  it('keeps every drawn point inside the viewport', () => {
    const wheel = buildNatalWheelData(CHART, {
      size: SIZE,
      rising: CHART.rising,
      mc: CHART.mc,
      cusps: CHART.houses,
    });
    const points = [
      ...wheel.planets.flatMap((p) => [p.glyph, p.tickInner, p.tickOuter]),
      ...wheel.houses.flatMap((h) => [h.inner, h.outer, h.numberAt]),
      ...wheel.zodiac.flatMap((z) => [z.label, z.divider.inner, z.divider.outer]),
      ...wheel.aspects.flatMap((a) => [a.from, a.to]),
    ];
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(SIZE);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(SIZE);
    }
  });

  it('scales linearly with size', () => {
    const small = buildNatalWheelData(CHART, { size: 200, rising: CHART.rising });
    const large = buildNatalWheelData(CHART, { size: 400, rising: CHART.rising });
    expect(large.geometry.planetRadius).toBeCloseTo(small.geometry.planetRadius * 2, 6);
  });
});
