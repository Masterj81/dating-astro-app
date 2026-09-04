#!/usr/bin/env node
// Guards the three P0 retention fixes from docs/retention-day2-audit-2026-08.md.
//
// All three are one-line-to-undo and invisible when broken, which is how they
// came to be broken in the first place:
//
//   P0-2  profiles.last_active was never written, so no retention number was
//         computable and no lifecycle email could cancel itself.
//   P0-3  the notification permission was requested from the SIGNED_IN
//         handler — before onboarding, before the chart — and a refusal on
//         Android 13+ is near-permanent.
//   P0-4  Discover's empty state renders above the intention pills, so a
//         filter with no matches was a dead end with no way back.
//
// There is no OTA on this project: a regression here waits for the next build
// plus a Play review before it can be undone. Fail the build instead.
//
// Usage: node scripts/validate-mobile-retention-guards.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const M = (p) => path.join(ROOT, 'apps/mobile', p);

let failures = 0;
let checks = 0;
const check = (label, ok, detail = '') => {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
};

function read(rel) {
  try {
    return readFileSync(M(rel), 'utf8');
  } catch {
    console.error(`Could not read apps/mobile/${rel} — refusing to pass vacuously.`);
    process.exit(2);
  }
}

const layout = read('app/_layout.tsx');
const notifications = read('services/notifications.ts');
const birthInfo = read('app/onboarding/birth-info.tsx');
const birthCityPicker = read('components/BirthCityPicker.tsx');
const authCallback = read('app/auth/callback.tsx');
const discover = read('app/(tabs)/discover.tsx');
const activity = read('services/activity.ts');

// --- P0-2 · last_active -----------------------------------------------------
console.log('\nP0-2  profiles.last_active');

check('service writes last_active', /last_active:/.test(activity));
check('service throttles repeat writes', /MIN_INTERVAL_MS/.test(activity));
check('service is scoped to the session user', /session\?\.user\?\.id/.test(activity));
check('root layout stamps on sign-in', /touchLastActive\(\)/.test(layout));
check('root layout stamps on foreground',
  /nextState === 'active'[\s\S]{0,240}touchLastActive\(\)/.test(layout),
  'the foreground handler must call it before any early return');
check('throttle is cleared on sign-out',
  /SIGNED_OUT[\s\S]{0,600}resetActivityThrottle\(\)/.test(layout));

// --- P0-3 · notification permission timing ----------------------------------
console.log('P0-3  notification permission timing');

check('registration accepts a silent mode',
  /registerForPushNotificationsAsync\(\s*\n?\s*promptIfNeeded = true/.test(notifications));
check('silent mode returns before prompting',
  /if \(!promptIfNeeded\) return null;/.test(notifications));
check('token save forwards the flag',
  /registerForPushNotificationsAsync\(promptIfNeeded\)/.test(notifications));

// Sign-in and foreground refresh must both be silent. Only the post-reveal
// call may prompt.
const signInCall = layout.match(/registerAndSavePushToken\(user\.id[^)]*\)/)?.[0] ?? '';
check('sign-in registration was located', signInCall.length > 0);
check('sign-in never prompts', /,\s*false\s*\)$/.test(signInCall), signInCall);

const refreshCall = notifications.match(
  /registerAndSavePushToken\(userId[^)]*\)/,
)?.[0] ?? '';
check('foreground refresh was located', refreshCall.length > 0);
check('foreground refresh never prompts', /,\s*false\s*\)$/.test(refreshCall), refreshCall);

check('the prompt happens after the chart reveal',
  /handleRevealContinue[\s\S]{0,400}requestNotificationsAfterReveal/.test(birthInfo));
check('a primer runs before the OS dialog',
  /pushPrimerTitle[\s\S]{0,900}registerAndSavePushToken\(user\.id, true\)/.test(birthInfo),
  'the single OS prompt must not be spent on someone about to decline');
check('declining the primer asks for nothing',
  /pushPrimerLater[\s\S]{0,120}style: 'cancel'/.test(birthInfo));
check('navigation is never blocked by the prompt',
  /catch \{[\s\S]{0,160}router\.replace\('\/\(tabs\)\/discover'\)/.test(birthInfo));

// Exactly one prompting call site in the whole app.
const prompting = [
  ...layout.matchAll(/registerAndSavePushToken\([^)]*\)/g),
  ...birthInfo.matchAll(/registerAndSavePushToken\([^)]*\)/g),
  ...notifications.matchAll(/registerAndSavePushToken\((?!\n)[^)]*\)/g),
].map((m) => m[0]).filter((c) => !/,\s*false\s*\)/.test(c) && !/promptIfNeeded/.test(c));
check('exactly one call site may prompt', prompting.length === 1,
  `found ${prompting.length}: ${prompting.join(' | ')}`);

// --- P0-4 · Discover filter trap --------------------------------------------
console.log('P0-4  Discover filter escape');

const emptyBlock = discover.match(
  /if \(profiles\.length === 0\) \{[\s\S]*?\n  \}/,
)?.[0] ?? '';
check('empty-state block was located', emptyBlock.length > 200);
check('empty state knows whether a filter is active',
  /intentionFilter !== 'all'/.test(emptyBlock));
check('the action clears the filter rather than retrying',
  /setIntentionFilter\('all'\)/.test(emptyBlock));
check('unfiltered behaviour is unchanged',
  /handleRefresh/.test(emptyBlock),
  'the no-filter path must still offer Refresh');
check('copy is localised, not hardcoded',
  /t\('discoverShowAllIntentions'\)/.test(emptyBlock));

// --- P0-5 · the fabricated ascendant ----------------------------------------
// §3.5 of the same audit, and the worst of the set: the first personalised
// fact JUNO stated about an account without a birth time was false, eleven
// times out of twelve. `services/astrology.ts` substituted
// `{ sign: 'Aries', degree: 0, longitude: 0 }` for the ascendant the engine
// had correctly refused to compute.
//
// The substitution is gone. These checks exist because putting it back is a
// one-line change that no type and no test would notice — the shape is valid,
// the screens render, and only the reader knows they are being lied to.
console.log('P0-5  no fabricated ascendant');

const astrologyService = read('services/astrology.ts');
const preview = read('app/welcome/preview.tsx');
const natalChart = read('app/premium-screens/natal-chart.tsx');
const profileTab = read('app/(tabs)/profile.tsx');
const synastry = read('app/premium-screens/synastry.tsx');

// Strip comments before scanning code: these files explain the bug at length,
// and the explanation must not be what trips the guard.
const codeOf = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n');

const serviceCode = codeOf(astrologyService);
const birthInfoCode = codeOf(birthInfo);
const birthCityPickerCode = codeOf(birthCityPicker);
const callbackCode = codeOf(authCallback);
const layoutCode = codeOf(layout);

check('the engine facade has no Aries literal at all',
  !/['"]Aries['"]/.test(serviceCode),
  'the old fallback was { sign: \'Aries\', degree: 0, longitude: 0 }');
check('placement() takes no fallback argument',
  /function placement\(p: \{[^}]*\} \| null\): Placement \{/.test(serviceCode),
  'a second parameter is how the substitution came back last time');
check('placement() throws instead of inventing a position',
  /throw new Error\('calculateNatalChart: expected placement was not computed'\)/.test(serviceCode));
check('rising is typed nullable on the mobile chart',
  /rising: Placement \| null;/.test(serviceCode));
check('rising passes straight through from the engine',
  /rising: chart\.rising,/.test(serviceCode));
check('mc and houses pass through too',
  /mc: chart\.mc,/.test(serviceCode) && /houses: chart\.houses,/.test(serviceCode));

// Generic shapes the substitution could take anywhere in the mobile tree.
const RISING_FALLBACK_PATTERNS = [
  [/rising[^\n]{0,60}\|\|\s*['"]Aries['"]/i, "rising || 'Aries'"],
  [/rising[^\n]{0,60}\?\?\s*['"]Aries['"]/i, "rising ?? 'Aries'"],
  [/rising[^\n]{0,80}sign:\s*['"]Aries['"]/i, "rising: { sign: 'Aries' }"],
  [/rising_sign:\s*['"]Aries['"]/i, "rising_sign: 'Aries'"],
];
for (const [pattern, label] of RISING_FALLBACK_PATTERNS) {
  for (const [name, source] of [
    ['services/astrology.ts', serviceCode],
    ['onboarding/birth-info.tsx', codeOf(birthInfo)],
    ['welcome/preview.tsx', codeOf(preview)],
    ['premium-screens/natal-chart.tsx', codeOf(natalChart)],
    ['(tabs)/profile.tsx', codeOf(profileTab)],
    ['(tabs)/discover.tsx', codeOf(discover)],
    ['premium-screens/synastry.tsx', codeOf(synastry)],
  ]) {
    check(`${name}: no \`${label}\` fallback`, !pattern.test(source));
  }
}

// Onboarding must write null, not a substitute, and must not dereference a
// placement that may not exist.
check('onboarding writes rising_sign null-safely',
  /rising_sign: chart\.rising\?\.sign \?\? null,/.test(codeOf(birthInfo)));
check('onboarding never dereferences chart.rising without a guard',
  !/chart\.rising\.sign/.test(codeOf(birthInfo)),
  'use chart.rising?.sign — the ascendant is nullable now');
check('the reveal omits the rising row when there is none',
  /const risingSign = chart\.rising\?\.sign \?\? null;/.test(codeOf(birthInfo)) &&
    /\.\.\.\(risingSign\s*\n?\s*\?/.test(codeOf(birthInfo)),
  'the third placement must be conditional on a real ascendant');

// Display surfaces must gate on evidence, never on the bare column.
check('own profile gates the rising card on birth_time',
  /resolveTrustedRisingSign\(\{[\s\S]{0,160}?birthTime: profile\?\.birth_time/.test(profileTab));
// Two assertions, because the first one alone passed while proving less than
// it looked like it did: it only checked that the call EXISTED somewhere in
// the file, not that the rising row was actually conditional on its answer.
// The screen was reworked on 2026-08-31 to read placements from birth_chart,
// which moved this call into a memo over `chartData`; that is the moment the
// weakness showed.
check('the natal chart resolves the rising against birth_time',
  /resolveTrustedRisingSign\(\{[\s\S]{0,160}?birthTime: (data|chartData)\.birth_time/.test(natalChart),
  'the bare rising_sign column cannot tell a real ascendant from a fabricated one');
check('the natal chart renders the rising row only when that answer is positive',
  /if \(trustedRisingSign\) \{[\s\S]{0,200}?push\('rising'/.test(natalChart) ||
    /\.\.\.\(resolveTrustedRisingSign\([\s\S]{0,200}?planetKey: 'rising'/.test(natalChart),
  'resolving trust and then ignoring it would render "With Aries Rising, you come across as…" to someone who has no ascendant');
check('discover hides an unprovable rising pill',
  /isRisingTrustworthy\(\{ storedRisingSign: currentProfile\.rising_sign \}\)/.test(discover));
check('synastry refuses an unprovable ascendant on both sides',
  (codeOf(synastry).match(/resolveTrustedRisingSign\(/g) || []).length >= 2,
  'the "first impressions" factor must not score an invented placement');

// --- P0-6 · native email confirmation callback ------------------------------
// Supabase signup emails redirect to `astrodating://auth/callback`. Android
// parses that as host=`auth`, pathname=`/callback`. Two separate mistakes
// made the link look like it worked while doing nothing useful: the layout
// rejected `auth` as an untrusted host, and the callback screen returned
// immediately on native because OAuth uses expo-web-browser. Email
// confirmation links are opened from Gmail/Chrome, so native must consume the
// URL itself.
console.log('P0-6  native email confirmation callback');

check('custom scheme allows the Supabase auth host',
  /host !== 'auth'/.test(layoutCode),
  '`astrodating://auth/callback` is parsed with hostname "auth"');
check('custom auth host is normalized back to /auth/callback',
  /effectivePath[\s\S]{0,160}?`\/auth\$\{parsed\.pathname\}`/.test(layoutCode),
  'otherwise the allowed path check sees only /callback and drops the link');
check('native callback reads the initial deep link URL',
  /Linking\.getInitialURL\(\)/.test(callbackCode),
  'email confirmation does not arrive through expo-web-browser');
check('native callback does not return before handling auth data',
  !/Platform\.OS !== 'web'[\s\S]{0,160}?router\.replace\('\/'\)[\s\S]{0,80}?return;/.test(callbackCode),
  'this was the blank-page bug: native opened the route and immediately left');
check('callback exchanges PKCE code when Supabase sends one',
  /exchangeCodeForSession\(code\)/.test(callbackCode));
check('callback verifies token_hash links when Supabase sends one',
  /verifyOtp\(\{[\s\S]{0,120}?token_hash: tokenHash/.test(callbackCode));
check('callback can store hash token sessions',
  /setSession\(\{[\s\S]{0,120}?access_token: accessToken[\s\S]{0,80}?refresh_token: refreshToken/.test(callbackCode));

// --- P0-7 · readable native birth inputs ------------------------------------
// Android's native picker popup does not inherit our web glass layer. If the
// items are styled dark while the system popup is dark gray, the month/day/time
// menus become almost unreadable on a real device. Guard the boring values:
// opaque dark fields, light item text, muted-gold placeholders, visible icons.
console.log('P0-7  readable native birth inputs');

check('birth date/time pickers are not painted with the old light shell',
  !/#f6f1ea/i.test(birthInfoCode),
  'the native popup needs light item text; a light collapsed shell would make that unreadable');
check('birth date/time pickers use an opaque dark shell',
  /pickerWrapper:\s*\{[\s\S]{0,180}?backgroundColor:\s*['"]#080B14['"]/.test(birthInfoCode) &&
    /pickerWrapperSmall:\s*\{[\s\S]{0,180}?backgroundColor:\s*['"]#080B14['"]/.test(birthInfoCode));
check('picker item text is light enough for Android popups',
  /pickerItem:\s*\{[\s\S]{0,80}?color:\s*AppTheme\.colors\.textPrimary/.test(birthInfoCode));
check('picker placeholders use muted gold instead of low-contrast gray',
  /pickerItemPlaceholder:\s*\{[\s\S]{0,80}?color:\s*AppTheme\.colors\.goldMuted/.test(birthInfoCode));
check('all five birth pickers have a visible muted-gold dropdown icon',
  (birthInfoCode.match(/dropdownIconColor=\{AppTheme\.colors\.goldMuted\}/g) || []).length === 5);
check('all five birth pickers have a restrained gold ripple',
  (birthInfoCode.match(/dropdownIconRippleColor="rgba\(232, 199, 126, 0\.18\)"/g) || []).length === 5);
check('mobile city search sends the Supabase bearer to the proxy',
  /Authorization:\s*`Bearer \$\{token\}`/.test(birthCityPickerCode),
  'without it the edge function returns unavailable and the city field feels broken');
check('mobile city suggestions are opaque, not glass-on-glass',
  /list:\s*\{[\s\S]{0,220}?backgroundColor:\s*['"]#080B14['"]/.test(birthCityPickerCode));
check('mobile city suggestions are raised above the form',
  /list:\s*\{[\s\S]{0,360}?elevation:\s*12/.test(birthCityPickerCode) &&
    /list:\s*\{[\s\S]{0,380}?zIndex:\s*30/.test(birthCityPickerCode));

// Surfaces showing SOMEONE ELSE's chart. None of these queries return
// birth_time or birth_chart, so none of them can prove an ascendant is real —
// they must all hide it rather than repeat the column.
const publicProfile = read('app/profile/[id].tsx');
const chat = read('app/chat/[id].tsx');

check("the public profile hides another user's unprovable rising",
  /isRisingTrustworthy\(\{ storedRisingSign: profile\.rising_sign \}\)/.test(codeOf(publicProfile)));
check('the chat header drops an unprovable rising from the sign line',
  /isRisingTrustworthy\(\{[\s\S]{0,120}?conversationInfo\.other_user\.rising_sign/.test(codeOf(chat)));
check('discover keeps the screen-reader label in sync with the pill',
  /isRisingTrustworthy\([\s\S]{0,160}?\?\s*\[`Rising sign: /.test(codeOf(discover)),
  'naming the sign in accessibilityLabel while the pill is hidden leaks it to the one audience that cannot see it is gone');

// Prose that NAMES the ascendant needs a variant that does not.
check('the natal-chart summary has a no-rising variant',
  /cosmicSummaryTextNoRising/.test(codeOf(natalChart)));
check('the summary picks the variant from the trust check',
  /trustedRisingSign\s*\n?\s*\?\s*t\('cosmicSummaryText'/.test(codeOf(natalChart)));
check('the summary never interpolates the raw column',
  !/rising: chartData\?\.rising_sign/.test(codeOf(natalChart)),
  "it used to render `${rising_sign || 'Unknown'} Rising` straight into a sentence about the reader");

console.log(
  failures === 0
    ? `\nMobile retention guards look clean: ${checks} checks passed.`
    : `\n${failures} of ${checks} checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
