-- =============================================================================
-- JUNO-06 M1a — POSTCONDITIONS de l'exécution POSITIVE (lecture seule).
-- Exécuté sur la base jetable APRÈS le COMMIT de 20260922000001, dans une
-- session psql INDÉPENDANTE (nouvelle connexion). Toute exigence violée =>
-- RAISE => psql ON_ERROR_STOP => exit non nul => CI rouge.
-- Requêtes exclusivement en lecture ; la seule "écriture" est la sonde C8,
-- à l'intérieur d'un bloc EXCEPTION qui la rollback (23502 attendu).
-- =============================================================================

DO $pc$
DECLARE
  -- Snapshot Phase 0 (tier|quota|preview, '' = NULL) — LA référence.
  v_phase0 CONSTANT TEXT[] := ARRAY[
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
  v_classes CONSTANT TEXT[] := ARRAY[
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
  v_audited CONSTANT TEXT[] := ARRAY[
    'natal_chart','conversation_guide','synastry','daily_horoscope',
    'monthly_horoscope','lucky_days','date_planner',
    'planetary_transits','retrograde_alerts','tarot_cosmic','tarot_monthly'
  ];
  v_snap TEXT[];
  v_cls  TEXT[];
  v_n    INTEGER;
BEGIN
  -- PC1 : catalogue toujours 15 lignes --------------------------------------
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy;
  IF v_n <> 15 THEN RAISE EXCEPTION 'PC1 : catalogue = % lignes (attendu 15)', v_n; END IF;

  -- PC2 : tiers/quotas/previews identiques à la Phase 0 ---------------------
  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_snap FROM public.premium_feature_policy;
  IF v_snap <> v_phase0 THEN
    RAISE EXCEPTION 'PC2 : snapshot produit diverge de la Phase 0 : %', v_snap;
  END IF;

  -- PC3 : synastry.free_preview_quota = 1 -----------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.premium_feature_policy
                  WHERE feature_key='synastry' AND free_preview_quota = 1) THEN
    RAISE EXCEPTION 'PC3 : synastry.free_preview_quota <> 1';
  END IF;

  -- PC4 : classifications exactes des 15 clés --------------------------------
  SELECT COALESCE(array_agg(feature_key || '|' || enforcement_class ORDER BY feature_key), '{}')
    INTO v_cls FROM public.premium_feature_policy;
  IF v_cls <> v_classes THEN
    RAISE EXCEPTION 'PC4 : classes divergentes : %', v_cls;
  END IF;

  -- PC5 : compteurs audités exactement 2/7/2 -------------------------------
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class='server_enforced_data';
  IF v_n <> 2 THEN RAISE EXCEPTION 'PC5 : server_enforced_data = % (attendu 2)', v_n; END IF;
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class='server_metered_ui';
  IF v_n <> 7 THEN RAISE EXCEPTION 'PC5 : server_metered_ui = % (attendu 7)', v_n; END IF;
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy
   WHERE feature_key = ANY (v_audited) AND enforcement_class='public_content';
  IF v_n <> 2 THEN RAISE EXCEPTION 'PC5 : public_content = % (attendu 2)', v_n; END IF;

  -- PC6/PC7 : marqueurs legacy ----------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.premium_feature_policy
                  WHERE feature_key='tarot' AND enforcement_class='legacy_alias') THEN
    RAISE EXCEPTION 'PC6 : tarot <> legacy_alias';
  END IF;
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy
   WHERE feature_key IN ('compatibility_details','priority_messages','likes_you_see_who')
     AND enforcement_class='legacy_unused';
  IF v_n <> 3 THEN RAISE EXCEPTION 'PC7 : graines legacy_unused = % (attendu 3)', v_n; END IF;

  -- PC8 : colonne SANS DEFAULT ----------------------------------------------
  IF EXISTS (SELECT 1 FROM pg_attrdef d
              JOIN pg_class c ON c.oid = d.adrelid
              JOIN pg_namespace ns ON ns.oid = c.relnamespace
              JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = d.adnum
             WHERE ns.nspname='public' AND c.relname='premium_feature_policy'
               AND a.attname = 'enforcement_class') THEN
    RAISE EXCEPTION 'PC8 : un DEFAULT existe sur enforcement_class (interdit)';
  END IF;

  -- PC9 : colonne NOT NULL ---------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='premium_feature_policy'
                    AND column_name='enforcement_class' AND is_nullable='NO') THEN
    RAISE EXCEPTION 'PC9 : enforcement_class n''est pas NOT NULL';
  END IF;

  -- PC10 : CHECK présent ----------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.premium_feature_policy'::regclass
                    AND conname='premium_feature_policy_enforcement_class_check') THEN
    RAISE EXCEPTION 'PC10 : CHECK enforcement_class absent';
  END IF;

  -- PC11 : convalidated = true ----------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid='public.premium_feature_policy'::regclass
                    AND conname='premium_feature_policy_enforcement_class_check'
                    AND convalidated) THEN
    RAISE EXCEPTION 'PC11 : CHECK non validé (convalidated = false)';
  END IF;

  -- PC12 : insertion sans classe refusée, SQLSTATE 23502 --------------------
  BEGIN
    INSERT INTO public.premium_feature_policy
      (feature_key, required_tier, daily_quota, free_preview_quota)
    VALUES ('probe_no_class', 'celestial', NULL, NULL);
    RAISE EXCEPTION 'PC12 : l''INSERT sans classe a RÉUSSI (DEFAULT ou NOT NULL absent)';
  EXCEPTION WHEN not_null_violation THEN NULL; -- 23502 attendu
  END;
  -- la sonde n'existe pas (l'échec a tout annulé)
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy
   WHERE feature_key = 'probe_no_class';
  IF v_n <> 0 THEN RAISE EXCEPTION 'PC12 : la sonde sans classe existe'; END IF;

  -- PC13/PC14 : données synthétiques inchangées -----------------------------
  DECLARE
    v_usage_rows INTEGER;
    v_usage_sum  INTEGER;
    v_subs_rows  INTEGER;
  BEGIN
    SELECT COUNT(*), COALESCE(SUM(view_count), 0) INTO v_usage_rows, v_usage_sum
      FROM public.premium_usage;
    IF v_usage_rows <> 3 OR v_usage_sum <> 6 THEN
      RAISE EXCEPTION 'PC13 : premium_usage muté (rows=%, sum=% ; attendu 3, 6)',
        v_usage_rows, v_usage_sum;
    END IF;

    SELECT COUNT(*) INTO v_subs_rows FROM public.subscriptions;
    IF v_subs_rows <> 2 THEN
      RAISE EXCEPTION 'PC14 : subscriptions muté (rows=% ; attendu 2)', v_subs_rows;
    END IF;
  END;

  -- PC15 : M2 absente -------------------------------------------------------
  SELECT COUNT(*) INTO v_n FROM information_schema.tables
   WHERE table_schema='public' AND table_name='entitlement_sync_claims';
  IF v_n <> 0 THEN RAISE EXCEPTION 'PC15 : entitlement_sync_claims existe (M2 hors périmètre)'; END IF;

  -- PC16 : aucune migration enregistrée (M1a seule n'écrit pas l'historique) -
  SELECT COUNT(*) INTO v_n FROM supabase_migrations.schema_migrations;
  IF v_n <> 0 THEN RAISE EXCEPTION 'PC16 : % ligne(s) dans schema_migrations (attendu 0 — repair est un acte opérateur séparé)', v_n; END IF;
END
$pc$;

SELECT 'ALL POSTCONDITIONS PASS (PC1..PC16)' AS verdict;

