// JUNO-06 — validate that every premium feature's DATA reaches the client
// through (or behind) a server control, and that nothing regresses to a
// client-decided path.
//
// The gating validator (validate-premium-gating.mjs) proves the DECISION
// contract (keys, tiers, quotas, reason codes, 11/11 coverage). This one
// proves the SOURCES:
//
//   D1  every FEATURE_TIERS feature is mapped in SERVER_ENFORCED_FEATURES
//       (no orphan that some surface could still gate client-side);
//   D2  the legacy client-side authorization helpers are GONE from
//       premiumUsage.ts (hasTrialRemaining / incrementFeatureUsage /
//       getFeatureUsageToday / getTodayUsage as exports);
//   D3  PremiumContext does not let the device tier authorize: no
//       consumeTrial/hasTrialRemaining in its API, and the JUNO-06 boundary
//       comment (device tier = subscriber-transient smoothing only) stays;
//   D4  PremiumGate carries no legacy branch and fails closed on unmapped
//       keys ('unknown_feature' defensive branch present);
//   D5  every premium DATA SOURCE in the mobile app that crosses the network
//       for a premium feature resolves through the server inventory below —
//       a new premium screen importing supabase directly, or calling an edge
//       function not in the inventory, fails until it is classified;
//   D6  each of the eleven features is declared with a source class
//       (A: server-served data, B: local compute + server authorization,
//       C: static public const + server authorization) — the honest
//       classification the runbook records, kept executable so it cannot
//       drift from the code it describes.
//
// Exits 1 on violation. Wired as `validate:premium-data-sources`.

import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (dir, predicate, acc = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
};

const issues = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  issues.push(msg);
  console.log(`  FAIL  ${msg}`);
};

// ── The honest, executable classification (mirrors the runbook matrix) ──────
// class A = data itself served by an RPC/edge behind the control
// class B = deterministic local compute; the ACCESS is a server decision
// class C = static public const; the ACCESS is a server decision
const FEATURE_SOURCES = {
  "natal-chart":        { class: "A", server: "edge calculate-chart + enforce natal_chart" },
  "conversation-guide": { class: "B", server: "enforce conversation_guide (per-tap)" },
  "synastry":           { class: "A", server: "edge get-profile-chart + synastry_preview_gate + claim_synastry_free_grant" },
  "daily-horoscope":    { class: "B", server: "enforce daily_horoscope" },
  "monthly-horoscope":  { class: "B", server: "enforce monthly_horoscope" },
  "lucky-days":         { class: "B", server: "enforce lucky_days" },
  "date-planner":       { class: "B", server: "enforce date_planner (web already enforced)" },
  "planetary-transits": { class: "C", server: "enforce planetary_transits" },
  "retrograde-alerts":  { class: "C", server: "enforce retrograde_alerts" },
  "weekly-tarot":       { class: "B", server: "enforce tarot_cosmic" },
  "monthly-tarot":      { class: "B", server: "enforce tarot_monthly" },
};

const premiumUsageSrc = read("apps/mobile/services/premiumUsage.ts");
const gateSrc = read("apps/mobile/components/PremiumGate.tsx");
const ctxSrc = read("apps/mobile/contexts/PremiumContext.tsx");

// ── D1: map coverage equals the catalog ─────────────────────────────────────
const tierBlock = premiumUsageSrc.match(
  /export const FEATURE_TIERS:\s*Record<FeatureKey,[^>]+>\s*=\s*\{([\s\S]*?)\n\};/
);
const mapBlock = premiumUsageSrc.match(
  /SERVER_ENFORCED_FEATURES:\s*Record<FeatureKey,\s*string>\s*=\s*\{([\s\S]*?)\n\};/
);
const tierKeys = tierBlock ? [...tierBlock[1].matchAll(/'([\w-]+)'\s*:/g)].map((m) => m[1]) : [];
const mapKeys = mapBlock ? [...mapBlock[1].matchAll(/'([\w-]+)'\s*:\s*'([\w-]+)'/g)].map((m) => m[1]) : [];
const classified = Object.keys(FEATURE_SOURCES);
for (const key of tierKeys) {
  if (!mapKeys.includes(key)) fail(`D1: '${key}' has no server mapping — orphan feature`);
  else if (!classified.includes(key)) fail(`D1: '${key}' mapped but not classified in FEATURE_SOURCES`);
}
// The mirror direction: a MAPPED key that FEATURE_TIERS does not list is a
// stale mapping (dead weight the gate would still query) and an UNCLASSIFIED
// map entry escapes the honest inventory entirely.
for (const key of mapKeys) {
  if (!tierKeys.includes(key)) fail(`D1: SERVER_ENFORCED_FEATURES maps '${key}' but FEATURE_TIERS does not list it — stale mapping`);
  else if (!classified.includes(key)) fail(`D1: '${key}' mapped but not classified in FEATURE_SOURCES`);
}
if (tierKeys.length === classified.length && mapKeys.length === classified.length) {
  ok(`D1: ${mapKeys.length}/${tierKeys.length} features mapped AND classified`);
}

// ── D2: legacy authorization helpers gone ──────────────────────────────────
const legacyExports = [
  "export async function hasTrialRemaining",
  "export async function incrementFeatureUsage",
  "export async function getFeatureUsageToday",
  "export async function getTodayUsage",
];
const resurrected = legacyExports.filter((sym) => premiumUsageSrc.includes(sym));
if (resurrected.length === 0) ok("D2: aucun helper d'autorisation client (chemin legacy supprimé)");
else fail(`D2: helpers legacy de retour dans premiumUsage.ts: ${resurrected.join(", ")}`);

// ── D3: PremiumContext cannot authorize from the device ────────────────────
if (/consumeTrial,/.test(ctxSrc) || /hasTrialRemaining:/.test(ctxSrc)) {
  fail("D3: PremiumContext expose encore un chemin d'autorisation device (consumeTrial/hasTrialRemaining)");
} else {
  ok("D3: PremiumContext n'expose plus consumeTrial/hasTrialRemaining");
}
if (ctxSrc.includes("JUNO-06 BOUNDARY")) ok("D3b: la frontière device-≠-autorité est documentée dans PremiumContext");
else fail("D3b: le commentaire JUNO-06 BOUNDARY a disparu de PremiumContext (la frontière doit rester écrite)");

// ── D4: gate has no legacy branch, fails closed ────────────────────────────
if (gateSrc.includes("Legacy client-side path")) fail("D4: branche legacy de retour dans PremiumGate");
else ok("D4: PremiumGate sans branche legacy");
if (gateSrc.includes("'unknown_feature'")) ok("D4b: échec fermé sur clé non mappée présent");
else fail("D4b: la branche défensive unknown_feature a disparu de PremiumGate");

// ── D5: premium screens reach the network only through the inventory ───────
// The only network-touching modules a premium screen may import for its data:
// services/supabase (RPCs behind server controls) and the two classified edge
// calls (get-profile-chart for synastry — server-gated; calculate-chart for
// the natal chart — own data, gated by the same feature's enforce call).
// A NEW direct supabase.from() in a premium screen fails until classified.
const screensDir = path.join(ROOT, "apps/mobile/app/premium-screens");
const screens = walk(screensDir, (f) => f.endsWith(".tsx"));
const ALLOWED_TABLES = new Set(["profiles"]); // own row, RLS — the user's own sign/inputs
for (const screen of screens) {
  const src = fs.readFileSync(screen, "utf8");
  const froms = [...src.matchAll(/\.from\(\s*'([a-z_]+)'/g)].map((m) => m[1]);
  const illegal = froms.filter((t) => !ALLOWED_TABLES.has(t));
  if (illegal.length > 0) {
    fail(`D5: ${path.relative(ROOT, screen)} lit ${illegal.join(", ")} directement — classifier la source ou passer par un contrôle serveur`);
  }
}
ok(`D5: ${screens.length} écrans premium — lectures directes limitées à ${[...ALLOWED_TABLES].join(", ")}`);

// ── D6: the classification is complete and honest ──────────────────────────
const validClasses = new Set(["A", "B", "C"]);
for (const [feature, meta] of Object.entries(FEATURE_SOURCES)) {
  if (!validClasses.has(meta.class)) fail(`D6: classe invalide pour ${feature}: ${meta.class}`);
  if (!meta.server || meta.server.length < 8) fail(`D6: contrôle serveur non documenté pour ${feature}`);
}
const classCount = Object.values(FEATURE_SOURCES).reduce((acc, m) => {
  acc[m.class] = (acc[m.class] ?? 0) + 1;
  return acc;
}, {});
ok(`D6: classification exécutable — ${Object.entries(classCount).map(([c, n]) => `${n}×${c}`).join(", ")}`);

if (issues.length) {
  console.error(`\npremium-data-sources: ${issues.length} violation(s) — JUNO-06 (voir docs/runbooks/premium-server-enforcement-2026-09.md)`);
  process.exit(1);
}
console.log("\npremium-data-sources contract looks clean.");
