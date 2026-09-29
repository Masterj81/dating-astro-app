#!/usr/bin/env node
// validate-android-131 — the release guard for the Android 131 train (JUNO-06).
//
// CI runs this before any 131 build can be considered shippable. It analyzes
// ACTIVE CODE under apps/mobile (import statements, call sites, exported
// constants, control-flow markers) — never comments alone — and fails on any
// regression of the guarantees PR A + PR B merged:
//
//   G1  no file under apps/mobile imports the tarot engine/corpus
//       (@astro/shared/tarot) — the APK must not carry the premium content;
//   G2  the two hardened edge clients are still wired:
//       premium-tarot-reading (services/serverTarot.ts) and
//       sync-entitlement (services/premiumUsage.ts);
//   G3  both clients still parse error.context (status + body) — the HTTP
//       contract, not a generic refusal;
//   G4  the 401 session renewal stays BOUNDED in both (renewalSpent budget,
//       two-iteration loop);
//   G5  sync 429 never auto-retries, and the 30 s UX cooldown constant
//       (SYNC_RETRY_COOLDOWN_MS = 30_000) exists exactly once, used by
//       SyncCooldown;
//   G6  the tarot consumption lock is still ONE global slot per controller
//       (guard before first await, dual release handlers) and is NOT keyed
//       by parameters (no Map in the controller);
//   G7  no server-side secret NAME is referenced anywhere under apps/mobile
//       (SUPABASE_SERVICE_ROLE*, REVENUECAT_API_KEY — the EXPO_PUBLIC_
//       REVENUECAT_API_KEY_{ANDROID,IOS} SDK keys are public and allowed);
//   G8  the honest enforcement inventory stays 2/7/2 (the class counts in
//       ENFORCEMENT_CLASS_COUNTS match the per-feature record);
//   G9  the product mappings are intact: weekly-tarot -> tarot_cosmic,
//       monthly-tarot -> tarot_monthly, and the tarot client sends period
//       verbatim (the tarot_cosmic/tarot_monthly mapping lives in the edge
//       alone);
//   G10 no direct WRITE to subscriptions / premium_usage /
//       entitlement_sync_claims exists under apps/mobile (reads through the
//       audited RPC/RLS paths are fine);
//   G11 the build-131 runbook exists and keeps its stop rules — including
//       that no submission is ever automatic;
//   G12 the artifact inspector exists and pins EXPECTED_VERSION_CODE = 132.
//
// Exits 1 on the first failed group of checks, 0 when all pass.
// Read-only: this script never mutates anything and holds no secret.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MOBILE = path.join(ROOT, 'apps', 'mobile');

const results = [];
const ok = (id, msg) => results.push([true, id, msg]);
const fail = (id, msg) => results.push([false, id, msg]);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// Walk apps/mobile collecting .ts/.tsx sources (skips node_modules and
// dotfolders). Comments stay in the text — that is why every rule below
// matches SYNTAX (import/require statements, call expressions, exported
// initializers), not prose.
function mobileSources() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && (entry.name === 'node_modules' || entry.name.startsWith('.'))) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(MOBILE);
  return files;
}

// ── G1: no tarot engine/corpus import under apps/mobile ─────────────────────
{
  const offenders = [];
  for (const file of mobileSources()) {
    const src = fs.readFileSync(file, 'utf8');
    if (/(?:from\s+|require\()['"]@astro\/shared\/tarot['"]/.test(src)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  if (offenders.length === 0) {
    ok('G1', 'no @astro/shared/tarot import under apps/mobile (engine + corpus out of the APK)');
  } else {
    fail('G1', `tarot producer import(s) back in the mobile bundle: ${offenders.join(', ')}`);
  }
}

// ── G2: both edge clients still wired ───────────────────────────────────────
{
  const tarot = read('apps/mobile/services/serverTarot.ts');
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const a = /functions\.invoke\(\s*'premium-tarot-reading'/.test(tarot);
  const b = /functions\.invoke\(\s*'sync-entitlement'/.test(sync);
  if (a && b) ok('G2', 'premium-tarot-reading and sync-entitlement are both invoked by the mobile client');
  else fail('G2', `edge client unwired (tarot=${a}, sync=${b}) — the server paths must be called`);
}

// ── G3: error.context still parsed in both clients ──────────────────────────
{
  const tarot = read('apps/mobile/services/serverTarot.ts');
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const a = /\)\?\.context/.test(tarot) && /typeof[^;]+json[^;]+function/.test(tarot);
  const b = /\)\?\.context/.test(sync) && /typeof[^;]+json[^;]+function/.test(sync);
  if (a && b) ok('G3', 'both clients read error.context (status + guarded json())');
  else fail('G3', `error.context parsing regressed (tarot=${a}, sync=${b}) — failures must be classified, not collapsed`);
}

// ── G4: the 401 renewal stays bounded in both clients ───────────────────────
{
  const tarot = read('apps/mobile/services/serverTarot.ts');
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const a = /renewalSpent\s*=\s*true/.test(tarot) && /attempt\s*<\s*2/.test(tarot);
  const b = /renewalSpent\s*=\s*true/.test(sync) && /attempt\s*<\s*2/.test(sync);
  if (a && b) ok('G4', '401 renewal is bounded in both clients (budget flag + 2-iteration loop)');
  else fail('G4', `unbounded 401 renewal detected (tarot=${a}, sync=${b}) — at most one refresh and one re-invocation`);
}

// ── G5: sync 429 never retries; the 30 s cooldown constant is single ────────
{
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const cooldown = read('apps/mobile/utils/syncCooldown.ts');
  const noRetry = /case\s+'rate_limited':\s*\r?\n\s*return/.test(sync);
  const constant = /^export const SYNC_RETRY_COOLDOWN_MS = 30_000;$/m.test(sync);
  const onceOnly = (sync.match(/SYNC_RETRY_COOLDOWN_MS\s*=/g) ?? []).length === 1;
  const used = cooldown.includes('SYNC_RETRY_COOLDOWN_MS');
  if (noRetry && constant && onceOnly && used) {
    ok('G5', 'sync 429 returns without retry; SYNC_RETRY_COOLDOWN_MS=30_000 defined once and mirrored by SyncCooldown');
  } else {
    fail('G5', `429/cooldown contract regressed (noRetry=${noRetry}, constant=${constant}, once=${onceOnly}, used=${used})`);
  }
}

// ── G6: the tarot global consumption lock ───────────────────────────────────
{
  const ctrl = read('apps/mobile/utils/tarotController.ts');
  const slot = /let inFlight: Promise<void> \| null = null;/.test(ctrl);
  const guard = /if \(inFlight\) return inFlight;/.test(ctrl);
  const releases = (ctrl.match(/inFlight = null;/g) ?? []).length >= 2;
  const noMap = !/new Map/.test(ctrl);
  if (slot && guard && releases && noMap) {
    ok('G6', 'tarot controller keeps ONE parameter-free in-flight slot (guard + dual release, no Map)');
  } else {
    fail('G6', `consumption lock regressed (slot=${slot}, guard=${guard}, releases=${releases}, noMap=${noMap})`);
  }
}

// ── G7: no server secret NAME under apps/mobile (production code only —
// test fixtures legitimately cite the forbidden names as literals) ────────
{
  const offenders = [];
  for (const file of mobileSources()) {
    if (file.includes('__tests__') || /\.test\.[jt]sx?$/.test(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    // \b after KEY keeps EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID (public SDK
    // key) out of the match: '_' is a word character, so the boundary fails.
    if (/\bSUPABASE_SERVICE_ROLE(?:_KEY)?\b/.test(src) || /\bREVENUECAT_API_KEY\b/.test(src)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  if (offenders.length === 0) {
    ok('G7', 'no service-role / server RevenueCat secret name referenced under apps/mobile');
  } else {
    fail('G7', `server secret name(s) referenced in the mobile bundle: ${offenders.join(', ')}`);
  }
}

// ── G8: the honest 2/7/2 inventory ──────────────────────────────────────────
{
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const start = sync.indexOf('export const ENFORCEMENT_CLASSES');
  const end = sync.indexOf('export const ENFORCEMENT_CLASS_COUNTS');
  const block = start >= 0 && end > start ? sync.slice(start, end) : '';
  // The block stops before ENFORCEMENT_CLASS_COUNTS, so the class literals in
  // it are exactly the per-feature ones.
  const dataFeatures = (block.match(/'server_enforced_data',/g) ?? []).length;
  const meteredFeatures = (block.match(/'server_metered_ui',/g) ?? []).length;
  const publicFeatures = (block.match(/'public_content',/g) ?? []).length;
  const countsOk =
    /server_enforced_data:\s*2,/.test(sync) &&
    /server_metered_ui:\s*7,/.test(sync) &&
    /public_content:\s*2,/.test(sync);
  if (dataFeatures === 2 && meteredFeatures === 7 && publicFeatures === 2 && countsOk) {
    ok('G8', 'enforcement inventory is the honest 2/7/2 (per-feature record and counts agree)');
  } else {
    fail('G8', `inventory drift: features ${dataFeatures}/${meteredFeatures}/${publicFeatures}, countsOk=${countsOk} — expected 2/7/2`);
  }
}

// ── G9: product mappings intact, period travels verbatim ────────────────────
{
  const sync = read('apps/mobile/services/premiumUsage.ts');
  const tarot = read('apps/mobile/services/serverTarot.ts');
  const weekly = /'weekly-tarot':\s*'tarot_cosmic',/.test(sync);
  const monthly = /'monthly-tarot':\s*'tarot_monthly',/.test(sync);
  const verbatim = /body:\s*\{\s*period,\s*mode,\s*locale\s*\},/.test(tarot);
  if (weekly && monthly && verbatim) {
    ok('G9', 'weekly->tarot_cosmic / monthly->tarot_monthly intact; the tarot client sends period verbatim');
  } else {
    fail('G9', `mapping drift (weekly=${weekly}, monthly=${monthly}, verbatim=${verbatim})`);
  }
}

// ── G10: no direct write to the sensitive tables ────────────────────────────
{
  const offenders = [];
  for (const file of mobileSources()) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /\.from\(['"](subscriptions|premium_usage|entitlement_sync_claims)['"]\)\s*\.\s*(insert|update|upsert|delete)/;
    if (re.test(src)) offenders.push(path.relative(ROOT, file));
  }
  if (offenders.length === 0) {
    ok('G10', 'no direct insert/update/upsert/delete on subscriptions/premium_usage/entitlement_sync_claims in mobile');
  } else {
    fail('G10', `direct table write(s) from the mobile client: ${offenders.join(', ')}`);
  }
}

// ── G11: the build-131 runbook keeps its stop rules ─────────────────────────
{
  const RUNBOOK = 'docs/runbooks/android-131-build-2026-09.md';
  const p = path.join(ROOT, RUNBOOK);
  if (!fs.existsSync(p)) {
    fail('G11', `${RUNBOOK} is missing — the 131 build gates are undefined`);
  } else {
    const doc = fs.readFileSync(p, 'utf8');
    const checks = {
      versionCode131: /versionCode[^.\n]*131/.test(doc),
      stopOnWrongCode: /ARR[IÊ]T[^\n]*versionCode|versionCode[^\n]*ARR[IÊ]T/i.test(doc),
      stopOnShaMismatch: /ARR[IÊ]T[^\n]*SHA|SHA[^\n]*ARR[IÊ]T/i.test(doc),
      noSubmitOnE2EFail: /E2E[^\n]*(échoue|fail)/i.test(doc) && /soumission/i.test(doc),
      noAutoSubmit: /aucune soumission automatique/i.test(doc),
      noAutoSecondBuild: /aucun second build automatique/i.test(doc),
    };
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length === 0) ok('G11', 'runbook keeps the 131 gates (versionCode 131, SHA match, no submit on E2E fail, no auto submit, no auto second build)');
    else fail('G11', `runbook lost stop rule(s): ${bad.join(', ')}`);
    // And the runbook must not AUTHOMATICALLY authorize submission anywhere.
    if (/soumission automatique (activée|autorisée|possible|lancée)/i.test(doc)) {
      const i = results.findIndex(([, id]) => id === 'G11');
      if (i >= 0) results[i] = [false, 'G11', 'runbook authorizes an automatic submission'];
    }
  }
}

// ── G12: the artifact inspector pins the NEXT expected versionCode (132) ──
{
  const RULES = 'apps/mobile/src/release/artifact-rules.mjs';
  const SCRIPT = 'scripts/inspect-android-artifact.mjs';
  const rulesPath = path.join(ROOT, RULES);
  const scriptPath = path.join(ROOT, SCRIPT);
  if (!fs.existsSync(rulesPath) || !fs.existsSync(scriptPath)) {
    fail('G12', `${RULES} or ${SCRIPT} is missing — the artifact cannot be proven`);
  } else {
    const rules = fs.readFileSync(rulesPath, 'utf8');
    const script = fs.readFileSync(scriptPath, 'utf8');
    // 2026-09-29: the next production build is EXPECTED to be versionCode
    // 132 — the EAS remote counter read 131 after build 6c16c35c (from
    // 6d4f042a, pre-PR-#84, obsolete, never submitted) consumed it, and
    // production uses autoIncrement. The pin's single source stays the
    // canonical rules; the validator checks the rules pin 132 AND that the
    // CLI imports them (no duplicated literal that could drift).
    const pinInRules = rules.match(/export const EXPECTED_VERSION_CODE\s*=\s*(\d+);/);
    const pinnedValue = pinInRules ? Number(pinInRules[1]) : null;
    const pinned = pinnedValue === 132;
    const pkg = /EXPECTED_PACKAGE\s*=\s*'com\.astrodatingapp\.mobile'/.test(rules);
    const wired = script.includes("../apps/mobile/src/release/artifact-rules.mjs");
    if (pinned && pkg && wired) {
      ok('G12', 'artifact rules pin the next expected versionCode 132 (131 consumed by the obsolete pre-PR-#84 build) + package; the CLI imports them (single source)');
    } else {
      fail('G12', `inspector expectations wrong (pinned=${pinned}, value=${pinnedValue}, pkg=${pkg}, wired=${wired})`);
    }
  }
}

// ── report ─────────────────────────────────────────────────────────────────
let failed = 0;
for (const [passed, id, msg] of results) {
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${id}: ${msg}`);
  if (!passed) failed += 1;
}
if (failed > 0) {
  console.error(`\nandroid-131 release guard: ${failed} violation(s) — the 131 train is NOT shippable.`);
  process.exit(1);
}
console.log('\nandroid-131 release guard: all gates green — the client matches the 131 expectations.');
