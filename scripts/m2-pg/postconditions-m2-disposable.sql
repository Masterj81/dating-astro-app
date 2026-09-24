-- =============================================================================
-- JUNO-06 M2 — POSTCONDITIONS DU REJEU JETABLE (2026-09-24).
-- Exécutées par scripts/m2-pg/run-m2-pipeline.sh juste après 20260922000002.
-- Lecture seule. Chaque requête retourne une ligne (check, expected, found,
-- ok). Aucun \echo, aucun DDL/DML, aucune fonction mutante, aucun secret.
-- Le runner exige : 14 lignes OK, zéro FAIL.
-- =============================================================================

-- D1 : la table existe ------------------------------------------------------
SELECT 'D1 table présente' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

-- D2 : exactement les trois colonnes techniques — rien de plus -------------
SELECT 'D2 colonnes = {user_id,last_sync_at,created_at}' AS check,
       'created_at,last_sync_at,user_id' AS expected,
       string_agg(column_name, ',' ORDER BY column_name) AS found,
       CASE WHEN string_agg(column_name, ',' ORDER BY column_name) = 'created_at,last_sync_at,user_id'
            THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

-- D3 : typage et nullabilité des deux horodatages throttle ------------------
SELECT 'D3 typage TIMESTAMPTZ NOT NULL' AS check,
       2 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 2 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND column_name IN ('last_sync_at', 'created_at')
  AND data_type = 'timestamp with time zone' AND is_nullable = 'NO';

-- D4 : PK = user_id seul (unicité du verrou par compte) ---------------------
SELECT 'D4 PK sur user_id seul' AS check,
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

-- D5 : FK vers auth.users(id) ON DELETE CASCADE -----------------------------
SELECT 'D5 FK auth.users ON DELETE CASCADE' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_constraint
WHERE conrelid = 'public.entitlement_sync_claims'::regclass
  AND contype = 'f' AND confdeltype = 'c'
  AND confrelid = 'auth.users'::regclass;

-- D6 : RLS activée ----------------------------------------------------------
SELECT 'D6 RLS activée' AS check,
       't' AS expected, relrowsecurity::text AS found,
       CASE WHEN relrowsecurity THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_class
WHERE oid = 'public.entitlement_sync_claims'::regclass;

-- D7 : ZÉRO policy (seul service_role, qui bypass RLS, y accède) ------------
SELECT 'D7 zéro policy' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'entitlement_sync_claims';

-- D8 : ZÉRO privilège anon/authenticated (le REVOKE a pris) -----------------
SELECT 'D8 zéro privilège anon/authenticated' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND grantee IN ('anon', 'authenticated');

-- D9 : service_role tient réellement la table (le bras serveur fonctionne).
-- has_table_privilege avec une liste n'est vrai que si le rôle les tient
-- TOUS : information_schema.table_privileges ne liste jamais 'ALL' (leçon
-- 2026-09-24 — c'était la sonde impossible de la première version).
SELECT 'D9 service_role = usage complet (SELECT,INSERT,UPDATE,DELETE)' AS check,
       't' AS expected,
       has_table_privilege('service_role','public.entitlement_sync_claims','SELECT, INSERT, UPDATE, DELETE')::text AS found,
       CASE WHEN has_table_privilege('service_role','public.entitlement_sync_claims','SELECT, INSERT, UPDATE, DELETE')
            THEN 'OK' ELSE 'FAIL' END AS ok;

-- D9b : aucun accès client indirect — AUCUN tiers hors postgres/service_role
-- ne détient le moindre privilège sur la table (couvre aussi un éventuel
-- rôle public ou rôle futur ajouté par défaut).
SELECT 'D9b zéro privilège hors postgres/service_role' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.table_privileges
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims'
  AND grantee NOT IN ('postgres', 'service_role');

-- D10 : la table naît VIDE (aucun edge déployé ; le T1 officiel n'a pas
-- encore tourné à ce stade du pipeline) --------------------------------------
SELECT 'D10 table née vide (0 claim)' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM public.entitlement_sync_claims;

-- D11 : tables métier inchangées par M2 (comptages du fixture) --------------
SELECT 'D11 premium_usage = 3, subscriptions = 2' AS check,
       '3/2' AS expected,
       (SELECT COUNT(*) FROM public.premium_usage)::text || '/' ||
       (SELECT COUNT(*) FROM public.subscriptions)::text AS found,
       CASE WHEN (SELECT COUNT(*) FROM public.premium_usage) = 3
             AND (SELECT COUNT(*) FROM public.subscriptions) = 2
            THEN 'OK' ELSE 'FAIL' END AS ok;

-- D12 : catalogue toujours 15 lignes, classes M1a intactes (2/7/2 + 4) ------
SELECT 'D12 catalogue 15, classes 2/7/2 + 4 legacy' AS check,
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

-- D13 : M2 n'a RIEN écrit dans l'historique (le repair est un acte séparé) --
SELECT 'D13 schema_migrations ne contient PAS 002' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM supabase_migrations.schema_migrations
WHERE version = '20260922000002';

-- D14 : M1a toujours conforme après M2 (NOT NULL, sans DEFAULT) -------------
SELECT 'D14 M1a conforme après M2' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'premium_feature_policy'
  AND c.column_name = 'enforcement_class' AND c.is_nullable = 'NO'
  AND NOT EXISTS (SELECT 1 FROM pg_attrdef d
                  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                  WHERE d.adrelid = 'public.premium_feature_policy'::regclass
                    AND a.attname = 'enforcement_class');
