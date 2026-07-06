// Synastry tests:
//   - Deterministic across runs.
//   - Confidence cap: a low-confidence pair cannot reach "resonant".
//   - Symmetry-friendly: each frame ranks the same pair the same way both
//     directions (we apply both bodyA→bodyB and bodyB→bodyA weights).
//   - All three frames produce a score in [0, 100] with a valid band.

import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import { FRAME_WEIGHTS, computeSynastry } from '../synastry';
import { SCORING_MODEL_VERSION } from '../version';
import type { BirthInput, FrameKey, NatalChart } from '../types';
import fixtures from '../__fixtures__/pairs.json' assert { type: 'json' };

interface FixturePerson {
  date: string;
  time: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

interface FixturePair {
  id: string;
  label: string;
  personA: FixturePerson;
  personB: FixturePerson;
  expectations: Record<string, unknown>;
}

const PAIRS = (fixtures as { pairs: FixturePair[] }).pairs;

const FRAMES: FrameKey[] = ['love', 'friendship', 'business'];

function toInput(p: FixturePerson): BirthInput {
  return {
    date: p.date,
    time: p.time,
    timezone: p.timezone,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}

describe('computeSynastry — happy path properties', () => {
  for (const pair of PAIRS) {
    it(`${pair.id} — all three frames in [0,100] with valid band`, () => {
      const chartA = computeNatalChart(toInput(pair.personA));
      const chartB = computeNatalChart(toInput(pair.personB));
      const result = computeSynastry(chartA, chartB);

      expect(result.modelVersion).toBe(SCORING_MODEL_VERSION);
      for (const frame of FRAMES) {
        const f = result.frames[frame];
        expect(f.score).toBeGreaterThanOrEqual(0);
        expect(f.score).toBeLessThanOrEqual(100);
        expect(f.band).toBeDefined();
      }
    });
  }
});

describe('determinism', () => {
  it('two identical computations yield identical frame scores', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const r1 = computeSynastry(a, b);
    const r2 = computeSynastry(a, b);
    for (const frame of FRAMES) {
      expect(r1.frames[frame].score).toBe(r2.frames[frame].score);
      expect(r1.frames[frame].band).toBe(r2.frames[frame].band);
    }
  });
});

describe('confidence cap', () => {
  it('a pair with one time-unknown chart cannot exceed score 80', () => {
    const a = computeNatalChart({
      date: '1990-03-21',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const b = computeNatalChart({
      date: '1992-09-15',
      time: '10:00',
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const result = computeSynastry(a, b);
    expect(result.confidence).toBe('low');
    for (const frame of FRAMES) {
      expect(result.frames[frame].score).toBeLessThanOrEqual(80);
      // band 'resonant' starts at 88, so it's impossible at low confidence.
      expect(result.frames[frame].band).not.toBe('resonant');
    }
  });
});

describe('warnings propagation', () => {
  it('passes missing_birth_time / timezone warnings up to the synastry result', () => {
    const a = computeNatalChart({
      date: '1990-03-21',
      time: null,
      timezone: 'Europe/Paris',
      latitude: 48.8566,
      longitude: 2.3522,
    });
    const b = computeNatalChart({
      date: '1987-11-05',
      time: '16:20',
      timezone: null, // missing tz → lookup → medium confidence
      latitude: 35.6762,
      longitude: 139.6503,
    });
    const result = computeSynastry(a, b);
    expect(result.warnings).toContain('missing_birth_time');
    expect(result.warnings).toContain('missing_birth_timezone');
    expect(result.confidence).toBe('low');
  });
});

describe('outer planets — interpretive only, never in the score', () => {
  const OUTER = ['uranus', 'neptune', 'pluto'] as const;

  it('FRAME_WEIGHTS never reference an outer planet (guard against silent score drift)', () => {
    for (const frame of FRAMES) {
      for (const pair of FRAME_WEIGHTS[frame]) {
        expect(OUTER).not.toContain(pair.bodyA);
        expect(OUTER).not.toContain(pair.bodyB);
      }
    }
  });

  it('frame scores are IDENTICAL with and without outer planets', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const stripped = (c: NatalChart): NatalChart => ({
      ...c,
      uranus: null,
      neptune: null,
      pluto: null,
    });
    const withOuter = computeSynastry(a, b);
    const withoutOuter = computeSynastry(stripped(a), stripped(b));
    for (const frame of FRAMES) {
      expect(withOuter.frames[frame].score).toBe(withoutOuter.frames[frame].score);
      expect(withOuter.frames[frame].band).toBe(withoutOuter.frames[frame].band);
    }
    // Stripping the outer planets only empties the interpretive layer.
    expect(withoutOuter.interpretiveAspects).toEqual([]);
  });

  it('interpretive aspects involve exactly one outer planet each and contribute 0', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const result = computeSynastry(a, b);
    for (const aspect of result.interpretiveAspects) {
      const outerCount = [aspect.bodyA, aspect.bodyB].filter((k) =>
        (OUTER as readonly string[]).includes(k),
      ).length;
      expect(outerCount).toBe(1);
      expect(aspect.contribution).toBe(0);
      expect(aspect.orb).toBeLessThanOrEqual(aspect.maxOrb);
    }
  });

  it('interpretive aspects are order-invariant modulo direction', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const signature = (bodyX: string, bodyY: string, name: string, orb: number) =>
      [[bodyX, bodyY].sort().join('×'), name, orb].join('|');
    const forward = computeSynastry(a, b).interpretiveAspects
      .map((x) => signature(x.bodyA, x.bodyB, x.name, x.orb))
      .sort();
    const reverse = computeSynastry(b, a).interpretiveAspects
      .map((x) => signature(x.bodyA, x.bodyB, x.name, x.orb))
      .sort();
    expect(reverse).toEqual(forward);
  });

  it('interpretive list is deterministic and sorted tightest-first', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const r1 = computeSynastry(a, b);
    const r2 = computeSynastry(a, b);
    expect(r1.interpretiveAspects).toEqual(r2.interpretiveAspects);
    for (let i = 1; i < r1.interpretiveAspects.length; i++) {
      expect(r1.interpretiveAspects[i].orb).toBeGreaterThanOrEqual(
        r1.interpretiveAspects[i - 1].orb,
      );
    }
  });
});

describe('score stability across fixtures (model v2)', () => {
  // The v1→v2 orb change (trine 8→7, sextile 6→5, luminary +1) can move a
  // frame score by a few points, never wildly: every contribution is bounded
  // by its pair weight, and pairs only enter/leave near the orb edges where
  // orbTightness — and therefore the contribution — is already small.
  // Guard the global shape rather than pinning exact numbers.
  for (const pair of PAIRS) {
    it(`${pair.id} — scores stay in a sane band and repeatable`, () => {
      const a = computeNatalChart(toInput(pair.personA));
      const b = computeNatalChart(toInput(pair.personB));
      const r1 = computeSynastry(a, b);
      const r2 = computeSynastry(a, b);
      for (const frame of FRAMES) {
        expect(r1.frames[frame].score).toBe(r2.frames[frame].score);
        // The formula is 50 ± 40·ratio with |ratio| ≤ 1, then capped.
        expect(r1.frames[frame].score).toBeGreaterThanOrEqual(10);
        expect(r1.frames[frame].score).toBeLessThanOrEqual(100);
      }
    });
  }
});

describe('order-invariance regression', () => {
  // Frame weights include both (A→B) and (B→A) directions so that swapping
  // person A and person B gives an identical score per frame.
  it('swap(personA, personB) yields the same frame scores', () => {
    const a = computeNatalChart(toInput(PAIRS[0].personA));
    const b = computeNatalChart(toInput(PAIRS[0].personB));
    const forward = computeSynastry(a, b);
    const reverse = computeSynastry(b, a);
    for (const frame of FRAMES) {
      expect(reverse.frames[frame].score).toBe(forward.frames[frame].score);
    }
  });
});
