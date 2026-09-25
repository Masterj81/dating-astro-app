#!/usr/bin/env bash
# =============================================================================
# JUNO-06 - HUIT CANARIS de la correction premium-tarot-reading (2026-09-25).
# Chaque canari injecte SON défaut, exige que la suite étendue (structurelle
# + comportementale, octets réels) devienne ROUGE, puis restaure.
# Restore-on-start ; refuse de courir sur cibles non commitées.
#
#   W1  retrait de global.headers.Authorization (retour JWT-anon)   (suite → rouge)
#   W2  RPC sur un client module-level cache (fuite cross-requêtes)(suite → rouge)
#   W3  usage de SUPABASE_SERVICE_ROLE_KEY                          (suite → rouge)
#   W4  JWT mutable en globalThis                                   (suite → rouge)
#   W5  3e argument fictif {headers} sur .rpc()                     (suite → rouge)
#   W6  génération avant la décision                                (suite → rouge)
#   W7  commentaire « free preview 1/day » réintroduit              (suite → rouge)
#   W8  import supabase-js flottant @2                              (suite → rouge)
# =============================================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EDGE="$REPO_ROOT/supabase/functions/premium-tarot-reading/index.ts"
SUITE="src/security/__tests__/premium-tarot-reading.test.ts"

failures=0
restore() { git -C "$REPO_ROOT" checkout -- "$1" 2>/dev/null || true; }

# GARDE ANTI-DESTRUCTION : jamais sur cibles non commitées.
if ! git -C "$REPO_ROOT" diff --quiet -- "$EDGE" 2>/dev/null \
   || ! git -C "$REPO_ROOT" diff --cached --quiet -- "$EDGE" 2>/dev/null; then
  echo "FATAL : edge non commité — committer d'abord." >&2
  exit 2
fi
restore "$EDGE"

canary() { # nom
  local name="$1" rc=0
  (cd "$REPO_ROOT/packages/shared" && npx vitest run "$SUITE" >/dev/null 2>&1) && rc=1
  if [ "$rc" -eq 0 ]; then echo "  ok    $name : la suite devient ROUGE"
  else echo "  FAIL  $name : la suite est RESTÉE VERTE — règle décorative"; failures=$((failures+1)); fi
}
mutate() { perl -0pi -e "$2" "$1"; }

echo "JUNO-06 — huit canaris premium-tarot-reading :"
echo ""

# W1 : l'Authorization disparait du client de requête (le JWT n'atteint plus
#      la RPC — le défaut d'origine, côté transport).
w1() { mutate "$EDGE" "s/global: \{\s*\n\s*headers: \{\s*\n\s*Authorization: authHeader,\s*\n\s*\},\s*\n\s*\},\s*\n\s*auth: \{/auth: {/s" ; canary "W1 Authorization absente du client requête" ; restore "$EDGE" ; }

# W2 : la RPC repart sur un client module-level cache (partagé, anon).
w2() { mutate "$EDGE" "s/const \{ data: decision, error: decisionError \} = await requestClient\.rpc\(/globalThis.__ANON_CLIENT ??= createClient(url, anonKey, { auth: { persistSession: false, detectSessionInUrl: false } });\n  const { data: decision, error: decisionError } = await globalThis.__ANON_CLIENT.rpc(/" ; canary "W2 RPC sur client module-level partagé" ; restore "$EDGE" ; }

# W3 : la clé service-role remplace la clé publique.
w3() { sed -i "s/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY/g" "$EDGE" ; canary "W3 clé service-role" ; restore "$EDGE" ; }

# W4 : le JWT passe par un mutable globalThis (premier requête gagne).
w4() { sed -i "s/Authorization: authHeader,/Authorization: (globalThis.__AUTH ||= authHeader),/" "$EDGE" ; canary "W4 JWT mutable en globalThis" ; restore "$EDGE" ; }

# W5 : le 3e argument fictif {headers} réapparait sur .rpc().
w5() { mutate "$EDGE" "s/'tarot_monthly' \},\s*\n  \);/'tarot_monthly' },\n    { headers: { Authorization: authHeader } },\n  );/" ; canary "W5 {headers} fictif sur .rpc()" ; restore "$EDGE" ; }

# W6 : un tir a lieu AVANT la décision.
w6() { mutate "$EDGE" "s/  const \{ data: decision, error: decisionError \} = await requestClient\.rpc\(/  const early = generateReading({ userId: user.id, mode, period, locale });\n  const { data: decision, error: decisionError } = await requestClient.rpc(/" ; canary "W6 génération avant décision" ; restore "$EDGE" ; }

# W7 : le mensonge « 1/day » revient en commentaire.
w7() { mutate "$EDGE" "s/(\/\/ Security: caller JWT)/\/\/ Free preview: 1\/day for every account, on the house.\n\/\/ Security: caller JWT/" ; canary "W7 commentaire free preview 1\/day" ; restore "$EDGE" ; }

# W8 : l'import redevient flottant.
w8() { sed -i "s/@supabase\/supabase-js@2.114.0/@supabase\/supabase-js@2/" "$EDGE" ; canary "W8 import flottant @2" ; restore "$EDGE" ; }

w1; w2; w3; w4; w5; w6; w7; w8

echo ""
if git -C "$REPO_ROOT" diff --quiet -- "$EDGE" ; then
  echo "Restauration : arbre propre (aucun canari résiduel)."
else
  echo "ATTENTION : des mutations subsistent — restauration manuelle requise."
  failures=$((failures+1))
fi
[ "$failures" -eq 0 ] && echo "TOUS LES HUIT CANARIS ONT TIRÉ."
exit "$failures"
