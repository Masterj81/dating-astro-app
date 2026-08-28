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

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions', 'send-email');
const TEMPLATES_TS = path.join(FN_DIR, 'templates.ts');
const INDEX_TS = path.join(FN_DIR, 'index.ts');
const UNSUB_TS = path.join(ROOT, 'supabase', 'functions', 'unsubscribe', 'index.ts');
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

check('welcome is transactional', TEMPLATES.welcome.category === 'transactional');
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
  check('unsubscribe: compares signatures in constant time', /constantTimeEqual/.test(unsubSrc));
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

console.log(
  failures === 0
    ? `\nAll ${checks} email template checks passed.`
    : `\n${failures} of ${checks} checks failed.`,
);
process.exit(failures === 0 ? 0 : 1);
