#!/usr/bin/env node
// Guards against fabricated astrology.
//
// WHY THIS EXISTS
// ---------------
// Every defect this file watches for shipped to production, none of them
// raised an error, and none of them broke a render. They were caught by
// reading the code, not by running it:
//
//   mobile  natal-chart.tsx   { degree: 15, house: 1 } — literals, identical
//                             for every user on earth, feeding one of the 96
//                             `natalPlanetInHouse_*` interpretations.
//   mobile  natal-chart.tsx   `data.mercury_sign || signs[3]` — and `profiles`
//                             has no mercury_sign column, so the fallback
//                             fired 100% of the time. Five invented planets.
//   web     NatalChartOverview `((baseSeed + index * 2) % 12) + 1` — a hash of
//                             string lengths, stable per profile, which also
//                             rearranged a reader's "houses" when they fixed a
//                             typo in their name.
//   edge    calculate-chart    `lat = 51.5074; lng = 0` — Greenwich, handed
//                             straight to calculateAscendant.
//   mobile  geocoding.ts       Montréal for any unresolvable city.
//   mobile  astrology.ts       Montréal as default parameters.
//
// The shape is always the same: a plausible value substituted for an absent
// one. Nothing about it looks wrong on screen, which is exactly why it needs a
// build-time assertion rather than a code review.
//
// See docs/twelve-houses-audit-2026-08.md.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'ja', 'ar', 'zh'];

let checks = 0;
let failures = 0;

const check = (label, ok, detail = '') => {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`        ${detail}`);
};

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`Missing file: ${rel}`);
    process.exit(2);
  }
  return readFileSync(file, 'utf8');
}

/**
 * Structural checks run against code with comments stripped.
 *
 * Without this, the comments that explain each removed bug — which quote the
 * exact expressions below, on purpose, so the next reader knows what not to
 * reintroduce — would trip every guard. A validator that forces you to stop
 * documenting your bugs is worse than no validator.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
}

const FILES = {
  mobileScreen: 'apps/mobile/app/premium-screens/natal-chart.tsx',
  webScreen: 'apps/web/src/components/NatalChartOverview.tsx',
  mobileFacade: 'apps/mobile/services/astrology.ts',
  mobileGeocoding: 'apps/mobile/services/geocoding.ts',
  mobileOnboarding: 'apps/mobile/app/onboarding/birth-info.tsx',
  mobilePreview: 'apps/mobile/app/welcome/preview.tsx',
  engine: 'packages/shared/src/astrology/chart.ts',
  houses: 'packages/shared/src/astrology/houses.ts',
  rising: 'packages/shared/src/astrology/rising.ts',
  mobileProfile: 'apps/mobile/app/(tabs)/profile.tsx',
  mobileSynastry: 'apps/mobile/app/premium-screens/synastry.tsx',
  webProfile: 'apps/web/src/components/AccountProfileWorkspace.tsx',
  webSynastry: 'apps/web/src/components/SynastryOverview.tsx',
  synastryView: 'packages/shared/src/astrology/synastry-view.ts',
  stored: 'packages/shared/src/astrology/stored.ts',
  calcChart: 'supabase/functions/calculate-chart/index.ts',
  profileChart: 'supabase/functions/get-profile-chart/index.ts',
};

const raw = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const code = Object.fromEntries(Object.entries(raw).map(([k, src]) => [k, stripComments(src)]));

// --- no invented signs -------------------------------------------------------
console.log('no invented signs');

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: no getFallbackSign`,
    !/getFallbackSign/.test(code[key]),
    'a sign derived from a seed is a fact JUNO does not have',
  );
  check(
    `${FILES[key]}: no "|| signs[...]" placement fallback`,
    !/\|\|\s*signs\s*\[/.test(code[key]),
    'this fired 100% of the time on mobile — the columns it fell back from never existed',
  );
  check(
    `${FILES[key]}: no all-twelve-signs array left to reach for`,
    !hasPickableZodiacArray(code[key]),
    'membership tests belong in SIGN_ELEMENTS / SIGN_MODALITIES, not a pickable list',
  );
}

/**
 * True when a single array literal holds (nearly) the whole zodiac.
 *
 * Deliberately NOT a span regex: `getElement` and `getModality` legitimately
 * declare four short arrays — ['Aries','Leo','Sagittarius'] and friends — and a
 * `[\s\S]{0,240}` window walks straight across all four and reports a list
 * nobody wrote. Bracket spans are matched with `[^\]]` so a closing bracket
 * ends the candidate, and a match needs ten of the twelve names.
 */
function hasPickableZodiacArray(source) {
  const NAMES = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
  ];
  for (const span of source.match(/\[[^[\]]*\]/g) ?? []) {
    const found = NAMES.filter((name) => span.includes(`'${name}'`) || span.includes(`"${name}"`));
    if (found.length >= 10) return true;
  }
  return false;
}

// --- no invented degrees or houses -------------------------------------------
console.log('no invented degrees or houses');

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: no numeric literal assigned to degree`,
    !/\bdegree\s*:\s*-?\d/.test(code[key]),
    'degree must come from a stored placement, never a constant',
  );
  check(
    `${FILES[key]}: no numeric literal assigned to house`,
    !/\bhouse\s*:\s*-?\d/.test(code[key]),
    'house must come from houseOfLongitude against trustworthy cusps',
  );
  check(
    `${FILES[key]}: no seed feeding a placement`,
    !/baseSeed/.test(code[key]),
    'a hash of string lengths is not an ephemeris',
  );
  check(
    `${FILES[key]}: no modulo-derived astrological value`,
    !/(degree|house|sign)\s*:\s*\(\(?[^)]*%[^)]*\)/.test(code[key]),
    '`% 12` and `% 29` are how the fabricated houses and degrees were built',
  );
}

// --- the house number must be proven before it is used -----------------------
console.log('natalPlanetInHouse_* only against a proven house');

check(
  'mobile: hasHouse tests for a real value, not a range that is always true',
  /const hasHouse = pos\.house !== null/.test(code.mobileScreen),
  'it was `pos.house >= 1 && pos.house <= 12`, unconditionally true for a literal',
);
check(
  'web: hasHouse tests for a real value, not a range that is always true',
  /const hasHouse = houseNumber !== null/.test(code.webScreen),
  'same defect, same shape',
);
// The two screens express the same gate differently, so assert each shape
// rather than one loose pattern that would pass on a coincidence.
check(
  'mobile: the planet-in-house lookup is gated on hasHouse',
  /const planetInHouse = hasHouse\s*\?[\s\S]{0,120}?natalPlanetInHouse_/.test(code.mobileScreen),
  '96 interpretations x 8 locales must never render against an unproven number',
);
check(
  'web: the planet-in-house lookup is gated on hasHouse',
  /const hasPlanetInHouse = hasHouse && t\.has\(planetInHouseKey\)/.test(code.webScreen),
  'same guarantee, different shape',
);
check(
  'web: the interpretation is only read behind that gate',
  !/(^|[^s])t\(planetInHouseKey\)/.test(
    code.webScreen.replace(/hasPlanetInHouse\s*\?\s*\n?\s*t\(planetInHouseKey\)/g, ''),
  ),
  'the only read of t(planetInHouseKey) must sit behind hasPlanetInHouse',
);

// --- houses require the clock AND the place ----------------------------------
console.log('houses require both the clock and the place');

check(
  'the shared gate exists and is exported',
  /export function areHousesTrustworthy/.test(code.houses),
);
check(
  'it refuses anything that is not the complete state',
  /resolveBirthDataState\(input\) !== 'complete'\) return false/.test(code.houses),
);
check(
  'it still applies the rising gate on top',
  /return isRisingTrustworthy\(input\)/.test(code.houses),
  'the rising rules protect rows the old Aries fallback poisoned',
);
check(
  'the birthplace check is delegated, not reimplemented',
  /if \(!hasUsableBirthPlace\(input\)\) \{\s*\n\s*return 'missing_birth_place';/.test(code.houses),
  'houses and the ascendant must ask the same question; the finiteness of that one definition is asserted in the rising section below',
);
check(
  'a guessed timezone counts as a missing place',
  /confidence === 'low'\) return 'missing_birth_place'/.test(code.houses),
  'one hour of timezone error is ~15 degrees of ascendant, half a house',
);
check(
  'cusps are never derived from a bare sign',
  /export function resolveRisingLongitude/.test(code.houses) &&
    /resolveRisingLongitude\(input\.birthChart\)/.test(code.houses),
  'a sign is 30 degrees wide; a cusp built on one is wrong by up to a whole house',
);

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: the house number comes from houseOfLongitude`,
    /houseOfLongitude\(/.test(code[key]),
  );
  check(
    `${FILES[key]}: the cusps come from resolveHouseCusps`,
    /resolveHouseCusps\(/.test(code[key]),
  );
}

// --- the engine refuses to invent a birthplace -------------------------------
console.log('no invented birthplace');

check(
  'the engine requires a finite birthplace before computing angles',
  /const hasBirthPlace =[\s\S]{0,220}?Number\.isFinite\(input\.longitude\)/.test(code.engine),
);
check(
  'angles are computed only with the clock AND the place',
  /if \(normalized\.hasBirthTime && hasBirthPlace\)/.test(code.engine),
  'this is the one line that stops Greenwich and Montreal coming back',
);
check(
  'the engine says so instead of failing silently',
  /warnings\.push\('missing_birth_place'\)/.test(code.engine),
);

const INVENTED_PLACES = [
  ['Greenwich', /(lat|latitude)\s*[=:]\s*51\.5074/],
  ['Montreal', /(lat|latitude)\s*[=:]\s*45\.5017/],
  ['Montreal longitude', /(lng|longitude)\s*[=:]\s*-73\.5673/],
];
/**
 * Drop the city gazetteers before looking for invented birthplaces.
 *
 * `calculate-chart` and `geocoding.ts` both carry a lookup table in which
 * London and Montréal are legitimate ENTRIES — `'london': { lat: 51.5074, … }`.
 * Those are answers to a question the reader asked. What must never come back
 * is the same coordinates used as a DEFAULT for a question they did not.
 */
function stripCityGazetteer(source) {
  return source.replace(/^\s*['"][a-z\s'’.-]+['"]\s*:\s*\{[^}]*\},?\s*$/gim, '');
}

for (const key of ['calcChart', 'profileChart', 'mobileFacade', 'mobileGeocoding']) {
  const withoutGazetteer = stripCityGazetteer(code[key]);
  for (const [label, pattern] of INVENTED_PLACES) {
    check(
      `${FILES[key]}: no silent fallback to ${label}`,
      !pattern.test(withoutGazetteer),
      'a substituted birthplace relocates every angle in the chart',
    );
  }
  // A bare coordinate pair passed as arguments is the other shape it took:
  // `return buildResult(45.5017, -73.5673, city)`.
  check(
    `${FILES[key]}: no invented coordinate pair passed as arguments`,
    !/\(\s*-?(51\.5074|45\.5017)\s*,\s*-?(0|73\.5673|0\.1278)\b/.test(withoutGazetteer),
  );
}
check(
  'calculate-chart tests coordinates for finiteness, not truthiness',
  !/if \(!lat \|\| !lng\)/.test(code.calcChart),
  'zero is a real coordinate; this replaced CORRECT data with invented data',
);
check(
  'calculate-chart withholds the ascendant without a place',
  /hasBirthTime && hasBirthPlace/.test(code.calcChart),
);
check(
  'get-profile-chart withholds the ascendant without a place',
  /hasBirthTime && hasBirthPlace/.test(code.profileChart),
);
check(
  'geocodeCity may return null rather than a stand-in city',
  /Promise<GeoResult \| null>/.test(code.mobileGeocoding),
);
check(
  'onboarding no longer geocodes the string "Montreal" for a blank city',
  !/geocodeCity\([^)]*\|\|\s*['"]Montreal['"]/.test(code.mobileOnboarding),
);
check(
  'the welcome preview no longer stands (0, 0) in for an unknown place',
  !/let lat = 0;\s*\n\s*let lng = 0;/.test(code.mobilePreview),
);

// --- the ascendant needs the place, not only the clock -----------------------
console.log('the ascendant needs the birthplace');

check(
  'there is ONE definition of a usable birthplace',
  /export function hasUsableBirthPlace/.test(code.rising) &&
    /hasUsableBirthPlace\(input\)/.test(code.houses),
  'two definitions is one too many — the divergence is how the ascendant kept a fallback the houses had rejected',
);
check(
  'it is a null test, not a truthiness test',
  /typeof input\.birthLatitude === 'number' &&\s*Number\.isFinite\(input\.birthLatitude\)/.test(code.rising),
  'zero is a coordinate; `!lat || !lng` replaced CORRECT data with invented data',
);
check(
  'isRisingTrustworthy refuses a sign when the caller sees no coordinates',
  /if \(canSeeBirthPlace\(input\) && !hasUsableBirthPlace\(input\)\) return false;/.test(code.rising),
);
check(
  'the confirmation state exists and is exported',
  /export function risingNeedsLocationConfirmation/.test(code.rising),
);
check(
  'it never asks someone whose blocker is the clock',
  /if \(typeof birthTime !== 'string' \|\| birthTime\.trim\(\)\.length === 0\) return false;/.test(code.rising),
  'the city would not help them; asking sends them to fix the wrong field',
);
// Scoped to the body of `resolveTrustedRisingSign` only: the field is
// legitimately read elsewhere in the file, by the function whose whole job is
// to decide whether to OFFER a recomputation.
const resolveBody = code.rising.slice(
  code.rising.indexOf('export function resolveTrustedRisingSign'),
);
check(
  'the set-aside sign is never returned as a placement',
  resolveBody.length > 0 &&
    !/unconfirmedRisingSign/.test(resolveBody.slice(0, resolveBody.indexOf('\n}'))),
  'rising_sign_unconfirmed exists to be recomputed, never to be rendered',
);

for (const key of ['mobileScreen', 'webScreen', 'mobileProfile', 'mobileSynastry', 'webProfile', 'webSynastry']) {
  check(
    `${FILES[key]}: the own-side rising gate is given the coordinates`,
    /birthLatitude:/.test(code[key]) && /birthLongitude:/.test(code[key]),
    'a caller that can read the columns and does not pass them silently trusts a Greenwich ascendant',
  );
}
for (const key of ['mobileSynastry', 'webSynastry']) {
  check(
    `${FILES[key]}: no synastry score rests on an unproven ascendant`,
    (code[key].match(/resolveTrustedRisingSign\(/g) || []).length >= 2,
  );
}

// --- the migration moves, it does not delete ---------------------------------
console.log('suspect ascendants are moved, not deleted');

const RISING_MIGRATION = path.join(
  ROOT, 'supabase/migrations/20260901000002_rising_needs_location_confirmation.sql',
);
const risingSql = existsSync(RISING_MIGRATION) ? readFileSync(RISING_MIGRATION, 'utf8') : '';
check('the migration exists', risingSql.length > 0);
check(
  'it preserves the value instead of deleting it',
  /rising_sign_unconfirmed = COALESCE\(rising_sign_unconfirmed, rising_sign\)/.test(risingSql),
  'a placement someone has seen for months is not erased silently',
);
check(
  'it clears the column every blind surface reads',
  /SET rising_sign_unconfirmed = COALESCE[\s\S]{0,120}?rising_sign\s*=\s*NULL/.test(risingSql),
  'get_discoverable_profiles returns no birth data at all — only the column can hide it there',
);
check(
  'it sets the chart placement aside too',
  /rising_unconfirmed/.test(risingSql) && /'\{rising\}', 'null'::jsonb/.test(risingSql),
  'birth_chart.rising feeds synastry scoring and the equal-house cusps',
);
check(
  'it asserts the stronger invariant afterwards',
  /rising_sign IS NOT NULL[\s\S]{0,160}?birth_latitude IS NULL OR birth_longitude IS NULL/.test(risingSql),
);
check(
  'it never deletes a profile row',
  !/DELETE\s+FROM\s+public\.profiles/i.test(risingSql),
);

// --- the substituted birthplaces ---------------------------------------------
// 20260901000002 looked for ascendants stored against NULL coordinates and
// found none, because the mobile path never stored NULL: `geocodeCity` ended
// with `return buildResult(45.5017, -73.5673, city)`, so an unresolved city
// became Montréal — a fact, indistinguishable from a real birthplace. 69
// profiles held it; 58 of them carried an ascendant that had been counted as
// reliable.
console.log('no substituted birthplace left in the data');

const PLACE_MIGRATION = path.join(
  ROOT, 'supabase/migrations/20260901000003_null_substituted_birthplaces.sql',
);
const placeSql = existsSync(PLACE_MIGRATION) ? readFileSync(PLACE_MIGRATION, 'utf8') : '';
check('the birthplace repair migration exists', placeSql.length > 0);
check(
  'it nulls the invented coordinates rather than keeping them',
  /SET birth_latitude\s*=\s*NULL,[\s\S]{0,40}?birth_longitude\s*=\s*NULL/.test(placeSql),
  'a future recompute would read Montréal back and rebuild the same wrong chart',
);
check(
  'it spares people genuinely born in Montréal',
  /lower\(birth_city\) NOT LIKE '%montr%'/.test(placeSql),
  "CITY_CACHE['montreal'] holds exactly these coordinates, so they are legitimate for some readers",
);
check(
  'it keeps what the reader actually typed',
  !/birth_city\s*=\s*NULL/.test(placeSql),
  'birth_city is not fabricated, and the confirmation flow needs it to pre-fill',
);
check(
  'it clears the coordinates echoed inside the chart too',
  /'\{coordinates\}'/.test(placeSql),
  'hydrateStoredChart reads them back into NatalChart.input',
);
check(
  'it leaves the ascendant to the BEFORE trigger',
  !/rising_sign_unconfirmed\s*=/.test(placeSql),
  'one rule in one place; the migration doubles as proof the trigger fires',
);
check(
  'it refuses to run if an UPDATE trigger could send mail',
  // Two halves, because checking only that the pre-flight EXISTS passes even
  // when its condition has been neutered to `IF FALSE THEN` — verified by
  // reintroducing exactly that.
  /tgtype & 16[\s\S]{0,240}?scheduled_emails/.test(placeSql) &&
    /IF v_mailers > 0 THEN\s*\n\s*RAISE EXCEPTION/.test(placeSql),
  '69 rows updated with an unguarded mailer attached would be 69 unwanted emails',
);
check(
  'it deletes no profile',
  !/DELETE\s+FROM\s+public\.profiles/i.test(placeSql),
);

// The root cause: Nominatim refuses anything without an identifying
// User-Agent, and React Native's platform default does not qualify. The edge
// function has always sent one; the client never did, so every city outside a
// 43-entry cache was refused and fell through to Montréal. 67 readers named
// Sofia, Varna, Vienna, Verona, Lima or Tampa and were stored in Quebec.
check(
  'the mobile geocoder identifies itself to Nominatim',
  /nominatim/i.test(code.mobileGeocoding) &&
    /'User-Agent':\s*'JUNO/.test(code.mobileGeocoding),
  'without it Nominatim answers 403 and every non-cached city silently becomes the fallback',
);
check(
  'a refused geocode is logged, not swallowed',
  /if \(!response\.ok\)[\s\S]{0,300}?console\.warn/.test(code.mobileGeocoding),
  'a 403 affecting every non-cached city looked exactly like "city not found"',
);
check(
  'a two-letter input cannot match a metropolis',
  /normalized\.length >= 4 && name\.includes\(normalized\)/.test(code.mobileGeocoding),
  '`name.includes("on")` matches london; `"a"` matches almost everything',
);
check(
  'the edge geocoder still identifies itself too',
  /'User-Agent':/.test(code.calcChart),
);

// The fallback that created them must stay gone.
check(
  'geocodeCity still returns null instead of a stand-in city',
  /Promise<GeoResult \| null>/.test(code.mobileGeocoding) &&
    !/buildResult\(45\.5017/.test(stripCityGazetteer(code.mobileGeocoding)),
);

// --- every column read must be a column selected ------------------------------
// This is a CLASS of bug, not an instance. `get-profile-chart` read
// `target.birth_chart` for its stored timezone and never selected it, so the
// value was permanently `undefined`. Nothing threw. The zone was re-derived,
// `tz.source` fell from 'input' to 'lookup', confidence from 'high' to
// 'medium', and `applyConfidenceCap` truncated every synastry score to 92 —
// the best matches in the product, invisible, for the life of the function.
//
// A generic check is worth far more than one assertion about birth_chart: it
// catches the next column somebody forgets.
console.log('columns read are columns selected');

function selectedColumns(source) {
  // `.select( 'a, b, ' + 'c, d' )` — collect every quoted fragment up to the
  // closing paren, then split on commas.
  const start = source.indexOf('.select(');
  if (start < 0) return null;
  const end = source.indexOf(')', start);
  if (end < 0) return null;
  const fragment = source.slice(start, end);
  const quoted = [...fragment.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
  return new Set(
    quoted.split(',').map((c) => c.trim()).filter(Boolean),
  );
}

function readColumns(source) {
  // Word boundary written as a character class, not ``: an earlier revision
  // of this file carried a literal backspace (0x08) here instead, so the regex
  // matched nothing and the check below passed vacuously. A guard that cannot
  // fail is worse than no guard.
  return new Set(
    [...source.matchAll(/(?:^|[^A-Za-z0-9_$])target\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]),
  );
}

const selected = selectedColumns(code.profileChart);
check('the target select list was located', selected !== null && selected.size > 5);
if (selected) {
  const missing = [...readColumns(code.profileChart)].filter((c) => !selected.has(c));
  check(
    'get-profile-chart selects every column it reads',
    missing.length === 0,
    missing.length
      ? `read but never selected: ${missing.join(', ')} — these are silently undefined`
      : '',
  );
  check(
    'birth_chart specifically is selected',
    selected.has('birth_chart'),
    'it carries the stored IANA timezone; without it every score is capped at 92',
  );
}

// --- an unknown place is not the Gulf of Guinea -------------------------------
// `Math.round(null * 2) / 2` is 0 in JavaScript. The coarsening step returned
// `{ latitude: 0, longitude: 0 }` for a profile with no birthplace — a
// fabricated location in an API response, and the exact shape
// `hydrateStoredChart` reads coordinates from.
check(
  'coarsened coordinates stay null when the birthplace is unknown',
  /const coarseLat = hasBirthPlace \? Math\.round/.test(code.profileChart) &&
    /const coarseLng = hasBirthPlace \? Math\.round/.test(code.profileChart),
  'Math.round(null * 2) / 2 === 0, which is a real coordinate',
);
check(
  'no unguarded numeric coercion of a nullable coordinate',
  !/Math\.round\(lat \* 2\)/.test(code.profileChart) &&
    !/Math\.round\(lng \* 2\)/.test(code.profileChart),
);

// --- the sanitizer stays an allowlist ----------------------------------------
// Selecting birth_chart is only safe because sanitizeProfile enumerates what
// leaves. If it ever became a denylist or a spread, the raw birth data of
// every profile would be one refactor away from the wire.
check(
  'sanitizeProfile enumerates its output rather than spreading the row',
  /function sanitizeProfile/.test(code.profileChart) &&
    !/function sanitizeProfile[\s\S]{0,400}?\.\.\.target/.test(code.profileChart),
  'a spread would put birth_time, birth_chart and raw coordinates on the wire',
);
const sanitizerBody = (() => {
  const from = code.profileChart.indexOf('function sanitizeProfile');
  if (from < 0) return '';
  const rest = code.profileChart.slice(from);
  const close = rest.indexOf('\n}');
  return close < 0 ? rest : rest.slice(0, close);
})();
for (const forbidden of [
  'birth_chart',
  'birth_time',
  'birth_date',
  'birth_latitude',
  'birth_longitude',
  'email',
  'push_token',
]) {
  check(
    `sanitizeProfile never returns ${forbidden}`,
    sanitizerBody.length > 0 && !new RegExp(`${forbidden}\\s*:`).test(sanitizerBody),
  );
}

const BANNED_SYNASTRY = [
  /soulmate/i,
  /perfect match/i,
  /guaranteed/i,
  /destined/i,
  /destiny/i,
];

// --- one synastry engine, and it is the real one ------------------------------
// JUNO shipped a complete aspect engine and called it from nowhere; readers saw
// `calculateSunCompatibility(sun_sign, sun_sign)` instead — two Venus placements
// 1 degree apart scored identically to two 29 degrees apart, because degrees
// never entered the calculation. (audit 2026-09 section 5.11.)
console.log('one synastry engine, the real one');

check(
  'the shared adapter exists and is the single entry point',
  /export function buildSynastryView/.test(code.synastryView),
);
check(
  'it refuses to score a chart it could not hydrate',
  /if \(!mine && !theirs\) return \{ source: 'sign-rhythm'/.test(code.synastryView) &&
    /if \(!mine\) return/.test(code.synastryView) &&
    /if \(!theirs\) return/.test(code.synastryView),
  'a partial chart must be named as missing, never scored as zero',
);
// Scoped to the interface body rather than matched across newlines: the
// discriminated union is what stops a screen rendering a score it does not
// have, so the check must actually look at what that branch carries.
const fallbackInterface = (() => {
  const from = code.synastryView.indexOf('export interface SynastrySignRhythmView');
  if (from < 0) return '';
  const rest = code.synastryView.slice(from);
  const close = rest.indexOf('}');
  return close < 0 ? rest : rest.slice(0, close);
})();
check(
  'the fallback branch carries no score fields at all',
  fallbackInterface.length > 0 &&
    /source: 'sign-rhythm'/.test(fallbackInterface) &&
    /reason: SynastryFallbackReason/.test(fallbackInterface) &&
    !/score|frames|headline|confidence/.test(fallbackInterface),
  'a fallback view that carried a score field would let a screen show one',
);
check(
  'legacy charts hydrate to medium, not high',
  /raw === 'low' \? raw : 'medium'/.test(code.stored),
  '74 of 95 stored charts are v1 — the least trustworthy data, and they used to get the top rating',
);

for (const key of ['mobileSynastry', 'webSynastry']) {
  check(
    `${FILES[key]}: the headline score comes from the aspect engine`,
    // Whitespace is collapsed first: the two screens format the ternary
    // differently, and a newline-sensitive pattern would pass on one platform
    // and fail on the other for no reason that matters.
    /buildSynastryView\(/.test(code[key]) &&
      /aspectView \? aspectView\.headline\.score/.test(
        code[key].replace(/\s+/g, ' '),
      ),
    'this is the whole point of the change',
  );
  check(
    `${FILES[key]}: the sign score survives only as a labelled fallback`,
    /!aspectView && me && other/.test(code[key].replace(/\s+/g, ' ')),
    'it must never be blended with, or shown under the same label as, the aspect score',
  );
  check(
    `${FILES[key]}: the fallback is named "sign rhythm", not "score"`,
    /synastrySignRhythmTitle/.test(code[key]),
  );
  check(
    `${FILES[key]}: the aspect block shows the orbs`,
    /formatOrb\(/.test(code[key]),
    'an aspect 0.4 degrees from exact and one 7.8 degrees from exact are not the same contact',
  );
  check(
    `${FILES[key]}: all three frames are rendered`,
    /aspectView\.frames\.map/.test(code[key]),
  );
  check(
    `${FILES[key]}: a limited confidence is told to the reader`,
    /aspectView\.isLimited/.test(code[key]) && /synastryLimitedConfidence/.test(code[key]),
  );
  check(
    `${FILES[key]}: both platforms use the SAME adapter`,
    /from ['"]@astro\/shared\/astrology['"]/.test(raw[key]),
    'two implementations of the headline number is how the platforms drift',
  );
}

// The copy must not promise anything, on either platform.
const SYNASTRY_KEYS = [
  'synastryAspectBasedTitle',
  'synastryAspectBasedBody',
  'synastryTopAspectsTitle',
  'synastryLimitedConfidence',
  'synastryMissingAscendant',
  'synastrySignRhythmTitle',
  'synastrySignRhythmBody',
  'synastryNeedsBothCharts',
  'synastryFrame_love',
  'synastryFrame_friendship',
  'synastryFrame_business',
  'synastryAspect_conjunction',
  'synastryAspect_sextile',
  'synastryAspect_square',
  'synastryAspect_trine',
  'synastryAspect_opposition',
];
for (const locale of LOCALES) {
  const webFile = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  const mobileFile = path.join(ROOT, 'apps/mobile/locales', `${locale}.json`);
  if (!existsSync(webFile) || !existsSync(mobileFile)) continue;
  const web = JSON.parse(readFileSync(webFile, 'utf8')).webApp ?? {};
  const mobile = JSON.parse(readFileSync(mobileFile, 'utf8'));
  for (const [name, bag] of [['web', web], ['mobile', mobile]]) {
    const missing = SYNASTRY_KEYS.filter((k) => typeof bag[k] !== 'string' || !bag[k].trim());
    check(`${locale}: ${name} synastry copy present`, missing.length === 0, missing.join(', '));
  }
  const offenders = SYNASTRY_KEYS.filter((key) => {
    const value = web[key];
    return typeof value === 'string' && BANNED_SYNASTRY.some((p) => p.test(value));
  });
  check(`${locale}: synastry copy promises nothing`, offenders.length === 0, offenders.join(', '));
}

// --- the angles are shown, and only when they are real ------------------------
// The MC was computed by the shared engine and displayed by nothing, while the
// edge functions did not compute it at all — so a chart written through web
// onboarding lost its midheaven permanently. Unlike equal-house cusps, an MC
// cannot be rebuilt from the ascendant afterwards.
console.log('the angles, and the honest absence of them');

check(
  'the trusted-midheaven helper exists',
  /export function resolveTrustedMidheaven/.test(code.houses),
);
check(
  'it applies the same gate as the houses',
  /if \(!areHousesTrustworthy\(input\)\) return null;/.test(
    code.houses.slice(code.houses.indexOf('export function resolveTrustedMidheaven')),
  ),
  'an MC without a birthplace is the same fabrication as a rising sign without one',
);
check(
  'the MC is never rebuilt from the ascendant',
  !/resolveRisingLongitude/.test(
    code.houses.slice(code.houses.indexOf('export function resolveTrustedMidheaven')).slice(0, 900),
  ),
  'equal-house cusps derive from the ascendant; the midheaven does not',
);
check(
  'MC-versus-tenth-cusp is checked, never assumed',
  /export function mcIsTenthCusp/.test(code.houses),
  'they coincide in Placidus and Koch, not in Equal House',
);
check(
  'the stored chart now persists mc and houses',
  /mc: chart\.mc/.test(code.stored) && /houses: chart\.houses/.test(code.stored),
);

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: renders the midheaven behind resolveTrustedMidheaven`,
    /resolveTrustedMidheaven\(/.test(code[key]) && /natalMidheavenLabel/.test(code[key]),
  );
  check(
    `${FILES[key]}: says the MC is not the tenth cusp in equal house`,
    /natalMidheavenNotTenthCusp/.test(code[key]) && /mcIsTenthCusp\(/.test(code[key]),
    'a screen that shows both must not let the reader assume they are one point',
  );
  check(
    `${FILES[key]}: the angles card explains its own absence`,
    /natalAnglesNeedBirthData/.test(code[key]),
  );
  check(
    `${FILES[key]}: planets per house come from planetsByHouse`,
    /planetsByHouse\(/.test(code[key]) && /natalPlanetsInHouse/.test(code[key]),
    'a planet may only be placed from a real longitude against trustworthy cusps',
  );
  check(
    `${FILES[key]}: an empty house is said to be empty`,
    /natalNoPlanetsInHouse/.test(code[key]),
    'the alternative is a house that quietly acquires a plausible planet',
  );
}

const ANGLE_KEYS = [
  'natalAnglesTitle',
  'natalAnglesBody',
  'natalMidheavenLabel',
  'natalMidheavenMeaning',
  'natalRisingMeaning',
  'natalMidheavenNotTenthCusp',
  'natalMidheavenOnTenthCusp',
  'natalAnglesNeedBirthData',
  'natalPlanetsInHouse',
  'natalNoPlanetsInHouse',
];
for (const locale of LOCALES) {
  const webFile = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  const mobileFile = path.join(ROOT, 'apps/mobile/locales', `${locale}.json`);
  if (!existsSync(webFile) || !existsSync(mobileFile)) continue;
  const web = JSON.parse(readFileSync(webFile, 'utf8')).webApp ?? {};
  const mobile = JSON.parse(readFileSync(mobileFile, 'utf8'));
  for (const [name, bag] of [['web', web], ['mobile', mobile]]) {
    const missing = ANGLE_KEYS.filter((k) => typeof bag[k] !== 'string' || !bag[k].trim());
    check(`${locale}: ${name} angles copy present`, missing.length === 0, missing.join(', '));
  }
  const offenders = ANGLE_KEYS.filter((key) => {
    const value = web[key];
    return typeof value === 'string' && BANNED_SYNASTRY.some((p) => p.test(value));
  });
  check(`${locale}: angles copy promises nothing`, offenders.length === 0, offenders.join(', '));
}

// --- the CTA is shown, and only to the right people --------------------------
console.log('the confirm-your-birth-city CTA');

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: renders the CTA behind risingNeedsLocationConfirmation`,
    /needsLocationConfirmation\s*(\?|&&)[\s\S]{0,600}?risingNeedsBirthCity/.test(code[key]),
  );
  check(
    `${FILES[key]}: never renders the set-aside sign`,
    !/rising_sign_unconfirmed[\s\S]{0,80}?(<Text|<p|translateSign)/.test(code[key]),
    'it was cast for a city this reader has never been to',
  );
}

// --- the three states are explained, never left blank ------------------------
console.log('the three birth-data states');

for (const key of ['mobileScreen', 'webScreen']) {
  check(
    `${FILES[key]}: renders the general intro when there are no cusps`,
    /cuspSigns \? t\(["']natalChartHousesBody["']\) : t\(["']natalChartHousesBodyGeneral["']\)/.test(
      code[key],
    ),
    'the personalised copy promised a cusp sign the section did not deliver',
  );
  check(
    `${FILES[key]}: distinguishes a missing time from a missing place`,
    /birthDataState === ["']missing_birth_time["'][\s\S]{0,160}?natalHousesNeedBirthTime[\s\S]{0,160}?natalHousesNeedBirthPlace/.test(
      code[key],
    ),
    'telling someone to add their city when the clock is the blocker sends them to the wrong field',
  );
  check(
    `${FILES[key]}: the cusp sign renders only when cuspSigns exists`,
    /cuspSigns\s*(&&|\?)[\s\S]{0,320}?natalHouseCuspSign/.test(code[key]),
  );
}

check(
  'mobile renders the twelve houses at all',
  /natalHouseName_\$\{houseNumber\}/.test(code.mobileScreen),
  'the 24 keys shipped translated in 8 locales and were rendered nowhere',
);

// --- locale parity -----------------------------------------------------------
console.log('locale parity for the houses copy');

const NEW_KEYS = [
  'natalChartHousesTitle',
  'natalChartHousesBody',
  'natalChartHousesBodyGeneral',
  'natalHousesNeedBirthTime',
  'natalHousesNeedBirthPlace',
  'natalHousesCompleteBirthData',
  'natalHouseCuspSign',
  'risingNeedsBirthCityLabel',
  'risingNeedsBirthCity',
  'risingConfirmBirthCity',
];

for (const locale of LOCALES) {
  const webFile = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  const mobileFile = path.join(ROOT, 'apps/mobile/locales', `${locale}.json`);
  if (!existsSync(webFile) || !existsSync(mobileFile)) {
    check(`${locale}: both locale files exist`, false);
    continue;
  }
  const web = JSON.parse(readFileSync(webFile, 'utf8')).webApp ?? {};
  const mobile = JSON.parse(readFileSync(mobileFile, 'utf8'));

  const missingWeb = NEW_KEYS.filter((k) => typeof web[k] !== 'string' || !web[k].trim());
  const missingMobile = NEW_KEYS.filter((k) => typeof mobile[k] !== 'string' || !mobile[k].trim());
  check(`${locale}: web houses copy present`, missingWeb.length === 0, missingWeb.join(', '));
  check(`${locale}: mobile houses copy present`, missingMobile.length === 0, missingMobile.join(', '));

  // The twelve names and twelve meanings must exist on BOTH platforms, or the
  // ported section renders holes.
  for (const platform of [['web', web], ['mobile', mobile]]) {
    const [name, bag] = platform;
    const missing = [];
    for (let i = 1; i <= 12; i++) {
      if (typeof bag[`natalHouseName_${i}`] !== 'string') missing.push(`natalHouseName_${i}`);
      if (typeof bag[`natalHouseMeaning_${i}`] !== 'string') missing.push(`natalHouseMeaning_${i}`);
    }
    check(`${locale}: ${name} has all 24 house keys`, missing.length === 0, missing.join(', '));
  }

  // Interpolation dialects differ: next-intl `{sign}`, i18n-js `{{sign}}`.
  check(
    `${locale}: web natalHouseCuspSign uses {sign}`,
    /\{sign\}/.test(web.natalHouseCuspSign ?? '') && !/\{\{sign\}\}/.test(web.natalHouseCuspSign ?? ''),
  );
  check(
    `${locale}: mobile natalHouseCuspSign uses {{sign}}`,
    /\{\{sign\}\}/.test(mobile.natalHouseCuspSign ?? ''),
  );
}

// --- the copy promises nothing ----------------------------------------------
console.log('the houses copy promises nothing');

const BANNED = [/\bsoulmate/i, /\bperfect match/i, /\bguaranteed\b/i, /\bdestined\b/i, /\bwill happen\b/i];
for (const locale of LOCALES) {
  const webFile = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  if (!existsSync(webFile)) continue;
  const web = JSON.parse(readFileSync(webFile, 'utf8')).webApp ?? {};
  const offenders = NEW_KEYS.filter((key) => {
    const value = web[key];
    return typeof value === 'string' && BANNED.some((pattern) => pattern.test(value));
  });
  check(`${locale}: houses copy promises nothing`, offenders.length === 0, offenders.join(', '));
}

// --- report ------------------------------------------------------------------
if (failures === 0) {
  console.log(`\nNatal chart integrity guards look clean: ${checks} checks passed.`);
  process.exit(0);
}

console.error(`\n${failures} of ${checks} natal integrity guard(s) failed.`);
process.exit(1);
