// Orb policy + aspect detection tests.
//
// Locks down:
//   - Base orb boundaries: detected exactly AT the orb, absent just beyond.
//   - Luminary bonus (+1°) and outer-outer tightening (−2°).
//   - Symmetry: detectAspect(l1, l2, a, b) === detectAspect(l2, l1, b, a).
//   - Determinism: identical inputs → identical outputs, run after run.
//   - No applying/separating flag is reported (see types.ts rationale).

import { describe, expect, it } from 'vitest';

import { angularSeparation, detectAspect } from '../aspects';
import {
  BASE_ORBS,
  LUMINARY_ORB_BONUS,
  MIN_ORB,
  OUTER_OUTER_ORB_PENALTY,
  resolveMaxOrb,
} from '../orbs';

describe('angularSeparation', () => {
  it('is symmetric and wraps 0/360 correctly', () => {
    expect(angularSeparation(10, 350)).toBeCloseTo(20, 10);
    expect(angularSeparation(350, 10)).toBeCloseTo(20, 10);
    expect(angularSeparation(0, 180)).toBeCloseTo(180, 10);
    expect(angularSeparation(0, 181)).toBeCloseTo(179, 10);
    expect(angularSeparation(359.5, 0.5)).toBeCloseTo(1, 10);
  });

  it('always lands in [0, 180]', () => {
    for (let a = 0; a < 360; a += 7.3) {
      for (let b = 0; b < 360; b += 11.9) {
        const sep = angularSeparation(a, b);
        expect(sep).toBeGreaterThanOrEqual(0);
        expect(sep).toBeLessThanOrEqual(180);
        expect(sep).toBeCloseTo(angularSeparation(b, a), 10);
      }
    }
  });
});

describe('orb policy (resolveMaxOrb)', () => {
  it('matches the documented base table', () => {
    expect(BASE_ORBS.conjunction).toBe(8);
    expect(BASE_ORBS.opposition).toBe(8);
    expect(BASE_ORBS.square).toBe(7);
    expect(BASE_ORBS.trine).toBe(7);
    expect(BASE_ORBS.sextile).toBe(5);
    expect(resolveMaxOrb('conjunction')).toBe(8);
    expect(resolveMaxOrb('sextile')).toBe(5);
  });

  it('widens by the luminary bonus when Sun or Moon is involved', () => {
    expect(resolveMaxOrb('conjunction', 'sun', 'mars')).toBe(8 + LUMINARY_ORB_BONUS);
    expect(resolveMaxOrb('trine', 'venus', 'moon')).toBe(7 + LUMINARY_ORB_BONUS);
    // Two luminaries: the bonus applies once, not twice.
    expect(resolveMaxOrb('square', 'sun', 'moon')).toBe(7 + LUMINARY_ORB_BONUS);
  });

  it('tightens outer-outer pairs', () => {
    expect(resolveMaxOrb('conjunction', 'uranus', 'pluto')).toBe(8 - OUTER_OUTER_ORB_PENALTY);
    expect(resolveMaxOrb('sextile', 'neptune', 'pluto')).toBe(5 - OUTER_OUTER_ORB_PENALTY);
    // Outer × personal keeps the base orb.
    expect(resolveMaxOrb('conjunction', 'uranus', 'venus')).toBe(8);
    // Outer × luminary gets the luminary bonus (a luminary is not an outer).
    expect(resolveMaxOrb('conjunction', 'pluto', 'moon')).toBe(8 + LUMINARY_ORB_BONUS);
  });

  it('is symmetric in its body arguments', () => {
    const names = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const;
    const bodies = ['sun', 'moon', 'venus', 'mars', 'uranus', 'pluto', 'rising'] as const;
    for (const n of names) {
      for (const a of bodies) {
        for (const b of bodies) {
          expect(resolveMaxOrb(n, a, b)).toBe(resolveMaxOrb(n, b, a));
        }
      }
    }
  });

  it('never resolves below the floor', () => {
    expect(resolveMaxOrb('sextile', 'uranus', 'neptune')).toBeGreaterThanOrEqual(MIN_ORB);
  });
});

describe('detectAspect — base orb boundaries (no body context)', () => {
  const cases: Array<{ name: string; at: number; beyond: number }> = [
    { name: 'conjunction', at: 8, beyond: 8.01 },
    { name: 'sextile', at: 65, beyond: 65.01 }, // 60 + 5
    { name: 'square', at: 97, beyond: 97.01 }, // 90 + 7
    { name: 'trine', at: 127, beyond: 127.01 }, // 120 + 7
    { name: 'opposition', at: 172, beyond: 171.99 }, // 180 − 8
  ];

  for (const c of cases) {
    it(`${c.name}: detected at the exact orb edge`, () => {
      const aspect = detectAspect(0, c.at);
      expect(aspect).not.toBeNull();
      expect(aspect!.name).toBe(c.name);
      expect(aspect!.separation).toBeCloseTo(c.at, 2);
      expect(aspect!.orb).toBeLessThanOrEqual(aspect!.maxOrb);
    });

    it(`${c.name}: NOT detected just beyond the orb`, () => {
      expect(detectAspect(0, c.beyond)).toBeNull();
    });
  }

  it('sextile lower edge: 55° detected, 54.99° is nothing', () => {
    expect(detectAspect(0, 55)?.name).toBe('sextile');
    expect(detectAspect(0, 54.99)).toBeNull();
  });

  it('reports exact separation and orb', () => {
    const aspect = detectAspect(10, 132.5); // separation 122.5 → trine, orb 2.5
    expect(aspect).not.toBeNull();
    expect(aspect!.name).toBe('trine');
    expect(aspect!.angle).toBe(120);
    expect(aspect!.separation).toBeCloseTo(122.5, 2);
    expect(aspect!.orb).toBeCloseTo(2.5, 2);
    expect(aspect!.maxOrb).toBe(7);
  });

  it('does not expose an applying/separating flag', () => {
    const aspect = detectAspect(0, 3)!;
    expect('applying' in aspect).toBe(false);
    expect('separating' in aspect).toBe(false);
  });
});

describe('detectAspect — body-aware orbs', () => {
  it('luminary pair reaches 1° further', () => {
    // Separation 9°: out of orb for mars×venus (8), in orb for sun×mars (9).
    expect(detectAspect(0, 9, 'mars', 'venus')).toBeNull();
    const lum = detectAspect(0, 9, 'sun', 'mars');
    expect(lum?.name).toBe('conjunction');
    expect(lum?.maxOrb).toBe(9);
    // And 9.01° is out even for luminaries.
    expect(detectAspect(0, 9.01, 'sun', 'mars')).toBeNull();
  });

  it('outer-outer pair is tightened by 2°', () => {
    // Separation 6.5°: conjunction for uranus×venus (orb 8), nothing for
    // uranus×pluto (orb 6).
    expect(detectAspect(0, 6.5, 'uranus', 'venus')?.name).toBe('conjunction');
    expect(detectAspect(0, 6.5, 'uranus', 'pluto')).toBeNull();
    // Exactly at the tightened edge: still detected.
    expect(detectAspect(0, 6, 'uranus', 'pluto')?.name).toBe('conjunction');
    // Outer-outer sextile: 5 − 2 = 3°.
    expect(detectAspect(0, 63, 'neptune', 'pluto')?.name).toBe('sextile');
    expect(detectAspect(0, 63.01, 'neptune', 'pluto')).toBeNull();
  });

  it('is symmetric: swapping longitudes AND bodies gives an identical aspect', () => {
    const samples: Array<[number, number, 'sun' | 'uranus' | 'venus', 'pluto' | 'mars' | 'moon']> = [
      [12.3, 100.9, 'sun', 'mars'],
      [351.2, 4.7, 'uranus', 'pluto'],
      [200.5, 260.1, 'venus', 'moon'],
    ];
    for (const [l1, l2, a, b] of samples) {
      expect(detectAspect(l1, l2, a, b)).toEqual(detectAspect(l2, l1, b, a));
    }
  });

  it('is deterministic across repeated calls', () => {
    const first = detectAspect(33.33, 95.5, 'moon', 'saturn');
    for (let i = 0; i < 50; i++) {
      expect(detectAspect(33.33, 95.5, 'moon', 'saturn')).toEqual(first);
    }
  });

  it('without body context, behaves exactly like the base table', () => {
    // Same longitudes, no bodies → base orbs (no luminary widening).
    expect(detectAspect(0, 9)).toBeNull();
    expect(detectAspect(0, 8)?.name).toBe('conjunction');
  });
});
