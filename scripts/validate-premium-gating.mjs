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
// did not reach the server at all. 'sync_available' is the client-side
// composite for "server refused/errored while the device claims a paid
// tier" (JUNO-06 sync flow) — the SQL cannot emit it by construction.
const CLIENT_ONLY_REASONS = new Set(["error", "sync_available"]);

const issues = [];
const source = fs.readFileSync(PREMIUM_USAGE, "utf8");
// Strip line comments once: a commented-out entry is an entry that no longer
// exists, and a regex that counts it validates the past (canary-proven).
const sourceNoComments = source
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");

// ---------------------------------------------------------------------------
// Client side: the server-key map and the reason union
// ---------------------------------------------------------------------------
const mapBlock = sourceNoComments.match(
  /SERVER_ENFORCED_FEATURES:\s*(?:Partial<)?Record<FeatureKey,\s*string>?\s*=?\s*\{([\s\S]*?)\n\};/
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
// JUNO-06: the map must be EXHAUSTIVE — every FEATURE_TIERS key carries a
// policy mapping. Before the remediation only 2 of 11 did; a feature added
// without a mapping silently fell back to the (now deleted) client path.
// Today the gate fails closed on an unmapped key, so this check is what
// turns "fails closed" into "never ships".
// ---------------------------------------------------------------------------
const tierKeysBlock = sourceNoComments.match(
  /export const FEATURE_TIERS:\s*Record<FeatureKey,[^>]+>\s*=\s*\{([\s\S]*?)\n\};/
);
if (!tierKeysBlock) {
  console.error("Could not find FEATURE_TIERS in apps/mobile/services/premiumUsage.ts");
  process.exit(2);
}
const tierKeys = [...tierKeysBlock[1].matchAll(/'([\w-]+)'\s*:/g)].map((m) => m[1]);
const mappedClientKeys = new Set(serverEnforced.map((e) => e.clientKey));
for (const key of tierKeys) {
  if (!mappedClientKeys.has(key)) {
    issues.push(
      `FEATURE_TIERS lists '${key}' but SERVER_ENFORCED_FEATURES does not map it — the gate ` +
        `fails closed (unknown_feature). Add the canonical policy key or remove the feature.`
    );
  }
}
if (tierKeys.length !== serverEnforced.length) {
  issues.push(
    `Coverage mismatch: ${serverEnforced.length}/${tierKeys.length} features server-enforced. ` +
      `JUNO-06 requires full coverage — the client-side trial path no longer exists as a fallback.`
  );
}

// ---------------------------------------------------------------------------
// JUNO-06 reprise (2026-09-23): the honest classes. The old check stopped at
// "every feature maps to the server" — which is the sentence the operator
// rejected ("11/11 server enforced" while engines stayed in the APK). Now
// every feature must ALSO carry an enforcement_class, the classes must be
// exhaustive, the published counts must match reality, and the classes must
// agree with the policy table's own migration. SEPARATE counts, always.
// ---------------------------------------------------------------------------
const classBlock = source.match(
  /export const ENFORCEMENT_CLASSES:\s*Record<FeatureKey,\s*EnforcementClass>\s*=\s*\{([\s\S]*?)\n\};/
);
if (!classBlock) {
  console.error(
    "Could not find ENFORCEMENT_CLASSES in apps/mobile/services/premiumUsage.ts — " +
      "a feature without an explicit class is a feature whose protection is undocumented."
  );
  process.exit(2);
}
// Strip line comments BEFORE parsing: a commented-out class line is a class
// that no longer exists, and a parser that counts it is green on a defect
// (proven by canary). Values in this map never contain '//'.
const classSource = classBlock[1]
  .split("\n")
  .filter((line) => !/^\s*\/\//.test(line))
  .join("\n");
const classEntries = [...classSource.matchAll(/'([\w-]+)':\s*'(server_enforced_data|server_metered_ui|public_content)'/g)].map(
  (m) => ({ clientKey: m[1], enforcementClass: m[2] })
);
const classCandidateEntries = (classSource.match(/'[^']+'\s*:/g) || []).length;
if (classCandidateEntries !== classEntries.length) {
  console.error(
    `Could not parse ENFORCEMENT_CLASSES: ${classCandidateEntries} entr(ies) present, ${classEntries.length} parsed. ` +
      `Fix the parser rather than trusting this run.`
  );
  process.exit(2);
}

const countsBlock = source.match(
  /export const ENFORCEMENT_CLASS_COUNTS:\s*Record<EnforcementClass,\s*number>\s*=\s*\{([\s\S]*?)\n\};/
);
if (!countsBlock) {
  console.error("Could not find ENFORCEMENT_CLASS_COUNTS in apps/mobile/services/premiumUsage.ts");
  process.exit(2);
}
const declaredCounts = {};
for (const m of countsBlock[1].matchAll(/(server_enforced_data|server_metered_ui|public_content):\s*(\d+)/g)) {
  declaredCounts[m[1]] = Number(m[2]);
}

const classedClientKeys = new Set(classEntries.map((e) => e.clientKey));
for (const key of tierKeys) {
  if (!classedClientKeys.has(key)) {
    issues.push(
      `FEATURE_TIERS lists '${key}' but ENFORCEMENT_CLASSES does not classify it — a new feature ` +
        `must declare what its server decision actually protects (the operator's reprise ruling).`
    );
  }
}
if (classedClientKeys.size !== tierKeys.length) {
  issues.push(
    `ENFORCEMENT_CLASSES has ${classedClientKeys.size} entries for ${tierKeys.length} features — the map must be exact.`
  );
}

const actualCounts = { server_enforced_data: 0, server_metered_ui: 0, public_content: 0 };
for (const e of classEntries) actualCounts[e.enforcementClass] += 1;
for (const cls of ["server_enforced_data", "server_metered_ui", "public_content"]) {
  if ((declaredCounts[cls] ?? -1) !== actualCounts[cls]) {
    issues.push(
      `ENFORCEMENT_CLASS_COUNTS declares ${cls}=${declaredCounts[cls] ?? "absent"} but the map has ${actualCounts[cls]} — ` +
        `the published verdict ("X/11") lives or dies on these numbers.`
    );
  }
}

// The policy table's own migration must agree with the client map for the
// strongest class: a feature the client calls server_enforced_data whose
// policy row is not is security theater in the database.
const migrationClasses = new Map();
for (const file of migrations) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  for (const m of sql.matchAll(
    /SET\s+enforcement_class\s*=\s*'(server_enforced_data|server_metered_ui|public_content)'[^;]*?WHERE\s+feature_key\s*=\s*'([a-z_]+)'/gi
  )) {
    migrationClasses.set(m[2], m[1]);
  }
  for (const m of sql.matchAll(
    /\(\s*'([a-z_]+)'\s*,\s*'(?:free|celestial|cosmic|premium|premium_plus)'[^)]*?'(server_enforced_data|server_metered_ui|public_content)'/g
  )) {
    migrationClasses.set(m[1], m[2]);
  }
}
for (const { clientKey, serverKey } of serverEnforced) {
  const clientClass = classEntries.find((e) => e.clientKey === clientKey)?.enforcementClass;
  const serverClass = migrationClasses.get(serverKey);
  if (clientClass === "server_enforced_data" && serverClass !== "server_enforced_data") {
    issues.push(
      `The client classifies '${clientKey}' as server_enforced_data but the policy row '${serverKey}' ` +
        `is '${serverClass ?? "unclassified"}' in the migrations — the two sides disagree on what is protected.`
    );
  }
}
for (const [serverKey, serverClass] of migrationClasses) {
  if (serverClass !== "server_enforced_data") continue;
  const owner = serverEnforced.find((e) => e.serverKey === serverKey);
  if (!owner) continue; // server-only keys (the 'tarot' alias) may mirror
  const clientClass = classEntries.find((e) => e.clientKey === owner.clientKey)?.enforcementClass;
  if (clientClass !== "server_enforced_data") {
    issues.push(
      `The policy row '${serverKey}' claims server_enforced_data but the client classifies ` +
        `'${owner.clientKey}' as '${clientClass}' — a class the binary contradicts is security theater.`
    );
  }
}

// ---------------------------------------------------------------------------
// JUNO-06 M1a/M1c split (operator decision 2026-09-23): product mutations
// (preview quotas, quota normalization, dead-seed deletion) are FORBIDDEN in
// supabase/migrations until build 131 + a dedicated product authorization.
// They live as a commented BROUILLON under docs/runbooks/sql/ which this
// validator reads, so the product promise stays traceable during the deferral.
// ---------------------------------------------------------------------------
const M1A_MIGRATION = path.join(
  MIGRATIONS_DIR,
  "20260922000001_juno06_server_enforced_features.sql"
);
const M1C_DRAFT = path.join(
  ROOT,
  "docs/runbooks/sql/2026-09-juno-06-m1c-product-policies-DRAFT.sql"
);
const M1C_PREVIEW_KEYS = [
  "daily_horoscope",
  "monthly_horoscope",
  "lucky_days",
  "planetary_transits",
  "retrograde_alerts",
  "date_planner",
  "tarot_monthly",
  "tarot_cosmic",
];
const M1C_DEAD_SEEDS = [
  "compatibility_details",
  "priority_messages",
  "likes_you_see_who",
];

if (!fs.existsSync(M1C_DRAFT)) {
  console.error(`M1c draft missing: ${path.relative(ROOT, M1C_DRAFT)} — the deferred preview promises must stay traceable there.`);
  process.exit(2);
}
const m1cDraft = fs.readFileSync(M1C_DRAFT, "utf8");
const draftPreviews = new Set();
for (const m of m1cDraft.matchAll(
  /SET free_preview_quota = 1,[^\n]*\n[^\n]*WHERE feature_key = '([a-z_]+)'/g
)) {
  draftPreviews.add(m[1]);
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
  // Preview promise: a migration may set it (historical keys), OR the M1c
  // draft carries it (deferred to 131 by explicit operator decision). A key
  // covered by NEITHER is a silently deleted free trial — the exact
  // regression class this validator was written to refuse.
  if (!freePreviewFeatures.has(serverKey) && !draftPreviews.has(serverKey)) {
    issues.push(
      `'${serverKey}' is server-enforced but gets a free_preview_quota NOWHERE — ` +
      `neither in any migration nor in the M1c draft (docs/runbooks/sql). Routing '${clientKey}' ` +
      `through the server gate without that promise deletes the free trial silently.`
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

// ---------------------------------------------------------------------------
// JUNO-06 M1a structural rules (operator decision 2026-09-23): the migration
// path is CLASSIFICATION-ONLY. Product mutations are forbidden in
// supabase/migrations until 131; the honest classes cover all 15 catalog
// rows, with legacy markers that are INVENTORY (never security levels) and
// never counted in 2/7/2.
// ---------------------------------------------------------------------------
const m1aSrc = fs.readFileSync(M1A_MIGRATION, "utf8");
const AUDITED_KEYS = [...new Set(serverEnforced.map((e) => e.serverKey))];

// (a) M1a mutates NOTHING but enforcement_class + updated_at.
for (const verb of [
  /INSERT INTO public\.premium_feature_policy/,
  /DELETE FROM public\.premium_feature_policy/,
  /SET (required_tier|daily_quota|free_preview_quota)\s*=/,
]) {
  if (verb.test(m1aSrc)) {
    issues.push(
      `M1a (20260922000001) must be classification-only — found a product mutation (${verb}). ` +
      `Product changes belong to the deferred M1c draft, never to this migration.`
    );
  }
}

// (b) No migration ANYWHERE in the tree applies M1c content.
for (const file of migrations) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const code = sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  for (const key of M1C_PREVIEW_KEYS) {
    if (new RegExp(`SET free_preview_quota = 1[^;]*WHERE feature_key = '${key}'`, "s").test(code)) {
      issues.push(`${file}: sets free_preview_quota=1 on '${key}' — that is M1c content, forbidden in migrations until build 131.`);
    }
  }
  if (/DELETE FROM public\.premium_feature_policy[\s\S]{0,200}?'(compatibility_details|priority_messages|likes_you_see_who)'/.test(code)) {
    issues.push(`${file}: deletes a dead seed — that is M1c content (deferred), forbidden in migrations.`);
  }
  if (/feature_key = '(daily_horoscope|synastry)'[\s\S]{0,80}?SET daily_quota = NULL|SET daily_quota = NULL[^;]*WHERE feature_key = '(daily_horoscope|synastry)'/s.test(code)) {
    issues.push(`${file}: normalizes a legacy quota to NULL — that is M1c content (deferred).`);
  }
  if (/WHERE feature_key = 'synastry'[\s\S]{0,120}?free_preview_quota = NULL|free_preview_quota = NULL[^;]*WHERE feature_key = 'synastry'/s.test(code)) {
    issues.push(`${file}: would null synastry's preview — the ratified decision (2026-09-23) KEEPS it at 1.`);
  }
}

// (c) The M1a classification covers all 15 rows honestly.
const m1aClasses = new Map();
for (const m of m1aSrc.matchAll(
  /SET enforcement_class = '([a-z_]+)',[\s\S]{0,60}?WHERE feature_key = '([a-z_]+)'/g
)) {
  m1aClasses.set(m[2], m[1]);
}
const M1A_EXPECTED_LEGACY = new Map([
  ["tarot", "legacy_alias"],
  ["compatibility_details", "legacy_unused"],
  ["priority_messages", "legacy_unused"],
  ["likes_you_see_who", "legacy_unused"],
]);
if (m1aClasses.size !== 15) {
  issues.push(`M1a classifies ${m1aClasses.size} rows — the Production catalog has exactly 15 (Phase 0).`);
}
for (const [key, cls] of M1A_EXPECTED_LEGACY) {
  if (m1aClasses.get(key) !== cls) {
    issues.push(`M1a: '${key}' must be '${cls}' (inventory marker, not a security level), got '${m1aClasses.get(key) ?? "unclassified"}'.`);
  }
}
const auditedClassCount = { server_enforced_data: 0, server_metered_ui: 0, public_content: 0 };
for (const key of AUDITED_KEYS) {
  const cls = m1aClasses.get(key);
  if (!cls) {
    issues.push(`M1a: audited feature '${key}' carries no class.`);
  } else if (cls === "legacy_alias" || cls === "legacy_unused") {
    issues.push(`M1a: audited feature '${key}' is classified '${cls}' — a legacy marker may never shadow an audited feature.`);
  } else {
    auditedClassCount[cls] += 1;
  }
}
if (
  auditedClassCount.server_enforced_data !== 2 ||
  auditedClassCount.server_metered_ui !== 7 ||
  auditedClassCount.public_content !== 2
) {
  issues.push(
    `M1a audited counts must be exactly 2/7/2, got ` +
    `${auditedClassCount.server_enforced_data}/${auditedClassCount.server_metered_ui}/${auditedClassCount.public_content} ` +
    `(legacy rows must never enter these counts).`
  );
}

// (d) The M1c draft stays a draft: every header must carry the do-not-run banner.
if (!/BROUILLON — NE PAS EXÉCUTER/.test(m1cDraft) || !/VERSION ANDROID 131 \+ AUTORISATION PRODUIT/.test(m1cDraft)) {
  issues.push("M1c draft lost its BROUILLON/NE PAS EXÉCUTER banner or its 131+authorization condition.");
}
for (const key of M1C_PREVIEW_KEYS) {
  if (!draftPreviews.has(key)) {
    issues.push(`M1c draft is missing the deferred preview promise for '${key}' — the deferral must stay traceable.`);
  }
}

if (issues.length === 0) {
  // The honest headline — SEPARATE counts, never a single "N/N enforced".
  // ASCII on purpose: validator output crosses consoles that mangle accents.
  const headline =
    `${actualCounts.server_enforced_data}/${tierKeys.length} server-protected (result unreachable offline), ` +
    `${actualCounts.server_metered_ui}/${tierKeys.length} server-metered but APK-circumventable, ` +
    `${actualCounts.public_content}/${tierKeys.length} public content (documented class)`;
  console.log(
    `Premium gating contract looks clean: ${serverEnforced.length} feature(s) routed through the server; ` +
      `${policyKeys.size} policy keys; ${clientReasons.size} reason codes aligned.\n` +
      `Classes (JUNO-06): ${headline}`
  );
  process.exit(0);
}

console.error(`Premium gating validation failed (${issues.length} issue(s)):\n`);
for (const issue of issues) console.error(`- ${issue}`);
process.exit(1);
