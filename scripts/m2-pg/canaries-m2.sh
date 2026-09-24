#!/usr/bin/env bash
# =============================================================================
# JUNO-06 M2 — HUIT CANARIS du pipeline PostgreSQL (2026-09-24).
# Chaque canari injecte SON défaut, exige que la cible (pipeline réel sur
# PostgreSQL 17.11 local, ou garde structurel) devienne ROUGE, puis restaure.
# Restore-on-start : un canari interrompu ne laisse rien (git checkout --).
# Aucun canari ne doit rester dans l'arbre — vérifié en fin de run.
#
#   C1  la sonde impossible privilege_type='ALL' revient   (pipeline → rouge)
#   C2  un privilège serveur requis est retiré             (pipeline → rouge)
#   C3  un grant client est réintroduit (REVOKE retiré)    (pipeline → rouge)
#   C4  la RLS est désactivée                              (pipeline → rouge)
#   C5  une policy est ajoutée                             (pipeline → rouge)
#   C6  régression booléen→INTEGER dans T1                 (pipeline → rouge)
#   C7  une table métier est mutée par M2                  (pipeline → rouge)
#   C8  l'image PostgreSQL n'est plus épinglée             (garde → rouge)
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
M2="$REPO_ROOT/supabase/migrations/20260922000002_sync_entitlement_throttle.sql"
T1="$REPO_ROOT/supabase/tests/juno06_sync_entitlement_claim.test.sql"
RUNNER="$REPO_ROOT/scripts/m2-pg/run-m2-pipeline.sh"
WF="$REPO_ROOT/.github/workflows/ci-postgres.yml"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}" PGBIN="${PGBIN:-/c/temp/pg17/pgsql/bin/}"
export PGCLIENTENCODING=UTF8

failures=0
restore() { git -C "$REPO_ROOT" checkout -- "$1" 2>/dev/null || true; }

# GARDE ANTI-DESTRUCTION (leçon 2026-09-24) : restore() fait git checkout --,
# qui réécrit la cible À PARTIR DU DERNIER COMMIT. Si les cibles portent des
# modifications non commitées, les exécuter ICI les détruirait silencieusement
# — c'est exactement ce qui a réverté les corrections M2/T1/workflow lors du
# premier run. Les canaris ne courent que sur un arbre COMMITTÉ.
if ! git -C "$REPO_ROOT" diff --quiet -- "$M2" "$T1" "$RUNNER" "$WF" 2>/dev/null \
   || ! git -C "$REPO_ROOT" diff --cached --quiet -- "$M2" "$T1" "$RUNNER" "$WF" 2>/dev/null; then
  echo "FATAL : M2/T1/runner/workflow ont des modifications non commitées —" >&2
  echo "        committer d'abord : restore() les réécrirait depuis HEAD et les détruirait." >&2
  exit 2
fi

# Restore-on-start : nettoie toute trace d'un run interrompu.
for f in "$M2" "$T1" "$RUNNER" "$WF"; do restore "$f"; done

canary() { # nom, cible(pipeline|guard)
  local name="$1" target="$2" rc=0
  if [ "$target" = pipeline ]; then
    bash "$RUNNER" >/dev/null 2>&1 && rc=1   # vert = canary NON tiré
  else
    node "$REPO_ROOT/scripts/validate-m2-pipeline.mjs" >/dev/null 2>&1 && rc=1
  fi
  if [ "$rc" -eq 0 ]; then echo "  ok    $name : la cible devient ROUGE"
  else echo "  FAIL  $name : la cible est RESTÉE VERTE — règle décorative"; failures=$((failures+1)); fi
}

mutate() { # fichier, expression perl (slurp)
  perl -0pi -e "$2" "$1"
}

echo "JUNO-06 M2 — huit canaris (défaut injecté ⇒ cible rouge) :"
echo ""

# C1 : la sonde impossible revient — on réintroduit un OU sur
#      privilege_type = 'ALL', une valeur qu'aucun serveur ne liste jamais
#      (ancre = la forme ANDée du self-check ; le ou-disjonctif rend la
#      condition toujours fausse ⇒ RAISE).
c1() { mutate "$M2" "s/IF NOT \(has_table_privilege\(/IF NOT EXISTS (SELECT 1 FROM information_schema.table_privileges WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims' AND grantee = 'service_role' AND privilege_type = 'ALL') OR NOT (has_table_privilege(/" ; canary "C1 sonde privilege_type='ALL' revient" pipeline ; restore "$M2" ; }

# C2 : un privilège serveur requis est retiré avant le self-check.
c2() { mutate "$M2" "s/(REVOKE ALL ON public\.entitlement_sync_claims FROM anon, authenticated;)/\$1\nREVOKE INSERT ON public.entitlement_sync_claims FROM service_role;/" ; canary "C2 privilège serveur retiré" pipeline ; restore "$M2" ; }

# C3 : le REVOKE client disparaît — les default privileges Supabase
#      réexposent la table, le self-check doit le refuser.
c3() { sed -i "s/^REVOKE ALL ON public.entitlement_sync_claims FROM anon, authenticated;/-- canari C3 : retrait du REVOKE client/" "$M2" ; canary "C3 grant client réintroduit" pipeline ; restore "$M2" ; }

# C4 : la RLS est désactivée — D6 doit le refuser.
c4() { sed -i 's/ENABLE ROW LEVEL SECURITY/DISABLE ROW LEVEL SECURITY/' "$M2" ; canary "C4 RLS retirée" pipeline ; restore "$M2" ; }

# C5 : une policy est ajoutée — D7 doit le refuser.
c5() { mutate "$M2" "s/(REVOKE ALL ON public\.entitlement_sync_claims FROM anon, authenticated;)/\$1\nCREATE POLICY canari_leak ON public.entitlement_sync_claims USING (true);/" ; canary "C5 policy ajoutée" pipeline ; restore "$M2" ; }

# C6 : régression booléen→INTEGER dans T1 (le défaut d'origine exact).
c6() { sed -i 's/v_bool        BOOLEAN;/v_bool        INTEGER;/' "$T1" ; canary "C6 booléen→INTEGER dans T1" pipeline ; restore "$T1" ; }

# C7 : M2 mute une table métier — D11 doit le refuser.
c7() { mutate "$M2" "s/(REVOKE ALL ON public\.entitlement_sync_claims FROM anon, authenticated;)/\$1\nDELETE FROM public.premium_usage;/" ; canary "C7 table métier mutée" pipeline ; restore "$M2" ; }

# C8 : l'image PostgreSQL n'est plus épinglée par digest.
c8() { sed -i 's#postgres:17.11@sha256:e31e3d5327d1806f6177827c9710643e4f35f7ab3f14d26d05332753d3e95ee0#postgres:17#' "$WF" ; canary "C8 image non épinglée" guard ; restore "$WF" ; }

c1; c2; c3; c4; c5; c6; c7; c8

echo ""
if git -C "$REPO_ROOT" diff --quiet -- "$M2" "$T1" "$RUNNER" "$WF" ; then
  echo "Restauration : arbre propre (aucun canari résiduel)."
else
  echo "ATTENTION : des mutations subsistent — restauration manuelle requise."
  failures=$((failures+1))
fi
[ "$failures" -eq 0 ] && echo "TOUS LES HUIT CANARIS ONT TIRÉ."
exit "$failures"
