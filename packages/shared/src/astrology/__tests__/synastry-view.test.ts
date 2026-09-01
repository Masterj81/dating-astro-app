import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import { hydrateStoredChart, toStoredBirthChart } from '../stored';
import {
  buildSynastryView,
  formatOrb,
  SYNASTRY_FRAME_ORDER,
  type SynastryAspectsView,
} from '../synastry-view';
import { SCORING_MODEL_VERSION } from '../version';

// Two real charts, computed rather than hand-written, so the aspects between
// them are whatever the sky actually did.
const CHART_A = computeNatalChart({
  date: '1990-08-05',
  time: '14:30',
  timezone: 'Europe/Paris',
  latitude: 48.8566,
  longitude: 2.3522,
});

const CHART_B = computeNatalChart({
  date: '1988-03-17',
  time: '09:15',
  timezone: 'Europe/Sofia',
  latitude: 42.6977,
  longitude: 23.3219,
});

const STORED_A = toStoredBirthChart(CHART_A);
const STORED_B = toStoredBirthChart(CHART_B);

/** A v1 row: no confidence, no timezone, no chartVersion. 74 of these exist. */
const LEGACY_A = {
  sun: CHART_A.sun,
  moon: CHART_A.moon,
  rising: CHART_A.rising,
  planets: {
    mercury: CHART_A.mercury,
    venus: CHART_A.venus,
    mars: CHART_A.mars,
    jupiter: CHART_A.jupiter,
    saturn: CHART_A.saturn,
  },
  coordinates: { latitude: 48.8566, longitude: 2.3522 },
};

function asAspects(view: ReturnType<typeof buildSynastryView>): SynastryAspectsView {
  if (view.source !== 'aspects') {
    throw new Error(`expected an aspect view, got ${view.source}: ${JSON.stringify(view)}`);
  }
  return view;
}

describe('the real engine is what the screens get', () => {
  it('returns aspect-based frames for two usable charts', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    expect(view.frames.map((f) => f.frame)).toEqual([...SYNASTRY_FRAME_ORDER]);
    expect(view.modelVersion).toBe(SCORING_MODEL_VERSION);
  });

  it('scores are integers in 0..100', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    for (const frame of view.frames) {
      expect(Number.isInteger(frame.score)).toBe(true);
      expect(frame.score).toBeGreaterThanOrEqual(0);
      expect(frame.score).toBeLessThanOrEqual(100);
    }
  });

  it('the headline is the love frame, not whichever came first', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    expect(view.headline.frame).toBe('love');
    expect(view.headline.score).toBe(
      view.frames.find((f) => f.frame === 'love')?.score,
    );
  });

  it('DEPENDS ON THE DEGREES, which the sign-based reading never did', () => {
    // The whole point. Move one chart by three days: the Sun stays in the same
    // sign, so `calculateSunCompatibility` would return an identical score —
    // while the actual geometry, and therefore this score, changes.
    const shifted = toStoredBirthChart(
      computeNatalChart({
        date: '1988-03-20',
        time: '09:15',
        timezone: 'Europe/Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
      }),
    );
    expect(shifted.sun.sign).toBe(STORED_B.sun.sign); // same sign
    const before = asAspects(buildSynastryView(STORED_A, STORED_B));
    const after = asAspects(buildSynastryView(STORED_A, shifted));
    const changed = SYNASTRY_FRAME_ORDER.some(
      (frame) =>
        before.frames.find((f) => f.frame === frame)?.score !==
        after.frames.find((f) => f.frame === frame)?.score,
    );
    expect(changed).toBe(true);
  });

  it('is order-invariant', () => {
    const ab = asAspects(buildSynastryView(STORED_A, STORED_B));
    const ba = asAspects(buildSynastryView(STORED_B, STORED_A));
    for (const frame of SYNASTRY_FRAME_ORDER) {
      expect(ab.frames.find((f) => f.frame === frame)?.score).toBe(
        ba.frames.find((f) => f.frame === frame)?.score,
      );
    }
  });

  it('is deterministic', () => {
    expect(buildSynastryView(STORED_A, STORED_B)).toEqual(
      buildSynastryView(STORED_A, STORED_B),
    );
  });
});

describe('the band vocabulary the UI already has copy for', () => {
  const UI_BANDS = ['exceptional', 'strong', 'promising', 'mixed', 'growth', 'different'];

  it('every frame maps onto a band the screens can translate', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    for (const frame of view.frames) {
      expect(UI_BANDS).toContain(frame.band);
    }
  });

  it('keeps the engine band alongside, for telemetry', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    for (const frame of view.frames) {
      expect(typeof frame.engineBand).toBe('string');
      expect(frame.engineBand.length).toBeGreaterThan(0);
    }
  });
});

describe('a missing chart is said, never scored around', () => {
  it('names which side is missing', () => {
    expect(buildSynastryView(null, STORED_B)).toEqual({
      source: 'sign-rhythm',
      reason: 'missing_own_chart',
    });
    expect(buildSynastryView(STORED_A, null)).toEqual({
      source: 'sign-rhythm',
      reason: 'missing_other_chart',
    });
    expect(buildSynastryView(null, null)).toEqual({
      source: 'sign-rhythm',
      reason: 'missing_both_charts',
    });
  });

  it('treats a row too partial to hydrate as missing, not as zero', () => {
    // No Moon: `hydrateStoredChart` refuses it. Scoring it would mean scoring
    // a chart we cannot read.
    const partial = { sun: CHART_A.sun, planets: {} };
    expect(buildSynastryView(partial, STORED_B)).toEqual({
      source: 'sign-rhythm',
      reason: 'missing_own_chart',
    });
  });

  it('carries NO score field at all in the fallback branch', () => {
    // The discriminated union is the guarantee: a screen cannot render an
    // aspect score it does not have, because the field does not exist.
    const view = buildSynastryView(null, STORED_B);
    expect('frames' in view).toBe(false);
    expect('headline' in view).toBe(false);
    expect('confidence' in view).toBe(false);
  });
});

describe('confidence reaches the reader', () => {
  it('flags a legacy chart as limited rather than certain', () => {
    // A v1 row hydrates to `medium` since 2026-09-01 (it used to be `high`).
    // 74 of 95 stored charts are v1, and they are the least trustworthy data
    // in the database — they came from the pipeline that used the device
    // timezone and substituted Montréal for an unknown birthplace.
    expect(hydrateStoredChart(LEGACY_A)?.confidence).toBe('medium');
    const view = asAspects(buildSynastryView(LEGACY_A, STORED_B));
    expect(view.confidence).toBe('medium');
    expect(view.isLimited).toBe(true);
  });

  it('caps a limited pairing below the top of the scale', () => {
    const view = asAspects(buildSynastryView(LEGACY_A, STORED_B));
    for (const frame of view.frames) {
      expect(frame.score).toBeLessThanOrEqual(92);
    }
  });

  it('does not flag two fully known charts', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    expect(view.confidence).toBe('high');
    expect(view.isLimited).toBe(false);
  });

  it('reports a missing ascendant so the screen can explain it', () => {
    const noTime = toStoredBirthChart(
      computeNatalChart({
        date: '1988-03-17',
        time: null,
        timezone: 'Europe/Sofia',
        latitude: 42.6977,
        longitude: 23.3219,
      }),
    );
    const view = asAspects(buildSynastryView(STORED_A, noTime));
    expect(view.missingAscendant).toBe(true);
    // And it still scores: losing the ascendant costs the "first impressions"
    // pairs, not the whole reading.
    expect(view.headline.score).toBeGreaterThan(0);
  });
});

describe('the aspects themselves', () => {
  it('exposes orb and max orb so the UI can show the geometry', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    const all = view.frames.flatMap((f) => f.topAspects);
    expect(all.length).toBeGreaterThan(0);
    for (const aspect of all) {
      expect(aspect.orb).toBeGreaterThanOrEqual(0);
      expect(aspect.orb).toBeLessThanOrEqual(aspect.maxOrb);
      expect(['conjunction', 'sextile', 'square', 'trine', 'opposition']).toContain(aspect.name);
    }
  });

  it('never lets an interpretive outer-planet contact move a score', () => {
    const view = asAspects(buildSynastryView(STORED_A, STORED_B));
    for (const aspect of view.interpretiveAspects) {
      expect(aspect.contribution).toBe(0);
    }
  });

  it('formats an orb to one decimal', () => {
    expect(formatOrb(2.44)).toBe('2.4°');
    expect(formatOrb(0)).toBe('0.0°');
    expect(formatOrb(7.96)).toBe('8.0°');
  });
});
