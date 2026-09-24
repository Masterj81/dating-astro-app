-- =============================================================================
-- JUNO-06 M2 — ROLLBACK DÉTERMINISTE, REVU (2026-09-24).
--
-- Périmètre : supprimer la table créée par 20260922000002, et rien d'autre.
--   - M2 ne crée QU'UNE table ; les grants et la policies en dépendant
--     disparaissent AVEC la table (les ACL colonnes/table sont portées par
--     l'objet) — il n'y a rien d'autre à nettoyer.
--   - M2 ne touche NI subscriptions, NI premium_usage, NI
--     premium_feature_policy : le rollback n'a donc RIEN à y restaurer,
--     et les vérifications D11/D12 ci-dessous le prouvent après coup.
--   - L'historique : M2 n'écrit jamais dans schema_migrations (l'acte de
--     réconciliation est `npx supabase migration repair --status reverted
--     20260922000002`, séparé et réversible, cf. runbook
--     migration-reconciliation-2026-09.md — jamais `db push`).
--
-- CE FICHIER NE DOIT ÊTRE EXÉCUTÉ QUE sur la base JETABLE du rejeu, ou en
-- Production sur décision explicite de l'opérateur, après échec constaté
-- et postconditions analysées. Il se vérifie lui-même après exécution.
-- =============================================================================

DROP TABLE IF EXISTS public.entitlement_sync_claims;

-- Vérification du rollback : la table est partie, le métier est intact ----
SELECT 'R1 table absente après rollback' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

SELECT 'R2 métier intact (3/2/15)' AS check,
       '3/2/15' AS expected,
       (SELECT COUNT(*) FROM public.premium_usage)::text || '/' ||
       (SELECT COUNT(*) FROM public.subscriptions)::text || '/' ||
       (SELECT COUNT(*) FROM public.premium_feature_policy)::text AS found,
       CASE WHEN (SELECT COUNT(*) FROM public.premium_usage) = 3
             AND (SELECT COUNT(*) FROM public.subscriptions) = 2
             AND (SELECT COUNT(*) FROM public.premium_feature_policy) = 15
            THEN 'OK' ELSE 'FAIL' END AS ok;

SELECT 'R3 enforcement_class M1a survit au rollback M2' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'premium_feature_policy'
  AND column_name = 'enforcement_class' AND is_nullable = 'NO'
  AND column_default IS NULL;
