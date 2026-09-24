#!/usr/bin/env bash
# =============================================================================
# JUNO-06 M2 — CANARIS DU DELTA P7 : Q11/Q14/Q15 (2026-09-24).
# Cinq mutations de script (cible = garde structurel validate-m2-pipeline.mjs)
# et trois preuves d'état sur base jetable (cible = postconditions réelles).
# Restore-on-start ; refuse de courir sur cibles non commitées (leçon
# 2026-09-24 : restore() = git checkout --, qui détruirait l'non-commité).
#
#   N1  Q14 attend 29 au lieu de 28                (garde → rouge)
#   N2  Q15 : nom supplémentaire dans la liste     (garde → rouge)
#   N3  Q15 : nom attendu retiré                   (garde → rouge)
#   N4  Q15 : entitlement_sync_claims retiré       (garde → rouge)
#   N5  Q11 neutralisée (plus d'état ANALYSER)     (garde → rouge)
#   S0  état : la référence 90/6 diverge ⇒ Q11 = ANALYSER (jetable, 3/2)
#   S1  état : table supplémentaire ⇒ Q14/Q15 suivent la réalité (jetable)
#   S2  état : entitlement_sync_claims absente ⇒ Q1/Q14/Q15 rouges (jetable)
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
POSTC="$REPO_ROOT/scripts/m2-pg/postconditions-production.sql"
GUARD="$REPO_ROOT/scripts/validate-m2-pipeline.mjs"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}" PGBIN="${PGBIN:-/c/temp/pg17/pgsql/bin/}"
export PGCLIENTENCODING=UTF8

failures=0
restore() { git -C "$REPO_ROOT" checkout -- "$1" 2>/dev/null || true; }

# GARDE ANTI-DESTRUCTION : jamais sur des cibles non commitées.
if ! git -C "$REPO_ROOT" diff --quiet -- "$POSTC" "$GUARD" 2>/dev/null \
   || ! git -C "$REPO_ROOT" diff --cached --quiet -- "$POSTC" "$GUARD" 2>/dev/null; then
  echo "FATAL : cibles non commitées — committer d'abord." >&2
  exit 2
fi
for f in "$POSTC" "$GUARD"; do restore "$f"; done

canary_guard() { # nom
  local name="$1" rc=0
  node "$GUARD" >/dev/null 2>&1 && rc=1
  if [ "$rc" -eq 0 ]; then echo "  ok    $name : le garde devient ROUGE"
  else echo "  FAIL  $name : le garde est RESTÉ VERT — règle décorative"; failures=$((failures+1)); fi
}
mutate() { perl -0pi -e "$2" "$1"; }

echo "JUNO-06 M2 — canaris du delta P7 (Q11/Q14/Q15) :"
echo ""

# N1 : Q14 attend 29 au lieu de 28.
n1() { sed -i 's/28 AS expected/29 AS expected/' "$POSTC" ; canary_guard "N1 Q14 attend 29 (au lieu de 28)" ; restore "$POSTC" ; }

# N2 : un nom supplémentaire s'invite dans la liste Q15.
n2() { mutate "$POSTC" "s/blocked_users,conversations,/blocked_users,canari_extra,conversations,/" ; canary_guard "N2 table supplémentaire dans Q15" ; restore "$POSTC" ; }

# N3 : un nom attendu disparaît de la liste Q15.
n3() { mutate "$POSTC" "s/,swipes,/,/" ; canary_guard "N3 table attendue manquante dans Q15" ; restore "$POSTC" ; }

# N4 : entitlement_sync_claims retiré de la liste Q15.
n4() { mutate "$POSTC" "s/edge_rate_limits,entitlement_sync_claims,marketing_posts/edge_rate_limits,marketing_posts/" ; canary_guard "N4 entitlement_sync_claims retiré de Q15" ; restore "$POSTC" ; }

# N5 : Q11 neutralisée — plus d'état ANALYSER (dérive acceptée d'office).
n5() { mutate "$POSTC" "s/CASE WHEN \(SELECT COUNT\(\*\) FROM public\.premium_usage\) = 90/CASE WHEN (SELECT COUNT(*) FROM public.premium_usage) >= 0/" ; canary_guard "N5 Q11 neutralisée (dérive ≠ 90/6 acceptée)" ; restore "$POSTC" ; }

# ── Preuves d'état sur base jetable ─────────────────────────────────────────
PSQL() { command "${PGBIN}psql.exe" -X -w -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$@"; }
seed_db() { # crée la base jetable post-M2 (4 tables : fixture + claims)
  local db="m2_q15_$$_$1"
  PSQL -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1
  PSQL -d postgres -c "CREATE DATABASE $db;" >/dev/null 2>&1 || { echo "FATAL createdb" >&2; exit 9; }
  for f in "$REPO_ROOT/scripts/m1a-pg/bootstrap-phase0.sql" \
           "$REPO_ROOT/supabase/migrations/20260922000001_juno06_server_enforced_features.sql" \
           "$REPO_ROOT/scripts/m2-pg/stub-supabase-roles-auth.sql" \
           "$REPO_ROOT/supabase/migrations/20260922000002_sync_entitlement_throttle.sql"; do
    PSQL -d "$db" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1 || { echo "FATAL seed $f" >&2; exit 9; }
  done
  echo "$db"
}
q_row() { PSQL -d "$1" -tA -f "$POSTC" 2>/dev/null | grep -F "$2" | head -1; }

s0() {
  local db; db="$(seed_db s0)"
  local row; row="$(q_row "$db" 'Q11 ')"
  PSQL -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1
  if echo "$row" | grep -q 'ANALYSER' && echo "$row" | grep -q '3 / 2'; then
    echo "  ok    S0 divergence de la référence (3/2 ≠ 90/6) : Q11 = ANALYSER"
  else
    echo "  FAIL  S0 : Q11 n'a pas signalé ANALYSER pour 3/2 — [$row]"; failures=$((failures+1))
  fi
}

s1() {
  local db; db="$(seed_db s1)"
  PSQL -d "$db" -c "CREATE TABLE public.canari_state_extra(x int);" >/dev/null 2>&1
  local r14 r15
  r14="$(q_row "$db" 'Q14 ')"
  r15="$(q_row "$db" 'Q15 ')"
  PSQL -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1
  if echo "$r14" | grep -q 'FAIL' && echo "$r14" | grep -q '| 5 |' \
     && echo "$r15" | grep -q 'FAIL' && echo "$r15" | grep -q 'canari_state_extra'; then
    echo "  ok    S1 table supplémentaire : Q14=5/FAIL, Q15 la nomme et FAIL"
  else
    echo "  FAIL  S1 : Q14/Q15 n'ont pas suivi la réalité — [$r14] [$r15]"; failures=$((failures+1))
  fi
}

s2() {
  local db; db="$(seed_db s2)"
  PSQL -d "$db" -c "DROP TABLE public.entitlement_sync_claims;" >/dev/null 2>&1
  local r1 r14 r15
  r1="$(q_row "$db" 'Q1 ')"
  r14="$(q_row "$db" 'Q14 ')"
  r15="$(q_row "$db" 'Q15 ')"
  PSQL -d postgres -c "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1
  if echo "$r1" | grep -q 'FAIL' && echo "$r14" | grep -q 'FAIL' \
     && echo "$r15" | grep -q 'FAIL' && ! echo "$r15" | grep -q 'entitlement_sync_claims'; then
    echo "  ok    S2 claims absente : Q1/Q14/Q15 rouges, Q15 sans la nommer"
  else
    echo "  FAIL  S2 : absence non détectée — [$r1] [$r14] [$r15]"; failures=$((failures+1))
  fi
}

n1; n2; n3; n4; n5; s0; s1; s2

echo ""
if git -C "$REPO_ROOT" diff --quiet -- "$POSTC" "$GUARD" ; then
  echo "Restauration : arbre propre (aucun canari résiduel)."
else
  echo "ATTENTION : des mutations subsistent — restauration manuelle requise."
  failures=$((failures+1))
fi
[ "$failures" -eq 0 ] && echo "TOUS LES CANARIS Q11/Q14/Q15 ONT TIRÉ."
exit "$failures"
