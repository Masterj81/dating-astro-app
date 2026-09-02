#!/usr/bin/env node
// Guards the tarot corpus, the deck, and the two things about this feature
// that are easy to break silently.
//
// WHY THIS EXISTS
// ---------------
// Until 2 Sep 2026 the 78-card deck existed twice — once in
// `apps/web/src/lib/tarotEngine.ts`, once in
// `apps/mobile/services/tarotEngine.ts` — with 312 meanings each. Importing
// both side by side showed the structure had held (same ids, same order, same
// draw for the same seed) but the PROSE had drifted on three cards: someone
// softened the fatalism on web ("Fate brings an unexpected romantic
// opportunity" → "an unexpected opening may invite you to soften") and the
// change never reached mobile. Nobody noticed for three months, because
// nothing compared them.
//
// So this file compares. Four obligations:
//
//   1. THE DECK IS A DECK. 78 cards, 22 majors, four suits of 14, unique ids,
//      and in the exact order the seeded shuffle depends on. Reordering it
//      changes every reading ever produced for a given seed, silently.
//   2. THE CORPORA ARE COMPLETE AND DISTINCT. Every card names itself and
//      carries four meanings in both written languages, no blanks, no
//      duplicated sentences. Duplicated prose is how a 78-card corpus quietly
//      becomes a 12-card one.
//   3. THE VOICE HOLDS. Tarot here is a reflection surface, not a forecast.
//      Prediction, fatalism, pop-clinical labels and instruction fail the
//      build — in both languages. This is an App Store question before it is
//      an editorial one.
//   4. THERE IS EXACTLY ONE DECK. Both apps import `@astro/shared/tarot`, and
//      no second copy has grown back.
//
// It also checks the premium keys, because the one thing this refactor was
// forbidden to touch is gating: web enforces `tarot_monthly`/`tarot_cosmic`,
// and migration 20260511000002's defensive `tarot` alias stays in the history.
//
// Usage: node scripts/validate-tarot-content.mjs

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
let checks = 0;
let failures = 0;
const check = (label, ok, detail = '') => {
  checks += 1;
  if (ok) return;
  failures += 1;
  console.error(`  FAIL  ${label}`);
  if (detail) console.error(`        ${detail}`);
};

const read = (rel) => {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`Missing file: ${rel}`);
    process.exitCode = 2;
    return '';
  }
  return readFileSync(file, 'utf8');
};

const TAROT_DIR = 'packages/shared/src/tarot';
const load = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

// ---------------------------------------------------------------------------
// 1. The deck
// ---------------------------------------------------------------------------
console.log('one deck, 78 cards, in the order the shuffle trusts');

const { DECK, DECK_SIZE, MAJOR_ARCANA_SIZE, MINOR_SUITS, SUIT_SIZE } = await load(
  `${TAROT_DIR}/deck.ts`,
);

check('the deck holds 78 cards', DECK.length === 78 && DECK_SIZE === 78, `${DECK.length} found`);
check(
  '22 major arcana',
  DECK.filter((c) => c.suit === 'major').length === MAJOR_ARCANA_SIZE &&
    MAJOR_ARCANA_SIZE === 22,
);
check(
  'four suits of 14',
  MINOR_SUITS.every((s) => DECK.filter((c) => c.suit === s).length === SUIT_SIZE) &&
    SUIT_SIZE === 14,
);
check('56 minor arcana', DECK.filter((c) => c.suit !== 'major').length === 56);

const ids = DECK.map((c) => c.id);
check('every id is unique', new Set(ids).size === ids.length);

const expectedOrder = [];
for (let n = 0; n < 22; n += 1) expectedOrder.push(`major-${String(n).padStart(2, '0')}`);
for (const suit of MINOR_SUITS) {
  for (let n = 1; n <= 14; n += 1) expectedOrder.push(`${suit}-${String(n).padStart(2, '0')}`);
}
check(
  'the deck order is exactly the one the seeded shuffle depends on',
  JSON.stringify(ids) === JSON.stringify(expectedOrder),
  'reordering this array changes every reading ever produced for a given seed',
);
check(
  'every card points at its own art file',
  DECK.every((c) => c.imageFile === `${c.id}.jpg`) &&
    new Set(DECK.map((c) => c.imageFile)).size === 78,
);

// ---------------------------------------------------------------------------
// 2. The corpora
// ---------------------------------------------------------------------------
console.log('both written corpora are complete and distinct');

const { CORPUS_EN } = await load(`${TAROT_DIR}/content-en.ts`);
const { CORPUS_FR } = await load(`${TAROT_DIR}/content-fr.ts`);
const CORPORA = { en: CORPUS_EN, fr: CORPUS_FR };

for (const [locale, corpus] of Object.entries(CORPORA)) {
  const missingNames = ids.filter((id) => !corpus.names[id] || !corpus.names[id].trim());
  check(`${locale}: all 78 cards are named`, missingNames.length === 0, missingNames.join(', '));
  check(
    `${locale}: no two cards share a name`,
    new Set(ids.map((id) => corpus.names[id])).size === 78,
  );

  const texts = [];
  const gaps = [];
  for (const id of ids) {
    const m = corpus.meanings[id];
    if (!m) {
      gaps.push(id);
      continue;
    }
    for (const mode of ['love', 'general']) {
      for (const orientation of ['upright', 'reversed']) {
        const text = m[mode]?.[orientation];
        if (typeof text !== 'string' || text.trim().length < 20) {
          gaps.push(`${id} ${mode}.${orientation}`);
        } else {
          texts.push(text);
        }
      }
    }
  }
  check(`${locale}: 312 meanings, none blank or stubbed`, gaps.length === 0, gaps.slice(0, 6).join('; '));
  check(`${locale}: exactly 312 meanings`, texts.length === 312, `${texts.length} found`);
  check(
    `${locale}: no sentence is reused across cards`,
    new Set(texts).size === texts.length,
    'duplicated prose is how a 78-card corpus quietly becomes a 12-card one',
  );
  check(
    `${locale}: no placeholder leaked into the prose`,
    !texts.some((t) => /\[missing|undefined|TODO|Lorem/i.test(t)),
  );
  check(
    `${locale}: every meaning ends as a sentence`,
    texts.every((t) => /[.!?]["']?$/.test(t.trim())),
  );
}

check(
  'the two languages say different things',
  ids.every((id) => CORPUS_EN.meanings[id].love.upright !== CORPUS_FR.meanings[id].love.upright),
  'a card whose French equals its English is an untranslated card',
);
check(
  'the upright and reversed readings differ on every card, in both languages',
  Object.values(CORPORA).every((c) =>
    ids.every(
      (id) =>
        c.meanings[id].love.upright !== c.meanings[id].love.reversed &&
        c.meanings[id].general.upright !== c.meanings[id].general.reversed,
    ),
  ),
);
check(
  'the love and general lenses differ on every card, in both languages',
  Object.values(CORPORA).every((c) =>
    ids.every((id) => c.meanings[id].love.upright !== c.meanings[id].general.upright),
  ),
);

// ---------------------------------------------------------------------------
// 3. The voice
// ---------------------------------------------------------------------------
// A reflection surface does not forecast, does not condemn, and does not
// instruct. These lists are the product promise made mechanical.
console.log('the voice is reflective, not predictive');

const BANNED = {
  en: [
    'will happen', 'guaranteed', 'destined', 'destiny', 'fated', 'soulmate',
    'soul mate', 'toxic', 'you must', 'inevitable', 'inevitably', 'bad luck',
    'doomed', 'cursed', 'diagnos', 'depression', 'invest in stocks',
  ],
  fr: [
    'destin', 'destinée', 'fatalité', 'inévitable', 'malchance', 'âme sœur',
    'toxique', 'tu dois', 'il faut', 'garanti', 'va arriver', 'jamais',
    'maudit', 'diagnostic', 'dépression',
  ],
};

for (const [locale, corpus] of Object.entries(CORPORA)) {
  const offences = [];
  for (const id of ids) {
    const m = corpus.meanings[id];
    for (const text of [m.love.upright, m.love.reversed, m.general.upright, m.general.reversed]) {
      const low = text.toLowerCase();
      for (const word of BANNED[locale]) {
        if (low.includes(word)) offences.push(`${id}: "${word}"`);
      }
    }
  }
  check(
    `${locale}: no predictive, fatalistic, clinical or instructing vocabulary`,
    offences.length === 0,
    offences.slice(0, 8).join('; '),
  );
}

// ---------------------------------------------------------------------------
// 4. One deck, and no second copy growing back
// ---------------------------------------------------------------------------
console.log('exactly one deck, imported by both apps');

const WEB_SCREEN = 'apps/web/src/components/TarotReadingOverview.tsx';
const MOBILE_SCREEN = 'apps/mobile/app/premium-screens/tarot.tsx';
const webScreen = read(WEB_SCREEN);
const mobileScreen = read(MOBILE_SCREEN);

check(
  'the web screen imports the shared tarot package',
  /from ["']@astro\/shared\/tarot["']/.test(webScreen),
);
check(
  'the mobile screen imports the shared tarot package',
  /from ["']@astro\/shared\/tarot["']/.test(mobileScreen),
);
check(
  'the legacy engines are gone',
  !existsSync(path.join(ROOT, 'apps/web/src/lib/tarotEngine.ts')) &&
    !existsSync(path.join(ROOT, 'apps/mobile/services/tarotEngine.ts')),
  'a second deck is how the corpora drifted for three months',
);

// A rebuilt copy would look like a local table of card names or arcana.
const SOURCE_DIRS = ['apps/web/src', 'apps/mobile/app', 'apps/mobile/services', 'apps/mobile/components'];
const sources = [];
const walk = (dir) => {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (/\.(tsx|ts)$/.test(entry.name)) sources.push(rel);
  }
};
SOURCE_DIRS.forEach(walk);

const rebuilt = sources.filter((rel) => {
  const code = read(rel).replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');
  return /MAJOR_ARCANA\s*[:=]|MINOR_MEANINGS\s*[:=]|SUIT_MEANINGS\s*[:=]/.test(code);
});
check(
  'no app-side file has grown its own deck back',
  rebuilt.length === 0,
  rebuilt.join(', '),
);

// The corpus files must import nothing at runtime, or this validator cannot
// load them under Node's type stripping — and then it asserts nothing at all.
for (const file of ['content-en.ts', 'content-fr.ts']) {
  const src = read(`${TAROT_DIR}/${file}`);
  const runtimeImports = (src.match(/^import\s+(?!type\b)/gm) ?? []).length;
  check(
    `${file} imports nothing at runtime`,
    runtimeImports === 0,
    'a runtime import here makes this validator unloadable, and a silent no-op',
  );
}

// ---------------------------------------------------------------------------
// 5. Localisation is explicit
// ---------------------------------------------------------------------------
console.log('the English fallback is admitted, not hidden');

// Behaviour — the draw, the fallback flags, the fact that the locale is absent
// from the seed — is asserted by `packages/shared/src/tarot/__tests__`, which
// imports through the bundler. This file cannot: Node strips types but does
// not resolve the repo's extensionless specifiers, so it can load the leaf
// files (deck and corpora import only types) and not the barrel. What it CAN
// check is that the barrel still declares the contract those tests rely on.
const indexSrc = read(`${TAROT_DIR}/index.ts`);
check(
  'exactly two written locales are declared',
  /WRITTEN_TAROT_LOCALES[^=]*=\s*\['en',\s*'fr'\]/.test(indexSrc),
  'adding a third here without a corpus would serve blank cards',
);
check(
  'an unwritten locale resolves to English and is flagged',
  /return\s*\{\s*corpus:\s*CORPUS_EN,\s*resolvedLocale:\s*'en',\s*isFallback:\s*true\s*\}/.test(
    indexSrc,
  ),
);
check(
  'the reading carries the fallback flag',
  /isFallback:\s*resolved\.some\(/.test(indexSrc),
);
check(
  'the locale is kept out of the seed',
  !/locale/.test(
    indexSrc.slice(indexSrc.indexOf('const { cards, seed } = drawSpread({'), indexSrc.indexOf('});', indexSrc.indexOf('const { cards, seed } = drawSpread({'))),
  ),
  'seeding on the locale would give a reader a different spread per language',
);

const NOTE_KEY = 'tarotV2EnglishCorpusNote';
check(
  'both screens render the fallback note',
  webScreen.includes(NOTE_KEY) && mobileScreen.includes(NOTE_KEY),
  'a silent English fallback is a false promise of localisation',
);
check(
  'the web marks fallback prose with lang="en" for screen readers',
  /lang=\{[^}]*isFallback[^}]*\}/.test(webScreen),
);

const LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'ja', 'zh', 'ar'];
for (const [label, dir, nested] of [
  ['web', 'apps/web/messages', true],
  ['mobile', 'apps/mobile/locales', false],
]) {
  const missing = LOCALES.filter((l) => {
    const json = JSON.parse(read(`${dir}/${l}.json`) || '{}');
    const bag = nested ? (json.webApp ?? {}) : json;
    return typeof bag[NOTE_KEY] !== 'string' || bag[NOTE_KEY].trim() === '';
  });
  check(`${label}: the note exists in all 8 locales`, missing.length === 0, missing.join(', '));
}

// ---------------------------------------------------------------------------
// 6. Gating, untouched
// ---------------------------------------------------------------------------
// This refactor was forbidden to change how tarot is gated. These checks are
// how that promise stays kept when someone later "tidies up" the feature keys.
console.log('premium gating is exactly where it was');

check(
  'web still enforces the split policy keys',
  /tarot_cosmic/.test(webScreen) && /tarot_monthly/.test(webScreen) &&
    /enforce_premium_feature/.test(webScreen),
);
check(
  'mobile still gates through PremiumGate with its own feature names',
  /PremiumGate/.test(mobileScreen) &&
    /weekly-tarot/.test(mobileScreen) &&
    /monthly-tarot/.test(mobileScreen),
);
check(
  'mobile still does NOT call enforce_premium_feature for tarot',
  !/enforce_premium_feature/.test(mobileScreen),
  'mobile tarot is client-gated; migration 20260511000002 says so explicitly',
);

const MIGRATION = 'supabase/migrations/20260511000002_split_tarot_feature_keys.sql';
const migration = read(MIGRATION);
check(
  'the split policy migration is untouched and still seeds both keys',
  /'tarot_monthly'/.test(migration) && /'tarot_cosmic'/.test(migration),
);
check(
  'the defensive legacy `tarot` alias is still there',
  /feature_key = 'tarot'/.test(migration) && !/DELETE\s+FROM\s+public\.premium_feature_policy/i.test(migration),
  'old installed clients calling it must keep getting a coherent answer',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log(
    `\nTarot content looks clean: ${checks} checks passed ` +
      `(78 cards, 2 written locales x 312 meanings, 6 explicit fallbacks).`,
  );
  process.exitCode = 0;
} else {
  console.error(`\n${failures} of ${checks} tarot guard(s) failed.`);
  process.exitCode = 1;
}
