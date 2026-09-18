// Local invariants for supabase/migrations — the CI gate (JUNO-15, 2026-09-18).
//
// WHY: the remote migration history drifted from the repository for three
// weeks because migrations were applied by hand and never registered, and one
// migration (20260903000004) committed while silently swallowing the failure
// of its own cron scheduling — the exact JUNO-29 pattern, inside a migration.
// This validator refuses the recurrences it can prove from the repository
// alone. It deliberately does NOT try to reach the production history: CI has
// no credentials for it, and pretending otherwise would be a false green.
// Remote comparison is the operator tool scripts/compare-migration-history.mjs.
//
// Rules:
//  R1 canonical file names: <timestamp 8 or 14 digits>_<name>.sql
//  R2 no two files share a version timestamp
//  R3 privilege migrations (statement-level GRANT/REVOKE) dated >= 2026-09-07
//     must self-verify with RAISE EXCEPTION (the rule adopted 2026-09-07 —
//     PostgreSQL warns and COMMITS on a failed REVOKE)
//  R4 cron migrations (cron.schedule/unschedule/alter_job) dated >= 2026-09-18
//     must self-verify with RAISE EXCEPTION and must NOT swallow scheduling
//     failures (EXCEPTION WHEN OTHERS THEN NULL / RAISE NOTICE). Historical
//     offenders before that date are grandfathered below, with the runbook.
//  R5 no "NOT DEPLOYED" markers in migrations dated >= 2026-09-18 — deployment
//     state lives in the runbook, not in the tree. Five older files carry
//     stale markers (two of them proven APPLIED by the 2026-09-18 audit);
//     editing applied migrations is forbidden, so they are documented in the
//     runbook instead.
//  R6 no NUL byte in any migration (grep/scanners must keep seeing them)
//
// Pattern checks run on COMMENT-STRIPPED code — the repository learned this
// the hard way (a test regex matching its own documentation). Dates compare on
// the first 8 digits of the version, so 14-digit February versions do not
// outnumber an 8-digit September threshold.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve("supabase/migrations");
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

// Utility files that are NOT migrations and must stay the only exceptions.
const NON_MIGRATION_ALLOWLIST = new Set(["run_pending.sql"]);

// R4 grandfathered pre-20260918 cron files that swallow failures. Each has an
// entry in docs/runbooks/migration-reconciliation-2026-09.md; two were
// re-proven applied by the 2026-09-18 audit, the third is what the corrective
// migration 20260918000001 repairs.
const R4_GRANDFATHER = new Set([
  "20260903000004_profiles_grant_watchdog.sql", // the miss this validator exists for
  "20260908000002_edge_rate_limits_present.sql", // re-proven applied 2026-09-18
  "20260909000001_expired_deletions_cron_fail_closed.sql", // re-proven applied 2026-09-18
]);

// The dates the rules entered force (documented in the runbook), compared as
// YYYYMMDD.
const R3_FROM = 20260907;
const R4_FROM = 20260918;
const R5_FROM = 20260918;

const errors = [];
const ok = (msg) => console.log(`  ok    ${msg}`);
const fail = (msg) => {
  errors.push(msg);
  console.log(`  FAIL  ${msg}`);
};

/** First 8 digits of the version: the DATE, comparable across 8- and
 *  14-digit version forms. */
const versionDate = (f) => Number(f.slice(0, 8));

/** Strip SQL line comments so a rule never matches its own documentation. */
const stripComments = (s) =>
  s
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
const isCanonical = (f) => /^\d{8}_[a-z0-9_.-]+\.sql$/i.test(f) || /^\d{14}_[a-z0-9_.-]+\.sql$/i.test(f);

console.log(`validate-migration-history: ${files.length} fichiers .sql dans supabase/migrations`);

// R1 + R6
for (const f of files) {
  if (NON_MIGRATION_ALLOWLIST.has(f)) {
    ok(`${f} — utilitaire autorisé (pas une migration)`);
    continue;
  }
  if (!isCanonical(f)) fail(`R1 nom non canonique: ${f}`);
  if (readFileSync(path.join(DIR, f)).includes("\0")) fail(`R6 octet NUL: ${f}`);
}
const canonical = files.filter((f) => !NON_MIGRATION_ALLOWLIST.has(f) && isCanonical(f));
ok(`R1 noms canoniques: ${canonical.length}/${files.length} (allowlist: ${[...NON_MIGRATION_ALLOWLIST].join(", ")})`);

// R2
const seen = new Map();
for (const f of canonical) {
  const v = f.split("_")[0];
  if (seen.has(v)) fail(`R2 version dupliquée ${v}: ${seen.get(v)} et ${f}`);
  else seen.set(v, f);
}
ok(`R2 versions uniques: ${seen.size}`);

// R3 + R4 (on comment-stripped code) + R5 (raw text, date-gated)
const swallow = /EXCEPTION\s+WHEN\s+OTHERS\s+THEN\s*[\r\n\s]*(NULL|RAISE NOTICE)/;
let r3Checked = 0;
let r4Checked = 0;
let r5Checked = 0;
for (const f of canonical) {
  const v = versionDate(f);
  const raw = readFileSync(path.join(DIR, f), "utf8");
  const code = stripComments(raw);
  const hasPriv = /(^|\s)(REVOKE|GRANT)\s/.test(code);
  const hasCron = /cron\.(schedule|unschedule|alter_job)\s*\(/.test(code);
  const hasRaise = code.includes("RAISE EXCEPTION");

  if (hasPriv && v >= R3_FROM) {
    r3Checked += 1;
    if (!hasRaise) {
      fail(`R3 migration de privilèges sans RAISE EXCEPTION: ${f}`);
    }
  }
  if (hasCron && v >= R4_FROM) {
    r4Checked += 1;
    if (R4_GRANDFATHER.has(f)) {
      ok(`R4 grand-père documenté: ${f}`);
    } else {
      if (!hasRaise) fail(`R4 migration cron sans RAISE EXCEPTION: ${f}`);
      if (swallow.test(code)) {
        fail(`R4 migration cron qui avale ses échecs (EXCEPTION WHEN OTHERS): ${f}`);
      }
    }
  }
  if (v >= R5_FROM && /NOT\s+DEPLOYED/i.test(raw)) {
    r5Checked += 1;
    fail(`R5 marqueur NOT DEPLOYED: ${f} — l'état de déploiement se consigne dans le runbook`);
  }
}
ok(`R3 privilèges auto-vérifiés (>= ${R3_FROM}): ${r3Checked} fichiers vérifiés`);
ok(`R4 cron fail-closed (>= ${R4_FROM}): ${r4Checked} fichiers vérifiés`);
ok(`R5 sans marqueur NOT DEPLOYED (>= ${R5_FROM}, 5 marqueurs historiques périmés documentés)`);

if (errors.length) {
  console.error(`\nmigration-history: ${errors.length} violation(s) — voir docs/runbooks/migration-reconciliation-2026-09.md`);
  process.exit(1);
}
console.log("\nmigration-history invariants look clean.");
