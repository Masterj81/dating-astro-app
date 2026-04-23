// Validate apps/mobile/locales/<locale>.json against the EN reference.
//
// Mobile uses i18n-js with `{{var}}` placeholder syntax (not next-intl's `{var}`).
// Checks every key (mobile schema is flat: no namespaces) for:
//   - structural drift: missing keys, extra keys
//   - placeholder drift: {{var}} sets must match between EN and the locale
//   - corruption: ??? leaks, mojibake bytes, BOM
//
// Exits 1 on any issue, 0 otherwise. Wired as `npm run validate:mobile:locales`.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "apps", "mobile", "locales");
const REFERENCE_LOCALE = "en";
const LOCALES = ["fr", "es", "pt", "de", "ja", "ar", "zh"];

const PLACEHOLDER_RE = /\{\{[^{}]+\}\}/g;
// Mojibake = UTF-8 bytes misread as Latin-1 then re-encoded. Real PT/ES/FR
// letters like `Ã`, `Á`, `Ñ` are followed by a regular letter, while
// double-encoded sequences like `Ã©`, `Ã§`, `â€™` have a Latin-1 symbol or
// punctuation byte after them. Match only the latter to avoid false positives.
const MOJIBAKE_RE = /Ã[ -¿]|â€[™œ]/;

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
  const file = path.join(LOCALES_DIR, `${locale}.json`);
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

function placeholderSet(value) {
  return new Set(value.match(PLACEHOLDER_RE) || []);
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
      // Empty-string values are allowed (e.g. ordinal suffixes that don't
      // exist in some languages — the EN equivalent is "th"/"st"/"nd"/"rd").
      issues.push({
        key,
        label: "Missing key",
        value: `expected: ${refValue.slice(0, 80)}`,
      });
      continue;
    }
    const value = entries[key];

    if (value.includes("???")) {
      issues.push({ key, label: "Question-mark corruption", value });
    }
    if (MOJIBAKE_RE.test(value)) {
      issues.push({ key, label: "Mojibake characters", value });
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
      issues.push({
        key,
        label: "Extra key not in EN",
        value: typeof entries[key] === "string" ? entries[key] : JSON.stringify(entries[key]),
      });
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
    `Mobile locale validation looks clean: reference=${REFERENCE_LOCALE} locales=${LOCALES.join(", ")} keys=${Object.keys(ref.entries).length}`
  );
  process.exit(0);
}

console.error(`Mobile locale validation failed (${allIssues.length} issue(s)):\n`);
for (const issue of allIssues) {
  console.error(`[${issue.locale}] ${issue.key}`);
  console.error(`  ${issue.label}`);
  console.error(`  ${issue.value}`);
}
process.exit(1);
