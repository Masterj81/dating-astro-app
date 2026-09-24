-- =============================================================================
-- JUNO-06 M2 — PRÉCONDITIONS PRODUCTION, LECTURE SEULE (2026-09-24).
-- À exécuter sur le projet Production (référence : runbook
-- juno-06-backend-activation-2026-09.md) AVANT 20260922000002.
-- Chaque requête ne fait que lire. Aucune commande psql meta, aucun
-- DDL/DML, aucune fonction mutante, aucun secret. Chaque ligne retourne
-- (expected, found, ok) : toute ligne à FAIL interdit l'application — arrêt
-- et analyse, jamais de retry automatique.
-- =============================================================================

-- P1 : M1a est enregistrée une fois (repair de l'opérateur, 2026-09-24) ----
SELECT 'P1 M1a enregistrée (1 ligne)' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM supabase_migrations.schema_migrations
WHERE version = '20260922000001';

-- P2 : M2 n'est PAS enregistrée ---------------------------------------------
SELECT 'P2 M2 absente de l''historique' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM supabase_migrations.schema_migrations
WHERE version = '20260922000002';

-- P3 : la table claims n'existe pas déjà (ni résidu, ni double passe) ------
SELECT 'P3 entitlement_sync_claims absente' AS check,
       0 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';

-- P4 : M1a conforme — NOT NULL, SANS DEFAULT, CHECK convalidé --------------
SELECT 'P4a enforcement_class NOT NULL sans DEFAULT' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'premium_feature_policy'
  AND c.column_name = 'enforcement_class' AND c.is_nullable = 'NO'
  AND NOT EXISTS (SELECT 1 FROM pg_attrdef d
                  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                  WHERE d.adrelid = 'public.premium_feature_policy'::regclass
                    AND a.attname = 'enforcement_class');

SELECT 'P4b CHECK convalidé (embedded, validated)' AS check,
       1 AS expected, COUNT(*)::text AS found,
       CASE WHEN COUNT(*) = 1 THEN 'OK' ELSE 'FAIL' END AS ok
FROM pg_constraint
WHERE conrelid = 'public.premium_feature_policy'::regclass
  AND contype = 'c' AND convalidated AND connoinherit = false
  AND pg_get_constraintdef(oid) LIKE '%enforcement_class%';

-- P5 : catalogue — 15 lignes, classes M1a exactes (2/7/2 + 4 legacy) -------
SELECT 'P5 catalogue 15 ; classes 2/7/2 ; legacy 4' AS check,
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

-- P5b : le contenu catalogue n\'a pas bougé depuis M1a (les 15 clés, les
-- quotas tiers et les previews de la Phase 0) -------------------------------
SELECT 'P5b Phase 0 intacte (synastry=celestial/20/1, natal 1/7j)' AS check,
       'synastry|celestial|20|1 ; natal_chart|celestial||1 ; tarot|cosmic|10|' AS expected,
       string_agg(feature_key || '|' || required_tier || '|' ||
                  COALESCE(daily_quota::text,'') || '|' ||
                  COALESCE(free_preview_quota::text,''),
                  ' ; ' ORDER BY feature_key) AS found,
       '' AS ok  -- comparaison visuelle par l'opérateur (16 valeurs attendues)
FROM public.premium_feature_policy
WHERE feature_key IN ('synastry','natal_chart','tarot');

-- P6 : agrégats métier AVANT M2 (à comparer aux postconditions) -----------
SELECT 'P6 compteurs avant M2 (premium_usage / subscriptions)' AS check,
       'capturer' AS expected,
       (SELECT COUNT(*) FROM public.premium_usage)::text || ' / ' ||
       (SELECT COUNT(*) FROM public.subscriptions)::text AS found,
       'à comparer à Q11' AS ok;

-- P7 : aucune divergence inconnue — capture de l'inventaire des tables
-- public, À COMPARER à la capture post-M1a de l'opérateur (2026-09-24).
-- Pas d'allowlist codée en dur : la liste de référence est la capture
-- réelle, jamais une reconstruction de mémoire. P3 couvre le cas M2.
SELECT 'P7a nombre de tables public (comparer à la capture post-M1a)' AS check,
       'capture post-M1a' AS expected, COUNT(*)::text AS found,
       'comparaison opérateur' AS ok
FROM pg_tables WHERE schemaname = 'public';

SELECT 'P7b inventaire complet (comparer à la capture post-M1a)' AS check,
       'identique post-M1a' AS expected,
       string_agg(tablename, ',' ORDER BY tablename) AS found,
       'comparaison opérateur' AS ok
FROM pg_tables WHERE schemaname = 'public';

-- P8 : version du serveur (17.6 attendu — majeure 17, rejeu fait sur 17.11) -
SELECT 'P8 version PostgreSQL' AS check,
       '17.x' AS expected, current_setting('server_version') AS found,
       CASE WHEN current_setting('server_version') LIKE '17.%' THEN 'OK' ELSE 'FAIL' END AS ok;
