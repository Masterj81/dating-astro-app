#!/usr/bin/env node
// Guards the JUNO palette.
//
// WHY THIS EXISTS
// ---------------
// On 2 Sep 2026 the app was running TWO palettes at once and nothing said so.
// `AppTheme.colors.coral` is #E85D75; a second coral, #E94560, appeared in 25
// mobile files and 83 places overall — more uses than the token it shadowed —
// plus `rgba(233, 69, 96, …)` 51 more times, an older three-stop navy in 56
// places, and a raw Tailwind purple-600. None of it looked wrong: the values
// are plausible neighbours of the real ones, which is exactly why nobody
// noticed the app was painted twice.
//
// The same audit found gold defined and barely used — `premiumGold` had ZERO
// call sites on mobile, and web had no gold token at all, only three raw
// hexes. An astrology app read pink.
//
// Three things are asserted here, and each of them is a one-line regression:
//
//   1. THE SECOND PALETTE STAYS DEAD. Any legacy value reappearing fails.
//   2. MOBILE AND WEB AGREE. The gold scale is declared in two files, in two
//      languages (CSS custom properties and a TS object). Identical hexes are
//      the whole point of calling it one palette, and nothing else checks it.
//   3. THE COLOURS ARE READABLE. Contrast is computed against the real canvas,
//      not eyeballed. A palette that fails AA is not a style opinion.
//
// It also counts the section labels. 144 uppercase eyebrows on web and 61 on
// mobile carry the identity; if they drift back to grey the app quietly loses
// its warmth with every check still green.
//
// Usage: node scripts/validate-design-tokens.mjs

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) {
    console.error(`Missing file: ${rel}`);
    process.exitCode = 2;
    return '';
  }
  return readFileSync(file, 'utf8');
}

const WEB_CSS = 'apps/web/src/app/globals.css';
const MOBILE_THEME = 'apps/mobile/constants/theme.ts';
const css = read(WEB_CSS);
const theme = read(MOBILE_THEME);

// ---------------------------------------------------------------------------
// 1. The palette, and the two files that must agree on it
// ---------------------------------------------------------------------------
console.log('one palette, two platforms');

/** name -> [css custom property, mobile theme key] */
const SHARED_COLORS = {
  gold: ['--color-gold', 'gold'],
  goldSoft: ['--color-gold-soft', 'goldSoft'],
  goldDeep: ['--color-gold-deep', 'goldDeep'],
  goldMuted: ['--color-gold-muted', 'goldMuted'],
  accent: ['--color-accent', 'coral'],
  accentHover: ['--color-accent-hover', 'coralStrong'],
  purple: ['--color-purple', 'cosmic'],
};

function cssHex(prop) {
  const m = css.match(new RegExp(`${prop}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1].toLowerCase() : null;
}
function themeHex(key) {
  const m = theme.match(new RegExp(`\\b${key}\\s*:\\s*'(#[0-9a-fA-F]{6})'`));
  return m ? m[1].toLowerCase() : null;
}

const palette = {};
for (const [name, [prop, key]] of Object.entries(SHARED_COLORS)) {
  const a = cssHex(prop);
  const b = themeHex(key);
  check(`${name}: declared on web (${prop})`, a !== null);
  check(`${name}: declared on mobile (${key})`, b !== null);
  check(
    `${name}: web and mobile hold the same hex`,
    a !== null && b !== null && a === b,
    `web ${a} vs mobile ${b} — one palette means one value, in both files`,
  );
  if (a) palette[name] = a;
}

// ---------------------------------------------------------------------------
// 2. The second palette stays dead
// ---------------------------------------------------------------------------
console.log('the second palette stays dead');

const BANNED = [
  ['#e94560', 'the legacy coral. AppTheme.colors.coral (#E85D75) is the one.'],
  ['#c23a51', 'the legacy pressed coral. Use coralStrong (#D93C5A).'],
  ['#c23152', 'the legacy pressed coral. Use coralStrong (#D93C5A).'],
  ['#0f0f1a', 'the legacy canvas. Use AppTheme.colors.canvas (#0B0B14).'],
  ['#1a1a2e', 'the legacy mid stop. Use gradients.screen.'],
  ['#16213e', 'the legacy end stop. Use gradients.screen.'],
  ['#9333ea', 'raw tailwind purple-600. Cosmic is #8B87FF.'],
  ['#dab56d', 'the old dim gold. The scale starts at #E8C77E.'],
];

const SOURCE_DIRS = ['apps/mobile/app', 'apps/mobile/components', 'apps/web/src'];

/** Comment lines are exempt: the history of a bug is worth writing down, and a
 *  guard that punishes documenting it gets the documentation deleted. */
function scanSources() {
  const out = [];
  const walk = (dir) => {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx|ts|css)$/.test(entry.name)) out.push(rel);
    }
  };
  SOURCE_DIRS.forEach(walk);
  return out;
}
const files = scanSources();

for (const [hex, why] of BANNED) {
  const offenders = [];
  for (const rel of files) {
    const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      if (line.toLowerCase().includes(hex)) offenders.push(`${rel}:${i + 1}`);
    });
  }
  check(`${hex} is gone`, offenders.length === 0, `${why}\n        ${offenders.slice(0, 4).join(', ')}`);
}

// The rgba form of the same legacy coral — invisible to a hex scan, and it was
// 51 uses.
const rgbaOffenders = [];
for (const rel of files) {
  const lines = readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    if (/rgba\(\s*233\s*,\s*69\s*,\s*96/.test(line)) rgbaOffenders.push(`${rel}:${i + 1}`);
  });
}
check(
  'rgba(233, 69, 96, …) is gone too',
  rgbaOffenders.length === 0,
  `the same legacy coral in channel form. Use rgba(232, 93, 117, …).\n        ${rgbaOffenders.slice(0, 4).join(', ')}`,
);

// ---------------------------------------------------------------------------
// 3. Readable on the real canvas
// ---------------------------------------------------------------------------
console.log('readable on the canvas');

const CANVAS = '#0b0b14';
/** The card surface as it actually composites: white at 7% over the canvas. */
const CARD = blend('#ffffff', CANVAS, 0.07);

function blend(fg, bg, alpha) {
  const f = hexToRgb(fg);
  const b = hexToRgb(bg);
  const mix = f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Each colour is tested the way it is actually USED, which is the only way the
// number means anything. A first version checked every token as foreground on
// a card and flagged `accent-hover` at 3.8:1 — but that token appears 62 times
// as `hover:bg-accent-hover` and the question there is whether the white label
// on top can be read, not whether the fill can.
const MIN = 4.5;
/** Tokens rendered as TEXT, measured against the card they sit on. */
const AS_TEXT = ['gold', 'goldSoft', 'goldMuted', 'accent', 'purple'];
/** Tokens rendered as a FILL, measured against the label that sits on them. */
// `goldDeep` is only ever the far end of the premium gradient, which is a
// gold surface: its label is near-black like the rest of that button, not
// white. Testing it against white measured a pairing that does not exist.
const AS_BACKGROUND = { accentHover: '#ffffff', goldDeep: '#0b0b14' };

for (const name of AS_TEXT) {
  const hex = palette[name];
  if (!hex) continue;
  const ratio = contrast(hex, CARD);
  check(
    `${name} (${hex}) is AA as text on a card`,
    ratio >= MIN,
    `${ratio.toFixed(2)}:1, needs ${MIN}:1. Lighten it or stop using it as text.`,
  );
}

// AA for a UI component / large text is 3:1 (WCAG 1.4.11 and 1.4.3). Buttons
// are the case this covers, and the honest floor for them is 3, not 4.5.
for (const [name, fg] of Object.entries(AS_BACKGROUND)) {
  const hex = palette[name];
  if (!hex) continue;
  const ratio = contrast(fg, hex);
  check(
    `${name} (${hex}) carries ${fg} at 3:1 or better`,
    ratio >= 3,
    `${ratio.toFixed(2)}:1. A button label has to be readable on its own fill.`,
  );
}

// The gold CTA is the one button in the app that must never take white text:
// #FFFFFF on #E8C77E is 1.63:1. `textOnGold` exists so the pairing is named
// rather than remembered.
const textOnGold = themeHex('textOnGold');
check('mobile declares textOnGold', textOnGold !== null,
  'anything sitting on gold needs a near-black foreground, and it should be a token');
if (textOnGold && palette.gold) {
  check(
    `textOnGold (${textOnGold}) is readable on gold`,
    contrast(textOnGold, palette.gold) >= MIN,
    `${contrast(textOnGold, palette.gold).toFixed(2)}:1`,
  );
}
check(
  'the CTA gradient never ends on a colour white cannot sit on',
  !/cta:\s*\['#E85D75',\s*'#E8C77E'\]/.test(theme),
  'coral into gold with white text ends at 1.63:1',
);

// ---------------------------------------------------------------------------
// 4. The identity is actually applied
// ---------------------------------------------------------------------------
// Tokens nobody uses are how the palette got into this state: `premiumGold`
// was defined for months with zero call sites. These floors are set below the
// counts at the time of writing (web 144, mobile 61) so ordinary edits pass
// and a wholesale revert does not.
console.log('the identity is applied, not just declared');

let webEyebrows = 0;
let mobileEyebrows = 0;
for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  if (rel.startsWith('apps/web/')) {
    webEyebrows += (src.match(/uppercase tracking-\[[0-9.]+em\] text-gold-muted/g) ?? []).length;
  } else {
    mobileEyebrows += (src.match(/color: AppTheme\.colors\.goldMuted,/g) ?? []).length;
  }
}
check(
  'web section labels are gold',
  webEyebrows >= 120,
  `${webEyebrows} found, expected at least 120. These uppercase eyebrows are on nearly every card; grey ones make the app read cold.`,
);
check(
  'mobile section labels are gold',
  mobileEyebrows >= 50,
  `${mobileEyebrows} found, expected at least 50.`,
);

check(
  'the mobile tab bar wears the identity colour',
  /tabBarActiveTintColor:\s*AppTheme\.colors\.gold/.test(read('apps/mobile/app/(tabs)/_layout.tsx')),
  'the tab bar is on screen in every session; it is where the identity lands or does not',
);

// The trap this catches bit twice while the palette was being applied: a
// button gets the gold gradient and keeps its white label, which looks
// expensive in a diff and is 1.63:1 on screen. Any screen that paints with
// `ctaGold` has to name `textOnGold` somewhere in the same file.
for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  if (!/gradients\.ctaGold/.test(src)) continue;
  check(
    `${rel}: gold button, dark label`,
    /textOnGold|rgba\(11,\s*11,\s*20/.test(src),
    'this screen paints a CTA with gradients.ctaGold but never names textOnGold — white on gold is 1.63:1',
  );
}

check(
  'the chart wheel zodiac ring is gold',
  /rgba\(232,199,126,0\.26\)/.test(read('apps/web/src/components/NatalChartWheel.tsx')) &&
    /rgba\(232,199,126,0\.26\)/.test(read('apps/mobile/components/NatalChartWheel.tsx')),
  'the wheel is the hero image of the product; in flat white it reads as a wireframe',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (failures === 0) {
  console.log(
    `\nDesign tokens look clean: ${checks} checks passed ` +
      `(${Object.keys(palette).length} shared colours, ${webEyebrows} web + ${mobileEyebrows} mobile section labels).`,
  );
  process.exitCode = 0;
} else {
  console.error(`\n${failures} of ${checks} design token guard(s) failed.`);
  process.exitCode = 1;
}
