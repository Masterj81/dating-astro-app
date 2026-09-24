-- =============================================================================
-- JUNO-06 M1a — fixture PostgreSQL JETABLE, fidèle et SYNTHÉTIQUE (2026-09-24).
-- Exécuté par scripts/m1a-pg/run-m1a-pipeline.sh sur une base vide dédiée
-- (CI: service postgres:17.11@sha256:… ; local: cluster 17.11 jetable).
--
-- PÉRIMÈTRE EXPLICITEMENT BORNÉ À M1a : exactement les objets que
-- 20260922000001 lit — et rien d'autre. On ne rejoue PAS l'historique des
-- migrations (certaines ont des effets externes ou dépendent de secrets).
--
-- FIDÉLITÉ : types réels, PK réelle, CHECK required_tier réel (copiés de
-- 20260419000006), colonne free_preview_quota (20260823000001), et les 15
-- lignes EXACTES de la Phase 0 (capture Production 2026-09-23 — valeurs
-- catalogue uniquement, aucune donnée utilisateur ; l'identité du projet
-- vit dans le runbook d'activation, pas ici). scripts/validate-m1a-
-- pipeline.mjs compare ce fixture au snapshot encodé dans la migration :
-- toute divergence fait échouer la CI.
--
-- SYNTHÉTIQUE : aucun UUID réel (des UUID fixes explicites), aucun courriel,
-- aucun abonnement, aucun secret. Les quelques lignes premium_usage /
-- subscriptions servent uniquement à prouver l'absence de mutation.
-- =============================================================================

-- L'objet métier lu par M1a (schéma réel, contraintes réelles) --------------
CREATE TABLE public.premium_feature_policy (
  feature_key   TEXT PRIMARY KEY,
  required_tier TEXT NOT NULL CHECK (
    required_tier IN ('free', 'celestial', 'cosmic', 'premium', 'premium_plus')
  ),
  daily_quota        INTEGER,     -- NULL = illimité pour le tier requis
  free_preview_quota INTEGER,     -- posée par 20260823000001
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Les 15 lignes de la Phase 0, exactement (tier, quota, preview) -----------
INSERT INTO public.premium_feature_policy
  (feature_key, required_tier, daily_quota, free_preview_quota)
VALUES
  ('compatibility_details', 'celestial', 50,   NULL),
  ('conversation_guide',    'celestial', 100,  1),
  ('daily_horoscope',       'celestial', 50,   NULL),
  ('date_planner',          'cosmic',    10,   NULL),
  ('likes_you_see_who',     'celestial', 50,   NULL),
  ('lucky_days',            'cosmic',    NULL, NULL),
  ('monthly_horoscope',     'cosmic',    NULL, NULL),
  ('natal_chart',           'celestial', NULL, 1),
  ('planetary_transits',    'cosmic',    NULL, NULL),
  ('priority_messages',     'celestial', 100, NULL),
  ('retrograde_alerts',     'cosmic',    NULL, NULL),
  ('synastry',              'celestial', 20,   1),
  ('tarot',                 'cosmic',    10,   NULL),
  ('tarot_cosmic',          'cosmic',    10,   NULL),
  ('tarot_monthly',         'celestial', NULL, NULL);

-- Tables métier : SEULES colonnes référencées par M1a (comptages) ----------
CREATE TABLE public.premium_usage (
  user_id         UUID        NOT NULL,
  feature_key     TEXT        NOT NULL,
  usage_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  view_count      INTEGER     NOT NULL DEFAULT 0,
  last_granted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, feature_key, usage_date)
);

CREATE TABLE public.subscriptions (
  user_id    UUID    NOT NULL,
  source     TEXT    NOT NULL,
  tier       TEXT,
  status     TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, source)
);

-- Quelques lignes synthétiques (preuve d'absence de mutation) --------------
-- UUID volontairement fixes et unmistakablement synthetic.
INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count, last_granted_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'natal_chart',        DATE '2026-09-01', 3, NOW()),
  ('22222222-2222-4222-8222-222222222222', 'conversation_guide', DATE '2026-09-02', 1, NOW()),
  ('33333333-3333-4333-8333-333333333333', 'tarot',              DATE '2026-09-03', 2, NOW());

INSERT INTO public.subscriptions (user_id, source, tier, status, expires_at)
VALUES
  ('44444444-4444-4444-8444-444444444444', 'play_store', 'celestial', 'active',   NOW() + INTERVAL '30 days'),
  ('55555555-5555-4555-8555-555555555555', 'play_store', 'cosmic',    'expired',  NOW() - INTERVAL '10 days');

-- L'historique des migrations, VIDE : M1a seule ne doit RIEN y écrire ------
-- (l'enregistrement réel passe par `migration repair`, jamais par la
-- migration elle-même — postcondition PC15 ci-dessous).
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations (
  version TEXT PRIMARY KEY,
  name    TEXT
);
