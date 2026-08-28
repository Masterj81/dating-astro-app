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

console.log(
  failures === 0
    ? `\nMobile retention guards look clean: ${checks} checks passed.`
    : `\n${failures} of ${checks} checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
