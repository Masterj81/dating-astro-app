// check-store-metadata.mjs
//
// Anti-regression guard for the JUNO App Store resubmission (Guideline
// 4.3(b)). It scans the store-facing and marketing-public surfaces — the
// values that literally become the app's name, store description,
// marketing graphics, share card and transactional emails — for old
// brand names and swipe/match dating-clone language.
//
// SCOPE — three deliberately-targeted tiers (per the brief: scan
// store-facing + marketing-public surfaces, NOT historical migrations,
// NOT i18n prose, NOT internal code):
//
//   1. CONFIG FIELDS (app.json + PWA manifests, name/description). The
//      strictest bar. NEVER inspects technical identifiers (bundle id,
//      applicationId, slug, URL scheme, domains, Sentry project, EAS
//      projectId) — they legitimately contain "astrodating".
//
//   2. MARKETING / USER-VISIBLE ASSETS (OG card, Google Play feature
//      graphics, Supabase transactional emails). Scanned as raw text,
//      reported with line numbers. NOT lowercase-scanned for
//      "astrodating" / "saturn": the product domain astrodatingapp.com
//      legitimately appears in the OG footer, and "Saturn" is a real
//      planet. The case-sensitive \bAstroDating\b / \bSATURN\b wordmark
//      checks catch the old brands instead.
//
//   3. APP REVIEW / STORE DOCS (juno-metadata.md, juno-app-review-notes.md,
//      screenshot-seed-notes.md). NOT substring-scanned — they
//      legitimately quote the banned phrases inside honest App Review
//      disclaimers and prohibited-term lists. They get POSITIVE marker
//      checks instead, so the guard can never be made unpassable by the
//      Apple notes that explain what JUNO is not.
//
// JUNO is an honest romantic / relationship product: "relationship",
// "romantic", "love", "synastry", "birth-chart context", "connection",
// "conversation", "guided intro" are ALL allowed.
//
// Exit 0 when clean, 1 on any finding. Run: node scripts/check-store-metadata.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Dating-clone phrases + old brand names, each with the reason it is
// banned (surfaced in the report). All are multi-word phrases or proper
// nouns with NO honest use in an app name, store description or
// marketing asset, so a case-insensitive substring match is safe.
const HARD_BANNED = [
  { term: "astrodating", reason: "former brand name" },
  { term: "saturn", reason: "former rebrand name (SATURN)" },
  { term: "tinder", reason: "competitor brand name" },
  { term: "bumble", reason: "competitor brand name" },
  { term: "hinge", reason: "competitor brand name" },
  { term: "dating clone", reason: "dating-clone framing" },
  { term: "swipe app", reason: "swipe-clone framing" },
  { term: "dating app", reason: "generic-dating framing (use 'relationship discovery app')" },
  { term: "perfect match", reason: "magic-outcome claim" },
  { term: "soulmate", reason: "magic-outcome claim" },
  { term: "guaranteed compatibility", reason: "compatibility guarantee" },
  { term: "unlimited swipes", reason: "swipe-clone mechanic" },
  { term: "swipe left", reason: "swipe-clone mechanic" },
  { term: "swipe right", reason: "swipe-clone mechanic" },
  { term: "swipe-to-like", reason: "swipe-clone mechanic" },
  { term: "swipe-to-pass", reason: "swipe-clone mechanic" },
  { term: "it's a match", reason: "match-celebration phrase" },
  { term: "it’s a match", reason: "match-celebration phrase (curly apostrophe)" },
  { term: "match rate", reason: "match-clone metric" },
  { term: "higher match chance", reason: "match-clone metric" },
  { term: "find your match", reason: "match-clone tagline" },
  { term: "find your deeper match", reason: "match-clone tagline" },
  { term: "prediction", reason: "fortune-telling claim" },
];

// Additionally banned in NAME fields — a store/app name must be pristine.
// (Descriptions may say "synastry" etc.; bare "swipe"/"match" are checked
// on names only.)
const NAME_ONLY_BANNED = [
  { term: "swipe", reason: "swipe mechanic in a store name" },
  { term: "match", reason: "match mechanic in a store name" },
  { term: "dating", reason: "generic 'dating' in a store name" },
  { term: "single", reason: "generic-dating term in a store name" },
  { term: "horoscope", reason: "generic-horoscope term in a store name" },
];

// Active store/device config surfaces. NAME fields get the strictest bar.
const CONFIG_TARGETS = [
  {
    file: "apps/mobile/app.json",
    nameFields: ["expo.name", "expo.web.name", "expo.web.shortName"],
    descFields: [
      "expo.web.description",
      "expo.ios.infoPlist.NSPhotoLibraryUsageDescription",
      "expo.ios.infoPlist.NSCameraUsageDescription",
      "expo.ios.infoPlist.NSMicrophoneUsageDescription",
      "expo.ios.infoPlist.NSSiriUsageDescription",
    ],
  },
  {
    file: "apps/web/public/manifest.json",
    nameFields: ["name", "short_name"],
    descFields: ["description"],
  },
  {
    file: "apps/mobile/public/manifest.json",
    nameFields: ["name", "short_name"],
    descFields: ["description"],
  },
];

// Marketing / user-visible assets — scanned as raw text, line-reported.
// "astrodating" / "saturn" excluded from the lowercase scan (domain /
// planet); caught by the case-sensitive wordmark regexes instead.
const MARKETING_TARGETS = [
  "apps/web/public/og-template.html",
  "apps/mobile/assets/images/google-play-feature-graphic.svg",
  "apps/mobile/assets/images/google-play-feature-graphic-minimal.svg",
  "apps/mobile/assets/images/google-play-feature-graphic-dating.svg",
  "supabase/templates/confirmation.html",
  "supabase/templates/recovery.html",
  "supabase/templates/email_change.html",
];
const MARKETING_BANNED = HARD_BANNED.filter(
  (b) => b.term !== "astrodating" && b.term !== "saturn"
);

// App Review / store docs — positive marker checks only (never
// substring-scanned: they legitimately quote the banned phrases).
const DOC_CHECKS = [
  {
    file: "docs/app-store/juno-metadata.md",
    must: ["JUNO — Synastry Guide", "Birth Chart Connections"],
    forbidSaturn: true,
  },
  {
    file: "docs/app-store/juno-app-review-notes.md",
    must: [
      "App Review pack (Guideline 4.3(b))",
      "Reviewer Walkthrough",
      "Resolution Center reply",
    ],
    // NOT SATURN-checked: this file lists "SATURN" in its prohibited-term
    // list on purpose.
    forbidSaturn: false,
  },
  {
    file: "docs/marketing/screenshot-seed-notes.md",
    must: ["JUNO — store screenshot narrative"],
    forbidSaturn: true,
  },
];

// Raster brand/store assets that must exist on disk before submission.
const REQUIRED_ASSETS = [
  "apps/mobile/assets/images/icon.png",
  "apps/mobile/assets/images/android-icon-foreground.png",
  "apps/mobile/assets/images/android-icon-background.png",
  "apps/mobile/assets/images/android-icon-monochrome.png",
  "apps/mobile/assets/images/favicon.png",
  "apps/mobile/public/icon-192.png",
  "apps/mobile/public/icon-512.png",
  "apps/web/public/favicon.png",
  "apps/web/public/favicon.ico",
  "apps/web/public/icon-192.png",
  "apps/web/public/icon-512.png",
  "apps/web/public/og-image.png",
  "docs/brand/juno-icon-exploration/final-juno-icon.svg",
];

function getField(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}

// failures: { file, where, term, reason }
const failures = [];
function fail(file, where, term, reason) {
  failures.push({ file, where, term, reason });
}

// --- Tier 1: config fields --------------------------------------------------
function scanField(file, field, value, banned) {
  if (typeof value !== "string") return;
  const lower = value.toLowerCase();
  for (const { term, reason } of banned) {
    if (lower.includes(term)) fail(file, field, term, reason);
  }
}

for (const target of CONFIG_TARGETS) {
  const full = path.join(ROOT, target.file);
  if (!fs.existsSync(full)) {
    fail(target.file, "(file)", "—", "file is missing");
    continue;
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (err) {
    fail(target.file, "(file)", "—", `not valid JSON: ${err.message}`);
    continue;
  }
  for (const field of target.nameFields || []) {
    scanField(target.file, field, getField(json, field), [
      ...HARD_BANNED,
      ...NAME_ONLY_BANNED,
    ]);
  }
  for (const field of target.descFields || []) {
    scanField(target.file, field, getField(json, field), HARD_BANNED);
  }
}

// Positive checks: the app must self-identify as JUNO.
const appJson = path.join(ROOT, "apps/mobile/app.json");
if (fs.existsSync(appJson)) {
  const json = JSON.parse(fs.readFileSync(appJson, "utf8"));
  if (json?.expo?.name !== "JUNO") {
    fail("apps/mobile/app.json", "expo.name", "—", 'must be "JUNO"');
  }
  if (json?.expo?.web?.name !== "JUNO — Synastry Guide") {
    fail("apps/mobile/app.json", "expo.web.name", "—", 'must be "JUNO — Synastry Guide"');
  }
}

// --- Tier 2: marketing / user-visible assets (line-reported) ----------------
for (const file of MARKETING_TARGETS) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    fail(file, "(file)", "—", "file is missing");
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const lower = line.toLowerCase();
    for (const { term, reason } of MARKETING_BANNED) {
      if (lower.includes(term)) fail(file, `line ${i + 1}`, term, reason);
    }
    if (/\bAstroDating\b/.test(line)) {
      fail(file, `line ${i + 1}`, "AstroDating", "former brand wordmark");
    }
    if (/\bSATURN\b/.test(line)) {
      fail(file, `line ${i + 1}`, "SATURN", "former rebrand name");
    }
  });
  if (!text.includes("JUNO")) {
    fail(file, "(file)", "—", "missing the JUNO brand name");
  }
}

// --- Tier 3: App Review / store docs (positive marker checks) ---------------
for (const dc of DOC_CHECKS) {
  const full = path.join(ROOT, dc.file);
  if (!fs.existsSync(full)) {
    fail(dc.file, "(file)", "—", "file is missing");
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  for (const needle of dc.must) {
    if (!text.includes(needle)) {
      fail(dc.file, "(marker)", needle, "required marker is missing");
    }
  }
  if (dc.forbidSaturn && /\bSATURN\b/.test(text)) {
    fail(dc.file, "(brand)", "SATURN", "former rebrand name leaked into a doc");
  }
}

// --- Asset existence -------------------------------------------------------
for (const asset of REQUIRED_ASSETS) {
  if (!fs.existsSync(path.join(ROOT, asset))) {
    fail(asset, "(file)", "—", "required brand/store asset is missing");
  }
}

// --- Report ----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`Store metadata guard FAILED — ${failures.length} finding(s):\n`);
  console.error("  file | where | term | reason");
  console.error("  " + "-".repeat(64));
  for (const f of failures) {
    console.error(`  ${f.file} | ${f.where} | "${f.term}" | ${f.reason}`);
  }
  console.error(
    "\nStore-facing config, marketing assets and user-visible emails must " +
      "not use old brand names or swipe/match dating-clone language."
  );
  process.exit(1);
}

console.log(
  "Store metadata guard passed — JUNO branding intact across config, " +
    "marketing assets, transactional emails and App Review docs; no " +
    "swipe/match dating-clone language; brand/store raster assets present."
);
process.exit(0);
