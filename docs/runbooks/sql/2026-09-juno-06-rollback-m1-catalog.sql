-- =============================================================================
-- JUNO-06 — ROLLBACK DÉTERMINISTE de M1a (20260922000001, classification).
-- 2026-09-23 — réécrit pour le découpage M1a : la migration étant
-- STRICTEMENT ADDITIVE (aucune valeur produit touchée — prouvé par son
-- propre self-check en base), son rollback est exactement l'inverse :
-- retirer la colonne. Le catalogue n'a JAMAIS bougé, il n'y a RIEN à
-- restaurer — l'auto-vérification ci-dessous le PROUVE au lieu de le
-- supposer (snapshot Phase 0 inchangé, 15 lignes, synastry p=1), pour que
-- ce script ne masque jamais une mutation qui viendrait d'ailleurs.
--
-- INSPECTABLE AVANT M1a ; sans AUCUNE donnée utilisateur (aucune ligne
-- premium_usage / subscriptions / auth.users n'est lue ni écrite).
-- Les marqueurs updated_at posés par M1a ne sont pas revenus en arrière :
-- c'est une métadonnée, la décision produit 2026-09-23 l'exclut du contrat.
--
-- M2 (20260922000002) se roule indépendamment :
--   DROP TABLE IF EXISTS public.entitlement_sync_claims;
-- Les edges se retirent par `supabase functions delete` (aucun client
-- installé ne les appelle). Les lignes premium_usage écrites entre temps
-- sont des faits de télémétrie : jamais touchées par ce script ; leur sort
-- est une décision consignée au rapport d'exécution.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- 1) Retirer la colonne (et sa contrainte, partie avec elle).
ALTER TABLE public.premium_feature_policy
  DROP COLUMN IF EXISTS enforcement_class;

-- 2) Auto-vérification (règle maison 20260903000003) : le catalogue PRODUIT
--    est exactement le snapshot Phase 0 — c'est la preuve que le rollback
--    retire la classification SANS rien avoir à restaurer, et que rien
--    d'autre n'a muté le catalogue entre-temps.
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
    'synastry|celestial|20|1',
    'tarot|cosmic|10|',
    'tarot_cosmic|cosmic|10|',
    'tarot_monthly|celestial||'
  ];
  v_actual TEXT[];
BEGIN
  SELECT COALESCE(array_agg(feature_key || '|' || required_tier || '|' ||
         COALESCE(daily_quota::text,'') || '|' ||
         COALESCE(free_preview_quota::text,'') ORDER BY feature_key), '{}')
    INTO v_actual
    FROM public.premium_feature_policy;

  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'Rollback M1a : le catalogue ≠ snapshot Phase 0 — une mutation produit a eu lieu par ailleurs, NE PAS continuer à aveugle. Obtenu : %', v_actual;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='premium_feature_policy'
                AND column_name='enforcement_class') THEN
    RAISE EXCEPTION 'Rollback M1a : la colonne enforcement_class existe encore';
  END IF;
END;
$$;

COMMIT;
\echo '===== ROLLBACK M1a TERMINÉ : classification retirée, catalogue produit prouvé intact. ====='
