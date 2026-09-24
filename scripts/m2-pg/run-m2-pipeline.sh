#!/usr/bin/env bash
# =============================================================================
# JUNO-06 M2 — pipeline PostgreSQL JETABLE (2026-09-24, étendu à T2).
# Exécute le FICHIER EXACT supabase/migrations/20260922000002… (jamais une
# copie, jamais une transformation), le T1 OFFICIEL
# supabase/tests/juno06_sync_entitlement_claim.test.sql ET le T2 OFFICIEL
# supabase/tests/juno06_server_enforced_features.test.sql, et prouve :
#   [+] positif : bootstrap Phase 0 → stub Supabase → gating officiel
#       (20260823000001 : enforce v2 + previews + RLS usage) → M1a officiel
#       → M2 officiel : commit + postconditions D1..D14 (15 OK, zéro FAIL) ;
#   [T1] T1 officiel : 4/4 cas verts (NOTICE), transaction roulée back,
#       ZÉRO résidu ;
#   [T2] T2 officiel : NOTICE « C1..C11 green », ROLLBACK, zéro résidu
#       (utilisateur synthétique, premium_usage, claims) et rôle/session
#       sans effet persistant (nouvelle session) ;
#   [R] rollback M2 : DROP TABLE seul → R1..R3 verts ;
#   [-] négatif : table pré-existante avec une PK hors user_id → M2 REFUSE
#       de committer, et la base reste exactement comme semée (le REVOKE
#       intra-transaction est roulé back lui aussi — fail-closed prouvé).
#
# Pourquoi ce pipeline existe : la première version de M2 portait une sonde
# privilege_type = 'ALL' qu'aucun PostgreSQL ne peut satisfaire (GRANT ALL se
# matérialise en privilèges individuels), le T1 officiel ne pouvait pas
# s'exécuter (booléen → INTEGER au CASE 3, FK auth.users violée au CASE 1a),
# et le T2 officiel portait QUATRE défauts (sonde 'ALL' again, rôle
# 'authenticated' jamais restauré avant C10, C11 contredisant le snapshot
# via un SELECT INTO multi-lignes, C9 contredisant la fenêtre de rejeu de
# 15 minutes). Voir les notes de révision 2026-09-24 dans chaque fichier.
# Aucune CI n'exécutait ce SQL — seule l'exécution réelle le prouve.
#
# Aucune secrète ici ni dans les logs : les identifiants viennent de
# l'environnement standard (PGHOST/PGPORT/PGUSER/PGPASSWORD), jamais affichés.
#
# CI  : service postgres:17.11@sha256:e31e… (même majeure que la Production,
#       lecture opérateur 2026-09-24) ; PGPASSWORD fourni par le service.
# Local (Git-bash) : PGBIN=/c/temp/pg17/pgsql/bin, cluster jetable port 5433.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
M1A_FILE="$REPO_ROOT/supabase/migrations/20260922000001_juno06_server_enforced_features.sql"
M2_FILE="$REPO_ROOT/supabase/migrations/20260922000002_sync_entitlement_throttle.sql"
GATING_FILE="$REPO_ROOT/supabase/migrations/20260823000001_free_preview_quota.sql"
T1_FILE="$REPO_ROOT/supabase/tests/juno06_sync_entitlement_claim.test.sql"
T2_FILE="$REPO_ROOT/supabase/tests/juno06_server_enforced_features.test.sql"
BOOTSTRAP="$REPO_ROOT/scripts/m1a-pg/bootstrap-phase0.sql"
STUB="$REPO_ROOT/scripts/m2-pg/stub-supabase-roles-auth.sql"
POSTCOND="$REPO_ROOT/scripts/m2-pg/postconditions-m2-disposable.sql"
ROLLBACK="$REPO_ROOT/scripts/m2-pg/rollback-m2.sql"

export PGCLIENTENCODING=UTF8
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGBIN="${PGBIN:-}"
PSQL()      { command "${PGBIN}psql"     -X -w -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
CREATEDB()  { command "${PGBIN}createdb" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
DROPDB()    { command "${PGBIN}dropdb"   --if-exists -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

WORK="$(mktemp -d)"
DBS=()
cleanup() {
  for db in "${DBS[@]:-}"; do [ -n "$db" ] && DROPDB "$db" >/dev/null 2>&1 || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

for f in "$M1A_FILE" "$M2_FILE" "$GATING_FILE" "$T1_FILE" "$T2_FILE" "$BOOTSTRAP" "$STUB" "$POSTCOND" "$ROLLBACK"; do
  [ -f "$f" ] || { echo "FATAL: fichier manquant $f" >&2; exit 2; }
done

echo "== [0] SHA-256 des fichiers réellement exécutés =="
M2_SHA="$(sha256sum "$M2_FILE" | awk '{print $1}')"
T1_SHA="$(sha256sum "$T1_FILE" | awk '{print $1}')"
T2_SHA="$(sha256sum "$T2_FILE" | awk '{print $1}')"
echo "sha256(20260922000002) = $M2_SHA"
echo "sha256(juno06_sync_entitlement_claim.test.sql) = $T1_SHA"
echo "sha256(juno06_server_enforced_features.test.sql) = $T2_SHA"

# Base jetable fidèle : Phase 0 + stub Supabase (rôles, default privileges,
# auth.users, fonctions plateforme) + gating OFFICIEL 20260823000001 (enforce
# v2 avec fenêtre de rejeu — exécuté tel quel, jamais copié) + M1a (le
# prérequis réel en Production) — ordre chronologique des migrations.
fresh_db() {
  local tag="$1"
  local db="m2_${tag}_$$"
  DROPDB "$db" >/dev/null 2>&1 || true
  CREATEDB "$db" >/dev/null
  DBS+=("$db")
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$BOOTSTRAP" >"$WORK/${tag}_boot.log" 2>&1 \
    || { echo "FATAL: bootstrap Phase 0 ($tag)" >&2; cat "$WORK/${tag}_boot.log" >&2; exit 1; }
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$STUB" >"$WORK/${tag}_stub.log" 2>&1 \
    || { echo "FATAL: stub Supabase ($tag)" >&2; cat "$WORK/${tag}_stub.log" >&2; exit 1; }
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$GATING_FILE" >"$WORK/${tag}_gating.log" 2>&1 \
    || { echo "FATAL: gating officiel 20260823000001 ($tag)" >&2; cat "$WORK/${tag}_gating.log" >&2; exit 1; }
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$M1A_FILE" >"$WORK/${tag}_m1a.log" 2>&1 \
    || { echo "FATAL: M1a préalable ($tag)" >&2; cat "$WORK/${tag}_m1a.log" >&2; exit 1; }
  echo "$db"
}

sql_scalar() { PSQL -d "$1" -tA -c "$2"; }

# ---------------------------------------------------------------------------
echo "== [+] EXÉCUTION POSITIVE (bootstrap → M1a → stub → M2 exacte) =="
POS_DB="$(fresh_db pos)"
PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$M2_FILE" >"$WORK/pos_apply.log" 2>&1 \
  || { echo "FAIL positif : M2 exit non nul" >&2; cat "$WORK/pos_apply.log" >&2; exit 1; }
if grep -Eq 'ERROR' "$WORK/pos_apply.log"; then
  echo "FAIL positif : occurrence ERROR dans la sortie" >&2; cat "$WORK/pos_apply.log" >&2; exit 1
fi
grep -q '^COMMIT' "$WORK/pos_apply.log" || { echo "FAIL positif : COMMIT non atteint" >&2; cat "$WORK/pos_apply.log" >&2; exit 1; }
echo "PASS  apply M2 : exit 0, zéro ERROR, COMMIT atteint (les 4 sondes du self-check sont passées)"

PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$POSTCOND" >"$WORK/pos_postcond.log" 2>&1 \
  || { echo "FAIL postconditions : exit non nul" >&2; cat "$WORK/pos_postcond.log" >&2; exit 1; }
PC_FAILS="$(grep -c 'FAIL' "$WORK/pos_postcond.log" || true)"
PC_OKS="$(grep -c '| OK' "$WORK/pos_postcond.log" || true)"
if [ "$PC_FAILS" -ne 0 ]; then
  echo "FAIL postconditions : $PC_FAILS ligne(s) FAIL" >&2; cat "$WORK/pos_postcond.log" >&2; exit 1
fi
if [ "$PC_OKS" -ne 15 ]; then
  echo "FAIL postconditions : $PC_OKS lignes OK (attendu 15)" >&2; cat "$WORK/pos_postcond.log" >&2; exit 1
fi
echo "PASS  postconditions : 15/15 OK (D1..D14 + D9b), zéro FAIL"

# ---------------------------------------------------------------------------
echo "== [T] T1 OFFICIEL (4 cas, transaction roulée back) =="
PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$T1_FILE" >"$WORK/t1.log" 2>&1 \
  || { echo "FAIL T1 : exit non nul" >&2; cat "$WORK/t1.log" >&2; exit 1; }
grep -q '4/4 cases green' "$WORK/t1.log" \
  || { echo "FAIL T1 : notice « 4/4 cases green » absente" >&2; cat "$WORK/t1.log" >&2; exit 1; }
grep -q '^ROLLBACK' "$WORK/t1.log" \
  || { echo "FAIL T1 : ROLLBACK final absent" >&2; cat "$WORK/t1.log" >&2; exit 1; }
T1_CLAIMS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.entitlement_sync_claims;')"
T1_USERS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM auth.users;')"
T1_SUBS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.subscriptions;')"
if [ "$T1_CLAIMS" != "0" ] || [ "$T1_USERS" != "0" ] || [ "$T1_SUBS" != "2" ]; then
  echo "FAIL T1 : résidu (claims=$T1_CLAIMS, auth.users=$T1_USERS, subscriptions=$T1_SUBS — attendu 0/0/2)" >&2
  exit 1
fi
echo "PASS  T1 : 4/4 cas verts, ROLLBACK, zéro résidu (claims=0, auth.users=0, subscriptions=2)"

# ---------------------------------------------------------------------------
echo "== [T2] T2 OFFICIEL (C1..C11, transaction roulée back) =="
PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$T2_FILE" >"$WORK/t2.log" 2>&1 \
  || { echo "FAIL T2 : exit non nul" >&2; cat "$WORK/t2.log" >&2; exit 1; }
grep -q 'C1..C11 green' "$WORK/t2.log" \
  || { echo "FAIL T2 : notice « C1..C11 green » absente" >&2; cat "$WORK/t2.log" >&2; exit 1; }
grep -q '^ROLLBACK' "$WORK/t2.log" \
  || { echo "FAIL T2 : ROLLBACK final absent" >&2; cat "$WORK/t2.log" >&2; exit 1; }
T2_USERS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM auth.users;')"
T2_USAGE="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.premium_usage;')"
T2_SUBS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.subscriptions;')"
T2_CLAIMS="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.entitlement_sync_claims;')"
T2_CATALOG="$(sql_scalar "$POS_DB" 'SELECT COUNT(*) FROM public.premium_feature_policy;')"
if [ "$T2_USERS" != "0" ] || [ "$T2_USAGE" != "3" ] || [ "$T2_SUBS" != "2" ] \
   || [ "$T2_CLAIMS" != "0" ] || [ "$T2_CATALOG" != "15" ]; then
  echo "FAIL T2 : résidu (auth.users=$T2_USERS, premium_usage=$T2_USAGE, subscriptions=$T2_SUBS, claims=$T2_CLAIMS, catalogue=$T2_CATALOG — attendu 0/3/2/0/15)" >&2
  exit 1
fi
echo "PASS  T2 : C1..C11 verts (NOTICE), ROLLBACK, zéro résidu (users=0, usage=3, subs=2, claims=0, catalogue=15)"

# ---------------------------------------------------------------------------
echo "== [R] ROLLBACK M2 (DROP TABLE seul) =="
PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$ROLLBACK" >"$WORK/rb.log" 2>&1 \
  || { echo "FAIL rollback : exit non nul" >&2; cat "$WORK/rb.log" >&2; exit 1; }
RB_FAILS="$(grep -c 'FAIL' "$WORK/rb.log" || true)"
RB_OKS="$(grep -c '| OK' "$WORK/rb.log" || true)"
if [ "$RB_FAILS" -ne 0 ] || [ "$RB_OKS" -ne 3 ]; then
  echo "FAIL rollback : $RB_OKS OK / $RB_FAILS FAIL (attendu 3/0)" >&2; cat "$WORK/rb.log" >&2; exit 1
fi
echo "PASS  rollback : R1..R3 verts (table partie, métier intact, M1a survit)"

# ---------------------------------------------------------------------------
echo "== [-] NÉGATIF : table pré-existante, PK hors user_id ⇒ M2 refuse =="
NEG_DB="$(fresh_db neg)"
PSQL -d "$NEG_DB" -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE public.entitlement_sync_claims (user_id UUID NOT NULL, last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (last_sync_at));" \
  >/dev/null
set +e
PSQL -d "$NEG_DB" -v ON_ERROR_STOP=1 -f "$M2_FILE" >"$WORK/neg_apply.log" 2>&1
NEG_RC=$?
set -e
if [ "$NEG_RC" -eq 0 ]; then
  echo "FAIL négatif : exit 0 alors qu'un refus est exigé" >&2; cat "$WORK/neg_apply.log" >&2; exit 1
fi
grep -q 'PK must be (user_id)' "$WORK/neg_apply.log" \
  || { echo "FAIL négatif : message « PK must be (user_id) » absent" >&2; cat "$WORK/neg_apply.log" >&2; exit 1; }
NEG_PK="$(sql_scalar "$NEG_DB" "SELECT COUNT(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'entitlement_sync_claims' AND i.indisprimary AND i.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'last_sync_at')")"
if [ "$NEG_PK" != "1" ]; then
  echo "FAIL négatif : la table semée a été modifiée (PK last_sync_at absente)" >&2; exit 1
fi
NEG_GRANTS="$(sql_scalar "$NEG_DB" "SELECT COUNT(*) FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims' AND grantee = 'anon'")"
if [ "$NEG_GRANTS" -lt 1 ]; then
  echo "FAIL négatif : le REVOKE a survécu au rollback (privilèges anon = $NEG_GRANTS, attendu ≥ 1)" >&2; exit 1
fi
echo "PASS  négatif : refus exigé (sonde PK), table semée intacte, REVOKE roulé back (fail-closed)"

echo ""
echo "M2 PIPELINE PASS — sha256(002)=$M2_SHA sha256(T1)=$T1_SHA sha256(T2)=$T2_SHA"
echo "  [+] positif : commit + postconditions 15/15"
echo "  [T1] T1 officiel : 4/4 verts, zéro résidu"
echo "  [T2] T2 officiel : C1..C11 verts, zéro résidu"
echo "  [R] rollback : R1..R3"
echo "  [-] négatif : refus fail-closed prouvé"
