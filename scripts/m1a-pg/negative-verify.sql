-- =============================================================================
-- JUNO-06 M1a — VÉRIFICATION POST-ÉCHEC (exécution NÉGATIVE, lecture seule).
-- Exécuté après qu'une exécution de 20260922000001 a ÉCHOUÉ (catalogue
-- divergent semé par le scénario), dans une session psql INDÉPENDANTE.
-- Prouve que RIEN n'a survécu à l'échec. Les checks SPÉCIFIQUES au scénario
-- (divergence toujours présente, nombre de lignes exact) sont exécutés par
-- le runner sous forme de requêtes -c séparées.
-- =============================================================================

DO $nv$
DECLARE
  v_usage_rows INTEGER;
  v_usage_sum  INTEGER;
  v_subs_rows  INTEGER;
  v_n          INTEGER;
BEGIN
  -- NV1 : la colonne enforcement_class est ABSENTE (aucune mutation partielle)
  SELECT COUNT(*) INTO v_n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='premium_feature_policy'
     AND column_name='enforcement_class';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'NV1 : enforcement_class existe après un échec — mutation partielle !';
  END IF;

  -- NV2 : la table n'a été ni vidée ni amputée (le scénario re-vérifie le
  --        compte exact et la divergence semée, via le runner).
  SELECT COUNT(*) INTO v_n FROM public.premium_feature_policy;
  IF v_n < 14 THEN
    RAISE EXCEPTION 'NV2 : catalogue amputé par l''exécution échouée (% lignes)', v_n;
  END IF;

  -- NV3 : tables métier inchangées (lignes synthétiques du fixture).
  SELECT COUNT(*), COALESCE(SUM(view_count), 0) INTO v_usage_rows, v_usage_sum
    FROM public.premium_usage;
  IF v_usage_rows <> 3 OR v_usage_sum <> 6 THEN
    RAISE EXCEPTION 'NV3 : premium_usage muté (rows=%, sum=% ; attendu 3, 6)',
      v_usage_rows, v_usage_sum;
  END IF;
  SELECT COUNT(*) INTO v_subs_rows FROM public.subscriptions;
  IF v_subs_rows <> 2 THEN
    RAISE EXCEPTION 'NV3 : subscriptions muté (rows=% ; attendu 2)', v_subs_rows;
  END IF;

  -- NV4 : aucune migration enregistrée.
  SELECT COUNT(*) INTO v_n FROM supabase_migrations.schema_migrations;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'NV4 : % ligne(s) dans schema_migrations après un échec', v_n;
  END IF;
END
$nv$;

SELECT 'NEGATIVE VERIFY PASS (rien n''a survécu à l''échec)' AS verdict;
