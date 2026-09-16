-- =============================================================================
-- Picker de synastrie — ouvert aux comptes gratuits quand l'aperçu est actif
-- =============================================================================
--
-- DÉFAUT n°3 DE LA REVUE : modifier seulement get-profile-chart ne suffit pas.
-- get_synastry_candidate_profiles est gardé par le niveau Céleste depuis
-- 20260907000001 (JUNO-02) : un lecteur gratuit ne pourrait sélectionner
-- AUCUNE cible, et l'aperçu serait une porte sans couloir.
--
-- SÉMANTIQUE (décision opérateur) :
--   * Céleste/Cosmique : comportement actuel, inchangé ;
--   * compte gratuit + politique présente + free_preview_quota >= 1 :
--     accès au picker — candidats réellement admissibles ;
--   * compte gratuit + politique présente + quota NULL : refus normal
--     premium_required (c'est l'état du ROLLBACK) ;
--   * politique absente ou plusieurs lignes : refus FAIL-CLOSED — le garde
--     de 20260907000003 (le sous-SELECT qui rendait NULL => porte ouverte)
--     n'est PAS réintroduit : la lecture de la politique compte ses lignes.
--
-- Le picker ne retourne AUCUNE donnée de thème ou de naissance : les colonnes
-- sont celles d'aujourd'hui (signes publics, texte de profil, intention) —
-- la visibilité passe par profile_chart_visible, le même prédicat que le
-- claim et que can_view_profile_chart.
-- =============================================================================

begin;

DROP FUNCTION IF EXISTS public.get_synastry_candidate_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_synastry_candidate_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  age                 INTEGER,
  sun_sign            TEXT,
  moon_sign           TEXT,
  rising_sign         TEXT,
  bio                 TEXT,
  image_url           TEXT,
  images              TEXT[],
  is_verified         BOOLEAN,
  relationship_intent TEXT,
  personal_values     TEXT[],
  interests           TEXT[],
  looking_for_text    TEXT,
  prompts             JSONB,
  icebreaker_question TEXT,
  last_active         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tier       TEXT;
  v_policy_rows INTEGER;
  v_required   TEXT;
  v_preview    INTEGER;
BEGIN
  -- Auth guard, inchangé : l'appelant authentifié agit en son propre nom ;
  -- service_role (auth.uid() IS NULL) garde l'accès complet (crons/webhooks).
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_tier := public.get_user_tier(p_user_id);

    -- Le garde JUNO-02, renforcé : la politique doit exister UNE fois.
    -- Avant 20260907000003, un sous-SELECT rendant NULL faisait tomber le
    -- garde ; ici le COUNT rend l'absence ET l'ambiguïté visibles, et les
    -- deux ferment.
    SELECT COUNT(*), MIN(pf.required_tier), MIN(pf.free_preview_quota)
      INTO v_policy_rows, v_required, v_preview
      FROM public.premium_feature_policy pf
     WHERE pf.feature_key = 'synastry';

    IF v_policy_rows IS DISTINCT FROM 1 THEN
      -- Fail-closed : une politique absente ou dupliquée n'ouvre RIEN.
      RAISE EXCEPTION 'policy_unavailable' USING ERRCODE = '42501';
    END IF;

    IF NOT public.tier_at_least(v_tier, v_required) THEN
      -- Pas abonné : le picker n'est ouvert que si l'aperçu gratuit est
      -- ACTIF (quota >= 1). NULL = désactivé = refus premium_required —
      -- l'état du rollback opérationnel, sans redéploiement.
      IF COALESCE(v_preview, 0) < 1 THEN
        RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
      END IF;
      -- Sinon : compte gratuit avec aperçu actif — le picker sert les
      -- candidats admissibles, protégés par profile_chart_visible.
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.age,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    COALESCE(p.image_url, p.photos[1]) AS image_url,
    p.images,
    COALESCE(p.is_verified, false) AS is_verified,
    p.relationship_intent,
    p.personal_values,
    p.interests,
    p.looking_for_text,
    p.prompts,
    p.icebreaker_question,
    p.last_active,
    p.created_at
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND public.profile_chart_visible(p_user_id, p.id)
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_synastry_candidate_profiles IS
  'Synastry candidate picker. Auth-guarded (own auth.uid()). Garde renforcé (2026-09-15) : politique synastry comptée — absente/ambiguë = fail-closed ; abonnés Céleste+ inchangés ; comptes gratuits admis UNIQUEMENT si free_preview_quota >= 1 (NULL = refus premium_required = état rollback). Filtrage profile_chart_visible (même prédicat que le claim et can_view_profile_chart). Aucune donnée de thème ou de naissance.';

-- =============================================================================
-- Auto-vérification
-- =============================================================================
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_synastry_candidate_profiles';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'picker absent après recréation';
  END IF;
  -- Les trois marqueurs de la sémantique nouvelle, dans le corps réellement
  -- installé (le validateur rls-contract rejoue aussi les assertions v_def).
  IF v_def NOT LIKE '%policy_unavailable%' THEN
    RAISE EXCEPTION 'picker sans garde fail-closed sur politique absente/ambiguë';
  END IF;
  IF v_def NOT LIKE '%premium_required%' THEN
    RAISE EXCEPTION 'picker sans refus premium pour quota NULL (état rollback)';
  END IF;
  IF v_def NOT LIKE '%free_preview_quota%' THEN
    RAISE EXCEPTION 'picker sans lecture du quota d aperçu';
  END IF;
  -- Le garde JUNO-02 d'origine reste : visibilité par prédicat partagé.
  IF v_def NOT LIKE '%profile_chart_visible%' THEN
    RAISE EXCEPTION 'picker sans prédicat de visibilité partagé';
  END IF;

  -- PUBLIC n'est PAS prouvable par has_function_privilege('public', ...) :
  -- pseudo-rôle, inspecté via proacl/aclexplode (helper posé par
  -- 20260915000001). IS NOT FALSE : TRUE ou NULL refusent (revue 4, P0 —
  -- STRICT + DEFAULT NULL produisait un NULL silencieux). anon suit en
  -- assertion directe séparée.
  IF public._acl_public_fn_privilege('public.get_synastry_candidate_profiles(uuid,integer)'::regprocedure) IS NOT FALSE THEN
    RAISE EXCEPTION 'PUBLIC (grantee=0 dans proacl) peut exécuter le picker, ou lecture indéterminée';
  END IF;
  IF has_function_privilege('anon', 'public.get_synastry_candidate_profiles(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut exécuter le picker';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_synastry_candidate_profiles(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ne peut pas exécuter le picker';
  END IF;

  RAISE NOTICE 'Picker : garde politique compté, aperçu gratuit actif pour free, fail-closed conservé.';
END
$$;

commit;
