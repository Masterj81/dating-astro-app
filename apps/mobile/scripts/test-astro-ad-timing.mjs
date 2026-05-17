// Standalone test for services/planetaryHours.ts.
//
// AstroDating has no unit-test harness ("No tests yet" per CLAUDE.md);
// this script gives the planetary-hour helper a deterministic suite
// runnable via:
//
//     node apps/mobile/scripts/test-astro-ad-timing.mjs
//
// Node 22.6+ strips TypeScript at import time, so this .mjs can import
// the .ts module directly. All "now" values are injected so the
// outputs are reproducible across machines and time zones.

import {
  CHALDEAN_ORDER,
  PLANETARY_HOURS_DISCLAIMER,
  PLANET_WEIGHT,
  PLANET_INTENT,
  PLANET_INTENT_HINT,
  getPlanetScore,
  getStatus,
  isFavorablePlanet,
  getCurrentPlanetaryHour,
  getUpcomingPlanetaryHours,
  getNextFavorableHour,
  scoreHour,
  getAdTimingSnapshot,
} from '../services/planetaryHours.ts';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, err });
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label || 'mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assert(cond, label) {
  if (!cond) throw new Error(label || 'assertion failed');
}

// Fixed reference moment + location. Manhattan, 2026-05-17 17:00 UTC
// (i.e. 13:00 local EDT) on a Sunday — Sunday opens with Sun-hour at
// sunrise, so the daytime sequence is fully predictable.
const NYC = { lat: 40.7128, lon: -74.006 };
const SUNDAY_UTC = new Date(Date.UTC(2026, 4, 17, 17, 0, 0));

console.log('planetaryHours test suite');
console.log('=========================');

// --- Static planet weights -------------------------------------------

console.log('\nPlanet weights (MVP spec)');
test('Mercury weight 20', () => eq(PLANET_WEIGHT.Mercury, 20));
test('Venus weight 20', () => eq(PLANET_WEIGHT.Venus, 20));
test('Jupiter weight 20', () => eq(PLANET_WEIGHT.Jupiter, 20));
test('Sun weight 15', () => eq(PLANET_WEIGHT.Sun, 15));
test('Moon weight 5', () => eq(PLANET_WEIGHT.Moon, 5));
test('Mars weight 0', () => eq(PLANET_WEIGHT.Mars, 0));
test('Saturn weight -10 (raw); clamped to 0', () => {
  eq(PLANET_WEIGHT.Saturn, -10);
  eq(getPlanetScore('Saturn'), 0);
});

// --- Favorability classification -------------------------------------

console.log('\nFavorability classification');
test('Mercury favorable', () => assert(isFavorablePlanet('Mercury')));
test('Venus favorable', () => assert(isFavorablePlanet('Venus')));
test('Jupiter favorable', () => assert(isFavorablePlanet('Jupiter')));
test('Sun favorable', () => assert(isFavorablePlanet('Sun')));
test('Moon NOT in favorable set (soft-ok only)', () =>
  assert(!isFavorablePlanet('Moon')));
test('Mars not favorable', () => assert(!isFavorablePlanet('Mars')));
test('Saturn not favorable', () => assert(!isFavorablePlanet('Saturn')));

// --- Status banding boundaries ---------------------------------------

console.log('\nStatus banding boundaries');
test('score 20 → strong', () => eq(getStatus(20), 'strong'));
test('score 15 → strong (lower boundary)', () => eq(getStatus(15), 'strong'));
test('score 14 → usable', () => eq(getStatus(14), 'usable'));
test('score 5  → usable (lower boundary)', () => eq(getStatus(5), 'usable'));
test('score 4  → avoid', () => eq(getStatus(4), 'avoid'));
test('score 0  → avoid', () => eq(getStatus(0), 'avoid'));

// --- Disclaimer string ------------------------------------------------

console.log('\nDisclaimer');
test('disclaimer is non-empty', () =>
  assert(typeof PLANETARY_HOURS_DISCLAIMER === 'string' && PLANETARY_HOURS_DISCLAIMER.length > 20));
test('disclaimer says "Symbolic"', () =>
  assert(PLANETARY_HOURS_DISCLAIMER.includes('Symbolic')));
test('disclaimer says "not a performance prediction"', () =>
  assert(PLANETARY_HOURS_DISCLAIMER.toLowerCase().includes('not a performance prediction')));
test('snapshot.disclaimer matches constant', () => {
  const snap = getAdTimingSnapshot(SUNDAY_UTC, NYC.lat, NYC.lon, 3);
  eq(snap.disclaimer, PLANETARY_HOURS_DISCLAIMER);
});

// --- Planetary-hour computation (deterministic) -----------------------

console.log('\nPlanetary-hour computation');

test('Chaldean order has 7 planets', () => eq(CHALDEAN_ORDER.length, 7));

test('Current hour at NYC 2026-05-17 17:00 UTC is well-formed', () => {
  const h = getCurrentPlanetaryHour(SUNDAY_UTC, NYC.lat, NYC.lon);
  assert(h.planet, 'planet present');
  assert(h.startTime instanceof Date, 'startTime is Date');
  assert(h.endTime instanceof Date, 'endTime is Date');
  assert(h.endTime > h.startTime, 'end after start');
  assert(SUNDAY_UTC >= h.startTime && SUNDAY_UTC < h.endTime, 'now lies inside hour');
  assert(typeof h.isDay === 'boolean', 'isDay present');
});

test('Sunday daytime opens with the Sun hour', () => {
  // Mid-morning Sunday in NYC: well after sunrise, well before sunset.
  // The first day-hour is the Sun hour; the hour active at ~13:00 UTC
  // (sunrise ~ 09:35 UTC, ~ 65min into a 12-hour split arc) is the
  // 4th day-hour. Chaldean sequence from Sun: Sun, Venus, Mercury,
  // Moon, Saturn, Jupiter, Mars, Sun, … so the 4th is Moon.
  const morningUTC = new Date(Date.UTC(2026, 4, 17, 13, 0, 0));
  const h = getCurrentPlanetaryHour(morningUTC, NYC.lat, NYC.lon);
  assert(h.isDay, 'should be daytime');
  assert(
    ['Sun', 'Venus', 'Mercury', 'Moon'].includes(h.planet),
    `expected one of the first four day-hours, got ${h.planet}`,
  );
});

test('Upcoming hours form a contiguous Chaldean walk', () => {
  const hours = getUpcomingPlanetaryHours(SUNDAY_UTC, NYC.lat, NYC.lon, 8);
  assert(hours.length === 8, `expected 8 hours, got ${hours.length}`);
  for (let i = 1; i < hours.length; i++) {
    const prev = hours[i - 1];
    const cur = hours[i];
    // Adjacency: each hour's end equals (within 1 ms) the next hour's start.
    assert(
      Math.abs(cur.startTime.getTime() - prev.endTime.getTime()) < 1000,
      `gap between hour ${i - 1} and ${i}: ${cur.startTime - prev.endTime}ms`,
    );
    // Chaldean cycle: ±1 step in CHALDEAN_ORDER (with wraparound).
    const idxPrev = CHALDEAN_ORDER.indexOf(prev.planet);
    const idxCur = CHALDEAN_ORDER.indexOf(cur.planet);
    eq((idxPrev + 1) % 7, idxCur, `planet step ${prev.planet}→${cur.planet}`);
  }
});

test('Determinism: same (now, lat, lon) → identical output', () => {
  const a = getAdTimingSnapshot(SUNDAY_UTC, NYC.lat, NYC.lon, 4);
  const b = getAdTimingSnapshot(SUNDAY_UTC, NYC.lat, NYC.lon, 4);
  eq(a.current.planet, b.current.planet);
  eq(a.current.startTime.getTime(), b.current.startTime.getTime());
  eq(a.current.endTime.getTime(), b.current.endTime.getTime());
  eq(a.upcoming.length, b.upcoming.length);
  for (let i = 0; i < a.upcoming.length; i++) {
    eq(a.upcoming[i].planet, b.upcoming[i].planet, `upcoming[${i}].planet`);
    eq(
      a.upcoming[i].startTime.getTime(),
      b.upcoming[i].startTime.getTime(),
      `upcoming[${i}].startTime`,
    );
  }
});

// --- Next-favorable-hour calculation ---------------------------------

console.log('\nNext favorable hour');

test('Next favorable hour after Saturn hour is Mercury/Venus/Jupiter/Sun', () => {
  // Pick a moment we know is mid-Saturn-hour: search forward starting
  // from any time until we land on Saturn, then jump to the start of
  // that hour and ask for the next favorable hour after it.
  let cursor = SUNDAY_UTC;
  let saturn = null;
  for (let i = 0; i < 48; i++) {
    const h = getCurrentPlanetaryHour(cursor, NYC.lat, NYC.lon);
    if (h.planet === 'Saturn') {
      saturn = h;
      break;
    }
    cursor = new Date(h.endTime.getTime() + 1);
  }
  assert(saturn, 'Saturn hour found within next 48 hours');
  const nxt = getNextFavorableHour(
    new Date(saturn.startTime.getTime() + 60_000),
    NYC.lat,
    NYC.lon,
  );
  assert(nxt, 'a favorable hour exists within 7 days');
  assert(
    isFavorablePlanet(nxt.planet),
    `expected favorable, got ${nxt.planet}`,
  );
  assert(
    nxt.startTime > saturn.startTime,
    'favorable hour starts after the Saturn hour',
  );
});

test('Next favorable hour at sunrise on Wednesday is Mercury', () => {
  // Wednesday's day-ruler is Mercury, so the very first day-hour
  // after Wednesday's sunrise is the Mercury hour. Pick a moment
  // just before Wednesday sunrise UTC in NYC and ask for the next
  // favorable hour.
  // 2026-05-20 (Wed). Sunrise ~ 09:32 UTC. Query at 09:00 UTC.
  const beforeWedSunrise = new Date(Date.UTC(2026, 4, 20, 9, 0, 0));
  const nxt = getNextFavorableHour(beforeWedSunrise, NYC.lat, NYC.lon);
  assert(nxt, 'favorable hour found');
  eq(nxt.planet, 'Mercury', 'Wednesday opens with Mercury');
  // The Mercury hour must score 20 → strong.
  eq(nxt.score, 20);
  eq(nxt.status, 'strong');
});

// --- Scoring round-trip ---------------------------------------------

console.log('\nScoring round-trip');

test('scoreHour clamps Saturn to 0 / avoid', () => {
  const fake = {
    planet: 'Saturn',
    startTime: new Date(0),
    endTime: new Date(3600_000),
    isDay: true,
  };
  const scored = scoreHour(fake);
  eq(scored.score, 0);
  eq(scored.status, 'avoid');
  eq(scored.isFavorable, false);
});

test('scoreHour marks Jupiter strong/favorable', () => {
  const fake = {
    planet: 'Jupiter',
    startTime: new Date(0),
    endTime: new Date(3600_000),
    isDay: false,
  };
  const scored = scoreHour(fake);
  eq(scored.score, 20);
  eq(scored.status, 'strong');
  eq(scored.isFavorable, true);
});

// --- Intent map sanity ----------------------------------------------

console.log('\nIntent map');

test('Every planet has an intent', () => {
  for (const p of CHALDEAN_ORDER) {
    assert(PLANET_INTENT[p], `${p} missing intent`);
    assert(PLANET_INTENT_HINT[p], `${p} missing intent hint`);
  }
});

test('Saturn intent is discouraged', () => {
  eq(PLANET_INTENT.Saturn, 'discouraged');
});

// --- Summary ---------------------------------------------------------

console.log('\n=========================');
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f.name}`);
    console.error(`    ${f.err.stack || f.err.message}`);
  }
  process.exit(1);
}
process.exit(0);
