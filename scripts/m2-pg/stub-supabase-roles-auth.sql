-- =============================================================================
-- JUNO-06 M2 — étage jetable : les trois faits Supabase que le fixture
-- Phase 0 n'a pas (2026-09-24). Exécuté par scripts/m2-pg/run-m2-pipeline.sh
-- APRÈS bootstrap-phase0.sql + M1a et AVANT 20260922000002, sur une base
-- dédiée (CI: service postgres:17.11@sha256:… ; local: cluster 17.11
-- jetable).
--
-- M2 référence auth.users(id), REVOKE sur anon/authenticated, et son
-- auto-verification exige que service_role tienne la table : sur la
-- Production Supabase, l'ALTER DEFAULT PRIVILEGES du rôle postgres accorde
-- ALL aux trois rôles à la création de toute table de public (c'est le
-- comportement documenté par la leçon 20260911000001). Sans reproduire ces
-- faits ici, M2 échouerait pour des raisons qui n'existent pas en
-- Production. On reproduit donc exactement :
--   1. les rôles anon / authenticated / service_role existent ;
--   2. les default privileges Supabase (ALL sur les tables de public) ;
--   3. auth.users existe (VIDE : le T1 officiel crée son compte synthétique
--      à l'intérieur de sa propre transaction roulée back ; aucune
--      assertion de M2 ou des postconditions ne dépend d'un utilisateur
--      pré-existant).
-- Aucune donnée réelle : aucun UUID, aucun courriel, aucun secret.
-- =============================================================================

-- (1) Les rôles que M2 révoque et celui qu'elle épargne ---------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END;
$$;

-- (2) Les default privileges Supabase : toute table créée ensuite par
-- postgres dans public accorde ALL à anon/authenticated/service_role.
-- C'est ce que M2 retire ensuite à anon/authenticated, et ce que son
-- auto-verification exige de retrouver du côté service_role (quatre
-- has_table_privilege individuels ANDés — la forme « liste » est un OU,
-- et GRANT ALL ne se matérialise jamais en privilege_type = 'ALL' ; leçons
-- 2026-09-24, révision de la migration).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- (3) auth.users minimal (cible de la FK de M2, table du T1 officiel) ------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY
);
