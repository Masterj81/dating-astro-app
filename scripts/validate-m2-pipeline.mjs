// JUNO-06 M2 — garde structurel du pipeline PostgreSQL jetable (2026-09-24).
//
// Ce validateur COMPLÈTE l'exécution réelle (ci-postgres.yml exécute le
// fichier exact 20260922000002 + le T1 officiel sur PostgreSQL 17.11
// épinglé) ; il ne la remplace jamais. Il refuse structurellement :
//   G1  une image PostgreSQL flottante (latest / tag sans digest) — le pin
//       exact postgres:17.11@sha256:e31e… est exigé ;
//   G2  la disparition du service postgres, du runner M2 ou du garde M2
//       dans le workflow ;
//   G3  le RETOUR de la sonde impossible privilege_type = 'ALL' (cause
//       racine de l'échec 2026-09-24 : GRANT ALL se matérialise en
//       privilèges individuels, la vue ne liste JAMAIS 'ALL') — la sonde
//       service_role doit être has_table_privilege avec liste explicite ;
//   G4  la dégradation du DDL de M2 : RLS, REVOKE anon+authenticated,
//       FK auth.users ON DELETE CASCADE, PK user_id doivent rester ;
//   G5  une régression T1 : le booléen CASE 3 re-affecté à un INTEGER
//       (défaut d'origine), ou la disparition du compte synthétique
//       auth.users exigé par la FK, ou d'un des quatre scénarios ;
//   G6  un runner qui transformerait le fichier avant exécution
//       (sed/awk/perl/cp), perdrait ON_ERROR_STOP=1, l'encodage UTF-8,
//       le bras négatif (exit≠0 exigé) ou le bras rollback ;
//   G7  des postconditions jetables vidées de leurs sondes réelles, ou des
//       scripts Production qui cesseraient d'être lecture seule ;
//   G8  un stub qui cesserait d'être fidèle (les trois rôles, les default
//       privileges Supabase, auth.users) ou cesseraient d'être synthétiques
//       (URI/identifiants/secret de Production dans scripts/m2-pg/*).
//
// Sortie 1 sur violation. Câblé : npm run validate:m2-pipeline — et exécuté
// dans le job ci-postgres.yml, avant le pipeline M2.

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
const RUNNER = "scripts/m2-pg/run-m2-pipeline.sh";
const STUB = "scripts/m2-pg/stub-supabase-roles-auth.sql";
const POSTC = "scripts/m2-pg/postconditions-m2-disposable.sql";
const ROLLBACK = "scripts/m2-pg/rollback-m2.sql";
const PRECOND_PROD = "scripts/m2-pg/preconditions-production.sql";
const POSTCOND_PROD = "scripts/m2-pg/postconditions-production.sql";
const M2 = "supabase/migrations/20260922000002_sync_entitlement_throttle.sql";
const T1 = "supabase/tests/juno06_sync_entitlement_claim.test.sql";
const T2 = "supabase/tests/juno06_server_enforced_features.test.sql";
const GATING = "supabase/migrations/20260823000001_free_preview_quota.sql";
for (const f of [WF, RUNNER, STUB, POSTC, ROLLBACK, PRECOND_PROD, POSTCOND_PROD, M2, T1, T2, GATING]) {
  if (!fs.existsSync(path.join(ROOT, f))) { console.error(`FATAL: ${f} manquant`); process.exit(2); }
}
const wf = read(WF);
const runner = read(RUNNER);
const stub = read(STUB);
const postc = stripSqlComments(read(POSTC));
const m2Code = stripSqlComments(read(M2));
const t1Code = stripSqlComments(read(T1));

// ── G1 : image épinglée par digest, aucune image flottante ─────────────────
if (!wf.includes(PINNED_IMAGE)) fail(`G1 : l'image épinglée exacte est exigée (${PINNED_IMAGE})`);
const imageLines = [...wf.matchAll(/image:\s*(\S+)/g)].map((m) => m[1]);
for (const img of imageLines) {
  if (/^postgres:(latest|$)/.test(img) || (/^postgres:/.test(img) && !img.includes("@sha256:"))) {
    fail(`G1 : image PostgreSQL flottante dans le workflow : ${img}`);
  }
}
if (!issues.some((i) => i.startsWith("G1"))) ok("G1 : image PostgreSQL épinglée tag+digest (17.11), aucune image flottante");

// ── G2 : service postgres + runner M2 + garde M2 dans le workflow ──────────
if (!/services:\s*\n\s+postgres:/.test(wf)) fail("G2 : le service postgres a disparu du workflow");
if (!wf.includes("run-m2-pipeline.sh")) fail("G2 : le workflow n'appelle plus le runner M2");
if (!wf.includes("validate-m2-pipeline.mjs")) fail("G2 : le workflow n'exécute plus le garde structurel M2");
if (!issues.some((i) => i.startsWith("G2"))) ok("G2 : service postgres + runner M2 + garde M2 présents dans ci-postgres.yml");

// ── G3 : la sonde impossible ne doit JAMAIS revenir ────────────────────────
if (/privilege_type\s*=\s*'ALL'/.test(m2Code)) {
  fail("G3 : privilege_type = 'ALL' est revenu dans M2 — information_schema.table_privileges ne liste JAMAIS 'ALL' (GRANT ALL se matérialise en privilèges individuels) : la migration refuserait de committer sur tout PostgreSQL réel");
}
if (!(/has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'SELECT'\)\s*\n\s*AND has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'INSERT'\)\s*\n\s*AND has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'UPDATE'\)\s*\n\s*AND has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'DELETE'\)/.test(m2Code))) {
  fail("G3 : la sonde service_role doit ANDer quatre has_table_privilege individuels (SELECT, INSERT, UPDATE, DELETE) — la forme « liste » est un OU, pas un ET (leçon du canari C2)");
}
// L'absence de privilèges client doit rester vérifiée séparément (vue).
if (!/grantee IN \('anon', 'authenticated'\)/.test(m2Code)) {
  fail("G3 : la vérification séparée de l'absence de privilèges anon/authenticated (information_schema.table_privileges) a disparu du self-check");
}
if (!issues.some((i) => i.startsWith("G3"))) ok("G3 : sonde has_table_privilege(explicite) + absence client vérifiée séparément ; aucune sonde 'ALL'");

// ── G4 : le DDL de M2 reste exact ──────────────────────────────────────────
for (const [re, what] of [
  [/user_id\s+UUID PRIMARY KEY REFERENCES auth\.users \(id\) ON DELETE CASCADE/, "PK user_id + FK auth.users ON DELETE CASCADE"],
  [/ENABLE ROW LEVEL SECURITY/, "RLS activée"],
  [/REVOKE ALL ON public\.entitlement_sync_claims FROM anon, authenticated;/, "REVOKE ALL anon+authenticated"],
  [/last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/, "last_sync_at TIMESTAMPTZ NOT NULL"],
]) {
  if (!re.test(m2Code)) fail(`G4 : disparu de M2 — ${what}`);
}
if (/CREATE POLICY|DISABLE ROW LEVEL SECURITY|INSERT INTO public\.(subscriptions|premium_usage|premium_feature_policy)|UPDATE public\.(subscriptions|premium_usage|premium_feature_policy)|DELETE FROM public\.(subscriptions|premium_usage|premium_feature_policy)/.test(m2Code)) {
  fail("G4 : M2 touche désormais une table métier ou une policy — hors périmètre");
}
if (!issues.some((i) => i.startsWith("G4"))) ok("G4 : DDL M2 intact (PK/FK, RLS, REVOKE, typage) et zéro contact table métier/policy");

// ── G5 : T1 — le booléen, le compte synthétique, les quatre cas ────────────
if (!/v_bool\s+BOOLEAN;/.test(t1Code)) fail("G5 : la variable BOOLEAN (v_bool) a disparu de T1");
if (/<\s*30\s+INTO\s+v_rows/.test(t1Code)) fail("G5 : le test EXTRACT(...) < 30 est ré-affecté à un INTEGER (défaut d'origine du 2026-09-24)");
if (!/INTO v_bool FROM public\.entitlement_sync_claims/.test(t1Code)) fail("G5 : l'affectation du test de fenêtre ne passe plus par v_bool");
if (!/INSERT INTO auth\.users \(id\) VALUES \(v_user\);/.test(t1Code)) {
  fail("G5 : la création du compte synthétique auth.users a disparu de T1 — la FK REFERENCES auth.users(id) ferait échouer CASE 1a sur toute base réelle");
}
for (const marker of ["CASE 1a", "CASE 2", "CASE 3", "CASE 4", "4/4 cases green"]) {
  if (!t1Code.includes(marker) && !read(T1).includes(marker)) fail(`G5 : marqueur T1 absent — ${marker}`);
}
if (/EXTRACT[^;]{0,200}::(int|integer)/i.test(t1Code) || /CAST\s*\([^)]{0,120}EXTRACT/i.test(t1Code)) {
  fail("G5 : le test de fenêtre EXTRACT(...) < 30 est casté — il doit rester BOOLEAN (aucun contournement masquant le type réel)");
}
if (!issues.some((i) => i.startsWith("G5"))) ok("G5 : T1 — v_bool BOOLEAN, compte synthétique auth.users, quatre scénarios intacts, aucun cast masqué");

// ── G6 : le runner exécute les fichiers EXACTS, sans transformation ────────
if (!runner.includes("ON_ERROR_STOP=1")) fail("G6 : ON_ERROR_STOP=1 a disparu du runner");
if (!runner.includes("PGCLIENTENCODING=UTF8")) fail("G6 : l'encodage client UTF-8 explicite a disparu");
for (const exact of [
  `"$REPO_ROOT/supabase/migrations/20260922000002_sync_entitlement_throttle.sql"`,
  `"$REPO_ROOT/supabase/tests/juno06_sync_entitlement_claim.test.sql"`,
  `"$REPO_ROOT/supabase/migrations/20260922000001_juno06_server_enforced_features.sql"`,
]) {
  if (!runner.includes(exact)) fail(`G6 : le runner ne référence plus le chemin exact : ${exact}`);
}
const transforms = runner.split("\n").filter((l) =>
  (/\b(sed|awk|perl|tr)\b/.test(l) || /\bcp\s+/.test(l)) && /20260922|juno06_sync/.test(l) && !/sha256sum/.test(l)
);
if (transforms.length > 0) fail(`G6 : transformation d'un fichier officiel avant exécution (${transforms.length} ligne(s))`);
if (!/-eq 0 \]/.test(runner)) fail("G6 : le runner n'exige plus un exit non nul pour le négatif");
if (!/ROLLBACK M2/.test(runner)) fail("G6 : le scénario rollback a disparu du runner");
if (!issues.some((i) => i.startsWith("G6"))) ok("G6 : runner — fichiers exacts (aucune transformation), ON_ERROR_STOP, UTF-8, négatif et rollback exigés");

// ── G7 : postconditions réelles ; scripts Production lecture seule ─────────
for (const [re, what] of [
  [/relrowsecurity/, "RLS activée"],
  [/pg_policies/, "zéro policy"],
  [/grantee IN \('anon', 'authenticated'\)/, "zéro privilège client"],
  [/has_table_privilege\('service_role'/, "privilèges serveur réellement suffisants"],
  [/created_at,last_sync_at,user_id/, "colonnes exactes"],
  [/FROM public\.subscriptions/, "comptage subscriptions"],
  [/schema_migrations/, "historique non écrit par M2"],
]) {
  if (!re.test(postc)) fail(`G7 : sonde absente des postconditions jetables — ${what}`);
}
const readOnlyCheck = (file, label) => {
  const raw = read(file);
  const noComments = stripSqlComments(raw);
  if (/\\echo/.test(noComments)) fail(`G7 : ${label} contient une commande psql meta (echo)`);
  // Les littéraux ('SELECT, INSERT, UPDATE, DELETE' des sondes de privilèges,
  // libellés des checks) ne sont pas du DDL/DML : on les neutralise avant le
  // test de mots-clés — le code RESTANT doit être en lecture seule.
  const noLiterals = noComments.replace(/'(?:[^']|'')*'/g, "''");
  if (/\b(CREATE|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|ALTER|TRUNCATE)\b/.test(noLiterals)) {
    fail(`G7 : ${label} n'est plus en lecture seule (DDL/DML détecté dans le code)`);
  }
};
readOnlyCheck(PRECOND_PROD, "preconditions-production.sql");
readOnlyCheck(POSTCOND_PROD, "postconditions-production.sql");
if (!issues.some((i) => i.startsWith("G7"))) ok("G7 : postconditions — sondes réelles présentes ; scripts Production strictement lecture seule, sans \\echo");

// ── G7b : les preuves de delta P7 (Q11/Q14/Q15) ne doivent pas être vidées ──
// Q11 doit conserver l'état ANALYSER (dérive ≠ réf. 90/6 jamais acceptée
// automatiquement) ; Q14 doit exiger exactement 28 tables ; Q15 doit comparer
// l'ensemble TRIÉ exact — la liste des 28 noms est encodée ici et comparée
// littéralement au fichier : ajouter/retirer un nom, ou neutraliser Q11,
// fait passer le garde au rouge.
// NOTE (canari N5, 2026-09-24) : les sondes Q11 s'appliquent au CODE sans
// commentaires — la première version matchait les mots des commentaires et
// laissait une neutralisation invisible (leçon d54abb2 : la sonde, pas le mot).
{
  const postcRaw = read(POSTCOND_PROD);
  const postcCode = stripSqlComments(postcRaw);
  if (!/premium_usage\) = 90/.test(postcCode) || !/subscriptions\) = 6/.test(postcCode) || !/ANALYSER/.test(postcCode)) {
    fail("G7b : Q11 doit conserver, dans le CODE, les comparaisons = 90 et = 6 avec l'état ANALYSER — une dérive n'est jamais acceptable automatiquement");
  }
  if (!/28 AS expected/.test(postcRaw) || !/FROM pg_tables WHERE schemaname = 'public'/.test(postcRaw)) {
    fail("G7b : Q14 doit exiger exactement 28 tables public (comptage pg_tables)");
  }
  const EXPECTED_Q15 =
    "blocked_users,conversations,cron_task_decisions,deletion_requests,edge_rate_limits,entitlement_sync_claims,marketing_posts,media_purge_jobs,messages,natal_charts,orphan_purge_campaigns,premium_feature_policy,premium_usage,product_events,profiles,promo_campaign_redemptions,promo_campaigns,push_tokens,rate_limits,referral_redemptions,reports,scheduled_emails,security_posture_alerts,subscription_events,subscriptions,subscriptions_archive,swipes,synastry_free_grant";
  if (!postcRaw.includes(EXPECTED_Q15)) {
    fail("G7b : la liste Q15 doit être l'ensemble exact à 28 noms (baseline P7b 2026-09-24 + entitlement_sync_claims) — tout ajout, retrait ou réordonnancement non trié est refusé");
  }
  if (!/string_agg\(tablename, ',' ORDER BY tablename\)/.test(postcRaw)) {
    fail("G7b : Q15 doit comparer via string_agg(... ORDER BY tablename) — comparaison d'ensembles triés, indépendante de l'ordre catalogue");
  }
  if (!issues.some((i) => i.startsWith("G7b"))) ok("G7b : Q11 (code : =90, =6, ANALYSER), Q14 (=28), Q15 (ensemble trié exact à 28 noms) — formes exigées et présentes");
}

// ── G9 : T2 officiel — les quatre corrections de 2026-09-24 ne reviennent pas ─
// Le runner doit exécuter le T2 EXACT (et le gating officiel 20260823000001
// qui porte enforce v2 + la fenêtre de rejeu), exiger le NOTICE C1..C11 et le
// ROLLBACK, et prouver le zéro-résidu. Le CODE de T2 (sans commentaires) doit
// garder : la sonde ANDée, la capture/restauration prouvée du rôle, C11 en
// valeurs exactes multi-lignes-sûres, et la fenêtre de rejeu de C9.
{
  const t2Raw = read(T2);
  const t2Code = stripSqlComments(t2Raw);
  if (!runner.includes(`"$REPO_ROOT/supabase/tests/juno06_server_enforced_features.test.sql"`)) {
    fail("G9 : le runner ne référence plus le chemin exact du T2 officiel");
  }
  if (!runner.includes(`"$REPO_ROOT/supabase/migrations/20260823000001_free_preview_quota.sql"`)) {
    fail("G9 : le runner n'exécute plus le gating officiel 20260823000001 (enforce v2, fenêtre de rejeu) préalable à T2");
  }
  if (!/C1\\.\\.C11 green/.test(runner)) fail("G9 : le runner n'exige plus le NOTICE « C1..C11 green » de T2");
  if (!/T2_LOG|t2\.log/.test(runner) || !runner.includes("T2_USERS")) {
    fail("G9 : le runner ne prouve plus le zéro-résidu après T2 (utilisateur/usage/claims synthétiques)");
  }
  if (/privilege_type\s*=\s*'ALL'/.test(t2Code)) {
    fail("G9 : privilege_type = 'ALL' est revenu dans T2 — la vue ne liste JAMAIS 'ALL' (défaut C10 2026-09-24)");
  }
  if (!(/has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'SELECT'\)\s*\n\s*AND has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'INSERT'\)/.test(t2Code))) {
    fail("G9 : C10 doit ANDer quatre has_table_privilege individuels (leçon canari C2 : la forme liste est un OU)");
  }
  if (!/v_admin\s*:=\s*current_user/.test(t2Code) || !/set_config\('role', v_admin, true\)/.test(t2Code) || !/current_user <> v_admin/.test(t2Code)) {
    fail("G9 : C9 doit capturer le rôle administratif, le restaurer explicitement et PROUVER la restauration avant C10 (défaut C9→C10 2026-09-24)");
  }
  if (!/IS DISTINCT FROM 50/.test(t2Code) || !/IS DISTINCT FROM 20/.test(t2Code)) {
    fail("G9 : C11 doit vérifier les valeurs legacy EXACTES (daily_horoscope=50, synastry=20 — snapshot Phase 0), pas leur nullité");
  }
  if (/SELECT\s+daily_quota\s+INTO/.test(t2Code)) {
    fail("G9 : C11 ne doit pas utiliser un SELECT scalaire multi-lignes (défaut 2026-09-24)");
  }
  if (!/INTERVAL '16 minutes'/.test(t2Code) || !/r\.current_count IS DISTINCT FROM 1/.test(t2Code)) {
    fail("G9 : C9 doit couvrir la fenêtre de rejeu (voyage 16 min) et lire current_count renvoyé par enforce — le 2e appel à chaud ne consomme pas (défaut C9 2026-09-24)");
  }
  const stubRaw = read(STUB);
  for (const [re, what] of [
    [/FUNCTION auth\.uid\(\)/, "auth.uid()"],
    [/FUNCTION auth\.role\(\)/, "auth.role()"],
    [/FUNCTION public\.get_user_tier/, "get_user_tier (corps exact 20260413000002)"],
    [/FUNCTION public\.tier_at_least/, "tier_at_least (corps exact 20260425)"],
    [/FUNCTION public\.get_effective_subscription/, "get_effective_subscription (corps exact 20260312)"],
    [/ADD COLUMN IF NOT EXISTS cancel_at_period_end/, "subscriptions.cancel_at_period_end"],
  ]) {
    if (!re.test(stubRaw)) fail(`G9 : le stub ne fournit plus la dépendance T2 — ${what}`);
  }
  if (!issues.some((i) => i.startsWith("G9"))) ok("G9 : T2 — runner (fichier exact + gating officiel + NOTICE + résidus), sonde ANDée, rôle capturé/restauré/prouvé, C11 valeurs exactes, fenêtre de rejeu, dépendances du stub");
}

// ── G8 : stub fidèle et synthétique ─────────────────────────────────────────
for (const [re, what] of [
  [/rolname = 'anon'/, "rôle anon"],
  [/rolname = 'authenticated'/, "rôle authenticated"],
  [/rolname = 'service_role'/, "rôle service_role"],
  [/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+GRANT ALL ON TABLES TO anon, authenticated, service_role/, "default privileges Supabase"],
  [/CREATE TABLE auth\.users/, "auth.users"],
]) {
  if (!re.test(stub.replace(/\n\s+/g, " "))) fail(`G8 : le stub ne reproduit plus — ${what}`);
}
const FORBIDDEN = [
  [/qtihezzbuubnyvrjdkjd/, "identifiant du projet Production"],
  [/supabase\.com|aws-[a-z0-9-]*\.pooler/, "hôte Production"],
  [/postgresql:\/\//, "URI de connexion"],
  [/[0-9a-f]{32}/i, "possible secret 32 hex"],
  [/PGPASSWORD\s*=\s*['"][^'"]+['"]/, "mot de passe littéral"],
];
let stubPure = true;
for (const f of [STUB, RUNNER, POSTC, ROLLBACK, PRECOND_PROD, POSTCOND_PROD]) {
  const content = read(f);
  for (const [re, what] of FORBIDDEN) {
    if (re.test(content)) { fail(`G8 : ${f} contient ${what}`); stubPure = false; }
  }
}
if (!issues.some((i) => i.startsWith("G8"))) ok("G8 : stub fidèle (3 rôles, default privileges, auth.users) et scripts/m2-pg synthétiques (aucune URI/identifiant/secret)");

if (issues.length) {
  console.error(`\nm2-pipeline guard : ${issues.length} violation(s) — voir ci-dessus`);
  process.exit(1);
}
console.log("\nm2-pipeline guard : structure conforme (G1..G8).");
