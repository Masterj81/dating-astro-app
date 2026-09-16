-- =============================================================================
-- Correctif n°10 — synastry_preview_gate : INTO sur champs d'un RECORD vierge
-- =============================================================================
--
-- INCIDENT D'APPLICATION n°10 (16 sept 2026, découvert par le test
-- comportemental, transaction du test annulée) : la porte déclarait
--   v_policy RECORD;
-- puis écrivait SES CHAMPS directement dans le premier SELECT INTO :
--   INTO v_rows, v_policy.required_tier, v_policy.free_preview_quota
-- Un RECORD plpgsql n'a AUCUNE structure avant sa première affectation
-- ENTIÈRE : PostgreSQL refuse l'accès au champ (« record "v_policy" has no
-- field "required_tier" » au parsing/exécution). La self-verify de la
-- migration d'origine ne l'a pas attrapé parce qu'elle n'APPELLE pas la
-- porte — seul le test l'appelle.
--
-- 20260915000001 ÉTANT APPLIQUÉE en production, ce correctif est une
-- migration DISTINCTE (l'historique livré ne s'édite pas en silence) :
-- CREATE OR REPLACE, sémantique inchangée, variables scalaires.
--
-- Aucun déploiement web/edge n'a eu lieu : le défaut n'a jamais été exposé.
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION public.synastry_preview_gate()
RETURNS TABLE (
  code           TEXT,  -- paid | preview_enabled | preview_disabled | policy_unavailable
  required_tier  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
-- Même durcissement que l'original : chemin vide, tout qualifié.
SET search_path = ''
AS $$
DECLARE
  v_user               UUID := auth.uid();
  v_rows               INTEGER;
  -- Scalars, PAS de RECORD : un RECORD sans structure préalable refuse
  -- l'écriture champ à champ dans un SELECT INTO (incident n°10).
  v_required_tier      TEXT;
  v_free_preview_quota INTEGER;
  v_tier               TEXT;
BEGIN
  IF v_user IS NULL THEN
    RETURN QUERY SELECT 'policy_unavailable'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  -- Politique : exactement une ligne. Zéro ou plusieurs = ambigu = fermé.
  SELECT
    COUNT(*),
    MIN(pf.required_tier),
    MIN(pf.free_preview_quota)
  INTO
    v_rows,
    v_required_tier,
    v_free_preview_quota
  FROM public.premium_feature_policy pf
  WHERE pf.feature_key = 'synastry';

  IF v_rows IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT 'policy_unavailable'::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user);

  IF public.tier_at_least(v_tier, v_required_tier) THEN
    RETURN QUERY SELECT 'paid'::TEXT, v_required_tier;
  ELSIF COALESCE(v_free_preview_quota, 0) >= 1 THEN
    RETURN QUERY SELECT 'preview_enabled'::TEXT, v_required_tier;
  ELSE
    -- Ligne présente, quota NULL/0 : aperçu DÉSACTIVÉ — le chemin du
    -- rollback opérationnel, 402 pas 503.
    RETURN QUERY SELECT 'preview_disabled'::TEXT, v_required_tier;
  END IF;
END;
$$;

-- CREATE OR REPLACE conserve l'ACL existante ; ces deux lignes la
-- réaffirment (idempotence, même posture que l'original).
REVOKE EXECUTE ON FUNCTION public.synastry_preview_gate() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.synastry_preview_gate() TO authenticated;

COMMENT ON FUNCTION public.synastry_preview_gate IS
  'Porte lecture-seule de la synastrie offerte : tier EXPLICITE via get_user_tier+tier_at_least. paid | preview_enabled | preview_disabled (quota NULL = rollback => 402) | policy_unavailable. Nécrit rien, ne consomme rien. Correctif n°10 (20260916000001) : variables scalaires — un RECORD plpgsql ne peut pas recevoir un SELECT INTO champ par champ sans structure préalable.';

-- =============================================================================
-- Auto-vérification : la définition DÉPLOYÉE est bien la corrigée.
-- =============================================================================
DO $$
DECLARE
  v_def TEXT;
  v_into TEXT;
  v_at INTEGER;
  v_from INTEGER;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'synastry_preview_gate';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'synastry_preview_gate absente après correction';
  END IF;
  IF v_def LIKE '%v_policy%' THEN
    RAISE EXCEPTION 'la porte déployée référence encore v_policy (RECORD interdit)';
  END IF;
  IF v_def NOT LIKE '%v_required_tier%' OR v_def NOT LIKE '%v_free_preview_quota%' THEN
    RAISE EXCEPTION 'la porte déployée n utilise pas les scalaires du correctif';
  END IF;
  -- Jamais d'écriture champ-à-champ d'un RECORD dans un INTO : on borne la
  -- clause INTO (entre INTO et le FROM qui la suit) AVANT de chercher un
  -- point — le FROM public.… qui suit en contient un, et un regex non borné
  -- ferait un faux positif (leçon des incidents 4 et 9).
  v_at := position('INTO' in v_def);
  v_from := position('FROM' in v_def);
  IF v_at IS NULL OR v_from IS NULL OR v_from <= v_at THEN
    RAISE EXCEPTION 'structure inattendue : clause INTO introuvable';
  END IF;
  v_into := substring(v_def from v_at for v_from - v_at);
  IF v_into LIKE '%.%' THEN
    RAISE EXCEPTION 'la clause INTO de la porte contient un accès à un champ (%)', v_into;
  END IF;
  IF v_def LIKE '%SET search_path = public%' THEN
    RAISE EXCEPTION 'la porte déployée a perdu son search_path vide';
  END IF;
  IF public._acl_public_fn_privilege('public.synastry_preview_gate()'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC peut exécuter la porte corrigée, ou lecture indéterminée';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.synastry_preview_gate()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.synastry_preview_gate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'les grants EXECUTE de la porte ont dérivé';
  END IF;

  RAISE NOTICE 'Porte corrigée : scalaires, INTO sans champ de RECORD, ACL intactes.';
END
$$;

commit;
