#!/usr/bin/env bash
# =============================================================================
# JUNO-06 M1a — pipeline PostgreSQL JETABLE (2026-09-24).
# Exécute le FICHIER EXACT supabase/migrations/20260922000001… (ci-dessous)
# sur des bases jetables et prouve :
#   [+] exécution positive : commit, postconditions PC1..PC16 ;
#   [-] exécution négative A (valeur divergente) : échec exigé + rollback
#       total prouvé en nouvelle connexion ;
#   [-] exécution négative B (clé inconnue) : idem, base propre ;
#   [R] rollback historique : le script de rollback ramène EXACTEMENT
#       le snapshot Phase 0.
#
# Aucune secrète dans ce script ni dans ses logs : les identifiants viennent
# de l'environnement standard (PGHOST/PGPORT/PGUSER/PGPASSWORD), jamais
# affichés.
#
# CI  : service postgres:17.11@sha256:e31e… (même majeure que la Production,
#       lecture opérateur 2026-09-24) ; PGPASSWORD fourni par le service.
# Local (Git-bash) : PGBIN=/c/temp/pg17/pgsql/bin, cluster jetable port 5433.
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
M1A_FILE="$REPO_ROOT/supabase/migrations/20260922000001_juno06_server_enforced_features.sql"
ROLLBACK_FILE="$REPO_ROOT/docs/runbooks/sql/2026-09-juno-06-rollback-m1-catalog.sql"
BOOTSTRAP="$REPO_ROOT/scripts/m1a-pg/bootstrap-phase0.sql"
POSTCOND="$REPO_ROOT/scripts/m1a-pg/postconditions-positive.sql"
NEGVERIFY="$REPO_ROOT/scripts/m1a-pg/negative-verify.sql"
RBVERIFY="$REPO_ROOT/scripts/m1a-pg/rollback-verify.sql"

export PGCLIENTENCODING=UTF8
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGBIN="${PGBIN:-}"
PSQL()  { command "${PGBIN}psql"   -X -w -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
CREATEDB() { command "${PGBIN}createdb" -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
DROPDB()   { command "${PGBIN}dropdb"   --if-exists -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }

WORK="$(mktemp -d)"
DBS=()
cleanup() {
  for db in "${DBS[@]:-}"; do [ -n "$db" ] && DROPDB "$db" >/dev/null 2>&1 || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

for f in "$M1A_FILE" "$ROLLBACK_FILE" "$BOOTSTRAP" "$POSTCOND" "$NEGVERIFY" "$RBVERIFY"; do
  [ -f "$f" ] || { echo "FATAL: fichier manquant $f" >&2; exit 2; }
done

echo "== [0] SHA-256 du fichier réellement exécuté =="
M1A_SHA="$(sha256sum "$M1A_FILE" | awk '{print $1}')"
echo "sha256(20260922000001) = $M1A_SHA"

fresh_db() {
  local tag="$1"
  local db="m1a_${tag}_$$"
  DROPDB "$db" >/dev/null 2>&1 || true
  CREATEDB "$db" >/dev/null
  DBS+=("$db")
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$BOOTSTRAP" >"$WORK/bootstrap_$tag.log" 2>&1 \
    || { echo "FATAL: bootstrap a échoué ($tag)" >&2; cat "$WORK/bootstrap_$tag.log" >&2; exit 1; }
  echo "$db"
}

# Exécute le FICHIER EXACT (aucune copie, aucun sed) avec ON_ERROR_STOP.
# $1 = base ; $2 = logfile ; echo le code de retour.
run_m1a_exact() {
  local db="$1" log="$2" rc
  set +e
  PSQL -d "$db" -v ON_ERROR_STOP=1 -f "$M1A_FILE" >"$log" 2>&1
  rc=$?
  set -e
  echo "$rc"
}

sql_scalar() { PSQL -d "$1" -tA -c "$2"; }

# ---------------------------------------------------------------------------
echo "== [+] EXÉCUTION POSITIVE (base jetable, fichier exact) =="
POS_DB="$(fresh_db pos)"
RC="$(run_m1a_exact "$POS_DB" "$WORK/pos_apply.log")"
if [ "$RC" -ne 0 ]; then
  echo "FAIL positif : exit $RC" >&2; cat "$WORK/pos_apply.log" >&2; exit 1
fi
if grep -Eq 'ERROR' "$WORK/pos_apply.log"; then
  echo "FAIL positif : occurrence ERROR dans la sortie (exit 0 accidentel ?)" >&2
  cat "$WORK/pos_apply.log" >&2; exit 1
fi
grep -q '^COMMIT' "$WORK/pos_apply.log" || { echo "FAIL positif : COMMIT du fichier non atteint" >&2; exit 1; }
echo "PASS  apply : exit 0, zéro ERROR, COMMIT atteint (le garde isolation interne est passé : REPEATABLE READ actif)"
PSQL -d "$POS_DB" -v ON_ERROR_STOP=1 -f "$POSTCOND" >"$WORK/pos_postcond.log" 2>&1 \
  || { echo "FAIL postconditions" >&2; cat "$WORK/pos_postcond.log" >&2; exit 1; }
tail -n 1 "$WORK/pos_postcond.log"

# ---------------------------------------------------------------------------
echo "== [-] NÉGATIF A : valeur divergente (synastry preview → NULL) =="
NA_DB="$(fresh_db nega)"
PSQL -d "$NA_DB" -c "UPDATE public.premium_feature_policy SET free_preview_quota = NULL WHERE feature_key='synastry';" >/dev/null
RC="$(run_m1a_exact "$NA_DB" "$WORK/nega_apply.log")"
[ "$RC" -ne 0 ] || { echo "FAIL négatif A : exit 0 attendu ≠ 0" >&2; cat "$WORK/nega_apply.log" >&2; exit 1; }
grep -q "M1a self-check (pre)" "$WORK/nega_apply.log" || { echo "FAIL négatif A : message d'exception attendu absent" >&2; cat "$WORK/nega_apply.log" >&2; exit 1; }
grep -q "Phase 0" "$WORK/nega_apply.log" || { echo "FAIL négatif A : mention Phase 0 absente" >&2; exit 1; }
PSQL -d "$NA_DB" -v ON_ERROR_STOP=1 -f "$NEGVERIFY" >"$WORK/nega_verify.log" 2>&1 \
  || { echo "FAIL négatif A : quelque chose a survécu" >&2; cat "$WORK/nega_verify.log" >&2; exit 1; }
[ "$(sql_scalar "$NA_DB" 'SELECT COUNT(*) FROM public.premium_feature_policy;')" = "15" ] \
  || { echo "FAIL négatif A : nombre de lignes inattendu" >&2; exit 1; }
[ "$(sql_scalar "$NA_DB" 'SELECT free_preview_quota IS NULL FROM public.premium_feature_policy WHERE feature_key='"'"'synastry'"'"';')" = "t" ] \
  || { echo "FAIL négatif A : la divergence semée a disparu" >&2; exit 1; }
echo "PASS  négatif A : échec exigé, exception (pre)/Phase 0, divergence intacte, zéro survivant"

# ---------------------------------------------------------------------------
echo "== [-] NÉGATIF B : clé inconnue (ghost_feature) =="
NB_DB="$(fresh_db negb)"
PSQL -d "$NB_DB" -c "INSERT INTO public.premium_feature_policy (feature_key, required_tier, daily_quota, free_preview_quota) VALUES ('ghost_feature', 'celestial', 5, NULL);" >/dev/null
RC="$(run_m1a_exact "$NB_DB" "$WORK/negb_apply.log")"
[ "$RC" -ne 0 ] || { echo "FAIL négatif B : exit 0 attendu ≠ 0" >&2; cat "$WORK/negb_apply.log" >&2; exit 1; }
grep -q "M1a self-check (pre)" "$WORK/negb_apply.log" || { echo "FAIL négatif B : message attendu absent" >&2; exit 1; }
PSQL -d "$NB_DB" -v ON_ERROR_STOP=1 -f "$NEGVERIFY" >"$WORK/negb_verify.log" 2>&1 \
  || { echo "FAIL négatif B : quelque chose a survécu" >&2; cat "$WORK/negb_verify.log" >&2; exit 1; }
[ "$(sql_scalar "$NB_DB" 'SELECT COUNT(*) FROM public.premium_feature_policy;')" = "16" ] \
  || { echo "FAIL négatif B : nombre de lignes inattendu" >&2; exit 1; }
[ "$(sql_scalar "$NB_DB" 'SELECT COUNT(*) FROM public.premium_feature_policy WHERE feature_key='"'"'ghost_feature'"'"';')" = "1" ] \
  || { echo "FAIL négatif B : la clé inconnue a disparu" >&2; exit 1; }
echo "PASS  négatif B : échec exigé, clé inconnue intacte, zéro survivant"

# ---------------------------------------------------------------------------
echo "== [R] ROLLBACK HISTORIQUE (bootstrap → M1a → rollback exact) =="
RB_DB="$(fresh_db rb)"
RC="$(run_m1a_exact "$RB_DB" "$WORK/rb_apply.log")"
[ "$RC" -eq 0 ] || { echo "FAIL rollback : l'application préalable a échoué" >&2; cat "$WORK/rb_apply.log" >&2; exit 1; }
PSQL -d "$RB_DB" -v ON_ERROR_STOP=1 -f "$ROLLBACK_FILE" >"$WORK/rb_rollback.log" 2>&1 \
  || { echo "FAIL rollback : le script de rollback a échoué" >&2; cat "$WORK/rb_rollback.log" >&2; exit 1; }
PSQL -d "$RB_DB" -v ON_ERROR_STOP=1 -f "$RBVERIFY" >"$WORK/rb_verify.log" 2>&1 \
  || { echo "FAIL rollback : vérification" >&2; cat "$WORK/rb_verify.log" >&2; exit 1; }
tail -n 1 "$WORK/rb_verify.log"

echo ""
echo "M1A PIPELINE PASS — sha256=$M1A_SHA"
echo "  [+] positif : commit + PC1..PC16"
echo "  [-] négatif A/B : échecs exigés, rollbacks totaux prouvés"
echo "  [R] rollback : catalogue revenu au snapshot Phase 0 exact"
