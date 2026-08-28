#!/usr/bin/env node
// The list of supported locales is declared in five independent places. This
// asserts they agree.
//
// Why this exists: profiles.preferred_language carries a CHECK constraint
// listing the locales, and the apps write into it. If someone adds a ninth
// locale to the apps and forgets the constraint, every write from that locale
// fails — silently, because both writers swallow errors by design (a
// preference is not worth interrupting a sign-in over). The failure would
// surface months later as "why are these users getting English email".
//
// The reverse drift is just as bad: dropping a locale from the apps while the
// constraint still allows it leaves rows whose language nothing can render.
//
// Usage: node scripts/validate-locale-contract.mjs

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

let failures = 0;
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  failures++;
};

/** Read a source list, failing loudly rather than returning an empty set. */
function required(label, values) {
  if (!values || values.length === 0) {
    console.error(`Could not parse the locale list from ${label}.`);
    console.error('Refusing to pass vacuously — fix the parser or the source.');
    process.exit(2);
  }
  return [...new Set(values)].sort();
}

// 1. Web routing — the canonical product list.
const routingSrc = readFileSync(
  path.join(ROOT, 'apps/web/src/i18n/routing.ts'), 'utf8',
);
const web = required(
  'apps/web/src/i18n/routing.ts',
  routingSrc.match(/locales:\s*\[([^\]]+)\]/)?.[1]
    ?.match(/"([a-z]{2})"|'([a-z]{2})'/g)
    ?.map((s) => s.replace(/["']/g, '')),
);

// 2. Web message files on disk.
const messages = required(
  'apps/web/messages/*.json',
  readdirSync(path.join(ROOT, 'apps/web/messages'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', '')),
);

// 3. Mobile i18n translations map.
const mobileSrc = readFileSync(
  path.join(ROOT, 'apps/mobile/services/i18n.ts'), 'utf8',
);
const mobile = required(
  'apps/mobile/services/i18n.ts',
  mobileSrc.match(/const translations = \{([^}]+)\}/)?.[1]
    ?.split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-z]{2}$/.test(s)),
);

// 4. Mobile locale files on disk.
const mobileFiles = required(
  'apps/mobile/locales/*.json',
  readdirSync(path.join(ROOT, 'apps/mobile/locales'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace('.json', '')),
);

// 5. The database CHECK constraint.
const migration = path.join(
  ROOT, 'supabase/migrations/20260827000001_profiles_preferred_language.sql',
);
const sqlSrc = readFileSync(migration, 'utf8');
const sql = required(
  path.relative(ROOT, migration),
  sqlSrc.match(/preferred_language IN \(([^)]+)\)/)?.[1]
    ?.match(/'([a-z]{2})'/g)
    ?.map((s) => s.replace(/'/g, '')),
);

// 6. The runtime allowlists in the two writers — a locale the app supports but
//    the writer rejects would never be persisted at all.
const webWriter = required(
  'apps/web/src/components/PreferredLanguageSync.tsx',
  readFileSync(path.join(ROOT, 'apps/web/src/components/PreferredLanguageSync.tsx'), 'utf8')
    .match(/new Set\(\[([^\]]+)\]\)/)?.[1]
    ?.match(/"([a-z]{2})"/g)?.map((s) => s.replace(/"/g, '')),
);

const mobileWriter = required(
  'apps/mobile/services/preferredLanguage.ts',
  readFileSync(path.join(ROOT, 'apps/mobile/services/preferredLanguage.ts'), 'utf8')
    .match(/SUPPORTED_LANGUAGES = \[([^\]]+)\]/)?.[1]
    ?.match(/'([a-z]{2})'/g)?.map((s) => s.replace(/'/g, '')),
);

const SOURCES = [
  ['web routing.ts', web],
  ['web messages/', messages],
  ['mobile i18n.ts', mobile],
  ['mobile locales/', mobileFiles],
  ['db CHECK constraint', sql],
  ['web writer allowlist', webWriter],
  ['mobile writer allowlist', mobileWriter],
];

const reference = web;
console.log(`Reference (web routing.ts): ${reference.join(', ')}\n`);

for (const [label, list] of SOURCES) {
  const missing = reference.filter((l) => !list.includes(l));
  const extra = list.filter((l) => !reference.includes(l));
  if (missing.length || extra.length) {
    fail(
      `${label} drifts from the reference` +
        (missing.length ? `\n        missing: ${missing.join(', ')}` : '') +
        (extra.length ? `\n        extra:   ${extra.join(', ')}` : ''),
    );
  } else {
    console.log(`  ok    ${label.padEnd(24)} ${list.length} locales`);
  }
}

// English must be present everywhere: it is the fallback the whole design
// leans on, in the migration comment and in both writers.
if (!reference.includes('en')) fail('"en" is not in the locale list — it is the documented fallback');

console.log(
  failures === 0
    ? `\nLocale contract looks clean: ${reference.length} locales agreed across ${SOURCES.length} sources.`
    : `\n${failures} locale source(s) drifted.`,
);
process.exit(failures === 0 ? 0 : 1);
