// Validate that the mobile premium gate and the Postgres gating policy agree.
//
// WHY THIS EXISTS
// ---------------
// The free preview bug was a silent contract drift, not a logic error: the
// client recorded usage under the hyphenated key 'natal-chart' while the
// server judged the underscored policy key 'natal_chart'. Both sides were
// individually correct, nothing failed loudly, and free users quietly burned
// a daily preview to reach a paywall. Types cannot catch that — the boundary
// is a string crossing an RPC — so it gets its own check.
//
// Checks:
//   1. Every server key in SERVER_ENFORCED_FEATURES exists as a
//      `premium_feature_policy.feature_key` in the migrations.
//   2. Every server-enforced feature actually has a free_preview_quota set,
//      otherwise routing it through the server gate silently removes the
//      free preview the legacy client path used to give.
//   3. Every reason code the client handles is one the SQL can emit, and
//      every reason the SQL emits is handled by the client.
//
// Exits 1 on drift. Wired as `npm run validate:premium-gating`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREMIUM_USAGE = path.join(ROOT, "apps", "mobile", "services", "premiumUsage.ts");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

// 'error' never crosses the wire — it is how the client reports an RPC that
// did not reach the server at all.
const CLIENT_ONLY_REASONS = new Set(["error"]);

const issues = [];
const source = fs.readFileSync(PREMIUM_USAGE, "utf8");

// ---------------------------------------------------------------------------
// Client side: the server-key map and the reason union
// ---------------------------------------------------------------------------
const mapBlock = source.match(
  /SERVER_ENFORCED_FEATURES:\s*Partial<Record<FeatureKey,\s*string>>\s*=\s*\{([\s\S]*?)\}/
);
if (!mapBlock) {
  console.error("Could not find SERVER_ENFORCED_FEATURES in apps/mobile/services/premiumUsage.ts");
  process.exit(2);
}
// The value pattern must accept hyphens. If it only accepted the underscored
// shape, the exact bug this script guards against — a hyphenated client key
// left in the server slot — would fail to parse rather than fail the check,
// and an unparsed map reads as "nothing to complain about".
const serverEnforced = [...mapBlock[1].matchAll(/'([\w-]+)'\s*:\s*'([\w-]+)'/g)].map((m) => ({
  clientKey: m[1],
  serverKey: m[2],
}));

// A parser that silently matches nothing is worse than no parser: it reports
// success for a file it never understood.
const candidateEntries = (mapBlock[1].match(/'[^']+'\s*:/g) || []).length;
if (candidateEntries !== serverEnforced.length) {
  console.error(
    `Could not parse SERVER_ENFORCED_FEATURES: ${candidateEntries} entr(ies) present, ${serverEnforced.length} parsed. ` +
      `Fix the parser in scripts/validate-premium-gating.mjs rather than trusting this run.`
  );
  process.exit(2);
}

const reasonBlock = source.match(/export type PremiumGateReason\s*=([\s\S]*?);/);
if (!reasonBlock) {
  console.error("Could not find the PremiumGateReason union in apps/mobile/services/premiumUsage.ts");
  process.exit(2);
}
const clientReasons = new Set([...reasonBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

// ---------------------------------------------------------------------------
// Server side: policy rows and emitted reason codes, replayed in migration order
// ---------------------------------------------------------------------------
const migrations = fs
  .readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql") && f !== "run_pending.sql")
  .sort();

const policyKeys = new Set();
const freePreviewFeatures = new Set();
const serverReasons = new Set();

for (const file of migrations) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

  // Seeded rows: ('natal_chart', 'celestial', 5)
  for (const m of sql.matchAll(
    /\(\s*'([a-z_]+)'\s*,\s*'(?:free|celestial|cosmic|premium|premium_plus)'/g
  )) {
    policyKeys.add(m[1]);
  }

  // Targeted statements against the policy table, in order, so a later
  // DELETE removes a feature seeded earlier (e.g. super_likes).
  for (const m of sql.matchAll(
    /(INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?premium_feature_policy([\s\S]{0,600}?);/gi
  )) {
    const [, verb, body] = m;
    for (const k of body.matchAll(/feature_key\s*=\s*'([a-z_]+)'/g)) {
      if (verb.toUpperCase() === "DELETE FROM") policyKeys.delete(k[1]);
      else policyKeys.add(k[1]);
    }
    if (/free_preview_quota\s*=\s*([1-9]\d*)/.test(body)) {
      for (const k of body.matchAll(/feature_key\s*=\s*'([a-z_]+)'/g)) {
        freePreviewFeatures.add(k[1]);
      }
    }
  }

  // Reason codes emitted by the gating functions. Only the bodies of the two
  // gating functions are scanned, so neighbouring helpers (tier_at_least and
  // friends) cannot contribute stray literals. Reasons are produced either as
  // `'x'::TEXT` or inside a CASE that picks between two codes.
  for (const fn of sql.matchAll(
    /CREATE OR REPLACE FUNCTION public\.(?:enforce|can_use)_premium_feature[\s\S]*?\$\$;/g
  )) {
    const body = fn[0];
    for (const m of body.matchAll(/'([a-z_]+)'::TEXT/g)) serverReasons.add(m[1]);
    for (const m of body.matchAll(/\b(?:THEN|ELSE)\s+'([a-z_]+)'/g)) serverReasons.add(m[1]);
  }
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------
for (const { clientKey, serverKey } of serverEnforced) {
  if (!policyKeys.has(serverKey)) {
    issues.push(
      `SERVER_ENFORCED_FEATURES maps '${clientKey}' to '${serverKey}', which has no row in premium_feature_policy. ` +
        `enforce_premium_feature would answer 'unknown_feature' and the screen would be dead.`
    );
  }
  if (!freePreviewFeatures.has(serverKey)) {
    issues.push(
      `'${serverKey}' is server-enforced but never gets a free_preview_quota in any migration. ` +
        `Routing '${clientKey}' through the server gate therefore removes the free daily preview it used to grant.`
    );
  }
}

for (const reason of clientReasons) {
  if (CLIENT_ONLY_REASONS.has(reason)) continue;
  if (!serverReasons.has(reason)) {
    issues.push(
      `The client handles reason '${reason}' but no gating migration emits it — dead branch or a renamed code.`
    );
  }
}

for (const reason of serverReasons) {
  // Tier names and other quoted casts share the ::TEXT shape; only compare
  // codes the enforcing function can actually return as `reason`.
  const KNOWN_NON_REASONS = new Set(["free", "celestial", "cosmic", "premium", "premium_plus"]);
  if (KNOWN_NON_REASONS.has(reason)) continue;
  if (!clientReasons.has(reason)) {
    issues.push(
      `enforce_premium_feature can return reason '${reason}' but PremiumGateReason does not include it — ` +
        `the paywall would fall back to generic copy for a state the server distinguishes.`
    );
  }
}

if (issues.length === 0) {
  console.log(
    `Premium gating contract looks clean: ${serverEnforced.length} server-enforced feature(s) ` +
      `(${serverEnforced.map((f) => `${f.clientKey}→${f.serverKey}`).join(", ")}), ` +
      `${policyKeys.size} policy keys, ${clientReasons.size} reason codes aligned.`
  );
  process.exit(0);
}

console.error(`Premium gating validation failed (${issues.length} issue(s)):\n`);
for (const issue of issues) console.error(`- ${issue}`);
process.exit(1);
