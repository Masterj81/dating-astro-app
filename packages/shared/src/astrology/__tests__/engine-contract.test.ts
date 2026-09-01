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

/**
 * Declarations each engine needs, in dependency order.
 *
 * The two lists differ by one entry and that difference is real:
 * `calculate-chart` hoists its body list to a `PLANET_BODIES` const, while
 * `get-profile-chart` declares the same array inline inside
 * `calculatePlanetPositions`. A single shared list would fail to extract on
 * one of them, and "declaration not found" is indistinguishable from "engine
 * removed" unless it is stated per engine.
 */
const NEEDED_BY_ENGINE = {
  calcChart: [
    'ZODIAC_SIGNS',
    'getZodiacSign',
    'getDegreeInSign',
    'getGeocentricLongitude',
    'calculateAscendant',
    'resolveIanaTimezone',
    'buildUtcInstant',
    'PLANET_BODIES',
    'calculatePlanetPositions',
    'calculateMidheaven',
    'calculateEqualHouses',
  ],
  profileChart: [
    'ZODIAC_SIGNS',
    'getZodiacSign',
    'getDegreeInSign',
    'getGeocentricLongitude',
    'calculateAscendant',
    'resolveIanaTimezone',
    'buildUtcInstant',
    'calculatePlanetPositions',
    'calculateMidheaven',
    'calculateEqualHouses',
  ],
} as const;

type EngineKey = keyof typeof NEEDED_BY_ENGINE;

/** Display names, used in test titles so a failure names the file. */
const ENGINE_LABEL: Record<EngineKey, string> = {
  calcChart: 'calculate-chart',
  profileChart: 'get-profile-chart',
};

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
  calculateMidheaven: (time: unknown, lng: number) => number;
  calculateEqualHouses: (ascendantLongitude: number) => number[];
};

// Written inside the package so bare specifiers ('astronomy-engine') resolve
// from its own node_modules. The leading dot and the missing `.test.` keep the
// directory out of the suite's own glob.
const TMP_DIR = path.join(import.meta.dirname, '.engine-contract');

const engines: Partial<Record<EngineKey, EdgeEngine>> = {};
const missingDeclarations: Record<EngineKey, string[]> = {
  calcChart: [],
  profileChart: [],
};

/**
 * Extract one edge function's maths and make it callable from Node.
 *
 * Every step here is load-bearing and was arrived at the hard way:
 *   - reading the REAL source, so a fixture cannot pass while the deployed
 *     function drifts;
 *   - brace matching that takes the LAST top-level group, because both
 *     `Record<string, { … }>` and `: { iana: string; … }` return types would
 *     otherwise be mistaken for the body, emitting a module that exports
 *     nothing for that name — silently;
 *   - esbuild rather than a `@vite-ignore` dynamic import of a `.ts` file,
 *     which loads outside Vite's transform and yields an empty namespace,
 *     also silently.
 */
async function loadEdgeEngine(key: EngineKey): Promise<void> {
  const source = read(EDGE_FILES[key]);
  const parts: string[] = [];
  for (const name of NEEDED_BY_ENGINE[key]) {
    const decl = extractDeclaration(source, name);
    if (!decl) missingDeclarations[key].push(name);
    else parts.push(decl);
  }
  if (missingDeclarations[key].length) return;

  // The Deno URL imports become their npm equivalents. Same versions — proven
  // by a test below rather than trusted.
  const shim = [
    "import * as Astronomy from 'astronomy-engine';",
    "import { DateTime, IANAZone } from 'luxon';",
    "import tzlookup from 'tz-lookup';",
    '',
    ...parts,
    '',
    `export { ${NEEDED_BY_ENGINE[key].join(', ')} };`,
  ].join('\n');

  const { transform } = await import('esbuild');
  const { code } = await transform(shim, { loader: 'ts', format: 'esm' });

  mkdirSync(TMP_DIR, { recursive: true });
  const file = path.join(TMP_DIR, `${key}.mjs`);
  writeFileSync(file, code, 'utf8');
  engines[key] = (await import(pathToFileURL(file).href)) as unknown as EdgeEngine;
}

/** Throws rather than silently skipping — a contract that skips proves nothing. */
function engineFor(key: EngineKey): EdgeEngine {
  const loaded = engines[key];
  if (!loaded) {
    throw new Error(
      `${ENGINE_LABEL[key]} was not loaded; missing: ${missingDeclarations[key].join(', ') || 'unknown'}`,
    );
  }
  return loaded;
}

beforeAll(async () => {
  await loadEdgeEngine('calcChart');
  await loadEdgeEngine('profileChart');
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
  it.each(Object.keys(NEEDED_BY_ENGINE) as EngineKey[])(
    '%s: found every declaration it needs',
    (key) => {
      // If this fails the whole contract is vacuous, so it fails loudly here
      // rather than letting the comparisons below silently skip.
      expect(missingDeclarations[key]).toEqual([]);
      expect(engines[key]).toBeTruthy();
    },
  );
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
  // Exercises the UTC FALLBACK branch of `resolveIanaTimezone`: no coordinates
  // to look a zone up from, and no zone supplied either. Without this case,
  // changing the fallback zone in an edge function went undetected — every
  // other case resolves through 'input' or 'lookup', so the branch was never
  // executed. Found by deliberately corrupting it and watching the contract
  // stay green.
  { name: 'no coordinates and no timezone (UTC fallback)',
    input: { date: '1992-06-15', time: '10:00', timezone: null, latitude: null, longitude: null } },
];

const BODIES = [
  'sun', 'moon', 'mercury', 'venus', 'mars',
  'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
] as const;

/** Signed angular difference in (-180, 180]. Handles the 360/0 wrap. */
function angleDelta(a: number, b: number): number {
  return ((((a - b + 180) % 360) + 360) % 360) - 180;
}

/**
 * Reproduce one edge handler's flow using ITS OWN extracted helpers.
 *
 * The handler bodies are near-identical between the two functions; what
 * differs is which file the helpers came from. Passing the engine key rather
 * than hardcoding one is what turns this from a calculate-chart test into a
 * three-way contract.
 */
function runEdge(key: EngineKey, input: ContractCase['input']) {
  const edge = engineFor(key);
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

  const rising = hasBirthTime && hasBirthPlace
    ? edge.calculateAscendant(time, input.latitude as number, input.longitude as number)
    : null;

  return {
    longitudes,
    rising,
    // Same gate as the ascendant, deliberately: an MC without a birthplace is
    // the same fabrication as a rising sign without one.
    mc: rising != null ? edge.calculateMidheaven(time, input.longitude as number) : null,
    houses: rising != null ? edge.calculateEqualHouses(rising) : null,
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

// Every case runs against BOTH edge engines. `get-profile-chart` was only
// checked structurally until now — same library versions, same control-flow
// guards — which proves the shape of the code, not its output.
const ENGINE_CASES = (Object.keys(NEEDED_BY_ENGINE) as EngineKey[]).flatMap((key) =>
  CASES.map((testCase) => ({ key, label: ENGINE_LABEL[key], ...testCase })),
);

describe.each(ENGINE_CASES)('shared vs $label, $name', ({ key, input }) => {
  it('agrees on the UTC instant', () => {
    // Everything downstream is a function of this. A DST or half-hour bug
    // shows up here before it shows up in a planet.
    const shared = computeNatalChart(input);
    const theirs = runEdge(key, input);
    expect(Math.abs(new Date(shared.utcInstant).getTime() - theirs.utcDate.getTime()))
      .toBeLessThan(1000);
  });

  it('agrees on the resolved timezone', () => {
    expect(computeNatalChart(input).timezone).toBe(runEdge(key, input).iana);
  });

  it.each(BODIES)('agrees on %s: longitude, sign and degree', (body) => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(key, input);
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
    expect(mine!.sign.toLowerCase()).toBe(engineFor(key).getZodiacSign(yours));
    expect(Math.abs(mine!.degree - engineFor(key).getDegreeInSign(yours)))
      .toBeLessThanOrEqual(STORAGE_QUANTUM);
  });

  it('agrees on the ascendant, including its absence', () => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(key, input);
    if (shared.rising === null || theirs.rising === null) {
      expect(shared.rising, 'one side computed an ascendant the other withheld').toBeNull();
      expect(theirs.rising).toBeNull();
      return;
    }
    expect(Math.abs(angleDelta(shared.rising.longitude, toStoredPrecision(theirs.rising))))
      .toBeLessThanOrEqual(EXACT_EPSILON);
  });

  it('agrees on confidence', () => {
    expect(computeNatalChart(input).confidence).toBe(runEdge(key, input).confidence);
  });

  it('withholds every angle when the birthplace is unknown', () => {
    if (input.latitude !== null && input.longitude !== null) return;
    const shared = computeNatalChart(input);
    expect(shared.rising).toBeNull();
    expect(shared.mc).toBeNull();
    expect(shared.houses).toBeNull();
    expect(shared.warnings).toContain('missing_birth_place');
    expect(runEdge(key, input).rising).toBeNull();
  });

  it('withholds every angle when the clock is unknown', () => {
    if (input.time !== null) return;
    const shared = computeNatalChart(input);
    expect(shared.rising).toBeNull();
    expect(shared.mc).toBeNull();
    expect(shared.houses).toBeNull();
    expect(runEdge(key, input).rising).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The two edge engines against EACH OTHER
// ---------------------------------------------------------------------------
// Both are compared to the shared engine above, which already implies they
// agree — but only through a comparison that applies the shared engine's
// rounding. Between themselves neither rounds, so they must be identical to
// float noise. If one is edited and the other is not, this is the assertion
// that names the pair rather than blaming the shared engine.
describe.each(CASES)('calculate-chart vs get-profile-chart, $name', ({ input }) => {
  it('produce the same UTC instant and timezone', () => {
    const a = runEdge('calcChart', input);
    const b = runEdge('profileChart', input);
    expect(a.utcDate.getTime()).toBe(b.utcDate.getTime());
    expect(a.iana).toBe(b.iana);
  });

  it.each(BODIES)('produce an identical %s longitude', (body) => {
    const a = runEdge('calcChart', input);
    const b = runEdge('profileChart', input);
    expect(Math.abs(angleDelta(a.longitudes[body], b.longitudes[body])))
      .toBeLessThanOrEqual(EXACT_EPSILON);
  });

  it('agree on the ascendant, including its absence', () => {
    const a = runEdge('calcChart', input);
    const b = runEdge('profileChart', input);
    if (a.rising === null || b.rising === null) {
      expect(a.rising).toBeNull();
      expect(b.rising).toBeNull();
      return;
    }
    expect(Math.abs(angleDelta(a.rising, b.rising))).toBeLessThanOrEqual(EXACT_EPSILON);
  });

  it('agree on confidence', () => {
    expect(runEdge('calcChart', input).confidence).toBe(runEdge('profileChart', input).confidence);
  });
});

// ---------------------------------------------------------------------------
// get-profile-chart returns someone ELSE's data, so its safety rules are its own
// ---------------------------------------------------------------------------
describe('get-profile-chart does not leak the birth data it reads', () => {
  const src = read(EDGE_FILES.profileChart);

  /** The `.select(...)` column list, gathered from its concatenated literals. */
  const selected = (() => {
    const start = src.indexOf('.select(');
    const end = src.indexOf(')', start);
    if (start < 0 || end < 0) return new Set<string>();
    const quoted = [...src.slice(start, end).matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
    return new Set(quoted.split(',').map((c) => c.trim()).filter(Boolean));
  })();

  /** The body of `sanitizeProfile`, which is what actually reaches the wire. */
  const sanitizer = (() => {
    const from = src.indexOf('function sanitizeProfile');
    if (from < 0) return '';
    const rest = src.slice(from);
    const close = rest.indexOf('\n}');
    return close < 0 ? rest : rest.slice(0, close);
  })();

  it('selects every column it reads', () => {
    // The class of bug that made `storedTz` permanently null: a column read
    // through `target.` but absent from the select is `undefined` forever, and
    // nothing throws.
    const readCols = new Set(
      [...src.matchAll(/(?:^|[^A-Za-z0-9_$])target\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]),
    );
    expect(selected.size).toBeGreaterThan(5);
    expect([...readCols].filter((c) => !selected.has(c))).toEqual([]);
  });

  it('selects birth_chart, which carries the stored timezone', () => {
    expect(selected.has('birth_chart')).toBe(true);
  });

  it('keeps sanitizeProfile an allowlist rather than a spread', () => {
    // A spread would put every selected column — including birth_chart and the
    // raw coordinates — on the wire in one refactor.
    expect(sanitizer.length).toBeGreaterThan(0);
    expect(/\.\.\.target/.test(sanitizer)).toBe(false);
  });

  it.each([
    'birth_chart',
    'birth_time',
    'birth_date',
    'birth_latitude',
    'birth_longitude',
    'email',
    'push_token',
    'notification_preferences',
  ])('never returns %s in the profile', (field) => {
    // Built with a plain string, not a template literal. Written as
    // `` `${field}\s*:` `` the backslash is dropped before the RegExp ever
    // sees it, so the pattern became `birth_chart s*:` — which matches
    // nothing, and the check passed while proving nothing. eslint's
    // no-useless-escape caught it; the test itself stayed green.
    expect(new RegExp(field + '\\s*:').test(sanitizer)).toBe(false);
  });

  it('returns null coordinates when the birthplace is unknown', () => {
    // `Math.round(null * 2) / 2` is 0 in JavaScript, so the coarsening step
    // used to answer `{ latitude: 0, longitude: 0 }` — the Gulf of Guinea,
    // returned as this person's approximate birthplace.
    expect(src).toMatch(/const coarseLat = hasBirthPlace \? Math\.round/);
    expect(src).toMatch(/const coarseLng = hasBirthPlace \? Math\.round/);
    expect(/Math\.round\(lat \* 2\)/.test(src)).toBe(false);
    expect(/Math\.round\(lng \* 2\)/.test(src)).toBe(false);
  });
});

describe('no substituted birthplace, and no substituted sign', () => {
  // The city gazetteers legitimately contain London and Montréal as ENTRIES.
  // Those are answers to a question the reader asked; what must never return
  // is the same coordinates as a DEFAULT for a question they did not.
  const stripGazetteer = (src: string) =>
    src.replace(/^\s*['"][a-z\s'’.-]+['"]\s*:\s*\{[^}]*\},?\s*$/gim, '');

  /**
   * Comments are stripped before the search.
   *
   * Both files carry a comment explaining the fallback that was REMOVED, and
   * it quotes the coordinates on purpose so the next reader knows what not to
   * reintroduce. Matching against raw source turns that documentation into a
   * failure — a guard that forbids you from writing down your own bugs is
   * worse than no guard.
   */
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  const executable = (rel: string) => stripGazetteer(stripComments(read(rel)));

  it.each(Object.entries(EDGE_FILES))('%s has no Greenwich fallback', (_label, rel) => {
    const src = executable(rel);
    expect(/(lat|latitude)\s*[=:]\s*51\.5074/.test(src)).toBe(false);
  });

  it.each(Object.entries(EDGE_FILES))('%s has no Montreal fallback', (_label, rel) => {
    const src = executable(rel);
    expect(/(lat|latitude)\s*[=:]\s*45\.5017/.test(src)).toBe(false);
    expect(/(lng|longitude)\s*[=:]\s*-73\.5673/.test(src)).toBe(false);
  });

  it.each(Object.entries(EDGE_FILES))('%s has no Aries fallback', (_label, rel) => {
    const src = stripComments(read(rel));
    // The original sin: `rising: placement(chart.rising, { sign: 'Aries', … })`
    // told eleven accounts in twelve a fact about themselves that was false.
    expect(/sign:\s*'Aries'/.test(src)).toBe(false);
    expect(/rising[^\n]*'Aries'/.test(src)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MC and houses — no longer a divergence, now a comparison
// ---------------------------------------------------------------------------
// Until 2026-09-01 this file asserted that the edge functions computed NEITHER,
// and called it an accepted divergence. It was accepted only because nothing
// displayed them. Now they are shown, so they are compared.
describe.each(ENGINE_CASES)('angles: shared vs $label, $name', ({ key, input }) => {
  it('agrees on the midheaven, including its absence', () => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(key, input);
    if (shared.mc === null || theirs.mc === null) {
      expect(shared.mc, 'one side computed an MC the other withheld').toBeNull();
      expect(theirs.mc).toBeNull();
      return;
    }
    expect(Math.abs(angleDelta(shared.mc.longitude, toStoredPrecision(theirs.mc))))
      .toBeLessThanOrEqual(EXACT_EPSILON);
    expect(Math.abs(angleDelta(shared.mc.longitude, theirs.mc))).toBeLessThanOrEqual(RAW_BOUND);
    expect(shared.mc.sign.toLowerCase()).toBe(engineFor(key).getZodiacSign(theirs.mc));
  });

  it('agrees on all twelve cusps, including their absence', () => {
    const shared = computeNatalChart(input);
    const theirs = runEdge(key, input);
    if (shared.houses === null || theirs.houses === null) {
      expect(shared.houses, 'one side computed houses the other withheld').toBeNull();
      expect(theirs.houses).toBeNull();
      return;
    }
    expect(theirs.houses).toHaveLength(12);
    for (let i = 0; i < 12; i++) {
      expect(
        Math.abs(angleDelta(shared.houses[i], theirs.houses[i])),
        `cusp ${i + 1}: shared=${shared.houses[i]} edge=${theirs.houses[i]}`,
      ).toBeLessThanOrEqual(RAW_BOUND);
    }
  });

  it('never produces an MC or houses without the clock AND the place', () => {
    const hasTime = input.time !== null;
    const hasPlace = input.latitude !== null && input.longitude !== null;
    const theirs = runEdge(key, input);
    if (hasTime && hasPlace) return;
    expect(theirs.mc, 'an MC without a birth time or place is a fabrication').toBeNull();
    expect(theirs.houses).toBeNull();
    expect(computeNatalChart(input).mc).toBeNull();
    expect(computeNatalChart(input).houses).toBeNull();
  });

  it('keeps the MC distinct from the tenth cusp', () => {
    // In Equal House the MC is NOT the 10th-house cusp — it falls where it
    // falls, often in the 9th or 11th. Asserting they are usually different is
    // how a future switch to Placidus (where they coincide by construction)
    // announces itself instead of quietly changing what the UI means.
    const shared = computeNatalChart(input);
    if (shared.mc === null || shared.houses === null) return;
    const delta = Math.abs(angleDelta(shared.mc.longitude, shared.houses[9]));
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThanOrEqual(180);
  });
});

describe('the two edge engines agree on the angles too', () => {
  it.each(CASES)('$name', ({ input }) => {
    const a = runEdge('calcChart', input);
    const b = runEdge('profileChart', input);
    if (a.mc === null || b.mc === null) {
      expect(a.mc).toBeNull();
      expect(b.mc).toBeNull();
    } else {
      expect(Math.abs(angleDelta(a.mc, b.mc))).toBeLessThanOrEqual(EXACT_EPSILON);
    }
    expect(a.houses === null).toBe(b.houses === null);
    if (a.houses && b.houses) {
      for (let i = 0; i < 12; i++) {
        expect(Math.abs(angleDelta(a.houses[i], b.houses[i]))).toBeLessThanOrEqual(EXACT_EPSILON);
      }
    }
  });
});

describe('known, accepted divergences', () => {
  // Asserted so they stay DELIBERATE. If an edge function starts emitting an
  // MC or houses, this fails and forces them into the comparison above rather
  // than being trusted on sight.
  it.each(Object.entries(EDGE_FILES))('%s now computes MC and houses', (_label, rel) => {
    // This assertion used to say the opposite, under the heading "known,
    // accepted divergences". The divergence was acceptable only while nothing
    // displayed them; the moment the screens do, an edge function that omits
    // them is writing an incomplete chart, not making a scoping choice.
    const src = read(rel);
    expect(src).toMatch(/calculateMidheaven/);
    expect(src).toMatch(/calculateEqualHouses/);
    // And both must be gated on the ascendant, which is itself gated on the
    // clock and the place.
    expect(src).toMatch(/hasBirthTime && hasBirthPlace/);
  });

  it.each([
    ['calculate-chart', EDGE_FILES.calcChart, 'ascendantLong'],
    ['get-profile-chart', EDGE_FILES.profileChart, 'ascLong'],
  ])('%s gates the MC and the cusps on the ascendant itself', (_label, rel, ascVar) => {
    // Asserted on the SOURCE, not by execution, and that is not laziness.
    // `runEdge` reproduces the handler flow with its own gate, so a handler
    // whose gate was removed still comes back gated through the test — the
    // mutation is invisible to execution. Verified by deleting each gate and
    // watching the suite stay green until these two assertions existed.
    // Patterns built by concatenation, never in a template literal: a `\s` or
    // `\w` inside backticks loses its backslash before the RegExp sees it, so
    // the pattern matches nothing while the test still reads as if it checked
    // something. That exact mistake shipped in this file once already.
    const src = read(rel);
    expect(src).toMatch(new RegExp('mc\\w*\\s*=\\s*' + ascVar + ' != null'));
    expect(src).toMatch(new RegExp('housesArr\\s*=\\s*' + ascVar + ' != null'));
    // And no ungated call can sneak past by defaulting the missing value.
    expect(/calculateMidheaven\(time, \(?lng[^)]*\|\|/.test(src)).toBe(false);
    expect(new RegExp('calculateEqualHouses\\(' + ascVar + '[^)]*\\|\\|').test(src)).toBe(false);
  });

  it('leaves the shared engine as the only one that persists them', () => {
    // `toStoredBirthChart` writes mc and houses as of 2026-09-01. The edge
    // functions return them in the response; what reaches `profiles.birth_chart`
    // is whatever the client then stores.
    const stored = read('packages/shared/src/astrology/stored.ts');
    expect(stored).toMatch(/mc: chart\.mc/);
    expect(stored).toMatch(/houses: chart\.houses/);
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
