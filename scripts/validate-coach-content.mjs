#!/usr/bin/env node
// Validates the JUNO Conversation Guide: its content, its i18n chrome, and the
// two structural promises the screen makes.
//
// WHY THIS EXISTS
// ---------------
// Two things about this feature are invisible when broken.
//
// 1. THE CONTENT. `scripts/check-store-metadata.mjs` deliberately does not
//    scan i18n prose, and this corpus does not live in a locale file at all —
//    it is the largest block of unreviewed user-facing English in the app. A
//    single "guaranteed", "soulmate" or clinical term would ship a promise or
//    a pseudo-diagnosis to eight markets. There is no OTA on this project
//    (`expo-updates` is absent), so a bad string waits for a full build and a
//    Play review. A lint in CI is cheaper than that, every time.
//
// 2. THE GATE. The feature only works if a free account can find it and read
//    it without spending anything. Wrapping the screen in `PremiumGate`, or
//    calling `enforcePremiumFeature` from a mount effect, would burn the daily
//    free preview before the reader had read a word — and both are one-line
//    regressions that no type and no test would catch. So they are asserted
//    here, structurally, against the real source.
//
// The corpus is loaded, not grepped: `packages/shared/src/coach/content.ts`
// imports nothing, so Node's native TypeScript stripping can import it
// directly. Same trick as scripts/validate-email-templates.mjs. Requires Node
// >= 22.18; CI pins 24.
//
// Usage: node scripts/validate-coach-content.mjs

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHARED = path.join(ROOT, 'packages/shared/src/coach');
const MOBILE = path.join(ROOT, 'apps/mobile');
const CONTENT_TS = path.join(SHARED, 'content.ts');
const SITUATIONS_TS = path.join(SHARED, 'situations.ts');
const SELECT_TS = path.join(SHARED, 'select.ts');
const SCREEN = path.join(MOBILE, 'app/premium-screens/conversation-guide.tsx');

const LOCALES = ['en', 'fr', 'es', 'pt', 'de', 'ja', 'ar', 'zh'];

const issues = [];
const fail = (msg) => issues.push(msg);

/** Bail loudly rather than reporting success for a file we never understood. */
function refuse(msg) {
  console.error(`${msg}\nRefusing to pass vacuously — fix the parser or the source.`);
  process.exit(2);
}

function read(file) {
  if (!existsSync(file)) refuse(`Could not read ${path.relative(ROOT, file)}.`);
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// Load the corpus (real values, not a regex approximation)
// ---------------------------------------------------------------------------
let coach;
try {
  coach = await import(pathToFileURL(CONTENT_TS).href);
} catch (err) {
  refuse(
    `Could not import packages/shared/src/coach/content.ts.\n` +
      `This script relies on Node's native TypeScript stripping, which does NOT resolve\n` +
      `module specifiers — content.ts must keep importing nothing at runtime.\n` +
      `Node ${process.version}. Original error: ${err.message}`,
  );
}

const { COACH_DISCLAIMER, COACH_SIGN_CONTENT, COACH_SITUATION_FRAMES } = coach;
if (!COACH_SIGN_CONTENT || !COACH_SITUATION_FRAMES || !COACH_DISCLAIMER) {
  refuse('content.ts did not export COACH_SIGN_CONTENT / COACH_SITUATION_FRAMES / COACH_DISCLAIMER.');
}

// ---------------------------------------------------------------------------
// Parse the situation table and the section headings from source text.
// (situations.ts / select.ts import other modules, so they cannot be imported
// under type stripping. Same approach as validate-premium-gating.mjs.)
// ---------------------------------------------------------------------------
const situationsSrc = read(SITUATIONS_TS);
const situationRows = [
  ...situationsSrc.matchAll(
    /\{\s*key:\s*'([a-z]+)',\s*access:\s*'(free|locked)',\s*order:\s*(\d+),\s*labelKey:\s*'([A-Za-z]+)'\s*\}/g,
  ),
].map((m) => ({ key: m[1], access: m[2], order: Number(m[3]), labelKey: m[4] }));
if (situationRows.length === 0) refuse('Could not parse COACH_SITUATIONS from situations.ts.');

const signRows = [
  ...(situationsSrc.match(/COACH_SIGNS[\s\S]*?\]\s*as const;/)?.[0] ?? '').matchAll(/'([a-z]+)'/g),
].map((m) => m[1]);
if (signRows.length === 0) refuse('Could not parse COACH_SIGNS from situations.ts.');

const selectSrc = read(SELECT_TS);
const sectionLabelKeys = [
  ...(selectSrc.match(/SECTION_LABEL_KEYS[\s\S]*?\};/)?.[0] ?? '').matchAll(
    /(\w+):\s*'([A-Za-z]+)'/g,
  ),
].map((m) => m[2]);
if (sectionLabelKeys.length === 0) refuse('Could not parse SECTION_LABEL_KEYS from select.ts.');

const SIGNS = signRows;
const SITUATIONS = situationRows.map((r) => r.key);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

// Promissory, deterministic, manipulative and clinical language. Each entry
// carries the reason so a failure explains itself instead of just matching.
const BANNED = [
  [/\bsoulmates?\b/i, 'magic-outcome claim'],
  [/\bsoul mate\b/i, 'magic-outcome claim'],
  [/\bperfect match\b/i, 'magic-outcome claim'],
  // Narrow on purpose: "the one thing that helps" is legitimate advice,
  // "they might be the one" is a fate claim.
  [/\b(?:is|are|was|might be|could be)\s+the one\b/i, 'magic-outcome claim'],
  [/\bguarantee[ds]\b/i, 'outcome guarantee'],
  [/\bdestin(?:y|ed)\b/i, 'fate claim'],
  [/\bmeant to be\b/i, 'fate claim'],
  [/\bfated\b/i, 'fate claim'],
  [/\balways\b/i, 'deterministic — use may / often / can / tends to'],
  [/\bnever fails?\b/i, 'deterministic'],
  [/\bevery time\b/i, 'deterministic'],
  [/\b(?:they|he|she|you)\s+will\b/i, 'predicts what the other person does'],
  [/\bwill (?:make|get) (?:them|him|her)\b/i, 'predicts an outcome'],
  [/\bmanipulat/i, 'manipulation'],
  [/\bplay(?:ing)? hard to get\b/i, 'manipulation'],
  [/\bmake (?:them|him|her) jealous\b/i, 'manipulation'],
  [/\bmixed signals? trick\b/i, 'manipulation'],
  [/\btoxic\b/i, 'character verdict'],
  [/\bnarcissis/i, 'clinical'],
  [/\bgaslight/i, 'clinical'],
  [/\btraumas?\b/i, 'clinical'],
  [/\banxiety\b/i, 'clinical'],
  [/\bdepress(?:ion|ed)\b/i, 'clinical'],
  [/\battachment style\b/i, 'clinical'],
  [/\btherap(?:y|ist)\b/i, 'clinical'],
  [/\bdiagnos/i, 'clinical'],
  [/\bastrodating\b/i, 'former brand name'],
  // Case-sensitive on purpose, matching the reasoning in
  // scripts/check-store-metadata.mjs: Saturn is a real planet and will appear
  // in premium placement copy. Only the all-caps former wordmark is banned.
  [/\bSATURN\b/, 'former rebrand name (SATURN)'],
];

const HEDGE = /\b(?:may|might|can|could|often|usually|generally|sometimes|tends? to)\b/i;

// Character verdicts: describing the person, never the rhythm.
const VERDICT = /\b(?:they|he|she)\s+(?:are|is)\s+(?:cold|difficult|toxic|needy|clingy|jealous|lazy|selfish|unstable|immature)\b/i;

const LENGTH = {
  rhythm: [60, 200],
  works: [80, 340],
  avoid: [80, 340],
  line: [30, 220],
  intent: [50, 240],
  reflect: [40, 240],
};

/** Flatten every string in the corpus with a diagnosable path and a kind. */
function corpusStrings() {
  const out = [{ path: 'disclaimer', kind: 'disclaimer', value: COACH_DISCLAIMER }];
  for (const [situation, frame] of Object.entries(COACH_SITUATION_FRAMES)) {
    out.push({ path: `frames.${situation}.intent`, kind: 'intent', value: frame.intent });
    out.push({ path: `frames.${situation}.reflect`, kind: 'reflect', value: frame.reflect });
  }
  for (const [sign, entry] of Object.entries(COACH_SIGN_CONTENT)) {
    out.push({ path: `signs.${sign}.rhythm`, kind: 'rhythm', value: entry.rhythm });
    out.push({ path: `signs.${sign}.works`, kind: 'works', value: entry.works });
    out.push({ path: `signs.${sign}.avoid`, kind: 'avoid', value: entry.avoid });
    for (const [situation, line] of Object.entries(entry.lines ?? {})) {
      out.push({ path: `signs.${sign}.lines.${situation}`, kind: 'line', value: line });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Check 1 — coverage: 12 signs x every P0 situation, nothing missing
// ---------------------------------------------------------------------------
if (SIGNS.length !== 12) {
  fail(`COACH_SIGNS declares ${SIGNS.length} signs; the zodiac has 12.`);
}
for (const sign of SIGNS) {
  const entry = COACH_SIGN_CONTENT[sign];
  if (!entry) {
    fail(`Content coverage: sign "${sign}" has no entry in content.ts. A reader who picks it gets a crash, not a card.`);
    continue;
  }
  for (const field of ['rhythm', 'works', 'avoid']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      fail(`Content coverage: signs.${sign}.${field} is empty.`);
    }
  }
  for (const situation of SITUATIONS) {
    const line = entry.lines?.[situation];
    if (typeof line !== 'string' || line.trim() === '') {
      fail(`Content coverage: signs.${sign}.lines.${situation} is missing. Every sign must answer every situation the picker offers.`);
    }
  }
}
for (const extra of Object.keys(COACH_SIGN_CONTENT)) {
  if (!SIGNS.includes(extra)) {
    fail(`content.ts defines sign "${extra}", which COACH_SIGNS does not list — it would never render.`);
  }
}
for (const situation of SITUATIONS) {
  const frame = COACH_SITUATION_FRAMES[situation];
  if (!frame?.intent || !frame?.reflect) {
    fail(`Content coverage: frames.${situation} needs both "intent" and "reflect".`);
  }
}

// ---------------------------------------------------------------------------
// Check 2 — free / locked coherence
// ---------------------------------------------------------------------------
const freeSituations = situationRows.filter((r) => r.access === 'free');
if (freeSituations.length !== 1) {
  fail(
    `COACH_SITUATIONS exposes ${freeSituations.length} free situation(s); it must expose exactly 1. ` +
      'A free account needs one surface that never runs out, and only one may be ungated.',
  );
} else if (freeSituations[0].key !== 'start') {
  fail(
    `The free situation is "${freeSituations[0].key}"; P0 ships "start" free. ` +
      'Changing which situation is free is a product decision — update the plan and this check together.',
  );
}
const orders = situationRows.map((r) => r.order).sort((a, b) => a - b);
if (orders.some((o, i) => o !== i + 1)) {
  fail(`COACH_SITUATIONS orders are ${orders.join(', ')} — they must be 1..${orders.length} with no gaps.`);
}

// ---------------------------------------------------------------------------
// Check 3 — language: banned lexicon, modality, character verdicts, length
// ---------------------------------------------------------------------------
for (const { path: p, kind, value } of corpusStrings()) {
  if (typeof value !== 'string') continue;

  // "guarantee" is allowed in exactly one place: the negated disclaimer.
  const scanned = p === 'disclaimer' ? value.replace(/does not guarantee/gi, '') : value;

  for (const [pattern, reason] of BANNED) {
    const hit = scanned.match(pattern);
    if (hit) fail(`Banned language in ${p}: "${hit[0]}" (${reason}).`);
  }

  const verdict = value.match(VERDICT);
  if (verdict) {
    fail(`Character verdict in ${p}: "${verdict[0]}". Describe a rhythm, never the person.`);
  }

  if (kind === 'rhythm' || kind === 'works' || kind === 'avoid') {
    if (!HEDGE.test(value)) {
      fail(`Missing modal hedge in ${p}. Every claim about a sign needs may / often / can / tends to.`);
    }
  }

  const bounds = LENGTH[kind];
  if (bounds) {
    const [min, max] = bounds;
    if (value.length < min) fail(`${p} is ${value.length} chars, under the ${min}-char floor — likely a placeholder.`);
    if (value.length > max) fail(`${p} is ${value.length} chars, over the ${max}-char ceiling for "${kind}".`);
  }

  if (kind === 'line' && /\n/.test(value)) {
    fail(`${p} contains a newline. A sendable line is one sentence, not a script.`);
  }
}

// ---------------------------------------------------------------------------
// Check 4 — the disclaimer says what it must
// ---------------------------------------------------------------------------
if (!/not prediction/i.test(COACH_DISCLAIMER)) {
  fail('COACH_DISCLAIMER must say the guidance is for reflection, not prediction.');
}
if (!/does not guarantee/i.test(COACH_DISCLAIMER)) {
  fail('COACH_DISCLAIMER must disclaim guaranteed outcomes, matching the wording used elsewhere in the app.');
}

// ---------------------------------------------------------------------------
// Check 5 — the screen's two structural promises
// ---------------------------------------------------------------------------
const screen = read(SCREEN);

// Scan CODE, not prose. The screen's header comment explains at length why it
// does not use PremiumGate and why the gate call must never move to mount —
// that explanation is the most valuable thing in the file and must not be what
// trips the check. Comments are therefore stripped before the structural
// assertions; the marker-comment check below reads the raw source instead.
const code = screen
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
  .join('\n');

if (/\bPremiumGate\b/.test(code)) {
  fail(
    'conversation-guide.tsx references PremiumGate. PremiumGate decides at MOUNT, which would spend the ' +
      "reader's daily free preview before they read a word and would hide the free situation for the rest of the day.",
  );
}

const gateCalls = [...code.matchAll(/enforcePremiumFeature\s*\(/g)];
if (gateCalls.length === 0) {
  fail('conversation-guide.tsx never calls enforcePremiumFeature — locked situations would be ungated and nothing would be measurable.');
} else if (gateCalls.length > 1) {
  fail(
    `conversation-guide.tsx calls enforcePremiumFeature ${gateCalls.length} times. One call per screen: a second ` +
      'call is exactly how the free preview got double-consumed before migration 20260823000001.',
  );
} else {
  // The single call must live inside a callback, not inside a mount effect.
  const before = code.slice(0, gateCalls[0].index);
  const lastEffect = before.lastIndexOf('useEffect(');
  const lastCallback = before.lastIndexOf('useCallback(');
  if (lastCallback < 0 || lastCallback < lastEffect) {
    fail(
      'enforcePremiumFeature is not inside a useCallback in conversation-guide.tsx — it appears to run from an ' +
        'effect. It must fire only on the first tap of a locked situation, never on mount.',
    );
  }
  // Read the RAW source here: this one asserts the comment is still there.
  const rawAt = screen.indexOf('enforcePremiumFeature(');
  if (!/GATE:[^\n]*first tap/i.test(screen.slice(Math.max(0, rawAt - 900), rawAt))) {
    fail(
      'The enforcePremiumFeature call site has lost its "GATE: ... first tap ..." marker comment. ' +
        'That comment is what tells the next reader (and this check) that the call must never move to mount.',
    );
  }
}

if (!/coach:preview-date/.test(code)) {
  fail(
    'conversation-guide.tsx does not use the "coach:preview-date" replay key. Without it, a reader who spends ' +
      "their preview and comes back two hours later is paywalled for something they already paid for (the server's " +
      'replay window is only 15 minutes).',
  );
}

// ---------------------------------------------------------------------------
// Check 6 — discoverable outside the Cosmic Hub
// ---------------------------------------------------------------------------
// The Premium tab renders a full-screen paywall for free accounts
// (app/(tabs)/premium.tsx), so a free user never sees the hub grid. If the hub
// were the only entry, the feature would be invisible to every account it is
// meant to convert.
const ROUTE = '/premium-screens/conversation-guide';
const NON_HUB_ENTRIES = [
  'app/(tabs)/profile.tsx',
  'app/chat/[id].tsx',
  'app/(tabs)/discover.tsx',
];
const found = NON_HUB_ENTRIES.filter((rel) => {
  const file = path.join(MOBILE, rel);
  return existsSync(file) && readFileSync(file, 'utf8').includes(ROUTE);
});
if (found.length === 0) {
  fail(
    `No entry point to ${ROUTE} outside the premium hub. Free accounts see a paywall on the Premium tab ` +
      `(app/(tabs)/premium.tsx), so the feature would be undiscoverable for them. Add an entry in one of: ` +
      NON_HUB_ENTRIES.join(', '),
  );
}

// ---------------------------------------------------------------------------
// Check 7 — i18n chrome exists in every locale
// ---------------------------------------------------------------------------
const situationLabelKeys = situationRows.map((r) => r.labelKey);
const CHROME_KEYS = [
  'conversationGuide',
  'conversationGuideSubtitle',
  'conversationGuideChooseSign',
  'conversationGuideChooseSituation',
  'conversationGuideFreeBadge',
  'conversationGuideLockedBadge',
  'conversationGuideCopy',
  'conversationGuideCopied',
  'conversationGuideEditHint',
  'conversationGuideDisclaimer',
  'conversationGuideEnglishNote',
  'conversationGuideLockedTitle',
  'conversationGuideLockedBody',
  'conversationGuideUnlockCta',
  'conversationGuidePreviewBanner',
  'conversationGuideExhaustedTitle',
  'conversationGuideExhaustedBody',
  'conversationGuideUpgradeCta',
  'conversationGuideErrorTitle',
  'conversationGuideErrorBody',
  'conversationGuideRetry',
  'conversationGuideEntryTitle',
  'conversationGuideEntrySubtitle',
  'conversationGuideChatChip',
  ...situationLabelKeys,
  ...sectionLabelKeys,
];

for (const locale of LOCALES) {
  const file = path.join(MOBILE, 'locales', `${locale}.json`);
  if (!existsSync(file)) {
    fail(`Missing locale file apps/mobile/locales/${locale}.json.`);
    continue;
  }
  let json;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`apps/mobile/locales/${locale}.json is not valid JSON: ${err.message}`);
    continue;
  }
  for (const key of CHROME_KEYS) {
    const value = json[key];
    if (typeof value !== 'string' || value.trim() === '') {
      fail(`i18n: "${key}" is missing or empty in apps/mobile/locales/${locale}.json.`);
    }
  }
  // The disclaimer is chrome, so it IS translated — and it must keep saying
  // the thing it exists to say. Checked structurally in EN, presence-only
  // elsewhere (the wording differs per language by design).
  if (locale === 'en' && typeof json.conversationGuideDisclaimer === 'string') {
    if (!/not prediction/i.test(json.conversationGuideDisclaimer)) {
      fail('i18n: conversationGuideDisclaimer (en) must say "not prediction".');
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (issues.length === 0) {
  const strings = corpusStrings();
  console.log(
    `Conversation Guide content looks clean: ${SIGNS.length} signs x ${SITUATIONS.length} situations ` +
      `(${situationRows.filter((r) => r.access === 'free').length} free, ` +
      `${situationRows.filter((r) => r.access === 'locked').length} locked), ` +
      `${strings.length} corpus strings, ${CHROME_KEYS.length} chrome keys x ${LOCALES.length} locales, ` +
      `${found.length} non-hub entry point(s), gate asserted off the mount path.`,
  );
  process.exit(0);
}

console.error(`Conversation Guide validation failed (${issues.length} issue(s)):\n`);
for (const issue of issues) console.error(`- ${issue}`);
process.exit(1);
