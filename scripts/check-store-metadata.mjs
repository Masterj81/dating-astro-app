// check-store-metadata.mjs
//
// Anti-regression guard for the JUNO App Store resubmission (Guideline
// 4.3(b)). It scans the store-facing and marketing-public surfaces — the
// values that literally become the app's name, store description,
// marketing graphics, share card and transactional emails — for old
// brand names and swipe/match dating-clone language.
//
// SCOPE — four deliberately-targeted tiers (per the brief: scan
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
//   4. PUBLIC WEB MARKETING COPY (the hero + landing-page sections of
//      every apps/web/messages/<locale>.json). This copy must SELL JUNO
//      positively — it must carry NO "swipe" vocabulary at all, not even
//      defensive "no swipe-to-like / swipe-to-pass" phrasing. That
//      defensive framing is correct, but it belongs ONLY in the App
//      Review docs of tier 3 — never in the public marketing hero.
//
//   5. CANONICAL WEB DOMAIN (SITE.url, robots.txt sitemap, OG card footer,
//      landing-page JSON-LD). The public/store-facing canonical domain
//      must be www.junosynastry.com and must NOT name astrodatingapp.com
//      as canonical. The legacy domain still survives operationally
//      (app.* PWA subdomain, @ mailboxes, the deep-link host, the
//      documented technical-identifier rows) — those are NOT scanned here.
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

// --- Tier 4 config: public web marketing copy ------------------------------
// The hero + landing-page sections of every locale. This copy SELLS JUNO;
// it must carry no "swipe" vocabulary in any language. The defensive
// "no swipe-to-like / swipe-to-pass" framing is allowed only in the
// docs/app-store App Review material (tier 3) — never here.
const WEB_MESSAGE_LOCALES = ["en", "fr", "es", "pt", "de", "ja", "zh", "ar"];
const WEB_MARKETING_SECTIONS = [
  "hero",
  "features",
  "howItWorks",
  "marketingProof",
  "socialProof",
  "intentionsSection",
  "frameSection",
  "workingChemistrySection",
  "cta",
];
const HERO_BANNED = [
  {
    term: "swipe",
    reason:
      "swipe vocabulary — public marketing must sell positively; the " +
      "'no swipe-to-like / swipe-to-pass' framing belongs only in docs/app-store",
  },
  { term: "astrodating", reason: "former brand name" },
  { term: "tinder", reason: "competitor brand name" },
  { term: "bumble", reason: "competitor brand name" },
  { term: "hinge", reason: "competitor brand name" },
  { term: "dating clone", reason: "dating-clone framing" },
  { term: "dating app", reason: "generic-dating framing" },
  { term: "perfect match", reason: "magic-outcome claim" },
  { term: "soulmate", reason: "magic-outcome claim" },
  { term: "guaranteed compatibility", reason: "compatibility guarantee" },
  { term: "it's a match", reason: "match-celebration phrase" },
  { term: "it’s a match", reason: "match-celebration phrase (curly apostrophe)" },
  { term: "find your match", reason: "match-clone tagline" },
  { term: "find your deeper match", reason: "match-clone tagline" },
];

// Collect every string value under an object, with its dotted key path.
function collectStrings(node, prefix, out) {
  if (typeof node === "string") {
    out.push({ path: prefix, value: node });
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectStrings(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

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

// --- Tier 4: public web marketing copy -------------------------------------
for (const locale of WEB_MESSAGE_LOCALES) {
  const rel = `apps/web/messages/${locale}.json`;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    fail(rel, "(file)", "—", "web locale file is missing");
    continue;
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (err) {
    fail(rel, "(file)", "—", `not valid JSON: ${err.message}`);
    continue;
  }
  for (const section of WEB_MARKETING_SECTIONS) {
    if (json[section] == null) continue;
    const strings = [];
    collectStrings(json[section], section, strings);
    for (const { path: keyPath, value } of strings) {
      const lower = value.toLowerCase();
      for (const { term, reason } of HERO_BANNED) {
        if (lower.includes(term)) fail(rel, keyPath, term, reason);
      }
      if (/\bSATURN\b/.test(value)) {
        fail(rel, keyPath, "SATURN", "former rebrand name");
      }
    }
  }
}

// --- Tier 5: canonical web domain ------------------------------------------
// The public, store-facing canonical domain is www.junosynastry.com. These
// surfaces drive SEO canonicals, the sitemap, the OG share card and the
// App Store / Play Store marketing+support URLs. They must point at
// junosynastry.com and must NOT name astrodatingapp.com as the canonical
// domain.
//
// astrodatingapp.com legitimately survives elsewhere (operational, NOT
// scanned here): the app.astrodatingapp.com PWA subdomain, @astrodatingapp.com
// mailboxes, the Android intentFilters deep-link host, and the documented
// "Technical identifiers" / "Universal-link domain" rows in juno-metadata.md.
const CANONICAL_DOMAIN = "junosynastry.com";
const CANONICAL_CHECKS = [
  {
    file: "apps/web/src/lib/constants.ts",
    // The SITE.url default literal must be the junosynastry canonical.
    mustMatch: /url:\s*process\.env\.NEXT_PUBLIC_SITE_URL\s*\|\|\s*"https:\/\/www\.junosynastry\.com"/,
    mustMatchDesc: 'SITE.url default must be "https://www.junosynastry.com"',
  },
  {
    file: "apps/web/public/robots.txt",
    mustMatch: /^Sitemap:\s*https:\/\/www\.junosynastry\.com\/sitemap\.xml$/m,
    mustMatchDesc: "robots.txt Sitemap must use www.junosynastry.com",
  },
  {
    file: "apps/web/public/og-template.html",
    // The OG card footer domain wordmark.
    mustInclude: "junosynastry.com",
    forbidInclude: "astrodatingapp.com",
    forbidDesc: "OG card must not show the legacy domain",
  },
];
for (const cc of CANONICAL_CHECKS) {
  const full = path.join(ROOT, cc.file);
  if (!fs.existsSync(full)) {
    fail(cc.file, "(file)", "—", "file is missing");
    continue;
  }
  const text = fs.readFileSync(full, "utf8");
  if (cc.mustMatch && !cc.mustMatch.test(text)) {
    fail(cc.file, "(canonical)", CANONICAL_DOMAIN, cc.mustMatchDesc);
  }
  if (cc.mustInclude && !text.includes(cc.mustInclude)) {
    fail(cc.file, "(canonical)", cc.mustInclude, "required canonical domain is missing");
  }
  if (cc.forbidInclude && text.includes(cc.forbidInclude)) {
    fail(cc.file, "(canonical)", cc.forbidInclude, cc.forbidDesc);
  }
}

// --- Tier 6: connection-intentions safety scan ------------------------------
// JUNO 2.0 introduces three macro intentions (love / friendship / business).
// "Business" reads serious / premium (working chemistry, communication
// rhythm, trust, pace, collaboration style) — NEVER hustle / cofounder
// finder. The insight copy itself uses "working chemistry"; the intent
// name is allowed to be "Business" but no surface may promise outcomes.
//
// Scope: same locale files as Tier 4 (web + mobile) PLUS only the keys
// added in 20260601000001 — connectionIntention_*, synastryZone_*, prompt_*.
// We deliberately do NOT scan docs/app-store/* because the Apple App Review
// notes have legitimate use for defensive terms ("not a swipe-first dating
// clone", etc.) inside their prohibited-term lists.
const INTENTION_BANNED = [
  { term: "perfect cofounder",                       reason: "magic-outcome claim" },
  { term: "find your cofounder",                     reason: "magic-outcome claim" },
  { term: "find your perfect business partner",      reason: "magic-outcome claim" },
  { term: "perfect business partner",                reason: "magic-outcome claim" },
  { term: "business partner",                        reason: "use 'working chemistry' instead — implies success promise" },
  { term: "compatible cofounder",                    reason: "compatibility guarantee" },
  { term: "guaranteed compatibility",                reason: "compatibility guarantee" },
  { term: "guaranteed business chemistry",           reason: "outcome guarantee" },
  { term: "guaranteed outcome",                      reason: "outcome guarantee" },
  { term: "soulmate guarantee",                      reason: "outcome guarantee" },
  { term: "soulmate",                                reason: "magic-outcome claim" },
  { term: "100% match",                              reason: "compatibility guarantee" },
  { term: "100% compatibility",                      reason: "compatibility guarantee" },
  { term: "your tribe",                              reason: "magic-outcome friendship claim" },
  { term: "find your people",                        reason: "magic-outcome claim" },
  { term: "make friends fast",                       reason: "magic-outcome claim" },
  { term: "power couple",                            reason: "magic-outcome claim" },
  { term: "linkedin",                                reason: "wrong category / competitor" },
  { term: "investment decision",                     reason: "out-of-scope financial advice" },
  { term: "financial advice",                        reason: "out-of-scope advice" },
  { term: "legal advice",                            reason: "out-of-scope advice" },
  { term: "hiring advice",                           reason: "out-of-scope advice" },
  { term: "employment advice",                       reason: "out-of-scope advice" },
];

// Prefixes for keys this tier scans. Any locale key starting with one of
// these strings will be inspected.
const INTENTION_KEY_PREFIXES = [
  "connectionIntention_",
  "synastryZone_",
  "synastryFrame_",
  "synastryFrameToggleLabel",
  "synastryFrameCaption",
  "onboardingIntentions",
  "profileIntentions",
  "discoverFilterIntention_",
  "discoverChipOpenTo",
  "prompt_cat_friendship",
  "prompt_cat_collaboration",
  "prompt_friend_",
  "prompt_collab_",
];

function isIntentionKey(keyPath) {
  // Strip web namespace prefix if present so the prefix check works for
  // both web (webApp.foo) and mobile (foo) shapes.
  const tail = keyPath.includes(".") ? keyPath.split(".").slice(-1)[0] : keyPath;
  return INTENTION_KEY_PREFIXES.some((p) => tail.startsWith(p));
}

// Web locales (nested next-intl namespaces; the "webApp" namespace carries
// the new keys).
for (const locale of WEB_MESSAGE_LOCALES) {
  const rel = `apps/web/messages/${locale}.json`;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    continue;
  }
  const strings = [];
  collectStrings(json, "", strings);
  for (const { path: keyPath, value } of strings) {
    if (!isIntentionKey(keyPath)) continue;
    const lower = value.toLowerCase();
    for (const { term, reason } of INTENTION_BANNED) {
      if (lower.includes(term)) fail(rel, keyPath, term, reason);
    }
  }
}

// Mobile locales (flat dict).
const MOBILE_LOCALES = ["en", "fr", "es", "pt", "de", "ja", "zh", "ar"];
for (const locale of MOBILE_LOCALES) {
  const rel = `apps/mobile/locales/${locale}.json`;
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    continue;
  }
  for (const [keyPath, value] of Object.entries(json)) {
    if (typeof value !== "string") continue;
    if (!isIntentionKey(keyPath)) continue;
    const lower = value.toLowerCase();
    for (const { term, reason } of INTENTION_BANNED) {
      if (lower.includes(term)) fail(rel, keyPath, term, reason);
    }
  }
}

// The marketing landing page JSON-LD must advertise the junosynastry canonical.
const landingPage = path.join(ROOT, "apps/web/src/app/[locale]/(marketing)/page.tsx");
if (fs.existsSync(landingPage)) {
  const text = fs.readFileSync(landingPage, "utf8");
  const ld = text.match(/const JSON_LD\s*=\s*\{[\s\S]*?\n\};/);
  if (ld) {
    if (!ld[0].includes(`"url": "https://www.junosynastry.com"`)) {
      fail(
        "apps/web/src/app/[locale]/(marketing)/page.tsx",
        "JSON_LD.url",
        CANONICAL_DOMAIN,
        'WebApplication JSON-LD url must be "https://www.junosynastry.com"'
      );
    }
    if (/astrodatingapp\.com/.test(ld[0])) {
      fail(
        "apps/web/src/app/[locale]/(marketing)/page.tsx",
        "JSON_LD",
        "astrodatingapp.com",
        "JSON-LD must not name the legacy domain as canonical"
      );
    }
  }
}

// --- Tier 7: legal copy positive markers -----------------------------------
// The privacy + terms locales (EN at minimum) and the mobile hardcoded legal
// screens must carry the working-chemistry / no-advice disclaimer. This is
// a positive marker check — we don't substring-scan the prose itself,
// because legal copy legitimately quotes "legal, financial, investment,
// hiring, employment" inside the disclaimer that says JUNO does NOT provide
// any of those.
const LEGAL_MARKERS = [
  {
    file: "apps/web/messages/en.json",
    where: "privacy.s7b_business",
    must: ["legal, financial, investment, hiring, employment"],
  },
  {
    file: "apps/web/messages/en.json",
    where: "terms.s7_text",
    must: ["working chemistry", "NOT legal, financial, investment"],
  },
  {
    file: "privacy-policy.html",
    where: "(file)",
    must: [
      "Synastry, Working Chemistry &amp; the Limits of This Service",
      "not legal, financial, investment, hiring, employment",
    ],
  },
  {
    file: "apps/mobile/app/settings/terms-of-service.tsx",
    where: "(file)",
    must: [
      "Working Chemistry",
      "NOT legal, financial, investment, hiring, employment",
    ],
  },
  {
    file: "apps/mobile/app/settings/privacy-policy.tsx",
    where: "(file)",
    must: [
      "Working Chemistry",
      "NOT legal, financial, investment, hiring, employment",
    ],
  },
];
for (const m of LEGAL_MARKERS) {
  const full = path.join(ROOT, m.file);
  if (!fs.existsSync(full)) {
    fail(m.file, "(file)", "—", "legal file is missing");
    continue;
  }
  if (m.file.endsWith(".json")) {
    const json = JSON.parse(fs.readFileSync(full, "utf8"));
    const val = m.where.split(".").reduce((o, k) => (o == null ? o : o[k]), json);
    if (typeof val !== "string") {
      fail(m.file, m.where, "—", "required legal key is missing");
      continue;
    }
    for (const needle of m.must) {
      if (!val.includes(needle)) {
        fail(m.file, m.where, needle, "required legal disclaimer marker is missing");
      }
    }
  } else {
    const text = fs.readFileSync(full, "utf8");
    for (const needle of m.must) {
      if (!text.includes(needle)) {
        fail(m.file, m.where, needle, "required legal disclaimer marker is missing");
      }
    }
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
    "marketing assets, transactional emails, public web marketing copy " +
    "and App Review docs; no swipe/match dating-clone language; the hero " +
    "sells positively; the canonical web domain is www.junosynastry.com; " +
    "brand/store raster assets present."
);
process.exit(0);
