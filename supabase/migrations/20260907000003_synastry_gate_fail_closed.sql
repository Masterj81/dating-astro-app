-- =============================================================================
-- Correctif de suivi — le garde premium du picker synastrie doit échouer FERMÉ
-- =============================================================================
--
-- LE DÉFAUT, INTRODUIT PAR 20260907000001
-- ---------------------------------------
-- Le garde ajouté à `get_synastry_candidate_profiles` lisait le tier requis
-- par sous-requête, en argument :
--
--     IF NOT public.tier_at_least(
--       v_tier,
--       (SELECT pf.required_tier FROM public.premium_feature_policy pf
--         WHERE pf.feature_key = 'synastry')
--     ) THEN
--       RAISE EXCEPTION 'premium_required';
--
-- Si la ligne `synastry` n'existe pas, la sous-requête rend NULL, et
-- `tier_at_least` commence par :
--
--     WHEN p_required IS NULL OR p_required = 'free' THEN TRUE
--
-- Le garde s'ouvre donc silencieusement. Toute la vague du 7 septembre est
-- écrite pour échouer fermé — un contrôle qui n'a pas pu s'exécuter refuse —
-- et c'est le seul endroit qui faisait l'inverse.
--
-- POURQUOI CE N'EST PAS THÉORIQUE
-- -------------------------------
-- Supprimer une ligne de `premium_feature_policy` est une opération que ce
-- projet pratique : `20260429000001_remove_super_likes_feature.sql` retire la
-- ligne `super_likes` quand la fonctionnalité a disparu du produit. Le jour où
-- quelqu'un renomme ou retire `synastry`, le picker cesserait de vérifier
-- l'abonnement, sans erreur et sans trace.
--
-- L'edge function, elle, était déjà correcte : `can_use_premium_feature` rend
-- `allowed = false, reason = 'unknown_feature'` quand la politique manque, et
-- `authorizeChartAccess` refuse sur `allowed !== true`. Donc la donnée reste
-- protégée même aujourd'hui ; c'est la LISTE de candidats qui s'ouvrirait.
--
-- CE QUE FAIT CE FICHIER
-- ----------------------
-- La lecture de la politique passe dans une variable, et son absence devient
-- un refus explicite. Une seule différence de comportement, dans un seul sens :
-- ce qui passait par accident ne passe plus.
--
-- Rien d'autre ne change : mêmes colonnes, même filtrage, même prédicat
-- partagé `profile_chart_visible`, mêmes GRANT/REVOKE. Un compte abonné voit
-- exactement la même liste qu'avant.
--
-- IDEMPOTENT : CREATE OR REPLACE + GRANT/REVOKE restatés.
--
-- À APPLIQUER dans l'éditeur SQL, puis relancer
-- supabase/tests/verify_20260907_remediation.sql (le contrôle 19 couvre ce cas).

begin;

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
  v_tier     TEXT;
  v_required TEXT;
BEGIN
  -- Auth guard, inchangé : un appelant authentifié agit sur son propre id.
  -- service_role (auth.uid() IS NULL) garde l'accès complet pour les crons.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Garde premium (JUNO-02), désormais fail-closed.
  IF auth.uid() IS NOT NULL THEN
    SELECT pf.required_tier
      INTO v_required
      FROM public.premium_feature_policy pf
     WHERE pf.feature_key = 'synastry';

    -- L'absence de politique est un refus, pas une permission. En argument
    -- direct de tier_at_least, ce NULL rendait TRUE et ouvrait le garde.
    IF v_required IS NULL THEN
      RAISE EXCEPTION 'premium_policy_missing' USING ERRCODE = '42501';
    END IF;

    -- Lecture seule : get_user_tier n'écrit rien et ne consomme aucun aperçu.
    v_tier := public.get_user_tier(p_user_id);

    IF NOT public.tier_at_least(v_tier, v_required) THEN
      RAISE EXCEPTION 'premium_required' USING ERRCODE = '42501';
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
  'Synastry candidate picker. Auth-guarded (caller must pass their own auth.uid()), premium-gated on the `synastry` policy row since 2026-09-07 (JUNO-02), and filtered by public.profile_chart_visible — the same predicate the get-profile-chart edge function consults. The policy lookup goes through a variable and a NULL raises `premium_policy_missing`: read inline as an argument to tier_at_least, a missing policy row rendered NULL, which that function treats as "no requirement", and the gate opened silently. Does NOT exclude already-swiped profiles: synastry is a comparison tool, not the Discover feed.';

-- ---------------------------------------------------------------------------
-- Auto-vérification : échouer plutôt que d'annoncer un succès.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_def       TEXT;
  v_required  TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_synastry_candidate_profiles';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'get_synastry_candidate_profiles a disparu';
  END IF;

  -- La branche fail-closed est présente…
  IF v_def NOT LIKE '%premium_policy_missing%' THEN
    RAISE EXCEPTION 'le garde reste fail-open : la branche premium_policy_missing est absente';
  END IF;

  -- …le tier requis passe par une variable…
  IF v_def !~ 'tier_at_least\s*\(\s*v_tier\s*,\s*v_required\s*\)' THEN
    RAISE EXCEPTION 'tier_at_least ne recoit plus (v_tier, v_required)';
  END IF;

  -- …et la lecture inline qui causait le défaut a bien disparu.
  --
  -- REGEX, PAS LIKE, et la première version de ce fichier s'est fait piéger
  -- dessus. `LIKE '%tier_at_least(%SELECT%'` a des jokers qui traversent tout :
  -- après l'appel vient forcément un SELECT plus loin — celui du RETURN QUERY.
  -- Le motif matchait donc la BONNE version, et la migration s'est annulée
  -- toute seule sur une fausse alarme. `[^)]*` s'arrête à la première
  -- parenthèse fermante, donc il ne voit que les arguments de l'appel.
  IF v_def ~ 'tier_at_least\s*\([^)]*SELECT' THEN
    RAISE EXCEPTION 'la politique est encore lue en argument de tier_at_least : un NULL y vaut TRUE';
  END IF;

  -- Ce que la migration ne doit PAS avoir cassé.
  IF v_def NOT LIKE '%profile_chart_visible%' THEN
    RAISE EXCEPTION 'le predicat de visibilite partage a ete perdu';
  END IF;
  IF v_def NOT LIKE '%unauthorized%' THEN
    RAISE EXCEPTION 'le garde auth.uid() a ete perdu';
  END IF;
  IF NOT has_function_privilege('authenticated',
        'public.get_synastry_candidate_profiles(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ne peut plus appeler le picker';
  END IF;
  IF has_function_privilege('anon',
        'public.get_synastry_candidate_profiles(uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon peut appeler le picker';
  END IF;

  -- Et la politique existe bel et bien aujourd'hui : le correctif protege
  -- contre une suppression future, il ne compense pas une absence actuelle.
  SELECT pf.required_tier INTO v_required
    FROM public.premium_feature_policy pf WHERE pf.feature_key = 'synastry';
  IF v_required IS NULL THEN
    RAISE EXCEPTION 'la ligne premium_feature_policy(synastry) est absente : le picker refuserait tout le monde';
  END IF;

  RAISE NOTICE 'Garde synastrie fail-closed. required_tier = %.', v_required;
END
$$;

commit;

-- =============================================================================
-- APRÈS APPLICATION
-- =============================================================================
--
-- Relancer supabase/tests/verify_20260907_remediation.sql. Le contrôle 19
-- (« le garde du picker echoue ferme ») doit passer au vert, et les 27 autres
-- rester verts.
--
-- ROLLBACK : ré-appliquer 20260907000001_chart_access_control.sql, qui contient
-- la version précédente de cette fonction. Elle est fail-open sur ce point
-- précis et correcte sur tout le reste.
