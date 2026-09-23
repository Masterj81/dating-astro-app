-- =============================================================================
-- JUNO-06 — M1a : contrat comportemental de la classification honnête
-- (réécrit 2026-09-23 pour le découpage M1a/M2/M1c).
--
-- HOW TO RUN
--   supabase start                       # ou base de test/staging
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/juno06_server_enforced_features.test.sql
--
-- Pré-requis : les migrations JUNO-06 (20260922000001 M1a, 20260922000002
-- M2) appliquées sur la base de test. Tout le run est transactionnel et se
-- termine par ROLLBACK : rien n'est laissé derrière. Chaque assertion RAISE
-- à l'échec, donc ON_ERROR_STOP=1 transforme une régression en exit code.
--
-- Ce que ce fichier prouve (l'ordre est le contrat) :
--   C1  les 15 lignes du catalogue existent, avec les classes attendues ;
--   C2  AUCUNE valeur produit n'a changé par rapport au snapshot Phase 0
--       (tier/quota/preview — M1a est strictement additive) ;
--   C3  les compteurs AUDITÉS font exactement 2/7/2 — et les 4 marqueurs
--       legacy (tarot + 3 graines mortes) n'y entrent jamais ;
--   C4  synastry.free_preview_quota = 1 (décision produit 2026-09-23) ;
--   C5  l'alias tarot survit (contrat build 130) et porte legacy_alias ;
--   C6  les graines mortes portent legacy_unused — jamais un niveau de
--       sécurité ;
--   C7  la contrainte CHECK interdit toute classe inconnue et NULL ;
--   C8  un INSERT sans enforcement_class ÉCHOUE (23502) — aucun DEFAULT,
--       aucune classification implicite : toute nouvelle clé déclare sa
--       classe explicitement (revue 2026-09-23) ;
--   C9  le comportement d'enforce est inchangé par M1a (le gate répond
--       sur une clé existante exactement comme avant) ;
--   C10 M2 : la table de claims existe, RLS active, aucun privilège client,
--       aucune colonne métier d'abonnement ;
--   C11 M1c est ABSENTE : aucune des 8 clés d'aperçu ne porte preview=1,
--       les graines mortes existent toujours, les quotas legacy sont
--       intacts (les mutations produit sont différées au 131).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
  v_classes_expected CONSTANT TEXT[] := ARRAY[
    'compatibility_details|legacy_unused',
    'conversation_guide|server_metered_ui',
    'daily_horoscope|server_metered_ui',
    'date_planner|server_metered_ui',
    'likes_you_see_who|legacy_unused',
    'lucky_days|server_metered_ui',
    'monthly_horoscope|server_metered_ui',
    'natal_chart|server_metered_ui',
    'planetary_transits|public_content',
    'priority_messages|legacy_unused',
    'retrograde_alerts|public_content',
    'synastry|server_metered_ui',
    'tarot|legacy_alias',
    'tarot_cosmic|server_enforced_data',
    'tarot_monthly|server_enforced_data'
  ];
  v_snapshot_phase0 CONSTANT TEXT[] := ARRAY[   -- tier|quota|preview (''=NULL)
    'compatibility_details|celestial|50|',
    'conversation_guide|celestial|100|1',
    'daily_horoscope|celestial|50|',
    'date_planner|cosmic|10|',
    'likes_you_see_who|celestial|50|',
    'lucky_days|cosmic||',
    'monthly_horoscope|cosmic||',
    'natal_chart|celestial||1',
    'planetary_transits|cosmic||',
    'priority_messages|celestial|100|',
    'retrograde_alerts|cosmic||',
    'synastry|celestial|20|1',
    'tarot|cosmic|10|',
    'tarot_cosmic|cosmic|10|',
    'tarot_monthly|celestial||'
  ];
  v_actual TEXT[];
  v_cls    TEXT;
  v_count  INTEGER;
  v_user   UUID := gen_random_uuid();
  r        RECORD;
BEGIN
  -- C1+C2 : catalogue = 15 lignes, classes ET valeurs produit attendues ----
  SELECT COALESCE(array_agg(feature_key || '|' || enforcement_class ORDER BY feature_key), '{}')
    INTO v_actual FROM public.premium_feature_policy;
  IF v_actual <> v_classes_expected THEN
    RAISE EXCEPTION 'C1 : classes ≠ attendues. Obtenu : %', v_actual;
  END IF;

  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_actual FROM public.premium_feature_policy;
  IF v_actual <> v_snapshot_phase0 THEN
    RAISE EXCEPTION 'C2 : le catalogue produit a changé (M1a doit être additive). Obtenu : %', v_actual;
  END IF;

  -- C3 : compteurs audités 2/7/2, bornés aux 11 fonctionnalités ------------
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE enforcement_class = 'server_enforced_data';
  IF v_count <> 2 THEN RAISE EXCEPTION 'C3 : server_enforced_data = % (attendu 2, SANS les marqueurs legacy)', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE enforcement_class = 'server_metered_ui';
  IF v_count <> 7 THEN RAISE EXCEPTION 'C3 : server_metered_ui = % (attendu 7)', v_count; END IF;
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE enforcement_class = 'public_content';
  IF v_count <> 2 THEN RAISE EXCEPTION 'C3 : public_content = % (attendu 2)', v_count; END IF;

  -- C4 : synastry = 1 --------------------------------------------------------
  SELECT free_preview_quota INTO v_count FROM public.premium_feature_policy
   WHERE feature_key = 'synastry';
  IF v_count <> 1 THEN RAISE EXCEPTION 'C4 : synastry.free_preview_quota = % (attendu 1, décision produit 2026-09-23)', v_count; END IF;

  -- C5 : alias tarot ----------------------------------------------------------
  SELECT enforcement_class INTO v_cls FROM public.premium_feature_policy
   WHERE feature_key = 'tarot';
  IF v_cls IS DISTINCT FROM 'legacy_alias' THEN
    RAISE EXCEPTION 'C5 : tarot doit porter legacy_alias (contrat build 130), obtenu %', v_cls;
  END IF;

  -- C6 : graines mortes présentes (leur suppression est M1c) et marquées
  --      legacy_unused — jamais un niveau de sécurité.
  FOR r IN
    SELECT feature_key, enforcement_class FROM public.premium_feature_policy
     WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who')
  LOOP
    IF r.enforcement_class IS DISTINCT FROM 'legacy_unused' THEN
      RAISE EXCEPTION 'C6 : la graine morte % porte % — elle doit être legacy_unused (jamais présentée comme protégée)', r.feature_key, r.enforcement_class;
    END IF;
  END LOOP;

  -- C7 : le CHECK interdit l'inconnu ; le NOT NULL interdit l'absence ------
  BEGIN
    UPDATE public.premium_feature_policy
       SET enforcement_class = 'military_grade' WHERE feature_key = 'tarot';
    RAISE EXCEPTION 'C7 : le CHECK a accepté une classe inconnue';
  EXCEPTION WHEN check_violation THEN NULL; -- attendu : 23514
  END;
  BEGIN
    UPDATE public.premium_feature_policy
       SET enforcement_class = NULL WHERE feature_key = 'tarot';
    RAISE EXCEPTION 'C7 : le NOT NULL a accepté NULL';
  EXCEPTION WHEN not_null_violation THEN NULL; -- attendu : 23502 (un CHECK seul ne bloque jamais NULL)
  END;
  -- restaure la valeur de l'alias pour la suite du test
  UPDATE public.premium_feature_policy
     SET enforcement_class = 'legacy_alias' WHERE feature_key = 'tarot';

  -- C8 (INVERSÉ, revue 2026-09-23) : un INSERT SANS enforcement_class doit
  --      ÉCHOUER — aucune classification implicite, aucun DEFAULT. La
  --      fonctionnalité future DOIT déclarer sa classe explicitement.
  BEGIN
    INSERT INTO public.premium_feature_policy
      (feature_key, required_tier, daily_quota, free_preview_quota)  -- sans classe
    VALUES ('probe_b', 'celestial', NULL, NULL);
    RAISE EXCEPTION 'C8 : l''INSERT sans enforcement_class a RÉUSSI — un DEFAULT ou un manque NOT NULL contourne la classification explicite';
  EXCEPTION WHEN not_null_violation THEN NULL; -- attendu : 23502
  END;
  -- La ligne n'existe pas (l'insert a été annulé par l'échec).
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key = 'probe_b';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'C8 : la sonde sans classe existe — l''échec attendu n''a pas rollbacké l''insert';
  END IF;

  -- C9 : enforce inchangé par M1a (comportement sur clé existante) -----------
  -- Nécessite un utilisateur ; sur une base de test avec auth.users :
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated',
          'authenticated', 'm1a.contract.test@example.invalid', '',
          NOW(), NOW(), NOW());
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- natal_chart : preview 1/jour — le contrat d'avant M1a, inchangé.
  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF r.allowed IS DISTINCT FROM true OR r.reason IS DISTINCT FROM 'free_preview' THEN
    RAISE EXCEPTION 'C9 : enforce(natal_chart) attendu (true, free_preview), obtenu (%)', COALESCE(r.reason,'NULL');
  END IF;
  SELECT * INTO r FROM public.enforce_premium_feature('natal_chart');
  IF r.allowed IS DISTINCT FROM false OR r.reason IS DISTINCT FROM 'free_preview_exhausted' THEN
    RAISE EXCEPTION 'C9 : 2e enforce(natal_chart) attendu (false, free_preview_exhausted), obtenu (%)', COALESCE(r.reason,'NULL');
  END IF;
  -- Une clé d'aperçu M1c (différée) : sans preview posée, un compte free est
  -- refusé sec — c'est le comportement web actuel, M1a ne change rien.
  SELECT * INTO r FROM public.enforce_premium_feature('planetary_transits');
  IF r.allowed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'C9/C11 : enforce(planetary_transits) free attendu refusé (preview = M1c), obtenu allowed=%', r.allowed;
  END IF;

  -- C10 : M2 — la table de claims, sa forme, ses verrous --------------------
  SELECT COUNT(*) INTO v_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name='entitlement_sync_claims';
  IF v_count <> 1 THEN RAISE EXCEPTION 'C10 : entitlement_sync_claims absente'; END IF;

  SELECT COUNT(*) INTO v_count FROM information_schema.columns
   WHERE table_schema='public' AND table_name='entitlement_sync_claims'
     AND column_name IN ('tier','status','expires_at','provider_customer_id',
                         'provider_subscription_id','cancel_at_period_end');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'C10 : la table de claims contient des colonnes métier d''abonnement (%)', v_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='entitlement_sync_claims' AND relrowsecurity) THEN
    RAISE EXCEPTION 'C10 : RLS doit être active sur entitlement_sync_claims';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname='public' AND tablename='entitlement_sync_claims') THEN
    RAISE EXCEPTION 'C10 : aucune policy client ne doit exister sur la table de claims';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.table_privileges
              WHERE table_schema='public' AND table_name='entitlement_sync_claims'
                AND grantee IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'C10 : anon/authenticated ne doit avoir AUCUN privilège sur la table de claims';
  END IF;
  -- Le claim reste jouable par le rôle serveur (service_role) :
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
                  WHERE table_schema='public' AND table_name='entitlement_sync_claims'
                    AND grantee='service_role' AND privilege_type='ALL') THEN
    RAISE EXCEPTION 'C10 : service_role doit garder ALL sur la table de claims (l''edge l''écrit)';
  END IF;

  -- C11 : M1c absente — ni aperçus, ni suppressions, ni quotas normalisés ---
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key IN ('daily_horoscope','monthly_horoscope','lucky_days',
                         'planetary_transits','retrograde_alerts',
                         'date_planner','tarot_monthly','tarot_cosmic')
     AND free_preview_quota IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'C11 : % aperçu(s) posé(s) — M1c est interdite jusqu''au 131', v_count;
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.premium_feature_policy
   WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'C11 : les 3 graines mortes doivent exister (suppression = M1c), il en reste %', v_count;
  END IF;
  SELECT daily_quota INTO v_count FROM public.premium_feature_policy
   WHERE feature_key IN ('daily_horoscope','synastry') AND daily_quota IS NOT NULL;
  IF v_count IS NOT NULL THEN
    RAISE EXCEPTION 'C11 : normalisation de quota détectée (M1c) — daily_horoscope/synastry doivent garder leur quota legacy';
  END IF;

  RAISE NOTICE 'juno06 M1a/M2 contract: C1..C11 green (15 classes, 2/7/2 auditées, snapshot intact, synastry=1, alias 130, M2 verrouillée, M1c absente)';
END;
$test$;

ROLLBACK;
