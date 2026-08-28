// Validate that every translation key the mobile code calls actually exists
// in apps/mobile/locales/en.json (the reference locale — cross-locale parity
// is validate-mobile-locales.js's job).
//
// Two checks:
//   1. Static usage: every `t('key')` / `i18n.t('key')` string literal in the
//      mobile source must be a key in en.json. This is the check that would
//      have caught the paywall V2 `[missing "..."]` regression.
//   2. Dynamic families: template-literal calls like
//      `t(`dailyHoroscopeMoodV2_${sign}`)` can't be extracted statically, so
//      the known families are enumerated below with the full set of runtime
//      suffix values their call sites can produce. Each expected member must
//      exist in en.json. New dynamic call sites must be added to FAMILIES —
//      the script reports unrecognized dynamic call sites so they can't slip
//      in silently.
//
// Exits 1 on any missing key, 0 otherwise. Wired as
// `npm run validate:mobile:i18n-usage`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOBILE = path.join(ROOT, "apps", "mobile");
const SCAN_DIRS = ["app", "components", "services", "contexts", "hooks", "lib", "utils", "constants"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

// ---------------------------------------------------------------------------
// Dynamic key families: prefix template -> exhaustive runtime suffix values.
// Sources of truth for the value sets are noted next to each family.
// ---------------------------------------------------------------------------
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const SIGNS_CAP = SIGNS.map((s) => s[0].toUpperCase() + s.slice(1));
const HOROSCOPE_LEVELS = ["quiet", "soft", "steady", "bright", "strong"]; // LEVELS in daily/monthly-horoscope.tsx
const SYNASTRY_BANDS = ["exceptional", "strong", "promising", "mixed", "growth", "different"]; // SynastryScoreBand in lib/synastry.ts
const SYNASTRY_ZONES = ["emotional", "communication", "attraction", "stability"]; // zone keys in synastry.tsx
const SYNASTRY_FRAMES = ["love", "friendship", "business"]; // ConnectionIntention frames
const SYNASTRY_LENSES = ["mercury", "moon", "venus"]; // talk lenses in synastry.tsx
const ELEMENTS = ["fire", "earth", "air", "water"];

function expand(prefix, suffixes) {
  return suffixes.map((s) => `${prefix}${s}`);
}

const FAMILIES = [
  // premium hub / plans / paywall preview — constants/premiumCatalog.ts
  { label: "premium feature catalogue", keys: ["fullNatalChart", "advancedSynastry", "dailyHoroscope", "monthlyTarot", "monthlyHoroscope", "weeklyTarot", "transitReflection", "planningWindows", "dateReflection"] },
  // t(signKey) — daily/monthly-horoscope.tsx, natal-chart.tsx
  { label: "zodiac sign labels", keys: SIGNS },
  // daily-horoscope.tsx template literals
  { label: "daily horoscope V2", keys: [
    ...expand("dailyHoroscopeMoodV2_", SIGNS),
    ...expand("dailyHoroscopeLensV2_", SIGNS),
    ...expand("dailyHoroscopeDatingLensV2_", SIGNS),
    ...expand("dailyHoroscopeConversationPromptV2_", SIGNS),
    ...expand("dailyHoroscopeReflectV2_", SIGNS),
    ...expand("dailyHoroscopeV2Level_", HOROSCOPE_LEVELS),
  ] },
  // monthly-horoscope.tsx template literals (note: ConversationPrompts is plural)
  { label: "monthly horoscope V2", keys: [
    ...expand("monthlyHoroscopeMoodV2_", SIGNS),
    ...expand("monthlyHoroscopeLensV2_", SIGNS),
    ...expand("monthlyHoroscopeDatingLensV2_", SIGNS),
    ...expand("monthlyHoroscopeConversationPromptsV2_", SIGNS),
    ...expand("monthlyHoroscopeReflectV2_", SIGNS),
    ...expand("monthlyHoroscopeV2Level_", HOROSCOPE_LEVELS),
  ] },
  // synastry.tsx template literals
  { label: "synastry V2", keys: [
    ...expand("synastryScoreTitle_", SYNASTRY_BANDS),
    ...expand("synastryScoreBody_", SYNASTRY_BANDS),
    ...expand("synastryV2Factor_", ["elementRhythm", "emotionalPace", "risingRhythm"]),
    ...expand("synastryV2FactorBody_", ["elementRhythm", "emotionalPace", "risingRhythm"]),
    ...expand("synastryFrame_", SYNASTRY_FRAMES),
    ...SYNASTRY_ZONES.flatMap((z) => SYNASTRY_FRAMES.flatMap((f) => [`synastryZone_${z}_${f}`, `synastryZone_${z}_${f}_desc`])),
    ...expand("synastryV2Dimension_", SYNASTRY_ZONES),
    ...expand("synastryV2DimensionBody_", SYNASTRY_ZONES),
    ...expand("synastryV2Cue_", SYNASTRY_ZONES),
    ...expand("synastryV2TalkLens_", SYNASTRY_LENSES),
    ...SYNASTRY_LENSES.flatMap((l) => ELEMENTS.map((e) => `synastryV2Prompt_${l}_${e}`)),
  ] },
  // tarot.tsx: t(`tarot_${entry.position}`)
  { label: "tarot positions", keys: expand("tarot_", ["past", "present", "future", "advice"]) },
  // natal-chart.tsx interpretation helpers
  { label: "natal chart interpretations", keys: [
    ...SIGNS.map((s) => `${s}Desc`),
    ...expand("sunIn", SIGNS_CAP),
    ...expand("moonIn", SIGNS_CAP),
    ...expand("risingIn", SIGNS_CAP),
    ...expand("dominant", ["Fire", "Earth", "Air", "Water", "Cardinal", "Fixed", "Mutable"]),
  ] },
  // preferences.tsx / onboarding/birth-info.tsx: t(opt) over SHOW_ME_OPTIONS
  { label: "show-me options", keys: ["men", "women", "everyone"] },
  // date-planner.tsx: t(pk) over PROMPT_KEYS_BY_INTENTION
  { label: "date reflection prompts", keys: ["curious", "connect", "know", "fun"].flatMap((i) => [1, 2, 3].map((n) => `dateReflectionPrompt${i[0].toUpperCase() + i.slice(1)}${n}`)) },
];

// ---------------------------------------------------------------------------
// Load reference locale (flattened, same rules as validate-mobile-locales.js)
// ---------------------------------------------------------------------------
function flatten(object, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push(next);
    else if (value && typeof value === "object" && !Array.isArray(value)) out.push(...flatten(value, next));
  }
  return out;
}
const en = JSON.parse(fs.readFileSync(path.join(MOBILE, "locales", "en.json"), "utf8"));
const enKeys = new Set(flatten(en));

// ---------------------------------------------------------------------------
// Collect source files and extract keys
// ---------------------------------------------------------------------------
const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
}
for (const dir of SCAN_DIRS) walk(path.join(MOBILE, dir));
for (const entry of fs.readdirSync(MOBILE, { withFileTypes: true })) {
  if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) files.push(path.join(MOBILE, entry.name));
}

// `t('key')`, `t("key")`, `i18n.t('key')` — the leading [^\w.] guard skips
// unrelated calls like `format('...')` or `Object.assign` member lookups.
const STATIC_RE = /(?:^|[^\w.])(?:i18n\.)?t\(\s*(['"])((?:(?!\1).)+)\1/g;
// `t(`...${x}...`)` — dynamic template-literal call sites, checked against FAMILIES.
const DYNAMIC_RE = /(?:^|[^\w.])(?:i18n\.)?t\(\s*`([^`]*)`/g;

const staticUses = new Map(); // key -> Set(relative file)
const dynamicSites = new Map(); // template source -> Set(relative file)
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const rel = path.relative(MOBILE, file).replace(/\\/g, "/");
  let match;
  STATIC_RE.lastIndex = 0;
  while ((match = STATIC_RE.exec(src))) {
    if (!staticUses.has(match[2])) staticUses.set(match[2], new Set());
    staticUses.get(match[2]).add(rel);
  }
  DYNAMIC_RE.lastIndex = 0;
  while ((match = DYNAMIC_RE.exec(src))) {
    if (!match[1].includes("${")) continue; // plain-string template, caught above
    if (!dynamicSites.has(match[1])) dynamicSites.set(match[1], new Set());
    dynamicSites.get(match[1]).add(rel);
  }
}

// ---------------------------------------------------------------------------
// Check 1: static keys must exist in en.json
// ---------------------------------------------------------------------------
const issues = [];
for (const [key, where] of [...staticUses.entries()].sort()) {
  if (!enKeys.has(key)) {
    issues.push(`Static key "${key}" is missing from en.json (used in ${[...where].join(", ")})`);
  }
}

// ---------------------------------------------------------------------------
// Check 2: every enumerated dynamic-family member must exist in en.json
// ---------------------------------------------------------------------------
for (const family of FAMILIES) {
  for (const key of family.keys) {
    if (!enKeys.has(key)) {
      issues.push(`Dynamic family "${family.label}": expected key "${key}" is missing from en.json`);
    }
  }
}

// ---------------------------------------------------------------------------
// Check 3: every dynamic call site's prefix must be covered by a FAMILIES
// entry, so new template-literal usages fail loudly instead of silently.
// ---------------------------------------------------------------------------
const familyKeys = new Set(FAMILIES.flatMap((f) => f.keys));
for (const [template, where] of [...dynamicSites.entries()].sort()) {
  const prefix = template.slice(0, template.indexOf("${"));
  // A call site is covered if its static prefix matches at least one
  // enumerated family key. Prefix-less templates (`${key}` pass-throughs,
  // e.g. t(signKey)) can't be matched textually and are covered by the
  // variable-argument sites the families already enumerate.
  if (prefix.length === 0) continue;
  const covered = [...familyKeys].some((k) => k.startsWith(prefix));
  if (!covered) {
    issues.push(`Dynamic call site \`t(\`${template}\`)\` (${[...where].join(", ")}) has no FAMILIES entry — add its runtime values to scripts/validate-mobile-i18n-usage.mjs`);
  }
}

if (issues.length === 0) {
  console.log(
    `Mobile i18n usage looks clean: ${staticUses.size} static keys, ${dynamicSites.size} dynamic call sites, ${FAMILIES.reduce((n, f) => n + f.keys.length, 0)} enumerated dynamic keys, en.json=${enKeys.size} keys`
  );
  process.exit(0);
}

console.error(`Mobile i18n usage validation failed (${issues.length} issue(s)):\n`);
for (const issue of issues) console.error(`- ${issue}`);
process.exit(1);
