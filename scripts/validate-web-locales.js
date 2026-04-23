// Validate apps/web/messages/<locale>.json against the EN reference.
//
// What it checks (every namespace, not just webApp):
//   - structural drift: missing keys, extra keys
//   - placeholder drift: {var} sets must match between EN and the locale
//   - corruption: ??? leaks, mojibake bytes, BOM
//   - broken key leaks (a value that looks like a dotted key path)
//
// Exits 1 on any issue, 0 otherwise. Wired as `npm run validate:web:locales`.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MESSAGES_DIR = path.join(ROOT, "apps", "web", "messages");
const REFERENCE_LOCALE = "en";
const LOCALES = ["fr", "es", "pt", "de", "ja", "ar", "zh"];

// Top-level namespaces this script knows the EN file ships with — used to
// detect when the EN reference itself drifts. Loaded dynamically below.
function flatten(object, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(object)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.push([next, value]);
    else if (value && typeof value === "object" && !Array.isArray(value))
      out.push(...flatten(value, next));
  }
  return out;
}

function load(locale) {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const raw = fs.readFileSync(file, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    return { error: `${locale}.json starts with a BOM` };
  }
  try {
    const json = JSON.parse(raw);
    return { entries: Object.fromEntries(flatten(json)) };
  } catch (err) {
    return { error: `${locale}.json is not valid JSON: ${err.message}` };
  }
}

const PLACEHOLDER_RE = /\{[^{}]+\}/g;
// Mojibake = UTF-8 bytes misread as Latin-1 then re-encoded. Real PT/ES/FR
// letters like `Ã`, `Á`, `Ñ` are followed by a regular letter, while
// double-encoded sequences like `Ã©`, `Ã§`, `â€™` have a Latin-1 symbol or
// punctuation byte after them. Match only the latter to avoid false positives.
const MOJIBAKE_RE = /Ã[ -¿]|â€[™œ]/;
const KEY_LEAK_NAMESPACES = [
  "webApp",
  "common",
  "hero",
  "features",
  "howItWorks",
  "cta",
  "footer",
  "nav",
  "premium",
  "help",
  "contact",
  "safety",
  "privacy",
  "terms",
  "accountDelete",
  "invite",
  "language",
  "notFound",
  "socialProof",
];
const KEY_LEAK_RE = new RegExp(
  `\\b(?:${KEY_LEAK_NAMESPACES.join("|")})\\.[A-Za-z][A-Za-z0-9_]*`,
  "g"
);

function placeholderSet(value) {
  return new Set((value.match(PLACEHOLDER_RE) || []));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function validate(locale, refEntries) {
  const loaded = load(locale);
  if (loaded.error) return [{ key: "<file>", label: "Load error", value: loaded.error }];
  const issues = [];
  const entries = loaded.entries;

  for (const [key, refValue] of Object.entries(refEntries)) {
    if (!(key in entries)) {
      issues.push({ key, label: "Missing key", value: `expected: ${refValue.slice(0, 80)}` });
      continue;
    }
    const value = entries[key];

    if (typeof value !== "string") {
      issues.push({ key, label: "Non-string value", value: String(value) });
      continue;
    }

    if (value.includes("???")) {
      issues.push({ key, label: "Question-mark corruption", value });
    }
    if (MOJIBAKE_RE.test(value)) {
      issues.push({ key, label: "Mojibake characters", value });
    }
    if (KEY_LEAK_RE.test(value)) {
      issues.push({ key, label: "Broken key leak", value });
    }

    const refPh = placeholderSet(refValue);
    const locPh = placeholderSet(value);
    if (!setsEqual(refPh, locPh)) {
      issues.push({
        key,
        label: "Placeholder mismatch",
        value: `en=[${[...refPh].join(",")}] ${locale}=[${[...locPh].join(",")}]`,
      });
    }
  }

  for (const key of Object.keys(entries)) {
    if (!(key in refEntries)) {
      issues.push({ key, label: "Extra key not in EN", value: entries[key] });
    }
  }

  return issues;
}

const ref = load(REFERENCE_LOCALE);
if (ref.error) {
  console.error(`EN reference failed to load: ${ref.error}`);
  process.exit(2);
}

const allIssues = [];
for (const locale of LOCALES) {
  for (const issue of validate(locale, ref.entries)) {
    allIssues.push({ locale, ...issue });
  }
}

if (allIssues.length === 0) {
  console.log(
    `Web locale validation looks clean: reference=${REFERENCE_LOCALE} locales=${LOCALES.join(", ")} keys=${Object.keys(ref.entries).length}`
  );
  process.exit(0);
}

console.error(`Web locale validation failed (${allIssues.length} issue(s)):\n`);
for (const issue of allIssues) {
  console.error(`[${issue.locale}] ${issue.key}`);
  console.error(`  ${issue.label}`);
  console.error(`  ${issue.value}`);
}
process.exit(1);
