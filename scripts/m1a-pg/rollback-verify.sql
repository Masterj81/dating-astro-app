-- =============================================================================
-- JUNO-06 M1a — VÉRIFICATION DU ROLLBACK (lecture seule).
-- Exécuté après : bootstrap Phase 0 → M1a appliquée avec succès → script de
-- rollback exécuté (docs/runbooks/sql/2026-09-juno-06-rollback-m1-catalog.sql).
-- Prouve : colonne supprimée, catalogue revenu EXACTEMENT au snapshot Phase 0,
-- tables métier inchangées. (Le rollback n'est JAMAIS exécuté en Production
-- pendant cette mission.)
-- =============================================================================

DO $rv$
DECLARE
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
  v_usage_rows INTEGER;
  v_usage_sum  INTEGER;
  v_subs_rows  INTEGER;
  v_n          INTEGER;
  v_snap       TEXT[];
BEGIN
  -- RV1 : la colonne est supprimée
  SELECT COUNT(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='premium_feature_policy'
     AND column_name='enforcement_class';
  IF v_n <> 0 THEN RAISE EXCEPTION 'RV1 : enforcement_class existe encore'; END IF;

  -- RV2 : le catalogue est revenu EXACTEMENT au snapshot Phase 0
  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_snap FROM public.premium_feature_policy;
  IF v_snap <> v_phase0 THEN
    RAISE EXCEPTION 'RV2 : catalogue ≠ Phase 0 après rollback : %', v_snap;
  END IF;

  -- RV3 : tables métier inchangées
  SELECT COUNT(*), COALESCE(SUM(view_count), 0) INTO v_usage_rows, v_usage_sum
    FROM public.premium_usage;
  IF v_usage_rows <> 3 OR v_usage_sum <> 6 THEN
    RAISE EXCEPTION 'RV3 : premium_usage muté (rows=%, sum=%)', v_usage_rows, v_usage_sum;
  END IF;
  SELECT COUNT(*) INTO v_subs_rows FROM public.subscriptions;
  IF v_subs_rows <> 2 THEN
    RAISE EXCEPTION 'RV3 : subscriptions muté (rows=%)', v_subs_rows;
  END IF;
END
$rv$;

SELECT 'ROLLBACK VERIFY PASS (catalogue = Phase 0 exact)' AS verdict;
