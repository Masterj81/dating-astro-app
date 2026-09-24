-- =============================================================================
-- JUNO-06 M2 — POSTCONDITIONS PRODUCTION, LECTURE SEULE (2026-09-24).
-- À exécuter sur le projet Production (référence : runbook
-- juno-06-backend-activation-2026-09.md) APRÈS 20260922000002, dans une
-- NOUVELLE session psql (jamais celle qui a appliqué la migration).
-- Lecture seule. Aucune commande psql meta, aucun DDL/DML, aucune fonction
-- mutante, aucun secret. Toute ligne FAIL = arrêt immédiat et rapport —
-- jamais de repair improvisé (le repair est un acte séparé, autorisé à
-- part).
-- =============================================================================

-- Q1 : la table existe ------------------------------------------------------
SELECT 'Q1 table présente' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

-- Q2 : EXACTEMENT les trois colonnes techniques — rien de plus -------------
SELECT 'Q2 colonnes = {created_at,last_sync_at,user_id} seulement' AS check,
       'created_at,last_sync_at,user_id' AS expected,
       string_agg(column_name, ',' ORDER BY column_name) AS found,
       CASE WHEN string_agg(column_name, ',' ORDER BY column_name) = 'created_at,last_sync_at,user_id'
            THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

-- Q2b : aucune colonne métier (tiers/statut/expiration/produit) ------------
SELECT 'Q2b zéro colonne tier/status/expires/provider_*' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND column_name IN ('tier','status','expires_at','provider_subscription_id',
                      'provider_customer_id','product_id','price_id');

-- Q3 : typage TIMESTAMPTZ NOT NULL pour les deux horodatages ---------------
SELECT 'Q3 typage TIMESTAMPTZ NOT NULL (2)' AS check,
       2 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 2 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND column_name IN ('last_sync_at','created_at')
  AND data_type = 'timestamp with time zone' AND is_nullable = 'NO';

-- Q4 : PK = user_id seul (le verrou par compte des deux bras) ---------------
SELECT 'Q4 PK sur user_id seul' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_index i
JOIN pg_class c ON c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'entitlement_sync_claims'
  AND i.indisprimary
  AND i.indkey[0] = (SELECT a.attnum FROM pg_attribute a
                     JOIN pg_class cc ON cc.oid = a.attrelid
                     JOIN pg_namespace nn ON nn.oid = cc.relnamespace
                     WHERE nn.nspname = 'public' AND cc.relname = 'entitlement_sync_claims'
                       AND a.attname = 'user_id' AND a.attnum > 0 AND NOT a.attisdropped);

-- Q5 : FK vers auth.users(id) ON DELETE CASCADE -----------------------------
SELECT 'Q5 FK auth.users ON DELETE CASCADE' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_constraint
WHERE conrelid = 'public.entitlement_sync_claims'::regclass
  AND contype = 'f' AND confdeltype = 'c'
  AND confrelid = 'auth.users'::regclass;

-- Q6 : RLS activée -----------------------------------------------------------
SELECT 'Q6 RLS activée' AS check,
       't' AS expected, relrowsecurity::text AS found,
       CASE WHEN relrowsecurity THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_class
WHERE oid = 'public.entitlement_sync_claims'::regclass;

-- Q7 : ZÉRO policy (RLS sans policy = aucun accès client) ------------------
SELECT 'Q7 zéro policy' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'entitlement_sync_claims';

-- Q8 : ZÉRO privilège anon/authenticated (REVOKE effectif) -----------------
SELECT 'Q8 zéro privilège anon/authenticated' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND grantee IN ('anon','authenticated');

-- Q9 : service_role = usage complet (le edge possède sa table) ------------
-- Sondes individuelles ANDées : la forme « liste » de has_table_privilege
-- est un OU (vraie si N'IMPORTE LEQUEL est tenu — leçon du canari C2,
-- 2026-09-24) ; information_schema.table_privileges ne liste jamais 'ALL'.
-- C'EST CETTE FORME que la migration 002 exige côté self-check.
SELECT 'Q9 service_role = usage complet (SELECT,INSERT,UPDATE,DELETE)' AS check,
       't' AS expected,
       (has_table_privilege('service_role','public.entitlement_sync_claims','SELECT')
    AND has_table_privilege('service_role','public.entitlement_sync_claims','INSERT')
    AND has_table_privilege('service_role','public.entitlement_sync_claims','UPDATE')
    AND has_table_privilege('service_role','public.entitlement_sync_claims','DELETE'))::text AS found,
       CASE WHEN (has_table_privilege('service_role','public.entitlement_sync_claims','SELECT')
              AND has_table_privilege('service_role','public.entitlement_sync_claims','INSERT')
              AND has_table_privilege('service_role','public.entitlement_sync_claims','UPDATE')
              AND has_table_privilege('service_role','public.entitlement_sync_claims','DELETE'))
            THEN 'OK' ELSE 'FAIL' END AS ok;

-- Q10 : M2 n'a PAS écrit dans l'historique (002 absent AVANT le repair) ---
SELECT 'Q10 schema_migrations sans 002 (pre-repair)' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM supabase_migrations.schema_migrations
WHERE version = '20260922000002';

-- Q11 : métier inchangé (comparer à P6 capturé avant) ----------------------
SELECT 'Q11 compteurs après M2 (comparer à P6)' AS check,
       'identique à P6' AS expected,
       (SELECT COUNT(*) FROM public.premium_usage)::text || ' / ' ||
       (SELECT COUNT(*) FROM public.subscriptions)::text AS found,
       'comparaison opérateur' AS ok;

-- Q12 : M1a survit à M2 -----------------------------------------------------
SELECT 'Q12 M1a toujours conforme (NOT NULL, sans DEFAULT)' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'premium_feature_policy'
  AND c.column_name = 'enforcement_class' AND c.is_nullable = 'NO'
  AND NOT EXISTS (SELECT 1 FROM pg_attrdef d
                  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                  WHERE d.adrelid = 'public.premium_feature_policy'::regclass
                    AND a.attname = 'enforcement_class');

SELECT 'Q12b catalogue toujours 15 ; classes 2/7/2 ; legacy 4' AS check,
       '15;2;7;2;4' AS expected,
       COUNT(*)::text || ';' ||
       COUNT(*) FILTER (WHERE enforcement_class = 'server_enforced_data')::text || ';' ||
       COUNT(*) FILTER (WHERE enforcement_class = 'server_metered_ui')::text || ';' ||
       COUNT(*) FILTER (WHERE enforcement_class = 'public_content')::text || ';' ||
       COUNT(*) FILTER (WHERE enforcement_class IN ('legacy_alias','legacy_unused'))::text AS found,
       CASE WHEN COUNT(*) = 15
             AND COUNT(*) FILTER (WHERE enforcement_class = 'server_enforced_data') = 2
             AND COUNT(*) FILTER (WHERE enforcement_class = 'server_metered_ui') = 7
             AND COUNT(*) FILTER (WHERE enforcement_class = 'public_content') = 2
             AND COUNT(*) FILTER (WHERE enforcement_class IN ('legacy_alias','legacy_unused')) = 4
            THEN 'OK' ELSE 'FAIL' END AS ok
FROM public.premium_feature_policy;

-- Q13 : contenu de la table : 0 ligne (aucun claim avant le déploiement
-- de sync-entitlement — T1/T2 non déployés) --------------------------------
SELECT 'Q13 zéro ligne de claim (edge non déployé)' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ANALYSER' END AS ok
FROM public.entitlement_sync_claims;
