// JUNO-06 M1a — garde structurel du pipeline PostgreSQL jetable (2026-09-24).
//
// Ce validateur COMPLÈTE l'exécution réelle (ci-postgres.yml exécute le
// fichier exact sur PostgreSQL 17.11 épinglé) ; il ne la remplace jamais.
// Il refuse structurellement :
//   G1  un RAISE dont le message est concaténé par || (la cause racine de
//       l'incident 2026-09-23) — dans les migrations JUNO-06 ;
//   G2  la disparition du service postgres du workflow ;
//   G3  une image PostgreSQL flottante (latest / tag sans digest) — le pin
//       exact postgres:17.11@sha256:e31e… est exigé ;
//   G4  la disparition de ON_ERROR_STOP=1 ou de l'encodage UTF-8 du runner ;
//   G5  l'exécution d'une copie modifiée (sed/awk/cp/tr sur le fichier
//       migration avant exécution) — seul sha256sum + psql -f y touchent ;
//   G6  la disparition du scénario négatif ou du scénario rollback ;
//   G7  la disparition des vérifications NOT NULL / absence de DEFAULT /
//       convalidated / 23502 dans les postconditions ;
//   G8  un fixture qui cesserait d'être synthétique (URI de Production,
//       identifiants réels, secrets) ou qui divergerait du snapshot Phase 0
//       encodé dans la migration (comparaison littérale fixture ↔ snapshot).
//
// Sortie 1 sur violation. Câblé : npm run validate:m1a-pipeline — et exécuté
// dans le job M1a PostgreSQL (ci-postgres.yml), avant le pipeline.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripSqlComments = (sql) =>
  sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

const issues = [];
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { issues.push(m); console.log(`  FAIL  ${m}`); };

const PINNED_IMAGE =
  "postgres:17.11@sha256:e31e3d5327d1806f6177827c9710643e4f35f7ab3f14d26d05332753d3e95ee0";

// ── Fichiers du pipeline ────────────────────────────────────────────────────
const WF = ".github/workflows/ci-postgres.yml";
const RUNNER = "scripts/m1a-pg/run-m1a-pipeline.sh";
const BOOT = "scripts/m1a-pg/bootstrap-phase0.sql";
const POSTC = "scripts/m1a-pg/postconditions-positive.sql";
const NEGV = "scripts/m1a-pg/negative-verify.sql";
const RBV = "scripts/m1a-pg/rollback-verify.sql";
for (const f of [WF, RUNNER, BOOT, POSTC, NEGV, RBV]) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`FATAL: ${f} manquant`); process.exit(2); }
}
const wf = read(WF);
const runner = read(RUNNER);
const boot = read(BOOT);
const postc = read(POSTC);
const negv = read(NEGV);

// ── G1 : aucun RAISE concaténé par || (code sans commentaires) ─────────────
for (const m of [
  "supabase/migrations/20260922000001_juno06_server_enforced_features.sql",
  "supabase/migrations/20260922000002_sync_entitlement_throttle.sql",
  "docs/runbooks/sql/2026-09-juno-06-rollback-m1-catalog.sql",
]) {
  const code = stripSqlComments(read(m));
  const stmts = code.split(";").filter((s) => /\bRAISE\s+(EXCEPTION|NOTICE|WARNING)/.test(s));
  for (const s of stmts) {
    if (/\|\|/.test(s) && !/USING\s+(MESSAGE|DETAIL|HINT)\s*=\s*format\(/.test(s)) {
      fail(`${path.basename(m)} : instruction RAISE dont le message est concaténé par || (cause racine de l'incident 2026-09-23)`);
    }
  }
}
ok("G1 : aucun RAISE concaténé par || dans les migrations JUNO-06 (code sans commentaires)");

// ── G2 : le service postgres existe ────────────────────────────────────────
if (!/services:\s*\n\s+postgres:/.test(wf)) fail("G2 : le service postgres a disparu du workflow");
else ok("G2 : service postgres présent dans ci-postgres.yml");

// ── G3 : image épinglée par digest, aucune image flottante ─────────────────
if (!wf.includes(PINNED_IMAGE)) fail(`G3 : l'image épinglée exacte est exigée (${PINNED_IMAGE})`);
const imageLines = [...wf.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]);
for (const img of imageLines) {
  if (/^postgres:(latest|$)/.test(img) || (/^postgres:/.test(img) && !img.includes("@sha256:"))) {
    fail(`G3 : image PostgreSQL flottante dans le workflow : ${img}`);
  }
}
ok("G3 : image PostgreSQL épinglée tag+digest (17.11), aucune image flottante");

// ── G4 : ON_ERROR_STOP + UTF-8 dans le runner ──────────────────────────────
if (!runner.includes("ON_ERROR_STOP=1")) fail("G4 : ON_ERROR_STOP=1 a disparu du runner");
if (!runner.includes("PGCLIENTENCODING=UTF8")) fail("G4 : l'encodage client UTF-8 explicite a disparu");
if (!wf.includes("run-m1a-pipeline.sh")) fail("G4 : le workflow n'appelle plus le runner bash");
ok("G4 : ON_ERROR_STOP=1 + PGCLIENTENCODING=UTF8 exigés et présents dans le runner");

// ── G5 : le runner exécute le FICHIER EXACT — aucune transformation ────────
const M1A_PATH = "supabase/migrations/20260922000001_juno06_server_enforced_features.sql";
if (!runner.includes(`"$REPO_ROOT/${M1A_PATH}"`)) fail("G5 : le runner ne référence plus le chemin exact du fichier migration");
const transforms = runner.split("\n").filter((l) =>
  (/\b(sed|awk|perl|tr)\b/.test(l) || /\bcp\s+/.test(l)) && /20260922000001/.test(l) && !/sha256sum/.test(l)
);
if (transforms.length > 0) fail(`G5 : transformation du fichier migration avant exécution (${transforms.length} ligne(s))`);
ok("G5 : le runner exécute le fichier exact (sha256sum + psql -f seulement)");

// ── G6 : scénarios négatif et rollback présents ────────────────────────────
if (!/NÉGATIF A/.test(runner) || !/NÉGATIF B/.test(runner)) fail("G6 : un scénario négatif a disparu du runner");
if (!/-ne 0\s*\]/.test(runner)) fail("G6 : le runner n'exige plus un exit non nul pour les négatifs");
if (!/ROLLBACK HISTORIQUE/.test(runner)) fail("G6 : le scénario rollback a disparu du runner");
ok("G6 : négatif ×2 (exit≠0 exigé) + rollback présents dans le runner");

// ── G7 : vérifications clés des postconditions (CODE, pas les commentaires) ─
const postcCode = stripSqlComments(postc);
const negvCode = stripSqlComments(negv);
for (const needle of [
  [/is_nullable='NO'|is_nullable = 'NO'/, "NOT NULL"],
  [/pg_attrdef/, "absence de DEFAULT"],
  [/convalidated/, "CHECK convalidated"],
  [/not_null_violation/, "refus 23502 de l'insert sans classe"],
  [/legacy_alias/, "tarot = legacy_alias"],
  [/legacy_unused/, "graines = legacy_unused"],
]) {
  if (!needle[0].test(postcCode)) fail(`G7 : vérification absente des postconditions — ${needle[1]}`);
}
if (!/information_schema\.columns[\s\S]{0,300}column_name\s*=\s*'enforcement_class'/.test(negvCode)
    || !/schema_migrations/.test(negvCode)) {
  fail("G7 : negative-verify ne contrôle plus la sonde de colonne (information_schema.columns + column_name='enforcement_class') ni l'historique — une mutation partielle pourrait survivre");
}
ok("G7 : NOT NULL, sans DEFAULT, convalidated, 23502, legacy — présents dans les vérifications");

// ── G8 : fixture synthétique ET fidèle au snapshot Phase 0 ──────────────────
const FORBIDDEN_IN_FIXTURE = [
  [/qtihezzbuubnyvrjdkjd/, "identifiant du projet Production"],
  [/supabase\.com|aws-[a-z0-9-]*\.pooler/, "hôte Production"],
  [/postgresql:\/\//, "URI de connexion"],
  [/[0-9a-f]{32}/i, "possible secret 32 hex"],
];
let fixturePure = true;
for (const [re, what] of FORBIDDEN_IN_FIXTURE) {
  if (re.test(boot)) { fail(`G8 : le fixture contient ${what}`); fixturePure = false; }
}

const m1aCode = stripSqlComments(read(M1A_PATH));
const snapMatch = m1aCode.match(/v_expected\s+CONSTANT\s+TEXT\[\]\s*:=\s*ARRAY\[([\s\S]*?)\];/);
if (!snapMatch) {
  fail("G8 : snapshot v_expected introuvable dans la migration");
} else {
  const migTuples = [...snapMatch[1].matchAll(/'([a-z_]+)\|([a-z_]+)\|(\d*)\|(\d*)'/g)]
    .map((m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}`).sort();
  const bootTuples = [...boot.matchAll(
    /\('([a-z_]+)',\s*'(celestial|cosmic|free|premium|premium_plus)',\s*(\d+|NULL),\s*(\d+|NULL)\)/g
  )].map((m) => `${m[1]}|${m[2]}|${m[3] === "NULL" ? "" : m[3]}|${m[4] === "NULL" ? "" : m[4]}`).sort();
  if (bootTuples.length !== 15) fail(`G8 : le fixture sème ${bootTuples.length} lignes (attendu 15)`);
  else if (JSON.stringify(bootTuples) !== JSON.stringify(migTuples)) {
    fail("G8 : le fixture diverge du snapshot Phase 0 encodé dans la migration\n         fixture:   " + JSON.stringify(bootTuples) + "\n         migration: " + JSON.stringify(migTuples));
  } else if (fixturePure) {
    ok("G8 : fixture synthétique (aucune URI/identifiant Production) et fidèle au snapshot Phase 0 (15/15)");
  }
}

if (issues.length) {
  console.error(`\nm1a-pipeline guard : ${issues.length} violation(s) — voir ci-dessus`);
  process.exit(1);
}
console.log("\nm1a-pipeline guard : structure conforme (G1..G8).");
