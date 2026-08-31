#!/usr/bin/env node
// Guards the P0 web/PWA onboarding fixes.
//
// WHY THIS EXISTS
// ---------------
// Same reasoning as scripts/validate-mobile-retention-guards.mjs: each of
// these is one line to undo and silent when broken.
//
//   * A profile row written without `email` is skipped by send-email forever
//     ({ skipped: true, reason: "No email on profile" }). Nothing errors, no
//     one is paged, the reader simply never hears from JUNO again.
//   * Re-adding birthTime / birthCity / elementFilter to the required set
//     pushes the first payoff back behind an exact birth minute and a dating
//     filter — on the channel iOS readers use, since iOS reaches JUNO through
//     the PWA.
//   * Writing `rising_sign` without a birth time invents an ascendant. The
//     mobile wrapper already does this (services/astrology.ts:125 substitutes
//     Aries), which is why eleven accounts in twelve are told the wrong rising
//     sign. The web must not acquire the same bug.
//   * Redirecting to /app straight after the save spends the whole onboarding
//     and shows the reader nothing for it.
//   * profiles.last_active is the only column D+1 / D+2 / D+7 can be computed
//     from. It was wired on mobile and left unwired on web.
//
// Unlike mobile there is no OTA argument here — web deploys are instant — but
// a regression would still run unnoticed until someone re-derives the funnel
// by hand, which is how the mobile versions of these went unnoticed for
// months.
//
// Usage: node scripts/validate-web-onboarding.mjs

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WEB = (p) => path.join(ROOT, 'apps/web', p);

const LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'ja', 'ar', 'zh'];

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
  const file = WEB(rel);
  if (!existsSync(file)) {
    console.error(`Could not read apps/web/${rel} — refusing to pass vacuously.`);
    process.exit(2);
  }
  return readFileSync(file, 'utf8');
}

const setupForm = read('src/components/AccountSetupForm.tsx');
const workspace = read('src/components/AccountProfileWorkspace.tsx');
const layout = read('src/app/[locale]/layout.tsx');
const activity = read('src/lib/web-activity.ts');
const tracker = read('src/components/WebActivityTracker.tsx');

// --- profiles.email ---------------------------------------------------------
console.log('\nprofiles.email on client-created rows');

for (const [label, source] of [
  ['AccountSetupForm', setupForm],
  ['AccountProfileWorkspace', workspace],
]) {
  const insert = source.match(/from\("profiles"\)\s*\.insert\(\{[\s\S]{0,400}?\}\)/);
  check(`${label} has a profiles insert`, Boolean(insert));
  if (insert) {
    check(
      `${label} insert writes email`,
      /email:\s*session\.user\.email\s*\?\?\s*null/.test(insert[0]),
      'a row created without email is invisible to send-email, permanently',
    );
  }
}

check(
  'onboarding save backfills email only when it exists',
  /const sessionEmail = await getSessionEmail\(\);\s*if \(sessionEmail\) \{\s*payload\.email = sessionEmail;/.test(
    setupForm,
  ),
  'an unconditional write could overwrite a good address with null',
);

// --- required fields --------------------------------------------------------
console.log('required fields at submit');

const required = setupForm.match(/const requiredFieldsPresent =[\s\S]{0,300}?;/);
check('the required-field guard was located', Boolean(required));
if (required) {
  const body = required[0];
  check('name is still required', /form\.name\.trim\(\)/.test(body));
  check('gender is still required', /form\.gender/.test(body));
  check('birthDate is still required', /form\.birthDate/.test(body));
  check(
    'birthTime does NOT block submit',
    !/form\.birthTime/.test(body),
    'Android treats birth time as optional and says so; the web must not ask for more',
  );
  check(
    'birthCity does NOT block submit',
    !/form\.birthCity/.test(body),
    'the chart is computed without it; the reveal says what that costs',
  );
  check(
    'elementFilter does NOT block submit',
    !/form\.elementFilter/.test(body),
    'a discovery filter must never gate the first payoff',
  );
}

check(
  'an empty element selection is stored as "all", not as []',
  /form\.elementFilter\.length > 0[\s\S]{0,160}?\[\.\.\.ALL_PROFILE_ELEMENTS\]/.test(setupForm),
  '[] reads as "wants nobody" to anything filtering on preferred_elements',
);

// --- honest astrology -------------------------------------------------------
console.log('no invented ascendant');

check(
  'setup form derives rising from the birth time',
  /const risingSign = hasBirthTime \? chart\.rising\?\.sign \?\? null : null;/.test(setupForm),
);
check(
  'setup form writes that derived value',
  /rising_sign:\s*risingSign,/.test(setupForm),
);
check(
  'workspace gates rising on the birth time too',
  /rising_sign:\s*birthForm\.birthTime \? chart\.rising\?\.sign \?\? null : null,/.test(workspace),
);
check(
  'no Aries-style fallback anywhere in the web onboarding',
  !/rising[^\n]*['"]Aries['"]/i.test(setupForm) && !/rising[^\n]*['"]Aries['"]/i.test(workspace),
  'this is the mobile bug (services/astrology.ts:125); it must not spread',
);
check(
  'a guessed timezone downgrades the stored confidence',
  /deviceTimezone[\s\S]{0,200}?confidence:\s*["']low["'][\s\S]{0,200}?timezone_guessed_from_device/.test(
    setupForm,
  ),
  'passing the device zone improves the instant but must not claim precision',
);
check(
  'birth coordinates are null when no city was given',
  /birth_latitude:\s*hasBirthCity \?/.test(setupForm) &&
    /birth_latitude:\s*hasBirthCity \?/.test(workspace),
  'storing the Greenwich fallback records a birthplace nobody supplied',
);

// --- the reveal -------------------------------------------------------------
console.log('chart reveal before /app');

// Scan the whole success path — from the moment the profile write is known to
// have worked, to the end of handleSubmit. A redirect anywhere in there sends
// the reader to /app without ever showing them the chart they just waited for,
// whether it sits before or after setReveal.
const successPath = setupForm.match(/if \(updateError\) \{[\s\S]*?\} catch \(saveFailure\)/);
check('the post-save success path was located', Boolean(successPath));
check(
  'no redirect to /app on the success path',
  Boolean(successPath) && !/router\.(replace|push)\(/.test(successPath[0]),
  'the reveal IS the destination; redirecting past it spends the onboarding for nothing',
);
check('the save sets the reveal state', /setReveal\(\{/.test(setupForm));
check('the reveal renders', /data-testid="setup-reveal"/.test(setupForm));
check('the reveal offers a way into the app', /data-testid="setup-reveal-open"/.test(setupForm));
check(
  'the reveal drops placements it does not have',
  /\.filter\(\(placement\) => Boolean\(placement\.sign\)\)/.test(setupForm),
  'an incomplete chart must render a shorter card, never block the reader',
);

// --- last_active ------------------------------------------------------------
console.log('profiles.last_active on web');

check('the web service writes last_active', /last_active:/.test(activity));
check('it throttles repeat writes', /MIN_INTERVAL_MS/.test(activity));
check('it is scoped to the session user', /session\?\.user\?\.id/.test(activity));
check('it never throws at the caller', /catch \{[\s\S]{0,120}?\}/.test(activity));
check('the tracker beacons on mount', /\/\/ 1\. Mount\.\s*\n\s*beacon\(\);/.test(tracker));
check(
  'the tracker beacons on tab focus',
  /visibilitychange["']?,\s*onVisibility/.test(tracker),
);
check(
  'the tracker beacons on bfcache restore',
  /pageshow["']?,\s*onPageShow/.test(tracker),
  'iOS standalone PWAs resume from bfcache and fire no visibilitychange',
);
check(
  'sign-out clears the throttle',
  /SIGNED_OUT[\s\S]{0,120}?resetActivityThrottle\(\)/.test(tracker),
);
check(
  'the tracker is mounted globally, not inside AppShell',
  /<WebActivityTracker \/>/.test(layout),
  'a reader who returns to the home page and never opens /app is still a D+1 return',
);

// --- no invented placements on web -----------------------------------------
// The mobile half of this rule lives in section P0-5 of
// validate-mobile-retention-guards.mjs. The web needs its own because it has
// its own display surfaces AND had its own, quieter fabricator:
// `getFallbackSign(seed) = SIGNS[seed % 12]` in NatalChartOverview invented a
// sign for ANY missing placement. It stayed mostly dormant while the mobile
// bug kept `rising_sign` filled with 'Aries'; nulling those columns
// (migration 20260830000001) would have handed it 99 accounts to invent an
// ascendant for. A varied plausible sign is harder to notice than a constant
// Aries, which is exactly why it needs a guard.
console.log('no invented placements');

const natalChart = read('src/components/NatalChartOverview.tsx');
const discover = read('src/components/DiscoverOverview.tsx');
const synastry = read('src/components/SynastryOverview.tsx');
const workspace2 = read('src/components/AccountProfileWorkspace.tsx');

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n');

check(
  'NatalChartOverview has no getFallbackSign',
  !/getFallbackSign/.test(stripComments(natalChart)),
  'a missing placement must be dropped, never derived from a seed',
);
check(
  'NatalChartOverview keeps no all-signs array to invent from',
  !/const SIGNS\s*=\s*\[/.test(stripComments(natalChart)),
);
check(
  'NatalChartOverview drops placements it does not have',
  /if \(!sign\) return null;/.test(natalChart) &&
    /\.filter\(\(position\)[^)]*=> position !== null\)/.test(natalChart),
);
check(
  'NatalChartOverview gates rising on birth_time',
  /resolveTrustedRisingSign\(\{[\s\S]{0,120}?birthTime: profile\.birth_time/.test(natalChart),
);

check(
  'Discover hides an unprovable rising instead of showing "?"',
  (stripComments(discover).match(/isRisingTrustworthy\(/g) || []).length >= 2,
  'both the sign line and the placement tile must gate; "?" on a stranger\'s card is a placeholder standing in for a placement',
);
check(
  'Discover no longer renders a bare rising fallback',
  !/currentProfile\.rising_sign, locale\) : "\?"/.test(stripComments(discover)),
);

check(
  'Synastry gates rising on both sides',
  (stripComments(synastry).match(/resolveTrustedRisingSign\(/g) || []).length >= 2,
  'the "first impressions" factor must not score an invented placement',
);

check(
  'the account workspace gates its own rising card',
  /resolveTrustedRisingSign\(\{[\s\S]{0,160}?birthTime: profile\.birth_time/.test(workspace2),
);

for (const [name, source] of [
  ['NatalChartOverview', natalChart],
  ['DiscoverOverview', discover],
  ['SynastryOverview', synastry],
  ['AccountProfileWorkspace', workspace2],
  ['AccountSetupForm', setupForm],
]) {
  check(
    `${name}: no Aries-style rising fallback`,
    !/rising[^\n]{0,60}(\|\||\?\?)\s*["']Aries["']/i.test(stripComments(source)) &&
      !/rising_sign:\s*["']Aries["']/i.test(stripComments(source)),
  );
}

// --- email-click measurement ------------------------------------------------
// The lifecycle CTAs have carried `template` + three UTM params since the
// sequence shipped, and the middleware preserves them through the
// /app -> /{locale}/app redirect. Nothing read them, so "nobody clicked" and
// "everybody clicked and bounced" produced the same row of data — and they
// call for opposite fixes. These checks keep the reader wired up.
console.log('email click measurement');

const productEvents = read('src/lib/product-events.ts');
const landingTracker = read('src/components/EmailLandingTracker.tsx');

check(
  'the landing tracker is mounted globally',
  /<EmailLandingTracker \/>/.test(layout),
  'CTAs point at /app, /app/plans and /app/premium/... — a per-page mount would miss one',
);
check(
  'clicks are recorded through the RPC, never a direct insert',
  /rpc\("record_product_event"/.test(productEvents) &&
    !/from\("product_events"\)/.test(productEvents),
  'product_events has RLS on and no policies; a direct insert is denied by design',
);
check(
  'only the pathname is sent, never the query string',
  /p_path: pending\.path/.test(productEvents) &&
    /path: pathname,/.test(productEvents) &&
    !/p_path:[^\n]*search/.test(productEvents) &&
    !/path: pathname \+/.test(productEvents),
  'the unsubscribe flow signs an HMAC into its URL and it must never reach an analytics row',
);
check(
  'the recorder never throws at the caller',
  /catch \{[\s\S]{0,160}?\}/.test(productEvents),
);
check(
  'the tracker records before any session exists',
  /void recordEmailClick\(searchParams\.toString\(\), pathname\);/.test(landingTracker) &&
    !/getSession[\s\S]{0,200}?void recordEmailClick/.test(landingTracker),
  'a click that bounces at the sign-in wall is the case worth separating from no click at all',
);
check(
  'the tracker attributes on every page, not only on the landing',
  // Anchored to the mount path specifically. A bare /attributePendingClick\(\)/
  // would also match the call inside onAuthStateChange, which is a DIFFERENT
  // guarantee: that one fires on sign-in, this one fires on arrival — and it is
  // the one that catches a reader who returns from /auth/login already
  // authenticated, where no auth event fires at all.
  /void recordEmailClick\(searchParams\.toString\(\), pathname\);\s*\n\s*void attributePendingClick\(\);/.test(
    landingTracker,
  ),
  'AppShell bounces a signed-out reader to /auth/login and rebuilds `next` from the pathname alone, so the page that can attribute the click is never the page that received it',
);
check(
  'the tracker attributes again on sign-in',
  /onAuthStateChange\([\s\S]{0,400}?attributePendingClick\(\)/.test(landingTracker),
);
check(
  'the pending click survives the sign-in navigation',
  /sessionStorage\.setItem\(PENDING_KEY/.test(productEvents) &&
    /const PENDING_KEY = /.test(productEvents),
  'an in-page listener alone cannot see it: by the time identity exists the URL naming the template is two navigations behind',
);
check(
  'the pending click is parked BEFORE the request goes out',
  /writePending\(pending\);[\s\S]{0,200}?await send\(pending\)/.test(productEvents),
  'the sign-in redirect can fire while the RPC is still in flight',
);
check(
  'repeat calls upgrade instead of duplicating',
  /p_client_event_id: pending\.id/.test(productEvents) &&
    /existing\?\.template === template \? existing\.id : newId\(\)/.test(productEvents),
  'idempotency belongs in the database (unique client_event_id), not in a sessionStorage boolean that blocks the attribution retry',
);
check(
  'no sessionStorage boolean blocks the retry',
  !/alreadyRecorded/.test(productEvents),
);
check(
  'useSearchParams is wrapped in Suspense',
  /<Suspense/.test(landingTracker),
  'without it Next de-opts every page under this layout to dynamic rendering',
);

// --- i18n -------------------------------------------------------------------
console.log('reveal copy across locales');

const REVEAL_KEYS = [
  'setupOptionalTag',
  'setupPreferencesLater',
  'revealLabel',
  'revealTitle',
  'revealSubtitle',
  'revealSunDesc',
  'revealMoonDesc',
  'revealRisingDesc',
  'revealRefineTitle',
  'revealRefineMissingTime',
  'revealRefineMissingCity',
  'revealDisclaimer',
  'revealOpenApp',
  'revealCompleteProfile',
];

for (const locale of LOCALES) {
  const file = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  if (!existsSync(file)) {
    check(`messages/${locale}.json exists`, false);
    continue;
  }
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    check(`messages/${locale}.json parses`, false, err.message);
    continue;
  }
  const missing = REVEAL_KEYS.filter(
    (key) => typeof json.webApp?.[key] !== 'string' || json.webApp[key].trim() === '',
  );
  check(`${locale}: reveal copy present`, missing.length === 0, missing.join(', '));
}

// The reveal is the payoff. Copy that predicts an outcome turns a reflection
// card into a promise, which is the one thing JUNO does not sell.
const BANNED = [/\bsoulmate/i, /\bperfect match/i, /\bguaranteed\b/i, /\bdestined\b/i];
for (const locale of LOCALES) {
  const file = path.join(ROOT, 'apps/web/messages', `${locale}.json`);
  if (!existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const offenders = REVEAL_KEYS.filter((key) => {
    const value = json.webApp?.[key];
    return typeof value === 'string' && BANNED.some((pattern) => pattern.test(value));
  });
  check(`${locale}: reveal copy promises nothing`, offenders.length === 0, offenders.join(', '));
}

// --- the onboarding guard ---------------------------------------------------
// Until 2026-08-31, /app/setup had exactly ONE entry point: a single check in
// the auth callback, run once, on one page load. AppShell checked only that a
// session existed. A reader who missed that redirect landed on /app with no
// profile row and had no way back — signing in again returned a valid session,
// /app accepted it, and showed the same empty screen. auth.audit_log_entries
// recorded the result: user_signedup, then login, login, login within three
// minutes, ending with no profiles row. 143 of 245 confirmed accounts never
// got one.
//
// Every check below is one line away from restoring that. They are structural
// on purpose: a missing guard raises no error and shows no symptom to CI.
console.log('the onboarding guard');

const shell = read('src/components/AppShell.tsx');
const callback = read('src/app/[locale]/auth/callback/page.tsx');

check(
  'AppShell reads the setup state',
  /import \{[^}]*isWebProfileSetupIncomplete[^}]*\} from "@\/lib\/web-account"/.test(shell),
  'without it the shell is blind to onboarding again',
);
check(
  'AppShell sends an un-onboarded reader to setup',
  /isWebProfileSetupIncomplete\(profile\)\) \{\s*\n\s*router\.replace\("\/app\/setup"\)/.test(shell),
  'this is the recovery path; nothing else in /app looks at onboarding_completed',
);
check(
  'the guard exempts the setup screen itself',
  /pathname\.startsWith\("\/app\/setup"\)\) return;/.test(shell),
  'AccountSetupForm renders inside AppShell — guarding it would loop forever',
);
check(
  'the guard fails towards setup, not into the app',
  /catch \{[\s\S]{0,400}?router\.replace\("\/app\/setup"\)/.test(shell),
  'failing open is exactly the default that stranded 143 accounts',
);
// Scoped to the incomplete branch itself, not to a character window: the two
// branches sit a few lines apart, so a loose window matches the `else` and
// reports a failure that is not there.
const incompleteBranch = shell.match(
  /isWebProfileSetupIncomplete\(profile\)\) \{([\s\S]*?)\} else \{/,
);
check('the guard branches on the setup state', Boolean(incompleteBranch));
check(
  'only the completed state is memoised',
  /\} else \{\s*\n\s*rememberOnboarded\(userId\);/.test(shell) &&
    !/rememberOnboarded/.test(incompleteBranch?.[1] ?? 'rememberOnboarded'),
  'caching "incomplete" would bounce a reader back into setup after they finish',
);
check(
  'the callback routes both session branches the same way',
  (callback.match(/await routeAfterAuth\(/g) || []).length === 2,
  'the retry branch used to skip the onboarding check entirely',
);
check(
  'the callback defaults to setup before it knows',
  /const routeAfterAuth = async \([\s\S]{0,200}?let dest = "\/app\/setup";/.test(callback),
  'a thrown profile read must not resolve to /app',
);
check(
  'the callback still honours an explicit destination once onboarded',
  /if \(!isWebProfileSetupIncomplete\(profile\)\) \{\s*\n\s*dest = requestedNext;/.test(callback),
  'an onboarded reader following an email CTA must land where the CTA pointed',
);

// --- report -----------------------------------------------------------------
if (failures === 0) {
  console.log(`\nWeb onboarding guards look clean: ${checks} checks passed.`);
  process.exit(0);
}

console.error(`\n${failures} of ${checks} web onboarding guard(s) failed.`);
process.exit(1);
