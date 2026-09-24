#!/usr/bin/env bash
# =============================================================================
# JUNO-06 M1a — DOUZE CANARIS du pipeline PostgreSQL (2026-09-24).
# Chaque canari injecte SON défaut, exige que la cible (pipeline réel sur
# PostgreSQL 17.11 local, ou garde structurel) devienne ROUGE, puis restaure.
# Restore-on-start : un canari interrompu ne laisse rien (git checkout --).
# Aucun canari ne doit rester dans l'arbre — vérifié en fin de run.
#
#   K1  la concaténation RAISE ... || revient            (pipeline → rouge)
#   K2  le fichier M1a contient une erreur syntaxique    (pipeline → rouge)
#   K3  ON_ERROR_STOP disparaît                          (pipeline → rouge)
#   K4  le test exécute une copie modifiée               (pipeline → rouge)
#   K5  l'isolation retombe à READ COMMITTED             (pipeline → rouge)
#   K6  le CHECK reste NOT VALID                         (pipeline → rouge)
#   K7  un DEFAULT est ajouté                            (pipeline → rouge)
#   K8  une politique produit est modifiée               (pipeline → rouge)
#   K9  le catalogue divergent est accepté (seed retiré) (pipeline → rouge)
#   K10 une mutation partielle survit (NV1 retiré)       (garde → rouge)
#   K11 le job PostgreSQL est retiré                     (garde → rouge)
#   K12 l'image PostgreSQL devient flottante             (garde → rouge)
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
M1A="$REPO_ROOT/supabase/migrations/20260922000001_juno06_server_enforced_features.sql"
RUNNER="$REPO_ROOT/scripts/m1a-pg/run-m1a-pipeline.sh"
NEGV="$REPO_ROOT/scripts/m1a-pg/negative-verify.sql"
WF="$REPO_ROOT/.github/workflows/ci-postgres.yml"

export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5433}" PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-}" PGBIN="${PGBIN:-/c/temp/pg17/pgsql/bin/}"
export PGCLIENTENCODING=UTF8

failures=0
restore() { git -C "$REPO_ROOT" checkout -- "$1" 2>/dev/null || true; }
# Restore-on-start : nettoie toute trace d'un run interrompu.
for f in "$M1A" "$RUNNER" "$NEGV" "$WF"; do restore "$f"; done

canary() { # nom, cible(pipeline|guard)
  local name="$1" target="$2" rc=0
  if [ "$target" = pipeline ]; then
    bash "$RUNNER" >/dev/null 2>&1 && rc=1   # vert = canary NON tiré
  else
    node "$REPO_ROOT/scripts/validate-m1a-pipeline.mjs" >/dev/null 2>&1 && rc=1
  fi
  if [ "$rc" -eq 0 ]; then echo "  ok    $name : la cible devient ROUGE"
  else echo "  FAIL  $name : la cible est RESTÉE VERTE — règle décorative"; failures=$((failures+1)); fi
}

mutate() { # fichier, expression perl
  perl -0pi -e "$2" "$1"
}

echo "JUNO-06 M1a — douze canaris (défaut injecté ⇒ cible rouge) :"
echo ""

# ── Préparation des mutations ───────────────────────────────────────────────
# K1 : la forme d'incident revient (RAISE concaténé) — un mini-bloc DO suffit
#      à reproduire l'erreur de PARSE qui tue tout le fichier.
cp "$M1A" /dev/null 2>/dev/null || true
k1() { mutate "$M1A" 's/commit;\s*$/DO \$\$ BEGIN RAISE EXCEPTION '"'"'incident'"'"' || '"'"'revient'"'"'; END \$\$;\ncommit;/' ; canary "K1 RAISE|| revient" pipeline ; restore "$M1A" ; }

# K2 : erreur syntaxique pure.
k2() { mutate "$M1A" 's/commit;\s*$/SELEKT 1;\ncommit;/' ; canary "K2 erreur syntaxique" pipeline ; restore "$M1A" ; }

# K3 : ON_ERROR_STOP retiré du runner (les négatifs doivent échouer à détecter).
k3() { sed -i 's/ON_ERROR_STOP=1/ON_ERROR_STOP=0/g' "$RUNNER" ; canary "K3 ON_ERROR_STOP disparu" pipeline ; restore "$RUNNER" ; }

# K4 : le runner exécute une COPIE modifiée du fichier.
k4() { mutate "$RUNNER" 's/PSQL -d "\$db" -v ON_ERROR_STOP=1 -f "\$M1A_FILE" >"\$log" 2>&1/sed "s\/|20|1\/|20|2\/" "\$M1A_FILE" > "\$log.copy.sql" ; PSQL -d "\$db" -v ON_ERROR_STOP=0 -f "\$log.copy.sql" >"\$log" 2>\&1/' ; canary "K4 copie modifiée exécutée" pipeline ; restore "$RUNNER" ; }

# K5 : isolation dégradée.
k5() { sed -i 's/REPEATABLE READ;/READ COMMITTED;/' "$M1A" ; canary "K5 isolation READ COMMITTED" pipeline ; restore "$M1A" ; }

# K6 : le VALIDATE disparaît (le CHECK resterait NOT VALID).
k6() { sed -i '/VALIDATE CONSTRAINT premium_feature_policy_enforcement_class_check/d' "$M1A" ; canary "K6 CHECK reste NOT VALID" pipeline ; restore "$M1A" ; }

# K7 : un DEFAULT est ajouté avant le self-check final.
k7() { mutate "$M1A" 's/(ALTER TABLE public\.premium_feature_policy\n  ADD CONSTRAINT premium_feature_policy_enforcement_class_check)/ALTER TABLE public.premium_feature_policy\n  ALTER COLUMN enforcement_class SET DEFAULT '"'"'legacy_unused'"'"';\n$1/' ; canary "K7 DEFAULT ajouté" pipeline ; restore "$M1A" ; }

# K8 : une politique produit modifiée dans la migration.
k8() { mutate "$M1A" 's/(SET enforcement_class = '"'"'legacy_unused'"'"', updated_at = NOW\(\)\n WHERE feature_key = '"'"'likes_you_see_who'"'"';)/$1\n\nUPDATE public.premium_feature_policy SET free_preview_quota = 1, updated_at = NOW() WHERE feature_key = '"'"'tarot_cosmic'"'"';/' ; canary "K8 politique produit modifiée" pipeline ; restore "$M1A" ; }

# K9 : le semis de divergence du négatif A disparaît (divergence « acceptée »).
k9() { sed -i "/UPDATE public.premium_feature_policy SET free_preview_quota = NULL WHERE feature_key='synastry';/d" "$RUNNER" ; canary "K9 catalogue divergent accepté" pipeline ; restore "$RUNNER" ; }

# K10 : NV1 (colonne absente) retiré — une mutation partielle survivrait.
k10() { mutate "$NEGV" 's/SELECT COUNT\(\*\) INTO v_n FROM information_schema\.columns\n   WHERE table_schema='"'"'public'"'"' AND table_name='"'"'premium_feature_policy'"'"'\n     AND column_name='"'"'enforcement_class'"'"';/SELECT 1 INTO v_n;/' ; canary "K10 mutation partielle survit" guard ; restore "$NEGV" ; }

# K11 : le service postgres disparaît du workflow.
k11() { sed -i '/services:/,/options: >-/{/postgres:/d;/image:/d;/POSTGRES_PASSWORD/d;/POSTGRES_INITDB_ARGS/d;/5432:5432/d;}' "$WF" ; canary "K11 job PostgreSQL retiré" guard ; restore "$WF" ; }

# K12 : image flottante.
k12() { sed -i 's#image: postgres:17.11@sha256:e31e3d5327d1806f6177827c9710643e4f35f7ab3f14d26d05332753d3e95ee0#image: postgres:latest#' "$WF" ; canary "K12 image flottante" guard ; restore "$WF" ; }

k1; k2; k3; k4; k5; k6; k7; k8; k9; k10; k11; k12

echo ""
if git -C "$REPO_ROOT" diff --quiet -- "$M1A" "$RUNNER" "$NEGV" "$WF" ; then
  echo "Restauration : arbre propre (aucun canari résiduel)."
else
  echo "ATTENTION : des mutations subsistent — restauration manuelle requise."
  failures=$((failures+1))
fi
[ "$failures" -eq 0 ] && echo "TOUS LES DOUZE CANARIS ONT TIRÉ."
exit "$failures"
