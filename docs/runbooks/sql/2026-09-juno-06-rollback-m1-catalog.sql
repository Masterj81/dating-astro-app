-- =============================================================================
-- JUNO-06 — ROLLBACK DÉTERMINISTE de M1 (20260922000001), catalog seulement.
-- 2026-09-23 — PR #70 (documentaire). INSPECTABLE AVANT M1 ; ne contient
-- AUCUNE donnée utilisateur (aucune ligne premium_usage / subscriptions /
-- auth.users n'est lue, écrite ou supprimée).
--
-- DÉTERMINISME : chaque valeur ci-dessous est reconstruite depuis
-- L'HISTORIQUE VERSIONNÉ des migrations (20260419000006 → 20260915000001),
-- pas depuis une capture éphémère. La capture P0-1
-- (2026-09-juno-06-phase0-capture.sql) sert à VÉRIFIER cette reconstruction
-- AVANT M1 : toute divergence = ARRÊT (JUNO-15 : le dépôt n'est pas
-- forcément l'état).
--
-- ⚠ UNE DÉCISION EXPLICITE REQUISE — `synastry.free_preview_quota` :
--   20260915000001 l'a posée à 1 (le rollback vers NULL y est documenté
--   comme OPÉRATIONNEL, exécuté à la main, jamais par une migration).
--   Ce script restaure la valeur HISTORIQUE = 1 ci-dessous. Si votre
--   capture P0-1 montre NULL, changez CETTE ligne avant d'exécuter —
--   c'est le seul point de décision du script, il est volontaire unique.
--
-- PÉRIMÈTRE : M1 uniquement. Le rollback de M2 est un one-liner documenté
-- en tête (DROP TABLE entitlement_sync_claims) ; les edges se retirent par
-- `supabase functions delete`. Les lignes premium_usage écrites entre M1 et
-- ce rollback sont des FAITS de télémétrie : ce script ne les touche pas ;
-- leur sort (garder/archiver+purger) est une décision consignée au rapport
-- d'exécution, jamais silencieuse.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- (M2, si appliquée — HORS périmètre de ce fichier, rappel :
--   DROP TABLE IF EXISTS public.entitlement_sync_claims; )

-- 1) La colonne de classification part avec sa contrainte CHECK.
ALTER TABLE public.premium_feature_policy
  DROP COLUMN IF EXISTS enforcement_class;

-- 2) Restauration EXACTE du catalogue pré-M1 (historique des migrations).
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=50,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='compatibility_details';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=100, free_preview_quota=1,    updated_at=NOW() WHERE feature_key='conversation_guide';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=50,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='daily_horoscope';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=10,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='date_planner';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=50,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='likes_you_see_who';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=NULL,free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='lucky_days';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=NULL,free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='monthly_horoscope';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=NULL,free_preview_quota=1,    updated_at=NOW() WHERE feature_key='natal_chart';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=NULL,free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='planetary_transits';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=100, free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='priority_messages';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=NULL,free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='retrograde_alerts';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=20,  free_preview_quota=1,    updated_at=NOW() WHERE feature_key='synastry';  -- ⚠ DÉCISION : 1 (historique) ou NULL (votre P0-1)
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=10,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='tarot';
UPDATE public.premium_feature_policy SET required_tier='cosmic',    daily_quota=10,  free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='tarot_cosmic';
UPDATE public.premium_feature_policy SET required_tier='celestial', daily_quota=NULL,free_preview_quota=NULL, updated_at=NOW() WHERE feature_key='tarot_monthly';

-- 3) Les graines mortes supprimées par M1 re-sèment à leurs valeurs
--    d'origine (20260419000006) — restauration d'état, pas une décision
--    produit (leur re-suppression éventuelle appartient à M1c).
INSERT INTO public.premium_feature_policy (feature_key, required_tier, daily_quota, free_preview_quota)
VALUES ('compatibility_details','celestial',50,NULL),
       ('priority_messages','celestial',100,NULL),
       ('likes_you_see_who','celestial',50,NULL)
ON CONFLICT (feature_key) DO NOTHING;

-- 4) AUTO-VÉRIFICATION (règle maison 20260903000003) : le catalogue restauré
--    doit être EXACTEMENT l'attendu, sinon le rollback refuse de committer.
DO $$
DECLARE
  v_expected CONSTANT TEXT[] := ARRAY[
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
    'synastry|celestial|20|1',           -- ⚠ suivre la décision du point 2
    'tarot|cosmic|10|',
    'tarot_cosmic|cosmic|10|',
    'tarot_monthly|celestial||'
  ];
  v_actual TEXT[];
  v_missing TEXT;
BEGIN
  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_actual
    FROM public.premium_feature_policy;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'Rollback M1 : catalogue restauré ≠ attendu. Obtenu : %', v_actual;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='premium_feature_policy'
                AND column_name='enforcement_class') THEN
    RAISE EXCEPTION 'Rollback M1 : la colonne enforcement_class existe encore';
  END IF;
END;
$$;

COMMIT;
\echo '===== ROLLBACK M1 TERMINÉ : catalogue restauré à l''état pré-M1 (vérifié). ====='
