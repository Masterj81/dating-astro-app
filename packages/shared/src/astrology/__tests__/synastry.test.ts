// Synastry tests:
//   - Deterministic across runs.
//   - Confidence cap: a low-confidence pair cannot reach "resonant".
//   - Symmetry-friendly: each frame ranks the same pair the same way both
//     directions (we apply both bodyA→bodyB and bodyB→bodyA weights).
//   - All three frames produce a score in [0, 100] with a valid band.

import { describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';
import { computeSynastry } from '../synastry';
import { SCORING_MODEL_VERSION } from '../version';
import type { BirthInput, FrameKey } from '../types';
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
