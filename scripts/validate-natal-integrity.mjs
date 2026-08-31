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
  'the birthplace is checked as a finite number, not for truthiness',
  /isUsableCoordinate\(input\.birthLatitude\)\s*\|\|\s*!isUsableCoordinate\(input\.birthLongitude\)/.test(
    code.houses,
  ),
  '`!lat || !lng` treats a genuine 0 — the meridian, the equator — as missing',
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
