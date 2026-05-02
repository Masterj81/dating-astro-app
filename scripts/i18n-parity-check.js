// Plans the i18n translation work for the 6 secondary locales (ar/de/es/ja/pt/zh).
//
// Wraps validate-{web,mobile}-locales.js but trims their full output down to
// just the keys that matter for a given vague (translation wave). Uses curated
// allowlists below — `vague1` is the visible-UI-critical set, `vague2` is the
// catalog (values + lifestyle tags), `vague3` is prompt text. Pass --vague=N
// to filter, or --all to dump everything missing per locale.
//
// Usage:
//   node scripts/i18n-parity-check.js --vague=1
//   node scripts/i18n-parity-check.js --all
//   node scripts/i18n-parity-check.js --vague=1 --locale=es

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SECONDARY_LOCALES = ["ar", "de", "es", "ja", "pt", "zh"];

// ---- Curated allowlists --------------------------------------------------
//
// Vague 1: keys that show up on every profile / discover card / edit screen.
// Translating these closes 95% of the visible English leakage.
const VAGUE_1 = {
  // Mobile keys (flat, no namespace)
  mobile: [
    // Completeness hints
    "completeProfileHigh",
    "completeProfileLow",
    // Required intent + section labels
    "relationshipIntent",
    "relationshipIntentHint",
    "relationshipIntentRequired",
    "myValues",
    "myValuesHint",
    "lifestyle",
    "lifestyleHint",
    "myPrompts",
    "myPromptsHint",
    "addPrompt",
    "choosePrompt",
    "promptResponsePlaceholder",
    "removePrompt",
    "prompt_cat_humor",
    "prompt_cat_vulnerable",
    "prompt_cat_astro",
    "prompt_cat_fun",
    "prompt_cat_values",
    "lifestyle_food",
    "lifestyle_sport",
    "lifestyle_music",
    // 5 intents (snake_case mirrors @astro/shared/profile catalog keys)
    "intent_serious",
    "intent_serious_desc",
    "intent_exploring",
    "intent_exploring_desc",
    "intent_casual",
    "intent_casual_desc",
    "intent_friends",
    "intent_friends_desc",
    "intent_unsure",
    "intent_unsure_desc",
    // Public display labels
    "publicLookingFor",
    "publicValues",
    "publicLifestyle",
    "publicIcebreakerLabel",
    "publicIcebreakerCta",
    // Misc visible
    "tagsInCommon",
    "viewProfile",
    "icebreakerSection",
    "icebreakerHint",
    "lookingForLabel",
    "lookingForHint",
    "lookingForPlaceholder",
    "icebreakerPlaceholder",
  ],
  // Web keys (under webApp.*)
  web: [
    "webApp.fileTooLarge",
    "webApp.invalidFileType",
    "webApp.relationshipIntent",
    "webApp.relationshipIntentHint",
    "webApp.relationshipIntentRequired",
    "webApp.myValues",
    "webApp.myValuesHint",
    "webApp.lifestyle",
    "webApp.lifestyleHint",
    "webApp.myPrompts",
    "webApp.myPromptsHint",
    "webApp.addPrompt",
    "webApp.choosePrompt",
    "webApp.promptResponsePlaceholder",
    "webApp.removePrompt",
    "webApp.prompt_cat_humor",
    "webApp.prompt_cat_vulnerable",
    "webApp.prompt_cat_astro",
    "webApp.prompt_cat_fun",
    "webApp.prompt_cat_values",
    "webApp.lifestyle_food",
    "webApp.lifestyle_sport",
    "webApp.lifestyle_music",
    "webApp.intent_serious",
    "webApp.intent_serious_desc",
    "webApp.intent_exploring",
    "webApp.intent_exploring_desc",
    "webApp.intent_casual",
    "webApp.intent_casual_desc",
    "webApp.intent_friends",
    "webApp.intent_friends_desc",
    "webApp.intent_unsure",
    "webApp.intent_unsure_desc",
    "webApp.publicLookingFor",
    "webApp.publicValues",
    "webApp.publicLifestyle",
    "webApp.publicIcebreakerLabel",
    "webApp.publicIcebreakerCta",
    "webApp.tagsInCommon",
    "webApp.icebreakerSection",
    "webApp.lookingForLabel",
    "webApp.lookingForHint",
    "webApp.lookingForPlaceholder",
    "webApp.icebreakerPlaceholder",
  ],
};

// Vague 2 matches the @astro/shared catalog: 12 values + 36 lifestyle tags.
// Detection: `value_*` for personal values, `tag_(food|sport|music)_*` for
// lifestyle tags. The labelKey naming in catalog.ts is the source of truth.
function isVague2(key) {
  const bare = key.replace(/^webApp\./, "");
  return /^value_/.test(bare) || /^tag_(food|sport|music)_/.test(bare);
}

// Vague 3: prompt question text. Detection: `prompt_<id>` (not the category
// label `prompt_cat_*`, which is V1).
function isVague3(key) {
  const bare = key.replace(/^webApp\./, "");
  return /^prompt_/.test(bare) && !/^prompt_cat_/.test(bare);
}

// ---- JSON walking --------------------------------------------------------

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object" && !Array.isArray(v))
      Object.assign(out, flatten(v, key));
  }
  return out;
}

function loadFlat(file) {
  return flatten(JSON.parse(fs.readFileSync(file, "utf8")));
}

function classify(key) {
  const bare = key.replace(/^webApp\./, "");
  if (VAGUE_1.web.includes(key) || VAGUE_1.mobile.includes(bare)) return 1;
  if (isVague2(key)) return 2;
  if (isVague3(key)) return 3;
  return 0; // not in any planned vague
}

// ---- CLI -----------------------------------------------------------------

const args = process.argv.slice(2);
const targetVague = parseInt((args.find(a => a.startsWith("--vague=")) || "").split("=")[1], 10);
const targetLocale = (args.find(a => a.startsWith("--locale=")) || "").split("=")[1];
const showAll = args.includes("--all");

const surfaces = [
  { name: "mobile", dir: "apps/mobile/locales" },
  { name: "web", dir: "apps/web/messages" },
];

const summary = [];

for (const { name, dir } of surfaces) {
  const enFile = path.join(ROOT, dir, "en.json");
  const enKeys = loadFlat(enFile);
  const enKeyList = Object.keys(enKeys);

  for (const locale of SECONDARY_LOCALES) {
    if (targetLocale && locale !== targetLocale) continue;

    const localeFile = path.join(ROOT, dir, `${locale}.json`);
    if (!fs.existsSync(localeFile)) continue;

    const localeKeys = loadFlat(localeFile);
    const missing = enKeyList.filter(k => !(k in localeKeys));

    const filtered = showAll
      ? missing
      : missing.filter(k => {
          const v = classify(k);
          return targetVague ? v === targetVague : v > 0;
        });

    if (filtered.length === 0) continue;

    console.log(`\n=== [${name}] ${locale} — ${filtered.length} key(s) ===`);
    for (const key of filtered) {
      const vagueLabel = classify(key) ? `V${classify(key)}` : "—";
      console.log(`  [${vagueLabel}] ${key}`);
      console.log(`    EN: ${enKeys[key].slice(0, 100)}`);
    }

    summary.push({ surface: name, locale, count: filtered.length });
  }
}

console.log("\n=== Summary ===");
const totalKeys = summary.reduce((sum, s) => sum + s.count, 0);
for (const { surface, locale, count } of summary) {
  console.log(`[${surface}] ${locale}: ${count}`);
}
console.log(`Total: ${totalKeys} string(s) to translate`);
