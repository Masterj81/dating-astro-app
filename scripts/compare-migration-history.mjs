// Compare the LOCAL migration files with the REMOTE Supabase history.
//
// WHY (JUNO-15, 2026-09-18): thirty local migrations were absent from the
// remote migration history — every migration applied by hand through the
// Management API since 2026-08-28, plus one interleaved (20260824000001).
// `supabase db push` is FORBIDDEN in this repository (see
// docs/runbooks/migration-reconciliation-2026-09.md) precisely because the
// remote history does not describe the real schema; this tool measures the
// drift without touching anything.
//
// Usage (operator workstation, read-only):
//   npx supabase migration list --linked > "%TEMP%\migration-list.txt"
//   node scripts/compare-migration-history.mjs "%TEMP%\migration-list.txt"
//
// The CLI output interleaves progress lines with one JSON line — both are
// handled. Exit code 0 always: this is a measurement, not a gate. The CI
// companion that IS a gate is scripts/validate-migration-history.mjs (local
// invariants only — CI cannot reach the production history; that limit is
// documented in the runbook).
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("Usage: node scripts/compare-migration-history.mjs <migration-list.txt>");
  process.exit(1);
}
const raw = readFileSync(src, "utf8");
const jsonLine = raw.split(/\r?\n/).find((l) => l.trim().startsWith('{"migrations"'));
if (!jsonLine) {
  console.error("Aucune ligne JSON {\"migrations\"} trouvée — la sortie CLI a-t-elle changé ?");
  process.exit(1);
}
const remote = JSON.parse(jsonLine).migrations
  .map((m) => m.remote)
  .filter(Boolean);

const dir = path.resolve("supabase/migrations");
const local = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/.test(f))
  .map((f) => f.split("_")[0]);

const remoteSet = new Set(remote);
const localSet = new Set(local);
const both = local.filter((v) => remoteSet.has(v));
const localOnly = local.filter((v) => !remoteSet.has(v));
const remoteOnly = remote.filter((v) => !localSet.has(v));

console.log(`local=${local.length} remote=${remote.length} both=${both.length}`);
console.log(`LOCAL_SEULEMENT (${localOnly.length}): ${localOnly.join(", ") || "(aucune)"}`);
console.log(`DISTANT_SEULEMENT (${remoteOnly.length}): ${remoteOnly.join(", ") || "(aucun)"}`);

const dupes = local.filter((v, i) => local.indexOf(v) !== i);
if (dupes.length) console.log(`DOUBLONS locaux: ${dupes.join(", ")}`);

const nonCanonical = readdirSync(dir).filter(
  (f) => f.endsWith(".sql") && !/^\d+_.+\.sql$/.test(f),
);
if (nonCanonical.length) {
  console.log(`NON CANONIQUES (utilitaires, pas des migrations): ${nonCanonical.join(", ")}`);
}

// A drift is not an error condition for this tool — it is the measurement the
// operator acts on (repair per version, only with proof). Print a verdict line
// that the runbook's decision table consumes.
if (localOnly.length === 0 && remoteOnly.length === 0) {
  console.log("VERDICT: historique local et distant alignés.");
} else {
  console.log(
    "VERDICT: dérive détectée — voir docs/runbooks/migration-reconciliation-2026-09.md " +
      "(jamais `supabase db push`; `migration repair` uniquement avec preuve par version).",
  );
}
