#!/usr/bin/env bash
# =============================================================================
# JUNO-06 — NEUF CANARIS DU T2 (2026-09-24).
# Chaque canari injecte SON défaut, exige que la cible (pipeline réel sur
# PostgreSQL 17.11 local, ou garde structurel) devienne ROUGE, puis restaure.
# Restore-on-start ; refuse de courir sur cibles non commitées (leçon
# 2026-09-24 : restore() = git checkout --).
#
#   U1  la sonde impossible privilege_type='ALL' revient dans T2  (garde → rouge)
#   U2  un privilège service_role est révoqué après M2            (pipeline → rouge via C10)
#   U3  la restauration du rôle avant C10 disparaît               (pipeline → rouge via l'assertion)
#   U4  C11 exige à nouveau des quotas legacy NULL                (pipeline → rouge)
#   U5  mauvais quota attendu daily_horoscope (40≠50)             (pipeline → rouge)
#   U6  mauvais quota attendu synastry (2≠20)                     (pipeline → rouge)
#   U7  SELECT scalaire multi-lignes réintroduit dans C11         (pipeline → rouge)
#   U8  le ROLLBACK final de T2 disparaît                         (pipeline → rouge)
#   U9  T2 commite au lieu de rouler back (résidus)               (pipeline → rouge)
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T2="$REPO_ROOT/supabase/tests/juno06_server_enforced_features.test.sql"
RUNNER="$REPO_ROOT/scripts/m2-pg/run-m2-pipeline.sh"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}" PGBIN="${PGBIN:-/c/temp/pg17/pgsql/bin/}"
export PGCLIENTENCODING=UTF8

failures=0
restore() { git -C "$REPO_ROOT" checkout -- "$1" 2>/dev/null || true; }

# GARDE ANTI-DESTRUCTION : jamais sur des cibles non commitées.
if ! git -C "$REPO_ROOT" diff --quiet -- "$T2" "$RUNNER" 2>/dev/null \
   || ! git -C "$REPO_ROOT" diff --cached --quiet -- "$T2" "$RUNNER" 2>/dev/null; then
  echo "FATAL : T2/runner non commités — commetter d'abord." >&2
  exit 2
fi
for f in "$T2" "$RUNNER"; do restore "$f"; done

canary() { # nom, cible(pipeline|guard)
  local name="$1" target="$2" rc=0
  if [ "$target" = pipeline ]; then
    bash "$RUNNER" >/dev/null 2>&1 && rc=1
  else
    node "$REPO_ROOT/scripts/validate-m2-pipeline.mjs" >/dev/null 2>&1 && rc=1
  fi
  if [ "$rc" -eq 0 ]; then echo "  ok    $name : la cible devient ROUGE"
  else echo "  FAIL  $name : la cible est RESTÉE VERTE — règle décorative"; failures=$((failures+1)); fi
}
mutate() { perl -0pi -e "$2" "$1"; }

echo "JUNO-06 — neuf canaris du T2 (défaut injecté ⇒ cible rouge) :"
echo ""

# U1 : la sonde impossible revient dans le CODE de T2.
u1() { mutate "$T2" "s/IF NOT \(has_table_privilege\('service_role', 'public\.entitlement_sync_claims', 'SELECT'\)/IF NOT EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims' AND grantee = 'service_role' AND privilege_type = 'ALL') OR NOT (has_table_privilege('service_role', 'public.entitlement_sync_claims', 'SELECT')/" ; canary "U1 sonde privilege_type='ALL' revient dans T2" guard ; restore "$T2" ; }

# U2 : un privilège service_role est révoqué APRÈS les postconditions — seul
#     le C10 de T2 peut l'attraper à ce stade.
u2() { mutate "$RUNNER" "s/(echo \"PASS  postconditions[^\n]*\n)/\$1  PSQL -d \"\$POS_DB\" -c \"REVOKE INSERT ON public.entitlement_sync_claims FROM service_role;\" >\/dev\/null\n/" ; canary "U2 privilège service_role révoqué (attrapé par C10)" pipeline ; restore "$RUNNER" ; }

# U3 : la restauration du rôle avant le voyage temporel disparaît —
#      l'assertion qui la prouve doit rendre T2 rouge immédiatement.
#      (\r?\n : le checkout Windows est en CRLF — leçon U3 2026-09-24.)
u3() { mutate "$T2" "s/  PERFORM set_config\('role', v_admin, true\);\r?\n  IF current_user <> v_admin THEN\r?\n    RAISE EXCEPTION 'C9 : rôle administratif \(%\) non restauré avant le voyage temporel[^\r\n]*\r?\n  END IF;\r?\n//" ; canary "U3 rôle non restauré (assertion C9)" pipeline ; restore "$T2" ; }

# U4 : C11 exige à nouveau la nullité des quotas legacy (se contredit).
u4() { mutate "$T2" "s/SELECT COUNT\(\*\) INTO v_count FROM public\.premium_feature_policy\r?\n   WHERE \(feature_key = 'daily_horoscope' AND daily_quota IS DISTINCT FROM 50\)\r?\n      OR \(feature_key = 'synastry'       AND daily_quota IS DISTINCT FROM 20\);/SELECT daily_quota INTO v_count FROM public.premium_feature_policy WHERE feature_key IN ('daily_horoscope','synastry') AND daily_quota IS NOT NULL;/" ; canary "U4 C11 exige des quotas NULL (contradiction snapshot)" pipeline ; restore "$T2" ; }

# U5 : mauvais quota attendu pour daily_horoscope.
u5() { sed -i "s/IS DISTINCT FROM 50/IS DISTINCT FROM 40/" "$T2" ; canary "U5 quota daily_horoscope faux (40≠50)" pipeline ; restore "$T2" ; }

# U6 : mauvais quota attendu pour synastry.
u6() { sed -i "s/IS DISTINCT FROM 20/IS DISTINCT FROM 2/" "$T2" ; canary "U6 quota synastry faux (2≠20)" pipeline ; restore "$T2" ; }

# U7 : le SELECT scalaire multi-lignes revient (variante limite).
u7() { mutate "$T2" "s/SELECT COUNT\(\*\) INTO v_count FROM public\.premium_feature_policy\r?\n   WHERE \(feature_key = 'daily_horoscope'/SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy\n   WHERE (SELECT daily_quota FROM public.premium_feature_policy WHERE feature_key IN ('daily_horoscope','synastry')) IS NOT NULL\n     AND (feature_key = 'daily_horoscope'/" ; canary "U7 SELECT scalaire multi-lignes dans C11" pipeline ; restore "$T2" ; }

# U8 : le ROLLBACK final disparaît.
u8() { sed -i 's/^ROLLBACK;/-- canari U8 : rollback retiré/' "$T2" ; canary "U8 ROLLBACK de T2 retiré" pipeline ; restore "$T2" ; }

# U9 : T2 commite ses résidus au lieu de rouler back.
u9() { sed -i 's/^ROLLBACK;/COMMIT; -- canari U9 : résidus conservés/' "$T2" ; canary "U9 T2 commite (résidus utilisateur/usage)" pipeline ; restore "$T2" ; }

u1; u2; u3; u4; u5; u6; u7; u8; u9

echo ""
if git -C "$REPO_ROOT" diff --quiet -- "$T2" "$RUNNER" ; then
  echo "Restauration : arbre propre (aucun canari résiduel)."
else
  echo "ATTENTION : des mutations subsistent — restauration manuelle requise."
  failures=$((failures+1))
fi
[ "$failures" -eq 0 ] && echo "TOUS LES NEUF CANARIS T2 ONT TIRÉ."
exit "$failures"
