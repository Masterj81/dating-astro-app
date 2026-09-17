#!/usr/bin/env node
// Validates the JUNO lifecycle email templates.
//
// This is a regression guard for P0-1 of docs/retention-day2-audit-2026-08.md.
// The defect it exists to prevent was not subtle — every template shipped
// without a single <a href>, so no lifecycle email could bring anyone back —
// but it survived in production precisely because nothing ever looked at the
// rendered output.
//
// So this script RENDERS the templates and asserts on the HTML and text that
// would actually be sent. It does not grep the source for reassuring strings.
// supabase/functions/send-email/templates.ts imports nothing, which is what
// makes it loadable here under Node's native type stripping.
//
// A few invariants live in the request path rather than in rendering (the
// suppression check, the RFC 8058 headers, the text/plain field). Those are
// checked by scanning index.ts, and are labelled as source checks so the
// difference in strength is visible.
//
// Usage: node scripts/validate-email-templates.mjs

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions', 'send-email');
const TEMPLATES_TS = path.join(FN_DIR, 'templates.ts');
const INDEX_TS = path.join(FN_DIR, 'index.ts');
const UNSUB_TS = path.join(ROOT, 'supabase', 'functions', 'unsubscribe', 'index.ts');
// JUNO-21: signing and verification live here, shared by send-email and unsubscribe.
const TOKEN_TS = path.join(ROOT, 'supabase', 'functions', '_shared', 'unsubscribe-token.ts');
const UNSUB_PAGE = path.join(
  ROOT, 'apps', 'web', 'src', 'app', '[locale]', 'unsubscribe', 'page.tsx',
);

const APP_HOST = 'https://app.junosynastry.com';

let failures = 0;
let checks = 0;

function check(label, ok, detail = '') {
  checks++;
  if (!ok) {
    failures++;
    console.error(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
// Banned content
// ---------------------------------------------------------------------------
// Each entry is [pattern, why]. Matched case-insensitively against the rendered
// subject + html + text of every template.
const BANNED = [
  [/astrodating/i, 'legacy brand name — the app is JUNO'],
  [/astrodatingapp\.com/i, 'legacy domain'],
  [/soulmate/i, 'banned brand promise (JUNO_BANNED_PROMISES)'],
  [/perfect match/i, 'banned brand promise'],
  [/guaranteed compat/i, 'banned brand promise'],
  [/100\s*%\s*match/i, 'banned brand promise'],
  [/\b\d+[-\s]day (free )?trial\b/i, 'no trial exists in the backend — audit §1'],
  [/free trial (ends|is almost|expires)/i, 'no trial exists in the backend'],
  [/trial (ends|expiring|is over)/i, 'no trial exists in the backend'],
  [/start swiping/i, 'contradicts JUNO positioning — audit §6.1'],
  [/\bundefined\b/, 'template variable leaked into output'],
  [/\bNaN\b/, 'template variable leaked into output'],
  [/\[object Object\]/, 'template variable leaked into output'],
];

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

// Native TypeScript type stripping is what lets this script import the edge
// function's templates and assert on real rendered output instead of grepping
// source. It is on by default from Node 22.18 and absent on 20, where the
// import fails with a bare "Unknown file extension" that says nothing about
// the actual cause. CI was pinned to 20 and hit exactly that.
const MIN_NODE = [22, 18];
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
  console.error(
    `Node ${process.versions.node} cannot strip TypeScript types.\n` +
      `This script imports supabase/functions/send-email/templates.ts directly,\n` +
      `which needs Node >= ${MIN_NODE.join('.')}. Upgrade the runtime rather than\n` +
      `weakening the check — grepping the source instead is what let the\n` +
      `missing-CTA defect ship in the first place.`,
  );
  process.exit(2);
}

let mod;
try {
  mod = await import(pathToFileURL(TEMPLATES_TS).href);
} catch (err) {
  console.error(`Could not load ${path.relative(ROOT, TEMPLATES_TS)}:\n  ${err.message}`);
  console.error('\nThis file must import nothing, so it can be rendered outside Deno.');
  process.exit(2);
}

const { TEMPLATES, isSuppressed, LIFECYCLE_PREF_KEY, MOON_INSIGHT } = mod;

// Completeness guard. A validator that silently checks nothing is worse than
// no validator: it reports success. If the registry does not look like what we
// expect, stop with a distinct exit code rather than passing vacuously.
const EXPECTED_TEMPLATES = [
  'welcome',
  'onboarding_day1',
  'onboarding_day3',
  'onboarding_day5',
];

if (!TEMPLATES || typeof TEMPLATES !== 'object') {
  console.error('TEMPLATES registry missing or not an object.');
  process.exit(2);
}
const names = Object.keys(TEMPLATES);
const missing = EXPECTED_TEMPLATES.filter((n) => !names.includes(n));
if (missing.length > 0) {
  console.error(`Expected templates are missing from the registry: ${missing.join(', ')}`);
  console.error('If a template was intentionally removed, update EXPECTED_TEMPLATES here.');
  process.exit(2);
}
if (typeof isSuppressed !== 'function') {
  console.error('isSuppressed is not exported — suppression cannot be verified.');
  process.exit(2);
}

console.log(`Rendering ${names.length} templates from ${path.relative(ROOT, TEMPLATES_TS)}`);

// ---------------------------------------------------------------------------
// Render matrix
// ---------------------------------------------------------------------------
// Every template is rendered against several contexts, because the interesting
// bugs live in the branches: a reader with no birth time (no Moon), a profile
// with no name, and a hostile name that must stay escaped.

const UNSUB = 'https://example.supabase.co/functions/v1/unsubscribe?token=abc.def';

const CONTEXTS = [
  {
    label: 'complete profile',
    ctx: { name: 'Camille', sunSign: 'Scorpio', moonSign: 'Cancer', unsubscribeUrl: UNSUB },
  },
  {
    label: 'no birth time (no Moon)',
    ctx: { name: 'Alex', sunSign: 'Leo', moonSign: '', unsubscribeUrl: UNSUB },
  },
  {
    label: 'no name, no signs',
    ctx: { name: '', sunSign: '', moonSign: '', unsubscribeUrl: UNSUB },
  },
  {
    label: 'unsubscribe token unavailable',
    ctx: { name: 'Sam', sunSign: 'Aries', moonSign: 'Pisces', unsubscribeUrl: null },
  },
  {
    label: 'hostile moon value',
    ctx: {
      name: 'Robert',
      sunSign: 'Virgo',
      moonSign: '<script>alert(1)</script>',
      unsubscribeUrl: UNSUB,
    },
  },
];

section('Rendered output');

for (const name of names) {
  const entry = TEMPLATES[name];
  check(`${name}: has a category`, entry.category === 'lifecycle' || entry.category === 'transactional');

  for (const { label, ctx } of CONTEXTS) {
    let built;
    try {
      built = entry.build(ctx);
    } catch (err) {
      check(`${name} [${label}]: renders without throwing`, false, err.message);
      continue;
    }

    const where = `${name} [${label}]`;
    const { subject, html, text } = built;
    const all = `${subject}\n${html}\n${text}`;

    check(`${where}: subject is non-empty`, typeof subject === 'string' && subject.trim().length > 0);
    check(`${where}: html is non-empty`, typeof html === 'string' && html.length > 200);
    check(`${where}: text alternative is non-empty`, typeof text === 'string' && text.trim().length > 50);

    // Brand palette: lifecycle emails must use the same gold CTA as the auth
    // templates. The dark text is intentional for contrast on the gold fill.
    check(`${where}: uses the JUNO gold palette`, /#e8c77e/i.test(html));
    check(`${where}: gold CTA uses dark text`, /color:#0b0b14/i.test(html));
    check(`${where}: excludes the legacy coral CTA`, !/#e94560/i.test(html));
    check(`${where}: excludes the legacy pink-purple wash`,
      !/rgba\(244\s*,\s*114\s*,\s*182/i.test(html) &&
      !/rgba\(236\s*,\s*72\s*,\s*153/i.test(html));

    // --- the defect this whole patch exists to fix ---
    const anchors = [...html.matchAll(/<a\s+href="([^"]+)"/g)].map((m) => m[1]);
    check(`${where}: html contains at least one <a href>`, anchors.length > 0);

    const appLinks = anchors.filter((h) => h.startsWith(APP_HOST));
    check(`${where}: has a CTA pointing at ${APP_HOST}`, appLinks.length > 0,
      anchors.length ? `anchors: ${anchors.slice(0, 3).join(', ')}` : 'no anchors at all');

    for (const link of appLinks) {
      const u = new URL(link);

      // Locale-prefixed paths would not match the Android intent filter
      // (pathPrefix "/app"), so the App Link would never open the native app.
      check(`${where}: CTA path starts with /app (not a locale prefix)`,
        u.pathname === '/app' || u.pathname.startsWith('/app/'),
        `got pathname "${u.pathname}" in ${link}`);

      for (const param of ['utm_source', 'utm_medium', 'utm_campaign', 'template']) {
        check(`${where}: CTA carries ${param}`, u.searchParams.get(param), link);
      }
      check(`${where}: utm_source is lifecycle_email`,
        u.searchParams.get('utm_source') === 'lifecycle_email');
      check(`${where}: utm_medium is email`, u.searchParams.get('utm_medium') === 'email');
    }

    // The text part must be usable on its own — a reader on a plain-text
    // client still needs the link.
    check(`${where}: text alternative contains the CTA url`, text.includes(APP_HOST));

    // --- banned content ---
    for (const [pattern, why] of BANNED) {
      const m = all.match(pattern);
      check(`${where}: free of "${pattern.source}" (${why})`, !m,
        m ? `matched: ${JSON.stringify(m[0])}` : '');
    }

    // --- honest unsubscribe ---
    if (ctx.unsubscribeUrl) {
      check(`${where}: unsubscribe link present in html`, html.includes(ctx.unsubscribeUrl));
      check(`${where}: unsubscribe link present in text`, text.includes(ctx.unsubscribeUrl));
    } else {
      // With no token we must NOT print the word as a bare promise. The
      // previous version's footer did exactly that.
      const promisesWithoutLink =
        /unsubscribe/i.test(html) && !/<a\s+href="[^"]*unsubscribe/i.test(html);
      check(`${where}: no unsubscribe promised without a link`, !promisesWithoutLink);
      check(`${where}: falls back to a real preferences instruction`,
        /manage email preferences/i.test(html));
    }

    // --- markup sanity ---
    const opens = (html.match(/<a\s/g) || []).length;
    const closes = (html.match(/<\/a>/g) || []).length;
    check(`${where}: anchors are balanced`, opens === closes, `${opens} <a> vs ${closes} </a>`);

    // A hostile sign value must never reach the output as markup. Signs go
    // through a lookup table, so an unknown value falls to the no-Moon branch.
    if (ctx.moonSign.includes('<')) {
      check(`${where}: hostile sign value is not echoed as markup`,
        !html.includes('<script>alert(1)</script>'));
    }
  }
}

// ---------------------------------------------------------------------------
// Base URL hardening
// ---------------------------------------------------------------------------
// Production briefly had PUBLIC_APP_BASE_URL set to ".../en", which broke
// Android App Link matching (intent filter pathPrefix is "/app") and pinned
// every reader to English. Configuration must not be able to do that again.

section('Base URL hardening');

check('APP_BASE_URL is reduced to an origin', /\.origin/.test(
  readFileSync(TEMPLATES_TS, 'utf8'),
), 'a configured path would leak into every CTA');

{
  const { appLink, APP_BASE_URL } = mod;
  check('APP_BASE_URL carries no path', new URL(APP_BASE_URL).pathname === '/',
    APP_BASE_URL);
  const link = new URL(appLink('/app', 'probe'));
  check('a CTA path starts with /app', link.pathname.startsWith('/app'),
    link.pathname);
  check('a CTA path carries no locale prefix',
    !/^\/(en|fr|es|pt|de|ja|ar|zh)\//.test(link.pathname), link.pathname);
}

// ---------------------------------------------------------------------------
// Moon insight coverage
// ---------------------------------------------------------------------------

section('Moon insight coverage');

const ZODIAC = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];
for (const sign of ZODIAC) {
  check(`MOON_INSIGHT covers ${sign}`, typeof MOON_INSIGHT?.[sign] === 'string' && MOON_INSIGHT[sign].length > 40);
}
check('MOON_INSIGHT has no extra keys',
  Object.keys(MOON_INSIGHT || {}).length === ZODIAC.length,
  `got ${Object.keys(MOON_INSIGHT || {}).length}`);

// Day 1 must actually differ between a reader with a Moon and one without —
// otherwise the fallback is decorative.
const withMoon = TEMPLATES.onboarding_day1.build(CONTEXTS[0].ctx);
const withoutMoon = TEMPLATES.onboarding_day1.build(CONTEXTS[1].ctx);
check('day1: subject differs when the Moon is unknown', withMoon.subject !== withoutMoon.subject);
check('day1: with a Moon, the insight is present', withMoon.html.includes(MOON_INSIGHT.cancer));
check('day1: without a Moon, no placement is invented',
  !/Moon in \w/.test(withoutMoon.html), 'a Moon placement was named without a birth time');

// ---------------------------------------------------------------------------
// Suppression semantics
// ---------------------------------------------------------------------------

section('Suppression semantics');

check('lifecycle: absent preference means opted in', isSuppressed({}, 'lifecycle') === false);
check('lifecycle: null preferences means opted in', isSuppressed(null, 'lifecycle') === false);
check('lifecycle: explicit false suppresses',
  isSuppressed({ [LIFECYCLE_PREF_KEY]: false }, 'lifecycle') === true);
check('lifecycle: explicit true does not suppress',
  isSuppressed({ [LIFECYCLE_PREF_KEY]: true }, 'lifecycle') === false);
check('transactional is never suppressed',
  isSuppressed({ [LIFECYCLE_PREF_KEY]: false }, 'transactional') === false);

// The preference key must not be `promotions`: it defaults to false in the
// profiles schema, so gating on it would suppress the entire sequence for
// every account — the same defect that kept the horoscope push at zero
// recipients.
check('preference key is not "promotions"', LIFECYCLE_PREF_KEY !== 'promotions');
check('promotions=false does not suppress lifecycle mail',
  isSuppressed({ promotions: false }, 'lifecycle') === false);

// welcome was transactional until 2026-09-01 and was sent by nothing at all.
// Now that it is actually enqueued (20260901000001), it must respect the
// unsubscribe: it is the first beat of onboarding, not a receipt. A
// transactional classification would mail exactly the people who asked us to
// stop, because `isSuppressed` returns false for that category unconditionally.
check('welcome is lifecycle, so the unsubscribe applies to it',
  TEMPLATES.welcome.category === 'lifecycle');
for (const n of ['onboarding_day1', 'onboarding_day3', 'onboarding_day5']) {
  check(`${n} is lifecycle`, TEMPLATES[n].category === 'lifecycle');
}

// ---------------------------------------------------------------------------
// Request-path invariants (source checks)
// ---------------------------------------------------------------------------

section('Request path (source checks)');

const indexSrc = readFileSync(INDEX_TS, 'utf8');

check('index: consults isSuppressed before sending', /isSuppressed\(/.test(indexSrc));
// Anchored to a line of its own: a looser pattern matched the word "text,"
// inside this file's own header comment, so the check passed even with the
// field deleted from the Resend payload.
check('index: sends a text/plain part to Resend', /^\s*text,\s*$/m.test(indexSrc));
check('index: sets List-Unsubscribe', /"List-Unsubscribe"/.test(indexSrc));
check('index: sets List-Unsubscribe-Post for one-click', /List-Unsubscribe-Post/.test(indexSrc));
check('index: one-click headers are lifecycle-only',
  /category === "lifecycle" && unsubscribeUrl/.test(indexSrc));
check('index: reads moon_sign from the profile', /moon_sign/.test(indexSrc));
check('index: default sender is a junosynastry.com address',
  /noreply@junosynastry\.com/.test(indexSrc));

// --- the welcome email, and the account that must not receive mail ----------
// `welcome` shipped, was whitelisted, was asserted here — and was enqueued by
// nothing for its entire life. Now that 20260901000001 enqueues it, these
// guard the two ways it could go wrong: mailing a deactivated account, or
// mailing the same person twice.
check('index: reads is_active from the profile',
  /is_active/.test(indexSrc),
  'lifecycle mail queued days ahead can outlive the deactivation in between');
check('index: skips a deactivated account before Resend',
  /profile\.is_active === false[\s\S]{0,220}?skipped: true[\s\S]{0,60}?"inactive"/.test(indexSrc));

const WELCOME_MIGRATION = path.join(
  ROOT, 'supabase/migrations/20260901000001_welcome_email_on_onboarding.sql',
);
const welcomeSql = existsSync(WELCOME_MIGRATION) ? readFileSync(WELCOME_MIGRATION, 'utf8') : '';
check('a migration enqueues welcome at all', welcomeSql.length > 0,
  '20260901000001_welcome_email_on_onboarding.sql is missing');
check('welcome is enqueued through scheduled_emails, not sent from the trigger',
  /INSERT INTO public\.scheduled_emails[\s\S]{0,200}?'welcome'/.test(welcomeSql),
  'an HTTP call inside the onboarding transaction would let a Resend outage roll back onboarding');
check('welcome is idempotent at the schema level',
  /CREATE UNIQUE INDEX[\s\S]{0,200}?ux_scheduled_emails_welcome_once[\s\S]{0,200}?WHERE template = 'welcome'/.test(welcomeSql) &&
    /ON CONFLICT \(user_id\) WHERE template = 'welcome' DO NOTHING/.test(welcomeSql),
  'a column would only be as reliable as the code that remembers to write it');
check('welcome is not enqueued for a deactivated account',
  /IF COALESCE\(NEW\.is_active, TRUE\) = TRUE THEN/.test(welcomeSql));
check('the three existing onboarding emails are still enqueued',
  ['onboarding_day1', 'onboarding_day3', 'onboarding_day5']
    .every((t) => welcomeSql.includes(`'${t}'`)),
  'replacing schedule_onboarding_emails must not drop the sequence it already sent');
check('the migration performs no backfill',
  !/INSERT INTO public\.scheduled_emails[\s\S]{0,400}?SELECT[\s\S]{0,200}?FROM public\.profiles/.test(welcomeSql),
  'welcoming an account that signed up in June would read as a mistake, not a welcome');

// Source cleanliness, including comments. The rendered-output checks above are
// the ones that matter for what readers receive — but a banned literal sitting
// in a comment makes `grep -ri soulmate supabase/functions/send-email` return a
// hit, and the next person to audit this directory has to work out that it is a
// false alarm. Keep the simplest possible check honest.
const SOURCE_FILES = [
  ['send-email/index.ts', indexSrc],
  ['send-email/templates.ts', readFileSync(TEMPLATES_TS, 'utf8')],
];
const SOURCE_BANNED = [
  /astrodating/i,
  /soulmate/i,
  /perfect match/i,
  /\b\d+[-\s]day (free )?trial\b/i,
  /free trial/i,
];
for (const [label, src] of SOURCE_FILES) {
  for (const pattern of SOURCE_BANNED) {
    const m = src.match(pattern);
    check(`${label}: source is free of "${pattern.source}" (comments included)`,
      !m, m ? `matched: ${JSON.stringify(m[0])} — reword the comment` : '');
  }
}

let unsubSrc = '';
try {
  unsubSrc = readFileSync(UNSUB_TS, 'utf8');
} catch {
  check('unsubscribe function exists', false, `${path.relative(ROOT, UNSUB_TS)} not found`);
}

if (unsubSrc) {
  check('unsubscribe: handles GET (footer link)', /"GET"/.test(unsubSrc));
  check('unsubscribe: handles POST (RFC 8058 one-click)', /"POST"/.test(unsubSrc));
  check('unsubscribe: verifies an HMAC token', /verifyToken\(/.test(unsubSrc));

  // JUNO-21 (8 Sep 2026): signing and verification moved out of the two
  // functions into supabase/functions/_shared/unsubscribe-token.ts, so that a
  // rotation of SUPABASE_SERVICE_ROLE_KEY stops invalidating every unsubscribe
  // link already in an inbox. The constant-time comparison went with it.
  //
  // This check FOLLOWS the code rather than being relaxed: it now asserts both
  // that `unsubscribe` delegates to the shared verifier, and that the shared
  // module still compares in constant time. Deleting either half fails here.
  let tokenSrc = '';
  try {
    tokenSrc = readFileSync(TOKEN_TS, 'utf8');
  } catch {
    // Reported by the check below.
  }

  // Comments blanked. All three files EXPLAIN the old derivation in their
  // headers — that prose is the reason nobody reinstates it, and a validator
  // that cannot tell it from code would force the explanation out.
  const codeOf = (text) =>
    text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const tokenCode = codeOf(tokenSrc);

  check(
    'unsubscribe: delegates verification to the shared token module',
    /verifyUnsubscribeToken/.test(unsubSrc),
    'It should call the shared verifier, which is what supports both token generations.',
  );
  check(
    'unsubscribe: compares signatures in constant time',
    /constantTimeEqual\(sig, expected\)/.test(tokenCode),
    `${path.relative(ROOT, TOKEN_TS)} must compare the HMAC with constantTimeEqual, not ===.`,
  );

  // The legacy branch, asserted on its three moving parts rather than on the
  // word "legacy" — which also appears in the type union and in a later
  // comparison, so a check for the word alone passes against a module whose
  // legacy branch has been gutted. Found by mutating it.
  check(
    'unsubscribe: still verifies links signed before the key split',
    /parts\.length === 2/.test(tokenCode) &&
      /secret = keyring\.previous/.test(tokenCode) &&
      /generation = "legacy"/.test(tokenCode) &&
      /PREVIOUS_SECRET_ENV/.test(tokenCode),
    'Dropping legacy verification turns every unsubscribe link already sent into a 400 — ' +
      'an RFC 8058 failure with Gmail and Yahoo. See docs/runbooks/unsubscribe-dual-key-2026-09.md.',
  );
  check(
    'unsubscribe: new tokens are signed with the current key only',
    /signWith\(`\$\{TOKEN_VERSION\}\.\$\{b64Payload\}`, keyring\.current\)/.test(tokenCode),
    'A new token signed with the previous key would outlive the transition it exists to end.',
  );
  check(
    'unsubscribe: no signing key is derived from the service-role key',
    !/juno-unsubscribe-v1:/.test(tokenCode) &&
      !/juno-unsubscribe-v1:/.test(codeOf(unsubSrc)) &&
      !/juno-unsubscribe-v1:/.test(codeOf(indexSrc)),
    'Rotating SUPABASE_SERVICE_ROLE_KEY would again invalidate every link already sent.',
  );
  check('unsubscribe: writes the same preference key send-email reads',
    new RegExp(`LIFECYCLE_PREF_KEY = "${LIFECYCLE_PREF_KEY}"`).test(unsubSrc));
  check('unsubscribe: cancels still-queued mail', /scheduled_emails/.test(unsubSrc));
  check('unsubscribe: offers an undo', /resubscribe/.test(unsubSrc));

  // The Supabase edge gateway neutralises HTML served by a function: it
  // downgrades the response to text/plain and adds nosniff + a sandbox CSP,
  // regardless of status code. A page written as HTML is therefore shown to
  // the reader as raw markup. Verified live on 2026-08-27.
  // Matches an actual header assignment, not the word "text/html" appearing in
  // the explanatory comment above page(). A looser pattern flagged the comment
  // that documents this very rule.
  check('unsubscribe: does not serve text/html (the gateway neutralises it)',
    !/"Content-Type"\s*:\s*"text\/html/.test(unsubSrc),
    'responses must be text/plain — see the note above page() in that file');
  check('unsubscribe: sets an explicit text/plain content type',
    /"Content-Type"\s*:\s*"text\/plain/.test(unsubSrc));
  check('unsubscribe: no markup left in the human-facing copy',
    !/<a\s+href=|<\/p>|<!DOCTYPE/i.test(unsubSrc),
    'markup would be displayed literally in a text/plain response');

  // ---- Redirect contract with the web result page ------------------------
  check('unsubscribe: redirects humans to the branded page',
    /redirectToResult\(/.test(unsubSrc));
  check('unsubscribe: redirect target is the /unsubscribe route',
    /\$\{APP_BASE_URL\}\/unsubscribe\?status=/.test(unsubSrc));
  check('unsubscribe: keeps a plain-text fallback when APP_BASE_URL is unset',
    /redirectToResult\([^)]*\)\s*\?\?\s*page\(/.test(unsubSrc));

  // A token on a public web URL would land in browser history, referrer
  // headers and Vercel access logs. Only `status` may cross the boundary.
  const redirectTarget = unsubSrc.match(/const target = `([^`]+)`/)?.[1] ?? '';
  check('unsubscribe: redirect target was parsed', redirectTarget.length > 0);
  check('unsubscribe: no token in the redirect target',
    redirectTarget.length > 0 && !/token/i.test(redirectTarget), redirectTarget);

  // RFC 8058: mail providers POST here. A redirect would break one-click.
  const postBlock = unsubSrc.match(/if \(req\.method === "POST"\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
  check('unsubscribe: POST block was located', postBlock.length > 100);
  check('unsubscribe: POST never redirects (RFC 8058 one-click)',
    postBlock.length > 100 && !/redirectToResult|humanResult|Location/.test(postBlock));
  check('unsubscribe: POST answers JSON',
    /"Content-Type"\s*:\s*"application\/json"/.test(postBlock));

  // ---- Status vocabulary must match the page -----------------------------
  let pageSrc = '';
  try {
    pageSrc = readFileSync(UNSUB_PAGE, 'utf8');
  } catch {
    check('web unsubscribe page exists', false, `${path.relative(ROOT, UNSUB_PAGE)} not found`);
  }

  if (pageSrc) {
    const fnStatuses = [
      ...new Set([...unsubSrc.matchAll(/humanResult\(\s*"([a-z]+)"/g)].map((m) => m[1])),
    ];
    const pageStatuses = [
      ...new Set(
        [...pageSrc.matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]),
      ),
    ];

    check('status vocabularies were parsed',
      fnStatuses.length > 0 && pageStatuses.length > 0,
      `function=[${fnStatuses}] page=[${pageStatuses}]`);

    for (const s of fnStatuses) {
      check(`page handles status "${s}" emitted by the function`,
        pageStatuses.includes(s), `page knows: ${pageStatuses.join(', ')}`);
    }

    check('page falls back to a known status for unrecognised input',
      /: "invalid"/.test(pageSrc));
    check('page is marked noindex', /index:\s*false/.test(pageSrc));
    check('page links contact to the marketing host (the app host redirects it)',
      /www\.junosynastry\.com\/\$\{locale\}\/contact/.test(pageSrc));
    check('page uses no legacy domain', !/astrodatingapp/i.test(pageSrc));

    // The token must never reach the web page — not in code, not in a link.
    const pageCode = pageSrc.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    check('page code never references a token', !/token/i.test(pageCode));
  }
}

// The endpoint is useless if Supabase demands a JWT: the reader clicks from
// their inbox and is by definition unauthenticated.
const configToml = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
check('config.toml: unsubscribe is exempt from JWT verification',
  /\[functions\.unsubscribe\]\s*\nverify_jwt = false/.test(configToml));

// ---------------------------------------------------------------------------
// Transactional emails — the gold set of 11 Sep 2026
// ---------------------------------------------------------------------------
// The account-deletion journey (code → scheduled → completed), the payment
// confirmation, the contact pair and the three Supabase Auth templates. The web
// deletion module is RENDERED here, the way the lifecycle templates are; the
// Deno renderers cannot be imported under Node and are checked at the source,
// labelled as such. The behavioural assertions on those — hostile names, hostile
// cancel URLs, the two honest states — live in
// packages/shared/src/security/__tests__/transactional-emails.test.ts, which
// executes the real functions. This section is the cheap guard that runs on
// every validate:*; that suite is the proof.
section('Transactional emails');

const LEGACY_COLOURS = [
  [/#e94560/i, 'coral CTA'],
  [/#ec4899/i, 'pink accent'],
  [/#a78bfa/i, 'lavender link'],
  [/#6366f1/i, 'indigo wash'],
  [/#2d1638/i, 'purple ground'],
  [/#f8d4df/i, 'pink eyebrow'],
  [/#f9a8d4/i, 'pink link'],
  [/rgba\(\s*244\s*,\s*114\s*,\s*182/i, 'pink wash'],
  [/rgba\(\s*236\s*,\s*72\s*,\s*153/i, 'magenta wash'],
  [/rgba\(\s*167\s*,\s*139\s*,\s*250/i, 'lavender wash'],
  [/rgba\(\s*99\s*,\s*102\s*,\s*241/i, 'indigo wash'],
  [/#0f0f1a|#1a1a2e|#2a2a40/i, 'first-generation greys'],
];

function gradientOffenders(html) {
  const out = [];
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const style = m[1];
    if (!/background-image\s*:\s*(linear|radial)-gradient/.test(style)) continue;
    if (!/background-color\s*:\s*#[0-9a-f]{3,6}/i.test(style)) out.push(style.slice(0, 60));
  }
  for (const m of html.matchAll(/background\s*:\s*(linear|radial)-gradient[^;"]*/g)) out.push(m[0].slice(0, 60));
  return out;
}

function checkRenderedTransactional(where, html, text) {
  check(`${where}: html is non-empty`, typeof html === 'string' && html.length > 500);
  check(`${where}: text alternative is non-empty`, typeof text === 'string' && text.trim().length > 80);
  check(`${where}: uses the JUNO gold palette`, /#e8c77e/i.test(html));
  for (const [re, why] of LEGACY_COLOURS) check(`${where}: free of the ${why}`, !re.test(html));
  for (const [pattern, why] of BANNED) {
    const m = (html + '\n' + text).match(pattern);
    check(`${where}: free of "${pattern.source}" (${why})`, !m, m ? `matched: ${m[0]}` : '');
  }
  const opens = (html.match(/<a\s/gi) ?? []).length;
  const closes = (html.match(/<\/a>/gi) ?? []).length;
  check(`${where}: anchors are balanced`, opens === closes, `${opens} <a> vs ${closes} </a>`);
  check(`${where}: every gradient has a solid fallback`, gradientOffenders(html).length === 0,
    gradientOffenders(html).join(' | '));
  check(`${where}: card is fluid on mobile`, /width:100%;max-width:560px/.test(html));
  check(`${where}: layout tables are presentation`, /role="presentation"/.test(html));
  check(`${where}: declares its language`, /<html lang="en">/.test(html));
  check(`${where}: shows the support address`, html.includes('support@junosynastry.com') && text.includes('support@junosynastry.com'));
}

// --- the web deletion module, rendered -------------------------------------
const WEB_EMAIL_TS = path.join(ROOT, 'apps', 'web', 'src', 'lib', 'account-deletion-email.ts');
let webEmail = null;
try {
  webEmail = await import(pathToFileURL(WEB_EMAIL_TS).href);
} catch (err) {
  check('account-deletion-email.ts loads under Node (imports nothing)', false, err.message);
}
if (webEmail) {
  const SAMPLE_CODE = '0123456789ABCDEF';
  const code = webEmail.deletionCodeEmail(SAMPLE_CODE);
  checkRenderedTransactional('deletion code', code.html, code.text);
  check('deletion code: code present in text', code.text.includes(SAMPLE_CODE));
  check('deletion code: code present in html (grouped)', code.html.includes('0123&nbsp;&nbsp;4567&nbsp;&nbsp;89AB&nbsp;&nbsp;CDEF'));
  check('deletion code: 10-minute expiry in both', /10 minutes/.test(code.html) && /10 minutes/.test(code.text));
  check('deletion code: never inside a URL',
    [...code.html.matchAll(/href="([^"]+)"/g)].every((m) => !m[1].includes('0123') && m[1].startsWith('mailto:')));
  check('deletion code: "never send this code" warning', /Never send this code/i.test(code.html) && /Never send this code/i.test(code.text));
  check('deletion code: refuses a malformed code',
    (() => { try { webEmail.deletionCodeEmail('<b>x</b>'); return false; } catch { return true; } })());

  const done = webEmail.deletionCompletedEmail(true);
  const partial = webEmail.deletionCompletedEmail(false);
  checkRenderedTransactional('deletion completed (purge done)', done.html, done.text);
  checkRenderedTransactional('deletion completed (purge partial)', partial.html, partial.text);
  for (const doc of [done.html, done.text]) {
    check('deletion completed (purge done): says the files are removed', /uploaded files[^.]*have been removed/i.test(doc));
    check('deletion completed (purge done): names the verification video', /verification video/i.test(doc));
  }
  for (const doc of [partial.html, partial.text]) {
    check('deletion completed (purge partial): does not claim the files are gone', !/uploaded files[^.]*have been removed/i.test(doc) && !/have all been removed/i.test(doc));
    check('deletion completed (purge partial): gives the 24-hour bound', /within 24 hours/i.test(doc));
  }
  check('deletion completed: deterministic', JSON.stringify(done) === JSON.stringify(webEmail.deletionCompletedEmail(true)));
}

// --- the routes hand the renderer the measurement, and send html + text ------
const REQUEST_ROUTE = path.join(ROOT, 'apps', 'web', 'src', 'app', 'api', 'account', 'request-deletion', 'route.ts');
const CONFIRM_ROUTE = path.join(ROOT, 'apps', 'web', 'src', 'app', 'api', 'account', 'confirm-deletion', 'route.ts');
const CONTACT_ROUTE = path.join(ROOT, 'apps', 'web', 'src', 'app', 'api', 'contact', 'route.ts');
const DELETE_FN = path.join(ROOT, 'supabase', 'functions', 'delete-account', 'index.ts');
const STRIPE_FN = path.join(ROOT, 'supabase', 'functions', 'stripe-webhook', 'index.ts');
const WEB_LIB = path.join(ROOT, 'apps', 'web', 'src', 'lib', 'media-purge.ts');
const rd = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const requestSrc = rd(REQUEST_ROUTE);
const confirmSrc = rd(CONFIRM_ROUTE);
check('request-deletion (source): renders through deletionCodeEmail(code)', /deletionCodeEmail\(code\)/.test(requestSrc));
check('request-deletion (source): sends html and text', /html: deletionEmail\.html/.test(requestSrc) && /text: deletionEmail\.text/.test(requestSrc));
check('confirm-deletion (source): renders through deletionCompletedEmail(purge.done), never a literal',
  /deletionCompletedEmail\(purge\.done\)/.test(confirmSrc) && !/deletionCompletedEmail\((true|false)\)/.test(confirmSrc));
check('confirm-deletion (source): sends html and text', /html: deletionEmail\.html/.test(confirmSrc) && /text: deletionEmail\.text/.test(confirmSrc));
check('confirm-deletion (source): the JUNO-09 guard precedes deleteUser, which precedes the email',
  (() => {
    const g = confirmSrc.indexOf('if (!purge.jobCreated) {');
    const d = confirmSrc.indexOf('auth.admin.deleteUser(user.id)');
    const e = confirmSrc.indexOf('deletionCompletedEmail(purge.done)');
    return g > 0 && d > g && e > d;
  })());
check('media-purge.ts (source): no longer renders email copy', !/export function deletionEmailText/.test(rd(WEB_LIB)));

const deleteSrc = rd(DELETE_FN);
check('delete-account (source): renderer is a named export outside Deno.serve',
  deleteSrc.indexOf('export function renderDeletionScheduledEmail') > 0 &&
    deleteSrc.indexOf('export function renderDeletionScheduledEmail') < deleteSrc.indexOf('Deno.serve('));
check('delete-account (source): sends html and text from the renderer',
  /html: scheduledEmail\.html/.test(deleteSrc) && /text: scheduledEmail\.text/.test(deleteSrc));
check('delete-account (source): cancel URL is validated by shape before rendering',
  /isAcceptableCancelUrl\(input\.cancelUrl, input\.supabaseUrl\)/.test(deleteSrc));
check('delete-account (source): "Keep my JUNO account" on a table button with bgcolor',
  /bgcolor="#e8c77e"[^>]*>\s*<a href="\$\{safeCancel\}"[^>]*color:#0b0b14[^>]*>Keep my JUNO account/.test(deleteSrc));
check('delete-account (source): never logs the cancel URL or token', !/console\.\w+\([^)]*cancel(Url|Token)/.test(deleteSrc));

const stripeSrc = rd(STRIPE_FN);
check('stripe-webhook (source): the reader\'s name is escaped', /Hi \$\{escapeHtml\(firstName\)\}/.test(stripeSrc));
check('stripe-webhook (source): summary rows are escaped', /\$\{escapeHtml\(row\.label\)\}/.test(stripeSrc) && /\$\{escapeHtml\(row\.value\)\}/.test(stripeSrc));
check('stripe-webhook (source): sends a text alternative', /html,\s*text,/.test(stripeSrc));
check('stripe-webhook (source): does not invite a reply to noreply@', !/reply to this email/i.test(stripeSrc));

const contactSrc = rd(CONTACT_ROUTE);
check('contact (source): every reader field is escaped before the HTML',
  ['name', 'email', 'category', 'message'].every((k) => new RegExp(`const safe\\w* = htmlEscape\\(${k}\\)`).test(contactSrc)));
check('contact (source): only the escaped variables reach the HTML',
  (() => {
    // JUNO-07: exactly ONE html: renderEmailShell({ … }) call — the internal
    // delivery. The public auto-acknowledgement is GONE; if a second shell
    // reappears, this fails. And not one raw field inside.
    const calls = [...contactSrc.matchAll(/html: renderEmailShell\(\{[\s\S]*?\}\),/g)].map((m) => m[0]);
    return calls.length === 1 && calls.every((c) => !/\$\{(name|email|category|message)\}/.test(c));
  })());
check('contact (source): auto-reply does not say "reply to this email"', !/just reply to this email/i.test(contactSrc));
check('contact (source): sends to the verified JUNO support inbox — one delivery, server-constant recipient (JUNO-07)',
  /const SUPPORT_INBOX = "support@junosynastry\.com"/.test(contactSrc)
    && /to: SUPPORT_INBOX/.test(contactSrc)
    && [...contactSrc.matchAll(/resend\.emails\.send\(/g)].length === 1
    && !/to: email/.test(contactSrc));

for (const [label, src] of [['delete-account', deleteSrc], ['stripe-webhook', stripeSrc], ['contact', contactSrc], ['lifecycle templates', readFileSync(TEMPLATES_TS, 'utf8')]]) {
  for (const [re, why] of LEGACY_COLOURS) check(`${label} (source): free of the ${why}`, !re.test(src));
  check(`${label} (source): uses the gold palette`, /#e8c77e/i.test(src));
}

// --- the Supabase Auth templates: pasted into the Dashboard as-is -----------
for (const name of ['confirmation', 'recovery', 'email_change']) {
  const file = path.join(ROOT, 'supabase', 'templates', `${name}.html`);
  const html = rd(file);
  const where = `auth template ${name}`;
  check(`${where}: exists`, html.length > 0);
  check(`${where}: keeps {{ .ConfirmationURL }} exactly — two hrefs and the visible fallback`,
    html.split('{{ .ConfirmationURL }}').length - 1 === 3 && html.split('href="{{ .ConfirmationURL }}"').length - 1 === 2);
  check(`${where}: no other Supabase placeholder and no query string appended`,
    !/\{\{\s*\.(Token|TokenHash|SiteURL|RedirectTo)\s*\}\}/.test(html) && !/ConfirmationURL \}\}[?&]/.test(html));
  check(`${where}: gold table button with dark text`,
    /<td align="center" bgcolor="#e8c77e"[^>]*>\s*<a href="\{\{ \.ConfirmationURL \}\}"[^>]*color:#0b0b14/.test(html));
  for (const [re, why] of LEGACY_COLOURS) check(`${where}: free of the ${why}`, !re.test(html));
  const opens = (html.match(/<a\s/gi) ?? []).length;
  const closes = (html.match(/<\/a>/gi) ?? []).length;
  check(`${where}: anchors are balanced`, opens === closes);
  check(`${where}: every gradient has a solid fallback`, gradientOffenders(html).length === 0);
  check(`${where}: card is fluid on mobile`, /width:100%;max-width:560px/.test(html));
  check(`${where}: free of the legacy brand`, !/astrodating/i.test(html));
  check(`${where}: declared in config.toml`, new RegExp(`\\[auth\\.email\\.template\\.${name}\\][\\s\\S]{0,120}content_path = "\\./supabase/templates/${name}\\.html"`).test(configToml));
}

// ---------------------------------------------------------------------------

console.log(
  failures === 0
    ? `\nAll ${checks} email template checks passed.`
    : `\n${failures} of ${checks} checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
