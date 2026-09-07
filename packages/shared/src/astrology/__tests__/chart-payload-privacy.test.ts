// JUNO-01 — what `get-profile-chart` is allowed to publish about someone else.
//
// This suite executes the ACTUAL edge-function source (see
// packages/shared/src/testing/edge-source.ts). It is not a fixture: rename or
// weaken a declaration in `supabase/functions/get-profile-chart/index.ts` and
// these tests fail rather than keep passing against a copy.
//
// WHAT WAS WRONG, RESTATED SO THE ASSERTIONS BELOW READ AS ANSWERS
// ----------------------------------------------------------------
// The response used to carry `longitude` at full float64 precision on `sun`,
// `moon`, `rising`, `mc`, every planet, and the twelve `houses`. Those numbers
// are exactly invertible:
//
//     moon.longitude   → the birth instant, to the second
//     mc.longitude     → the birth longitude (MC = f(instant, longitude))
//     rising.longitude → the birth latitude
//
// Beside them sat `coordinates`, rounded to 0.5° "so reverse-engineering the
// target's exact birth location is not practical". The blur was decorative.
//
// The first test below reproduces that inversion against the real engine and
// asserts it still works on RAW values — because a privacy control you cannot
// demonstrate breaking is a privacy control you cannot demonstrate fixing. Every
// test after it asserts the published payload no longer carries what it needs.

import * as Astronomy from 'astronomy-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { cleanupEdgeModules, loadEdgeModule, readRepoFile } from '../../testing/edge-source';
import { ZODIAC_SIGNS, computeNatalChart, longitudeToPlacement, placementToLongitude } from '../chart';
import { hydrateStoredChart } from '../stored';
import { computeSynastry } from '../synastry';
import type { NatalChart, Placement, PlacementKey } from '../types';

const EDGE_FILE = 'supabase/functions/get-profile-chart/index.ts';

type PublicPlacement = { sign: string; degree?: number };
type EdgeModule = {
  CHART_DEGREE_QUANTUM: number;
  PUBLISH_LEGACY_DEGREES: boolean;
  SYNASTRY_ORB_QUANTUM: number;
  getZodiacSign: (lon: number) => string;
  getDegreeInSign: (lon: number) => number;
  quantizeDegree: (degreeInSign: number) => number;
  toPublicPlacement: (longitude: number) => PublicPlacement;
  buildPublicChart: (input: {
    sunLongitude: number;
    moonLongitude: number;
    ascLongitude: number | null;
    mcLongitude: number | null;
    planets: Record<string, { longitude: number }>;
    confidence: 'high' | 'medium' | 'low';
  }) => Record<string, unknown>;
  withRoundedOrbs: <T>(view: T) => T;
  calculateAscendant: (time: unknown, lat: number, lng: number) => number;
  calculateMidheaven: (time: unknown, lng: number) => number;
  getGeocentricLongitude: (body: string, time: unknown) => number;
};

let edge: EdgeModule;

beforeAll(async () => {
  edge = await loadEdgeModule<EdgeModule>({
    file: EDGE_FILE,
    label: 'get-profile-chart-payload',
    preamble: ["import * as Astronomy from 'astronomy-engine';"],
    declarations: [
      'ZODIAC_SIGNS',
      'getZodiacSign',
      'getDegreeInSign',
      'getGeocentricLongitude',
      'calculateAscendant',
      'calculateMidheaven',
      'CHART_DEGREE_QUANTUM',
      'CHART_DEGREE_DECIMALS',
      'PUBLISH_LEGACY_DEGREES',
      'quantizeDegree',
      'toPublicPlacement',
      'buildPublicChart',
      'SYNASTRY_ORB_QUANTUM',
      'QUANTISED_ASPECT_FIELDS',
      'withRoundedOrbs',
    ],
  });
});

afterAll(() => cleanupEdgeModules());

// ---------------------------------------------------------------------------
// A private birth record. Fictional, and the only one used anywhere here.
// ---------------------------------------------------------------------------
const SECRET = {
  utc: new Date(Date.UTC(1994, 6, 14, 3, 47, 0)),
  latitude: 45.5017,
  longitude: -73.5673,
};

const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

const wrap = (d: number) => ((d % 360) + 360) % 360;
const signedDelta = (a: number, b: number) => {
  const d = wrap(a - b);
  return d > 180 ? d - 360 : d;
};

describe('JUNO-01 · the attack the fix exists to stop', () => {
  it('reconstructs the exact birth instant and coordinates from RAW longitudes', () => {
    const t0 = Astronomy.MakeTime(SECRET.utc);
    const raw = {
      moon: edge.getGeocentricLongitude('Moon', t0),
      sun: edge.getGeocentricLongitude('Sun', t0),
      mc: edge.calculateMidheaven(t0, SECRET.longitude),
      rising: edge.calculateAscendant(t0, SECRET.latitude, SECRET.longitude),
    };

    // Step 1 — the Sun narrows to a day, the Moon bisects to the instant.
    const moonAt = (ms: number) =>
      edge.getGeocentricLongitude('Moon', Astronomy.MakeTime(new Date(ms)));
    const sunAt = (ms: number) =>
      edge.getGeocentricLongitude('Sun', Astronomy.MakeTime(new Date(ms)));

    let recovered: number | null = null;
    for (let ms = Date.UTC(1994, 0, 1); ms < Date.UTC(1995, 0, 1); ms += 3600e3) {
      if (Math.abs(signedDelta(sunAt(ms), raw.sun)) > 0.6) continue;
      let lo = ms - 3600e3;
      let hi = ms + 3600e3;
      const f = (x: number) => signedDelta(moonAt(x), raw.moon);
      if (f(lo) * f(hi) > 0) continue;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (f(lo) * f(mid) <= 0) hi = mid;
        else lo = mid;
      }
      const candidate = (lo + hi) / 2;
      if (Math.abs(signedDelta(moonAt(candidate), raw.moon)) < 1e-9) {
        recovered = candidate;
        break;
      }
    }
    expect(recovered).not.toBeNull();
    expect(Math.abs((recovered as number) - SECRET.utc.getTime())).toBeLessThan(1000);

    // Step 2 — the MC depends only on the instant and the birth LONGITUDE.
    const tR = Astronomy.MakeTime(new Date(Math.round(recovered as number)));
    const fLon = (L: number) => signedDelta(edge.calculateMidheaven(tR, L), raw.mc);
    let lon: number | null = null;
    let prev = fLon(-180);
    let prevL = -180;
    for (let L = -179.9; L <= 180; L += 0.1) {
      const cur = fLon(L);
      if (prev < 0 !== cur < 0) {
        let a = prevL;
        let b = L;
        for (let i = 0; i < 200; i++) {
          const m = (a + b) / 2;
          if (fLon(a) < 0 !== fLon(m) < 0) b = m;
          else a = m;
        }
        const cand = (a + b) / 2;
        if (Math.abs(fLon(cand)) < 1e-7) { lon = cand; break; }
      }
      prev = cur;
      prevL = L;
    }
    expect(lon).not.toBeNull();
    expect(Math.abs((lon as number) - SECRET.longitude)).toBeLessThan(1e-6);

    // Step 3 — the ascendant then yields the LATITUDE.
    const fLat = (P: number) => signedDelta(edge.calculateAscendant(tR, P, lon as number), raw.rising);
    let lat: number | null = null;
    let prevF = fLat(-89.9);
    let prevP = -89.9;
    for (let P = -89.8; P <= 89.9; P += 0.1) {
      const cur = fLat(P);
      if (prevF < 0 !== cur < 0) {
        let a = prevP;
        let b = P;
        for (let i = 0; i < 200; i++) {
          const m = (a + b) / 2;
          if (fLat(a) < 0 !== fLat(m) < 0) b = m;
          else a = m;
        }
        const cand = (a + b) / 2;
        if (Math.abs(fLat(cand)) < 1e-7) { lat = cand; break; }
      }
      prevF = cur;
      prevP = P;
    }
    expect(lat).not.toBeNull();
    expect(Math.abs((lat as number) - SECRET.latitude)).toBeLessThan(1e-6);
  }, 120_000);
});

describe('JUNO-01 · the published payload', () => {
  const t0 = Astronomy.MakeTime(SECRET.utc);
  const buildRealPayload = () => {
    const planets: Record<string, { longitude: number; sign: string; degree: number }> = {};
    for (const body of BODIES.slice(2)) {
      const lon = edge.getGeocentricLongitude(body, t0);
      planets[body.toLowerCase()] = {
        longitude: lon,
        sign: edge.getZodiacSign(lon),
        degree: edge.getDegreeInSign(lon),
      };
    }
    return edge.buildPublicChart({
      sunLongitude: edge.getGeocentricLongitude('Sun', t0),
      moonLongitude: edge.getGeocentricLongitude('Moon', t0),
      ascLongitude: edge.calculateAscendant(t0, SECRET.latitude, SECRET.longitude),
      mcLongitude: edge.calculateMidheaven(t0, SECRET.longitude),
      planets,
      confidence: 'high',
    });
  };

  /** Every key/value pair in the payload, path-qualified. */
  function walk(node: unknown, at = '$'): Array<[string, unknown]> {
    if (Array.isArray(node)) return node.flatMap((v, i) => walk(v, `${at}[${i}]`));
    if (node && typeof node === 'object') {
      return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
        [[`${at}.${k}`, v] as [string, unknown], ...walk(v, `${at}.${k}`)],
      );
    }
    return [];
  }

  it('contains no `longitude` anywhere, at any depth', () => {
    const offenders = walk(buildRealPayload())
      .filter(([path]) => path.split('.').pop() === 'longitude');
    expect(offenders).toEqual([]);
  });

  it('contains no `coordinates` and no `houses`', () => {
    const paths = walk(buildRealPayload()).map(([p]) => p.split('.').pop());
    expect(paths).not.toContain('coordinates');
    expect(paths).not.toContain('houses');
  });

  it('publishes nothing but the whitelisted keys', () => {
    const payload = buildRealPayload() as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['confidence', 'mc', 'moon', 'planets', 'rising', 'sun'].sort(),
    );
    for (const key of ['sun', 'moon', 'rising', 'mc']) {
      const placement = payload[key] as Record<string, unknown> | null;
      if (placement === null) continue;
      const allowed = edge.PUBLISH_LEGACY_DEGREES ? ['degree', 'sign'] : ['sign'];
      expect(Object.keys(placement).sort()).toEqual(allowed);
    }
  });

  it('never carries a degree finer than the declared quantum', () => {
    if (!edge.PUBLISH_LEGACY_DEGREES) return;
    const degrees = walk(buildRealPayload())
      .filter(([path]) => path.split('.').pop() === 'degree')
      .map(([, v]) => v as number);
    expect(degrees.length).toBeGreaterThan(0);
    for (const degree of degrees) {
      const steps = degree / edge.CHART_DEGREE_QUANTUM;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      expect(degree).toBeGreaterThanOrEqual(0);
      expect(degree).toBeLessThan(30);
    }
  });

  it('quantises without letting 29.97° roll into the next sign', () => {
    // The bug this guards: quantising the LONGITUDE would push 29.96° of Aries
    // to 30.0°, which is Taurus, while `sign` still said Aries — a placement
    // that does not exist. Quantising the degree-in-sign and capping is why
    // the pair stays coherent.
    for (const degreeInSign of [29.999, 29.98, 29.95, 30 - 1e-12]) {
      const q = edge.quantizeDegree(degreeInSign);
      expect(q).toBeLessThan(30);
      expect(q).toBeGreaterThanOrEqual(0);
    }
    expect(edge.quantizeDegree(0)).toBe(0);
  });

  it('degrades the inversion from exact to a documented window', () => {
    // With the payload's precision, how well can the birth instant still be
    // pinned? This is the residual risk, asserted rather than asserted-about:
    // if a future change makes the payload sharper, this number moves and the
    // test says so.
    const payload = buildRealPayload() as Record<string, unknown>;
    if (!edge.PUBLISH_LEGACY_DEGREES) return;

    const published = new Map<string, number>();
    for (const body of BODIES) {
      const key = body.toLowerCase();
      const placement = (key === 'sun' || key === 'moon'
        ? payload[key]
        : (payload.planets as Record<string, unknown>)[key]) as PublicPlacement;
      published.set(body, placement.degree as number);
    }

    const matches = (ms: number) => {
      const t = Astronomy.MakeTime(new Date(ms));
      for (const body of BODIES) {
        const lon = edge.getGeocentricLongitude(body, t);
        if (edge.quantizeDegree(edge.getDegreeInSign(lon)) !== published.get(body)) return false;
      }
      return true;
    };

    let lo = Infinity;
    let hi = -Infinity;
    for (let d = -3600; d <= 3600; d += 5) {
      const ms = SECRET.utc.getTime() + d * 1000;
      if (matches(ms)) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    const windowMinutes = (hi - lo) / 60;

    // Documented in the edge function beside CHART_DEGREE_QUANTUM: ~±5 min at
    // 0.1°. Asserted as a floor, not an equality — the point is that the
    // instant is no longer EXACT, and that nobody can silently make it exact
    // again by publishing a finer degree.
    expect(windowMinutes).toBeGreaterThan(1);
    // And the raw inversion at the top of this file resolved to 0 seconds, so
    // this is a real change of kind, not of degree.
    expect(hi - lo).toBeGreaterThan(0);
  }, 120_000);

  it('rounds BOTH published angular measurements to display precision', () => {
    // The aspect list is its own channel: the reader knows their OWN chart, so
    // "your Sun trine their Moon, orb 2.34°" places their Moon to 0.01°.
    //
    // And `separation = angle ± orb` with `angle` a constant, so rounding one
    // while publishing the other raw hands the rounded one straight back.
    // `separation` is the sharper of the two — it IS the distance between the
    // two longitudes — and leaving it raw would have made moving the
    // computation server-side a step backwards.
    const view = {
      source: 'aspects',
      frames: [{
        frame: 'love',
        topAspects: [{
          orb: 2.3456789, separation: 122.3456789, angle: 120, maxOrb: 8, contribution: 0.61234,
        }],
      }],
      interpretiveAspects: [{ orb: 5.987654, separation: 174.012346 }],
      nested: { deep: [{ orb: 0.04, separation: 89.96 }] },
    };
    const rounded = edge.withRoundedOrbs(view) as typeof view;
    const top = rounded.frames[0].topAspects[0];
    expect(top.orb).toBe(2.3);
    expect(top.separation).toBe(122.3);
    expect(rounded.interpretiveAspects[0].orb).toBe(6);
    expect(rounded.interpretiveAspects[0].separation).toBe(174);
    expect(rounded.nested.deep[0].orb).toBe(0);
    expect(rounded.nested.deep[0].separation).toBe(90);

    // Untouched, and each for its own reason: `contribution` is a weight, not
    // a distance — rounding it would move the scores. `angle` and `maxOrb` are
    // constants from the aspect table and the orb policy, identical for every
    // pair, describing nobody's chart.
    expect(top.contribution).toBe(0.61234);
    expect(top.angle).toBe(120);
    expect(top.maxOrb).toBe(8);
  });

  it('leaves no angular field of a published aspect unquantised', () => {
    // A sweep over the REAL engine output rather than a fixture, so a numeric
    // field added to `Aspect` later is caught here instead of shipping raw.
    const rounded = edge.withRoundedOrbs({
      source: 'aspects',
      frames: [{
        topAspects: [{
          name: 'trine', angle: 120, separation: 122.34567, orb: 2.34567,
          maxOrb: 8, kind: 'harmonious', bodyA: 'sun', bodyB: 'moon',
          contribution: 0.5,
        }],
      }],
    }) as { frames: Array<{ topAspects: Array<Record<string, unknown>> }> };

    const aspect = rounded.frames[0].topAspects[0];
    const CONSTANTS = new Set(['angle', 'maxOrb', 'contribution']);
    for (const [key, value] of Object.entries(aspect)) {
      if (typeof value !== 'number' || CONSTANTS.has(key)) continue;
      const steps = value / edge.SYNASTRY_ORB_QUANTUM;
      expect(Math.abs(steps - Math.round(steps)), `${key} is finer than the quantum`)
        .toBeLessThan(1e-9);
    }
  });

  it('does not reintroduce the fields, and records why they went', () => {
    const source = readRepoFile(EDGE_FILE);

    // The response builder is an allowlist. Scoped to the object it RETURNS,
    // not to the whole function: its parameter type legitimately mentions
    // `longitude` (it consumes full-precision input — that is the point).
    const builderStart = source.indexOf('function buildPublicChart');
    expect(builderStart).toBeGreaterThan(0);
    const returned = source.slice(
      source.indexOf('return {', builderStart),
      source.indexOf('// Authorization (JUNO-02)'),
    );
    expect(returned.length).toBeGreaterThan(0);
    expect(returned).not.toMatch(/\blongitude:/);
    expect(returned).not.toMatch(/\bcoordinates:/);
    expect(returned).not.toMatch(/\bhouses:/);

    // And the reasoning survives: a future reader must be able to find out why
    // in the file itself, not only in an audit document they may never open.
    expect(source).toContain('CHART_DEGREE_QUANTUM');
    expect(source).toContain('JUNO-01');
  });
});

describe('JUNO-01 · the engine keeps its full internal precision', () => {
  // The functional constraint: minimisation happens at the edge of the network
  // and NOWHERE else. Nothing is rounded before the maths.
  const input = {
    date: '1994-07-14',
    time: '03:47',
    timezone: 'America/Montreal',
    latitude: SECRET.latitude,
    longitude: SECRET.longitude,
  };

  it('computes a chart identical to the pre-refactor implementation', () => {
    // The only change this work made inside the engine was moving ZODIAC_SIGNS,
    // normalize360, longitudeToPlacement and placementToLongitude out of
    // chart.ts and into signs.ts, so the edge bundle could be dependency-free.
    // Proving that move changed nothing means comparing against the ORIGINAL
    // code, reproduced verbatim below rather than imported — importing the new
    // module and asserting it equals itself would prove nothing.
    const ORIGINAL_SIGNS = [
      'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
      'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
    ];
    const originalNormalize360 = (x: number) => ((x % 360) + 360) % 360;
    const originalLongitudeToPlacement = (longitude: number) => {
      const lon = originalNormalize360(longitude);
      const idx = Math.floor(lon / 30);
      return {
        sign: ORIGINAL_SIGNS[idx],
        degree: Math.round((lon % 30) * 100) / 100,
        longitude: Math.round(lon * 100) / 100,
      };
    };
    const originalPlacementToLongitude = (p: { sign: string; degree: number }) => {
      const idx = ORIGINAL_SIGNS.indexOf(p.sign);
      if (idx < 0) return 0;
      return idx * 30 + p.degree;
    };

    // Exhaustive over the circle at the engine's own storage quantum.
    for (let lon = 0; lon < 360; lon += 0.01) {
      const now = longitudeToPlacement(lon);
      const before = originalLongitudeToPlacement(lon);
      expect(now.sign).toBe(before.sign);
      expect(now.degree).toBe(before.degree);
      expect(now.longitude).toBe(before.longitude);
      expect(placementToLongitude(now)).toBe(originalPlacementToLongitude(before));
    }
    expect([...ZODIAC_SIGNS]).toEqual(ORIGINAL_SIGNS);

    // And the whole chart still resolves, with every angle present.
    const chart = computeNatalChart(input);
    expect(chart.rising).not.toBeNull();
    expect(chart.mc).not.toBeNull();
    expect(chart.houses).toHaveLength(12);
    expect(chart.confidence).toBe('high');
    expect(chart.warnings).toEqual([]);
  });

  it('keeps the ascendant, MC and houses at the engine quantum, not the payload one', () => {
    const chart = computeNatalChart(input);
    const rising = chart.rising as Placement;
    const mc = chart.mc as Placement;

    // The engine stores two decimals. That is unchanged and unrelated to
    // CHART_DEGREE_QUANTUM, which applies only on the way out to another user.
    for (const value of [rising.longitude, mc.longitude, chart.sun.longitude, chart.moon.longitude]) {
      expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-9);
    }

    // The proof that the engine is finer than the payload: quantising the
    // engine's own angles to the payload step MOVES them. If the two ever
    // matched, minimisation would have leaked inward.
    const movedByQuantisation = [rising, mc, chart.sun, chart.moon].filter(
      (p) => edge.quantizeDegree(p.degree) !== p.degree,
    );
    expect(movedByQuantisation.length).toBeGreaterThan(0);

    // Houses are the equal-house rotations of the RAW ascendant, and they keep
    // more precision than `rising.longitude`, which `longitudeToPlacement`
    // rounds to the storage quantum. That asymmetry is the engine's own and
    // predates this work — asserted here so the JUNO-01 edits can be shown not
    // to have touched it.
    const houses = chart.houses as number[];
    for (let i = 0; i < 12; i++) {
      const expected = ((houses[0] + i * 30) % 360 + 360) % 360;
      expect(houses[i]).toBeCloseTo(expected, 9);
    }
    expect(Math.abs(houses[0] - rising.longitude)).toBeLessThanOrEqual(0.005 + 1e-9);
  });

  it('loses no precision when the birthplace resolves to coordinates', () => {
    // The birth-city selection path: coordinates in, angles out. A chart
    // computed WITHOUT coordinates must withhold the angles rather than
    // substitute a place — the invariant `validate:natal-integrity` guards.
    const withPlace = computeNatalChart(input);
    const withoutPlace = computeNatalChart({ ...input, latitude: null, longitude: null });
    expect(withPlace.rising).not.toBeNull();
    expect(withoutPlace.rising).toBeNull();
    expect(withoutPlace.mc).toBeNull();
    expect(withoutPlace.houses).toBeNull();
    expect(withoutPlace.warnings).toContain('missing_birth_place');
  });
});

describe('JUNO-01 · synastry survives the minimisation', () => {
  const A = computeNatalChart({
    date: '1994-07-14', time: '03:47', timezone: 'America/Montreal',
    latitude: 45.5017, longitude: -73.5673,
  });
  const B = computeNatalChart({
    date: '1991-11-02', time: '19:20', timezone: 'Europe/Paris',
    latitude: 48.8566, longitude: 2.3522,
  });

  /** Round-trip a chart through the published payload shape. */
  function throughPayload(chart: NatalChart): unknown {
    const planets: Record<string, PublicPlacement> = {};
    for (const key of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto'] as const) {
      const p = chart[key];
      if (p) planets[key] = edge.toPublicPlacement(p.longitude);
    }
    return {
      sun: edge.toPublicPlacement(chart.sun.longitude),
      moon: edge.toPublicPlacement(chart.moon.longitude),
      rising: chart.rising ? edge.toPublicPlacement(chart.rising.longitude) : null,
      mc: chart.mc ? edge.toPublicPlacement(chart.mc.longitude) : null,
      planets,
      confidence: chart.confidence,
    };
  }

  it('still hydrates from sign + degree alone, with no longitude field', () => {
    const payload = throughPayload(B) as Record<string, unknown>;
    expect((payload.sun as PublicPlacement)).not.toHaveProperty('longitude');
    const hydrated = hydrateStoredChart(payload);
    expect(hydrated).not.toBeNull();
    // `parseStoredPlacement` rebuilds the longitude from sign + degree. That is
    // what keeps an installed mobile build working during the rollout.
    expect((hydrated as NatalChart).sun.longitude).toBeCloseTo(B.sun.longitude, 0);
  });

  it('scores within the documented drift of the full-precision computation', () => {
    const exact = computeSynastry(A, B);
    const viaPayload = computeSynastry(
      hydrateStoredChart(throughPayload(A)) as NatalChart,
      hydrateStoredChart(throughPayload(B)) as NatalChart,
    );
    for (const frame of ['love', 'friendship', 'business'] as const) {
      // Measured over 400 random pairs: mean 0.039, max 2 points at 0.1°.
      expect(Math.abs(exact.frames[frame].score - viaPayload.frames[frame].score))
        .toBeLessThanOrEqual(3);
    }
  });

  it('keeps every placement key the aspect pairs need', () => {
    const hydrated = hydrateStoredChart(throughPayload(A)) as NatalChart;
    const needed: PlacementKey[] = [
      'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rising', 'mc',
    ];
    for (const key of needed) {
      expect(hydrated[key], `missing ${key}`).not.toBeNull();
    }
  });
});
