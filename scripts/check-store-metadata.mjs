// check-store-metadata.mjs
//
// Anti-regression guard for the JUNO App Store hardening pass. It scans
// the store- and device-facing surfaces — the values that literally
// become the app's name, its store description, its marketing graphics
// and its share card — for old brand names and swipe/match dating-clone
// language.
//
// SCOPE — three deliberately-targeted tiers (per the rebrand brief:
// "Pas global repo complet, pour ne pas casser IDs techniques / docs"):
//
//   1. CONFIG FIELDS (app.json + PWA manifests, name/description). The
//      strictest bar — a store/app name and description must be pristine.
//      NEVER inspects technical identifiers (bundle id, applicationId,
//      slug, URL scheme, domains, Sentry project, EAS projectId) — they
//      legitimately contain "astrodating" and must not change.
//
//   2. MARKETING ASSETS (OG card + Google Play feature graphics). These
//      are JUNO-branded visual surfaces. They are scanned for old brand
//      wordmarks and dating-clone phrasing. They are NOT lowercase-scanned
//      for "astrodating": the real product domain astrodatingapp.com
//      legitimately appears in the OG card footer. The case-sensitive
//      \bAstroDating\b wordmark check catches the old brand instead.
//
//   3. PROSE DOCS (juno-metadata.md, screenshot-seed-notes.md). NOT
//      substring-scanned — they legitimately quote banned phrases inside
//      honest disclaimers ("no swipe-to-like or swipe-to-pass mechanics",
//      "not a swipe-first dating clone", the keyword-exclusion list).
//      They get POSITIVE checks instead.
//
// JUNO is an honest romantic / relationship product: "relationship",
// "romantic", "love", "synastry", "birth-chart context", "connection",
// "conversation", "guided intro", "not swipe-first", and "no
// swipe-to-like or swipe-to-pass mechanics" are ALL allowed.
//
// Exit 0 when clean, 1 on any finding. Run: node scripts/check-store-metadata.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Dating-clone phrases + old brand names. All are multi-word phrases or
// proper nouns that have NO honest use in an app name or store
// description, so a plain case-insensitive substring match is safe and
// false-positive free on the scanned config fields.
const HARD_BANNED = [
  "astrodating",
  "saturn",
  "tinder",
  "bumble",
  "hinge",
  "dating clone",
  "dating app",
  "perfect match",
  "soulmate",
  "guaranteed compatibility",
  "unlimited swipes",
  "swipe left",
  "swipe right",
  "swipe-to-like",
  "swipe-to-pass",
  "it's a match",
  "it’s a match", // curly-apostrophe variant
  "match rate",
  "higher match chance",
  "find your deeper match",
  "prediction",
];

// Additionally banned in NAME fields — a store/app name must be pristine.
// (Descriptions may honestly say "without swipe-first mechanics", so bare
// "swipe" is checked on names only, not descriptions.)
const NAME_ONLY_BANNED = ["swipe", "match", "dating", "single", "horoscope"];

// Active store/device config surfaces. NAME fields get the strictest bar.
const TARGETS = [
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

// Marketing assets — JUNO-branded visual surfaces. Scanned as raw text.
// "astrodating" / "saturn" are intentionally excluded from the lowercase
// scan (the product domain is lowercase, the planet Saturn is a real
// astrology term); the old brands are caught by the case-sensitive
// \bAstroDating\b / \bSATURN\b wordmark checks instead.
const MARKETING_TARGETS = [
  "apps/web/public/og-template.html",
  "apps/mobile/assets/images/google-play-feature-graphic.svg",
  "apps/mobile/assets/images/google-play-feature-graphic-minimal.svg",
  "apps/mobile/assets/images/google-play-feature-graphic-dating.svg",
];
const MARKETING_BANNED = HARD_BANNED.filter(
  (t) => t !== "astrodating" && t !== "saturn"
);

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

const failures = [];

function scan(file, field, value, banned) {
  if (typeof value !== "string") return;
  const lower = value.toLowerCase();
  for (const term of banned) {
    if (lower.includes(term)) {
      failures.push(
        `${file} → ${field}: contains "${term}" → ${JSON.stringify(value)}`
      );
    }
  }
}

// --- Tier 1: config fields --------------------------------------------------
for (const target of TARGETS) {
  const full = path.join(ROOT, target.file);
  if (!fs.existsSync(full)) {
    failures.push(`${target.file}: file is missing`);
    continue;
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (err) {
    failures.push(`${target.file}: not valid JSON — ${err.message}`);
    continue;
  }
  for (const field of target.nameFields || []) {
    scan(target.file, field, getField(json, field), [
      ...HARD_BANNED,
      ...NAME_ONLY_BANNED,
    ]);
  }
  for (const field of target.descFields || []) {
    scan(target.file, field, getField(json, field), HARD_BANNED);
  }
}

// Positive checks: the app must self-identify as JUNO.
const appJson = path.join(ROOT, "apps/mobile/app.json");
if (fs.existsSync(appJson)) {
  const json = JSON.parse(fs.readFileSync(appJson, "utf8"));
  if (json?.expo?.name !== "JUNO") {
    failures.push(`apps/mobile/app.json → expo.name must be "JUNO"`);
  }
  if (json?.expo?.web?.name !== "JUNO — Synastry Guide") {
    failures.push(
      `apps/mobile/app.json → expo.web.name must be "JUNO — Synastry Guide"`
    );
  }
}

// --- Tier 2: marketing assets ----------------------------------------------
for (const file of MARKETING_TARGETS) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    failures.push(`${file}: file is missing`);
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  const lower = text.toLowerCase();
  for (const term of MARKETING_BANNED) {
    if (lower.includes(term)) {
      failures.push(`${file}: contains banned marketing phrase "${term}"`);
    }
  }
  if (/\bAstroDating\b/.test(text)) {
    failures.push(`${file}: contains the old brand wordmark "AstroDating"`);
  }
  if (/\bSATURN\b/.test(text)) {
    failures.push(`${file}: contains the old brand name "SATURN"`);
  }
  if (!text.includes("JUNO")) {
    failures.push(`${file}: missing the JUNO brand name`);
  }
}

// --- Tier 3: prose docs (positive checks only) -----------------------------
const docChecks = [
  {
    file: "docs/app-store/juno-metadata.md",
    must: ["JUNO — Synastry Guide", "Birth Chart Connections"],
  },
  {
    file: "docs/marketing/screenshot-seed-notes.md",
    must: ["JUNO — store screenshot narrative"],
  },
];
for (const dc of docChecks) {
  const full = path.join(ROOT, dc.file);
  if (!fs.existsSync(full)) {
    failures.push(`${dc.file}: file is missing`);
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  for (const needle of dc.must) {
    if (!text.includes(needle)) {
      failures.push(`${dc.file}: missing required marker "${needle}"`);
    }
  }
  // SATURN must never reappear in the JUNO docs (clean brand-regression
  // check — the previous rebrand name has zero honest use here).
  if (/\bSATURN\b/.test(text)) {
    failures.push(`${dc.file}: contains the old brand name "SATURN"`);
  }
}

// --- Asset existence -------------------------------------------------------
for (const asset of REQUIRED_ASSETS) {
  if (!fs.existsSync(path.join(ROOT, asset))) {
    failures.push(`${asset}: required brand/store asset is missing`);
  }
}

if (failures.length > 0) {
  console.error("Store metadata guard FAILED:\n");
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\nThe app name, store descriptions and marketing assets must not use " +
      "old brand names or swipe/match dating-clone language."
  );
  process.exit(1);
}

console.log(
  "Store metadata guard passed — JUNO branding intact across config, " +
    "marketing assets and docs; no swipe/match dating-clone language; " +
    "brand/store raster assets present."
);
process.exit(0);
