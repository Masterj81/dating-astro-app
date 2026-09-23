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
-- LA SORTIE EST LA SOURCE DE VÉRITÉ DE LA MATRICE
-- (docs/runbooks/juno-06-backend-activation-2026-09.md §2) :
--   - toute divergence avec la colonne « attendu » = ARRÊT avant M1
--     (leçon JUNO-15 : le dépôt n'est pas forcément l'état) ;
--   - la divergence CONNUE à surveiller en premier : `synastry`.
--     free_preview_quota — 20260915000001 l'a posée à 1 (rollback
--     opérationnel documenté vers NULL, aucune migration ne l'exécute) ;
--     20260922000001 asserte NULL. Si la capture montre 1, M1 s'auto-refuse
--     et le choix NULL-ou-1 doit être pris explicitement (voir §2).
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

\echo '===== P0-1a : catalogue complet (trié) — source de vérité du rollback ====='
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

\echo '===== P0-1c : contraintes existantes sur la table (CHECK/UNIQUE à connaître avant M1) ====='
SELECT conname, pg_get_constraintdef(oid) AS definition
  FROM pg_constraint
 WHERE conrelid = 'public.premium_feature_policy'::regclass
 ORDER BY conname;

ROLLBACK;
\echo '===== PHASE 0 TERMINÉE (ROLLBACK — rien écrit). Archiver la sortie. ====='

-- Commandes accompagnatrices (hors SQL, lecture seule, noms seulement) :
--   supabase functions list --project-ref "$REF"
--     -> les deux edges sync-entitlement / premium-tarot-reading ABSENTS
--   supabase secrets list --project-ref "$REF" | Select-String REVENUECAT_API_KEY
--     -> ATTENDU : le nom existe (backfill-revenuecat l'utilise déjà).
--        NE JAMAIS afficher la valeur.
