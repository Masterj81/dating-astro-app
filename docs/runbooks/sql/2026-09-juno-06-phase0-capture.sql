-- =============================================================================
-- JUNO-06 — PHASE 0 : capture ÉTAT AVANT MUTATION (2026-09-23).
-- STRICTEMENT LECTURE SEULE. Aucune écriture, aucune DDL, aucune DML.
-- Le script tourne dans une transaction qui se termine par ROLLBACK : même un
-- accident de copier-coller ne peut rien écrire.
--
-- OBJET (autorisation opérateur 2026-09-23) : consigner l'état RÉEL du
-- catalogue de politiques, des objets nouveaux et des volumes de télémétrie,
-- SANS valeurs secrètes et SANS PII (aucune colonne utilisateur n'est lue ;
-- les comptages premium_usage sont des agrégats par feature_key uniquement).
--
-- COMMENT EXÉCUTER (processus revu — jamais db push, JUNO-15) :
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f docs/runbooks/sql/2026-09-juno-06-phase0-capture.sql \
--     | Tee-Object phase0-capture-2026-09-23.txt     # archiver la sortie
--
-- LA SORTIE EST LA SOURCE DE VÉRIFICATION DE LA MATRICE
-- (docs/runbooks/juno-06-backend-activation-2026-09.md §1bis) et des SIX
-- contrôles de concordance post-capture (§1quater) :
--   1. historique distant : 20260922000001/0002 ABSENTES (P0-0) ;
--   2. catalogue réel vs reconstruction historique (P0-1b) ;
--   3. synastry.free_preview_quota = 1 (P0-1d — décision opérateur
--      2026-09-23 : CONSERVER 1, état posé par 20260915000001) ;
--   4. objets M1a/M2 absents (P0-2, P0-3) ;
--   5. agrégats premium_usage (P0-4) ;
--   6. nom REVENUECAT_API_KEY présent, valeur jamais affichée (commandes
--      accompagnatrices en pied de script).
--
-- PURETÉ (vérifiée mécaniquement avant publication — autorisation
-- opérateur 2026-09-23) : ce fichier ne contient QUE des SELECT, les
-- métadonnées transactionnelles BEGIN/ROLLBACK et des directives psql
-- (\set, \echo). Aucun DO, DML, DDL, GRANT/REVOKE, COPY, appel réseau
-- (dblink/net.*), fonction mutante (set_config, pg_sleep) ni cron. Les
-- fonctions utilisées (string_agg, coalesce, COUNT FILTER, CURRENT_DATE,
-- pg_get_constraintdef, ::regclass) sont pures et en lecture catalogue.
--
-- ⚠ RÈGLE ABSOLUE (autorisation 2026-09-23) : si P0-0 montre que
-- 20260922000001 ou 20260922000002 ont été appliquées dans un environnement
-- quelconque — ARRÊT IMMÉDIAT. Modifier une migration fusionnée n'est
-- acceptable QUE parce que la Phase 0 doit prouver qu'elle n'a jamais tourné
-- ; sinon il faudra une MIGRATION CORRECTIVE NOUVELLE, jamais réécrire
-- l'ancienne.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

\echo '===== P0-0 : historique des migrations — les deux JUNO-06 doivent être ABSENTES ====='
SELECT version FROM supabase_migrations.schema_migrations
 WHERE version LIKE '20260922%' ORDER BY version;      -- attendu : 0 ligne
SELECT version FROM supabase_migrations.schema_migrations
 ORDER BY version DESC LIMIT 5;                          -- contexte : 5 dernières appliquées

\echo '===== P0-1a : catalogue complet (trié) — source de la comparaison avec la reconstruction ====='
SELECT feature_key, required_tier, daily_quota, free_preview_quota, updated_at
  FROM public.premium_feature_policy
 ORDER BY feature_key;

\echo '===== P0-1b : forme compacte une-ligne (comparaison rapide à la matrice) ====='
SELECT string_agg(feature_key || '=' || coalesce(required_tier,'?')
       || '/q' || coalesce(daily_quota::text,'NULL')
       || '/p' || coalesce(free_preview_quota::text,'NULL'),
       ' ' ORDER BY feature_key) AS catalog_compact
  FROM public.premium_feature_policy;

\echo '===== P0-2 : la colonne enforcement_class doit être ABSENTE (avant M1) ====='
SELECT COUNT(*) AS enforcement_class_columns
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'premium_feature_policy'
   AND column_name = 'enforcement_class';          -- attendu 0

\echo '===== P0-3 : la table de claim doit être ABSENTE (avant M2) ====='
SELECT COUNT(*) AS claim_tables
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'entitlement_sync_claims';  -- attendu 0

\echo '===== P0-4 : volumes premium_usage par clé (agrégat, aucune PII) ====='
SELECT feature_key, COUNT(*) AS rows,
       COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS rows_today
  FROM public.premium_usage
 GROUP BY feature_key
 ORDER BY feature_key;

\echo '===== P0-4b : baseline subscriptions (comptages agrégés uniquement) ====='
SELECT source, tier, status, COUNT(*) AS rows
  FROM public.subscriptions
 GROUP BY source, tier, status
 ORDER BY source, tier, status;

\echo '===== P0-1c : contraintes existantes sur la table (CHECK/UNIQUE à connaître avant M1a) ====='
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.premium_feature_policy'::regclass
 ORDER BY conname;

\echo '===== P0-1d : synastry — LA décision ratifiée : free_preview_quota = 1 ====='
SELECT feature_key, free_preview_quota,
       CASE WHEN feature_key = 'synastry' AND free_preview_quota = 1
            THEN 'OK — conforme à la décision (conserver 1)'
            ELSE 'DIVERGENCE — arrêt avant toute migration' END AS verdict
  FROM public.premium_feature_policy
 WHERE feature_key = 'synastry';                -- attendu : 1 / OK

ROLLBACK;
\echo '===== PHASE 0 TERMINÉE (ROLLBACK — rien écrit). Archiver la sortie. ====='

-- Commandes accompagnatrices (hors SQL, lecture seule, noms seulement) :
--   supabase functions list --project-ref "$REF"
--     -> les deux edges sync-entitlement / premium-tarot-reading ABSENTS
--   supabase secrets list --project-ref "$REF" | Select-String REVENUECAT_API_KEY
--     -> ATTENDU : le nom existe (backfill-revenuecat l'utilise déjà).
--        NE JAMAIS afficher la valeur.
