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

-- (3) auth.users minimal (cible de la FK de M2, table du T1/T2 officiel) ----
-- T2 insère un compte de test avec les colonnes Supabase réelles.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY
);

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id       TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS aud               TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS role              TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email             TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password TEXT;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ;

-- (4) Fonctions plateforme auth.uid()/auth.role() — définitions standard
-- Supabase (le JWT de test est posé par T2 via set_config('request.jwt.claims')).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT
LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::json ->> 'role', '')::text $$;

-- (5) Dépendances de enforce_premium_feature — CORPS EXACTS copiés des
-- migrations réelles (aucune simplification) :
--   get_effective_subscription : 20260312_unified_subscriptions.sql (ÉTAPE 7)
--   get_user_tier (gardes auth) : 20260413000002_security_hardening.sql
--   tier_at_least (search_path): 20260425_fix_tier_at_least_search_path.sql
-- enforce_premium_feature v2 (fenêtre de rejeu) vient, LUI, du fichier
-- OFFICIEL 20260823000001 exécuté tel quel par le pipeline — jamais copié.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN;

CREATE OR REPLACE FUNCTION public.get_effective_subscription(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  source TEXT,
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.tier,
    s.status,
    s.source,
    s.expires_at,
    s.cancel_at_period_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ORDER BY
    CASE s.tier
      WHEN 'premium_plus' THEN 2
      WHEN 'premium' THEN 1
      ELSE 0
    END DESC,
    s.expires_at DESC NULLS LAST
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- service_role (webhooks, edge functions) can query any user
    WHEN auth.role() = 'service_role' THEN
      COALESCE((SELECT tier FROM public.get_effective_subscription(p_user_id)), 'free')
    -- authenticated users can only query their own tier
    WHEN auth.uid() = p_user_id THEN
      COALESCE((SELECT tier FROM public.get_effective_subscription(p_user_id)), 'free')
    ELSE 'free'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tier_at_least(p_actual TEXT, p_required TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_required IS NULL OR p_required = 'free' THEN TRUE
    WHEN p_required IN ('celestial', 'premium') THEN
      p_actual IN ('celestial', 'cosmic', 'premium', 'premium_plus')
    WHEN p_required IN ('cosmic', 'premium_plus') THEN
      p_actual IN ('cosmic', 'premium_plus')
    ELSE FALSE
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tier_at_least(TEXT, TEXT) TO authenticated;
