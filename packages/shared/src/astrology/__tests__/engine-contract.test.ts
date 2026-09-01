import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as AstronomyNs from 'astronomy-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeNatalChart } from '../chart';

// Shared engine vs Edge Functions — the drift alarm.
//
// WHY THIS EXISTS
// ---------------
// The natal chart maths exists in three places: the canonical engine in
// `packages/shared/src/astrology`, and inline Deno copies inside
// `calculate-chart` and `get-profile-chart`. On 2026-09-01 they were compared
// line by line and found identical — but "identical today" is not a guarantee,
// and the two edge copies are what writes `profiles.birth_chart` for every web
// signup and recomputes every other person's chart.
// (docs/astrology-calculation-audit-2026-09.md §5.2.)
//
// Unifying them means bundling TypeScript for Deno, which is a real project.
// This is the cheap thing that makes the expensive thing optional: if the two
// ever disagree by more than floating-point noise, the suite fails.
//
// HOW IT AVOIDS TESTING A COPY OF A COPY
// --------------------------------------
// The obvious shortcut — paste the edge maths into a fixture — would pass
// forever while the deployed function drifted. So this reads the ACTUAL edge
// source, extracts the declarations it needs by BRACE MATCHING (a regex cannot
// find the end of a function body without truncating it silently), and
// evaluates that exact text with the npm equivalents of the Deno URL imports
// injected. Same pinned versions, asserted below rather than assumed.
//
// WHAT IT CANNOT COMPARE BY EXECUTION
// -----------------------------------
// The edge control flow — "compute the ascendant only when there is a time AND
// a place" — lives inside the `serve()` handler, not in an extractable
// function. Those invariants are asserted against the source text instead.

const ROOT = path.resolve(import.meta.dirname, '../../../../..');

/**
 * The two engines agree EXACTLY, once one documented difference is accounted
 * for: `longitudeToPlacement` in the shared engine rounds what it stores to
 * two decimals (`Math.round(lon * 100) / 100`), while the edge functions keep
 * the raw value.
 *
 * So the contract does not use a loose tolerance — that would hide a real
 * drift behind a rounding allowance. It rounds the edge value the same way and
 * demands equality to float noise. `RAW_BOUND` is only a secondary sanity
 * check that the unrounded values are within half a quantum of each other.
 *
 * 0.01° is 36 arc-seconds. Against aspect orbs of 1–8° it is nothing; it is
 * worth knowing only because it means a chart round-tripped through
 * `birth_chart` is not bit-identical to a freshly computed one.
 */
const STORAGE_QUANTUM = 0.01;
const EXACT_EPSILON = 1e-9;
const RAW_BOUND = STORAGE_QUANTUM / 2 + EXACT_EPSILON;

/** Round the way `longitudeToPlacement` does, so the comparison is like-for-like. */
function toStoredPrecision(longitude: number): number {
  return Math.round(longitude * 100) / 100;
}

const EDGE_FILES = {
  calcChart: 'supabase/functions/calculate-chart/index.ts',
  profileChart: 'supabase/functions/get-profile-chart/index.ts',
};

function read(rel: string): string {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) throw new Error(`Missing file: ${rel}`);
  return readFileSync(file, 'utf8');
}

/**
 * Pull one top-level declaration out of a source file, by name.
 *
 * Brace matching, not a regex: `[\s\S]*?\n}` stops at the first line that
 * happens to start with a brace — which inside these files is an object
 * literal — and silently truncates the code under test. String contents are
 * skipped so a brace inside a template literal cannot close the body early.
 */
function extractDeclaration(source: string, name: string): string | null {
  // Literal search rather than a built regex: a `\n` inside a template literal
  // is a real newline and `\b` is a backspace, so `new RegExp(`\nfunction
  // ${name}\b`)` silently matches nothing at all. indexOf has no such trap.
  let start = -1;
  for (const keyword of ['function', 'const']) {
    const needle = `\nfunction ${name}`.replace('function', keyword);
    const at = source.indexOf(needle);
    if (at >= 0) {
      // Reject a prefix match: `const PLANET_BODIES_EXTRA` must not answer for
      // `PLANET_BODIES`.
      const after = source[at + needle.length];
      if (after && /[A-Za-z0-9_$]/.test(after)) continue;
      start = at + 1;
      break;
    }
  }
  if (start < 0) return null;

  // Where does this declaration end?
  //
  // TWO TRAPS, both of which truncate silently:
  //   1. A generic return type carries braces —
  //      `Record<string, { longitude: number; … }>` on
  //      `calculatePlanetPositions`.
  //   2. An object-literal return type IS a brace group —
  //      `: { iana: string; source: 'input' | 'lookup' | 'fallback' }` on
  //      `resolveIanaTimezone`.
  //
  // Stopping at the first balanced group yields the TYPE, and the emitted
  // module then exports nothing for that name. The body is always the LAST
  // top-level group before the next declaration, so that is what we take.
  const boundary = ['\nfunction ', '\nconst ', '\nasync function ', '\nserve(', '\ntype ']
    .map((marker) => source.indexOf(marker, start + 1))
    .filter((index) => index > 0);
  const end = boundary.length ? Math.min(...boundary) : source.length;

  const open = source.startsWith('const', start) ? null : '{';
  let last: number | null = null;
  let depth = 0;
  let groupOpen: string | null = null;
  let inString: string | null = null;

  for (let i = start; i < end; i++) {
    const ch = source[i];
    const prev = source[i - 1];
    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch;
      continue;
    }
    if (depth === 0 && (ch === '{' || ch === '[')) {
      // A `const` takes its FIRST group (the array/object literal); a function
      // takes its last (the body).
      if (open === null && last !== null) break;
      groupOpen = ch;
      depth = 1;
      continue;
    }
    if (groupOpen && ch === groupOpen) depth += 1;
    else if (groupOpen && ch === (groupOpen === '[' ? ']' : '}')) {
      depth -= 1;
      if (depth === 0) {
        last = i;
        groupOpen = null;
      }
    }
  }

  return last === null ? null : source.slice(start, last + 1);
}

/** Declarations the contract needs, in dependency order. */
const NEEDED = [
  'ZODIAC_SIGNS',
  'getZodiacSign',
  'getDegreeInSign',
  'getGeocentricLongitude',
  'calculateAscendant',
  'resolveIanaTimezone',
  'buildUtcInstant',
  'PLANET_BODIES',
  'calculatePlanetPositions',
] as const;

type EdgeEngine = {
  getZodiacSign: (lon: number) => string;
  getDegreeInSign: (lon: number) => number;
  getGeocentricLongitude: (body: string, time: unknown) => number;
  calculateAscendant: (time: unknown, lat: number, lng: number) => number;
  resolveIanaTimezone: (
    lat: number | null,
    lng: number | null,
    caller: string | null,
  ) => { iana: string; source: 'input' | 'lookup' | 'fallback' };
  buildUtcInstant: (
    y: number, mo: number, d: number, h: number, mi: number, iana: string,
  ) => Date;
  calculatePlanetPositions: (
    time: unknown,
  ) => Record<string, { longitude: number; sign: string; degree: number }>;
};

// Written inside the package so vitest transforms it on import. The leading dot
// and the missing `.test.` keep it out of the suite's own glob.
const TMP_DIR = path.join(import.meta.dirname, '.engine-contract');
let edge: EdgeEngine;
let missingDeclarations: string[] = [];

beforeAll(async () => {
  const source = read(EDGE_FILES.calcChart);
  const parts: string[] = [];
  for (const name of NEEDED) {
    const decl = extractDeclaration(source, name);
    if (!decl) missingDeclarations.push(name);
    else parts.push(decl);
  }
  if (missingDeclarations.length) return;

  // The Deno URL imports become their npm equivalents. Same versions — proven
  // by a test below rather than trusted.
  const shim = [
    "import * as Astronomy from 'astronomy-engine';",
    "import { DateTime, IANAZone } from 'luxon';",
    "import tzlookup from 'tz-lookup';",
    '',
    ...parts,
    '',
    `export { ${NEEDED.join(', ')} };`,
  ].join('\n');

  // Strip the TypeScript annotations with esbuild and emit plain ESM, then let
  // Node import it natively. Handing a `.ts` file to a dynamic import marked
  // `@vite-ignore` loads it outside Vite's transform and yields a module with
  // no exports at all — silently, which is the worst possible failure for a
  // file whose whole job is to catch silence.
  const { transform } = await import('esbuild');
  const { code } = await transform(shim, { loader: 'ts', format: 'esm' });

  mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, 'edge.mjs');
  // Bare specifiers ('astronomy-engine') resolve from the package's own
  // node_modules because the file sits inside it.
  writeFileSync(file, code, 'utf8');
  edge = (await import(pathToFileURL(file).href)) as unknown as EdgeEngine;
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('the two runtimes use the same libraries', () => {
  const sharedDeps: Record<string, string> =
    JSON.parse(read('packages/shared/package.json')).dependencies ?? {};

  it.each([
    ['astronomy-engine'],
    ['luxon'],
    ['tz-lookup'],
  ])('%s is pinned to the same version on both sides', (pkg) => {
    const wanted = (sharedDeps[pkg] ?? '').replace(/^[^~]/, (c) => (c === '^' ? '' : c)).replace(/^[\^~]/, '');
    for (const rel of Object.values(EDGE_FILES)) {
      const found = read(rel).match(new RegExp(`${pkg}@([0-9.]+)`));
      // Comparing outputs across library versions would prove nothing.
      expect(found?.[1], `${rel} pins ${pkg}@${found?.[1]}, shared wants ${wanted}`).toBe(wanted);
    }
  });
});

describe('the edge maths could be extracted at all', () => {
  it('found every declaration it needs', () => {
    expect(missingDeclarations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The case matrix
// ---------------------------------------------------------------------------

interface ContractCase {
  name: string;
  input: {
    date: string;
    time: string | null;
    timezone: string | null;
    latitude: number | null;
    longitude: number | null;
  };
}

const CASES: ContractCase[] = [
  { name: 'complete birth, DST in force',
    input: { date: '1990-08-05', time: '14:30', timezone: null, latitude: 48.8566, longitude: 2.3522 } },
  { name: 'no birth time',
    input: { date: '1990-08-05', time: null, timezone: null, latitude: 48.8566, longitude: 2.3522 } },
  { name: 'birth time, no birthplace',
    input: { date: '1990-08-05', time: '14:30', timezone: 'Europe/Paris', latitude: null, longitude: null } },
  // Zero is a coordinate. `calculate-chart` used `if (!lat || !lng)`, which
  // replaced these readers' CORRECT data with a substituted location.
  { name: 'latitude exactly 0 (the equator is a place)',
    input: { date: '1985-11-12', time: '06:05', timezone: null, latitude: 0, longitude: 32.5825 } },
  { name: 'longitude exactly 0 (the prime meridian is a place)',
    input: { date: '1985-11-12', time: '06:05', timezone: null, latitude: 51.4779, longitude: 0 } },
  { name: 'DST city, summer (America/New_York)',
    input: { date: '2001-07-04', time: '23:59', timezone: null, latitude: 40.7128, longitude: -74.006 } },
  { name: 'DST city, winter (America/New_York)',
    input: { date: '2001-01-15', time: '03:20', timezone: null, latitude: 40.7128, longitude: -74.006 } },
  { name: 'half-hour offset (Asia/Kolkata, +05:30)',
    input: { date: '1979-02-28', time: '18:45', timezone: null, latitude: 22.5726, longitude: 88.3639 } },
  // The classic trap: a 45-minute offset. Anything modelling zones as whole or
  // half hours gets this wrong by 15 or 45 minutes.
  { name: 'forty-five-minute offset (Asia/Kathmandu, +05:45)',
    input: { date: '1994-04-13', time: '11:11', timezone: null, latitude: 27.7172, longitude: 85.324 } },
  { name: 'high latitude (Tromso, 69.6N)',
    input: { date: '1976-12-21', time: '02:00', timezone: null, latitude: 69.6492, longitude: 18.9553 } },
  { name: 'southern hemisphere (Wellington)',
    input: { date: '1968-09-30', time: '17:20', timezone: null, latitude: -41.2866, longitude: 174.7756 } },
];

const BODIES = [
  'sun', 'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
] as const;

/** Signed angular difference in (-180, 180]. Handles the 360/0 wrap. */
function angleDelta(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

/** Reproduce the edge handler's flow using its own extracted helpers. */
function runEdge(input: ContractCase['input']) {
  const hasBirthTime = typeof input.time === 'string' && input.time.trim().length > 0;
  const hasBirthPlace =
    typeof input.latitude === 'number' && Number.isFinite(input.latitude) &&
    typeof input.longitude === 'number' && Number.isFinite(input.longitude);

  const [year, month, day] = input.date.split('-').map(Number);
  let hour = 12;
  let minute = 0;
  if (hasBirthTime) {
    const [h, m] = (input.time as string).split(':');
    hour = Number.parseInt(h, 10) || 12;
    minute = Number.parseInt(m, 10) || 0;
  }

  const tz = edge.resolveIanaTimezone(input.latitude, input.longitude, input.timezone);
  const utcDate = edge.buildUtcInstant(year, month, day, hour, minute, tz.iana);
  const time = AstronomyNs.MakeTime(utcDate);

  const planets = edge.calculatePlanetPositions(time);
  const longitudes: Record<string, number> = {
    sun: edge.getGeocentricLongitude('Sun', time),
    moon: edge.getGeocentricLongitude('Moon', time),
    ...Object.fromEntries(Object.entries(planets).map(([k, v]) => [k, v.longitude])),
  };

  return {
    longitudes,
    rising: hasBirthTime && hasBirthPlace
      ? edge.calculateAscendant(time, input.latitude as number, input.longitude as number)
      : null,
    confidence:
      !hasBirthTime || !hasBirthPlace || tz.source === 'fallback'
        ? 'low'
        : tz.source === 'lookup'
          ? 'medium'
          : 'high',
    iana: tz.iana,
    utcDate,
  };
}

describe.each(CASES)('shared vs calculate-chart, $name', ({ input }) => {
  it('agrees on the UTC instant', () => {
    // Everything downstream is a function of this. A DST or half-hour bug
    // shows up here before it shows up in a planet.
    const shared = computeNatalChart(input);
    const theirs = runEdge(input);
    expect(Math.abs(new Date(shared.utcInstant).getTime() - theirs.utcDate.getTime()))
      .toBeLessThan(1000);
  });

  it('agrees on the resolved timezone', () => {
    expect(computeNatalChart(input).timezone).toBe(runEdge(input).iana);
  });

  it.each(BODIES)('agrees on %s: longitude, sign and degree', (body) => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(input);
    const mine = shared[body];
    const yours = theirs.longitudes[body];
    expect(mine, `${body} missing from the shared chart`).toBeTruthy();
    expect(typeof yours, `${body} missing from the edge chart`).toBe('number');
    // Exact once the shared engine's own storage rounding is applied to both.
    expect(
      Math.abs(angleDelta(mine!.longitude, toStoredPrecision(yours))),
      `${body}: shared=${mine!.longitude} edge=${yours}`,
    ).toBeLessThanOrEqual(EXACT_EPSILON);
    // And the raw values are within half a quantum, so nothing is hiding
    // behind the rounding.
    expect(Math.abs(angleDelta(mine!.longitude, yours))).toBeLessThanOrEqual(RAW_BOUND);
    expect(mine!.sign.toLowerCase()).toBe(edge.getZodiacSign(yours));
    expect(Math.abs(mine!.degree - edge.getDegreeInSign(yours))).toBeLessThanOrEqual(STORAGE_QUANTUM);
  });

  it('agrees on the ascendant, including its absence', () => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(input);
    if (shared.rising === null || theirs.rising === null) {
      expect(shared.rising, 'one side computed an ascendant the other withheld').toBeNull();
      expect(theirs.rising).toBeNull();
      return;
    }
    expect(Math.abs(angleDelta(shared.rising.longitude, toStoredPrecision(theirs.rising))))
      .toBeLessThanOrEqual(EXACT_EPSILON);
  });

  it('agrees on confidence', () => {
    expect(computeNatalChart(input).confidence).toBe(runEdge(input).confidence);
  });

  it('withholds every angle when the birthplace is unknown', () => {
    if (input.latitude !== null && input.longitude !== null) return;
    const shared = computeNatalChart(input);
    expect(shared.rising).toBeNull();
    expect(shared.mc).toBeNull();
    expect(shared.houses).toBeNull();
    expect(shared.warnings).toContain('missing_birth_place');
    expect(runEdge(input).rising).toBeNull();
  });

  it('withholds every angle when the clock is unknown', () => {
    if (input.time !== null) return;
    const shared = computeNatalChart(input);
    expect(shared.rising).toBeNull();
    expect(shared.mc).toBeNull();
    expect(shared.houses).toBeNull();
    expect(runEdge(input).rising).toBeNull();
  });
});

describe('known, accepted divergences', () => {
  // Asserted so they stay DELIBERATE. If an edge function starts emitting an
  // MC or houses, this fails and forces them into the comparison above rather
  // than being trusted on sight.
  it.each(Object.entries(EDGE_FILES))('%s computes no MC and no houses', (_label, rel) => {
    const src = read(rel);
    expect(/computeMidheaven|calculateMidheaven/.test(src)).toBe(false);
    expect(/computeEqualHouses|equalHouses/.test(src)).toBe(false);
  });
});

describe('control flow that cannot be executed from here', () => {
  it.each(Object.entries(EDGE_FILES))('%s gates the angles on clock AND place', (_label, rel) => {
    const src = read(rel);
    expect(src).toMatch(/hasBirthTime && hasBirthPlace/);
    // Zero is a real coordinate; a truthiness test replaced correct data with
    // invented data for anyone born on the meridian or the equator.
    expect(/if \(!lat \|\| !lng\)/.test(src)).toBe(false);
    expect(src).toMatch(/!hasBirthTime \|\| !hasBirthPlace \|\| tz\.source === 'fallback'/);
  });
});
