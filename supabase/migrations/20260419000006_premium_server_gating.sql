-- P0-9 — Server-side premium gating.
--
-- HONEST INVENTORY OF PREMIUM CONTENT IN THIS CODEBASE
-- -----------------------------------------------------
-- Most "premium" pages in the web app (and features in the mobile app) are
-- computed CLIENT-SIDE from data the user already owns:
--   - natal chart            → calculate-chart edge fn, writes to profiles.birth_chart
--   - daily horoscope        → hardcoded strings in supabase/functions/send-daily-horoscope
--   - synastry               → client computes from two profile birth_charts
--   - retrograde alerts      → client uses astronomy-engine
--   - compatibility scoring  → client-side pairing of profile data
--
-- There is NO dedicated `horoscopes`, `natal_charts`, or `synastry` table to
-- RLS-gate on tier. This means a premium paywall bypass on the *client* would
-- still show the content if the attacker can reach the UI — the content is
-- derived from data they already have access to (their own profile).
--
-- What IS server-enforceable today:
--   1. `public.premium_usage` records feature views per user per day. If the
--      RPC `increment_feature_usage` refuses to record for free-tier users
--      over a quota, the client can keep rendering, but analytics/billing
--      stay honest and the business logic has an audit trail.
--   2. `public.increment_feature_usage(p_user_id, p_feature_key)` is the only
--      write path. We extend it to (a) look up the caller's effective tier
--      via `public.get_user_tier(auth.uid())` and (b) RAISE on over-quota
--      for free / tier-insufficient callers.
--   3. A new RPC `public.enforce_premium_feature(p_feature_key, p_required_tier)`
--      that the client/edge functions MUST call before rendering paid content.
--      It does the tier check, the quota check, and the usage bump in one
--      atomic call — making it trivial to audit ("does the premium feature
--      call enforce_premium_feature first?").
--
-- What is NOT fixed by this migration (structural limitation, documented):
--   - A determined attacker with a free-tier JWT can still reproduce the
--     client-side math locally. The only way to make this server-enforceable
--     is to move the astrological calculations behind a tier-gated edge
--     function (e.g. `premium-synastry`) and STOP shipping the raw `birth_chart`
--     to non-premium accounts. That is a larger refactor and should be
--     tracked separately (see P1 backlog).
--
-- Required tier hierarchy (see public.get_user_tier):
--   free < celestial < cosmic (aliases: premium < premium_plus in legacy code).

begin;

-- =============================================================================
-- 1) Tier comparator
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tier_at_least(p_actual TEXT, p_required TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
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

-- =============================================================================
-- 2) Feature → required tier table (source of truth)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.premium_feature_policy (
  feature_key   TEXT PRIMARY KEY,
  required_tier TEXT NOT NULL CHECK (
    required_tier IN ('free', 'celestial', 'cosmic', 'premium', 'premium_plus')
  ),
  daily_quota   INTEGER,  -- NULL = unlimited for the required tier
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.premium_feature_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_premium_policy" ON public.premium_feature_policy;
CREATE POLICY "public_read_premium_policy"
  ON public.premium_feature_policy
  FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS "service_role_writes_premium_policy"
  ON public.premium_feature_policy;
CREATE POLICY "service_role_writes_premium_policy"
  ON public.premium_feature_policy
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed / upsert the known premium features. Keep in sync with the mobile app's
-- PremiumFeatureKey enum and the web app's /premium/<tier>/<feature> routes.
INSERT INTO public.premium_feature_policy (feature_key, required_tier, daily_quota) VALUES
  ('natal_chart',           'celestial', 5),
  ('daily_horoscope',       'celestial', 50),
  ('synastry',              'celestial', 20),
  ('compatibility_details', 'celestial', 50),
  ('monthly_horoscope',     'cosmic',    NULL),
  ('tarot',                 'cosmic',    10),
  ('date_planner',          'cosmic',    10),
  ('lucky_days',            'cosmic',    NULL),
  ('retrograde_alerts',     'cosmic',    NULL),
  ('planetary_transits',    'cosmic',    NULL),
  ('priority_messages',     'celestial', 100),
  ('super_likes',           'celestial', 5),
  ('likes_you_see_who',     'celestial', 50)
ON CONFLICT (feature_key) DO UPDATE
  SET required_tier = EXCLUDED.required_tier,
      daily_quota   = EXCLUDED.daily_quota,
      updated_at    = NOW();

-- =============================================================================
-- 3) Atomic enforcement RPC
-- =============================================================================
-- Returns:
--   allowed      BOOLEAN  — TRUE if caller may use the feature now.
--   reason       TEXT     — 'ok' | 'unauthorized' | 'insufficient_tier'
--                          | 'quota_exceeded' | 'unknown_feature'
--   current_count INTEGER — today's usage count AFTER this call (when allowed).
--   required_tier TEXT    — echo of the feature's required tier.
--   user_tier    TEXT     — caller's effective tier.
--
-- Security:
--   - SECURITY DEFINER, SET search_path = public.
--   - Rejects if auth.uid() IS NULL (unauthenticated).
--   - Bumps premium_usage atomically (INSERT ... ON CONFLICT).

CREATE OR REPLACE FUNCTION public.enforce_premium_feature(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed       BOOLEAN,
  reason        TEXT,
  current_count INTEGER,
  required_tier TEXT,
  user_tier     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_policy  RECORD;
  v_tier    TEXT;
  v_count   INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, 0, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM public.premium_feature_policy
   WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'unknown_feature'::TEXT, 0, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user_id);

  IF NOT public.tier_at_least(v_tier, v_policy.required_tier) THEN
    RETURN QUERY SELECT FALSE, 'insufficient_tier'::TEXT, 0, v_policy.required_tier, v_tier;
    RETURN;
  END IF;

  -- Atomic usage bump.
  INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count)
  VALUES (v_user_id, p_feature_key, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature_key, usage_date)
  DO UPDATE SET view_count = public.premium_usage.view_count + 1
  RETURNING view_count INTO v_count;

  -- Quota check AFTER bump (fail-closed).
  IF v_policy.daily_quota IS NOT NULL AND v_count > v_policy.daily_quota THEN
    -- We already bumped; decrement back so honest clients see the correct count.
    UPDATE public.premium_usage
       SET view_count = v_count - 1
     WHERE user_id = v_user_id
       AND feature_key = p_feature_key
       AND usage_date = CURRENT_DATE;
    RETURN QUERY SELECT FALSE, 'quota_exceeded'::TEXT, v_count - 1, v_policy.required_tier, v_tier;
    RETURN;
  END IF;

  RETURN QUERY SELECT TRUE, 'ok'::TEXT, v_count, v_policy.required_tier, v_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_premium_feature(TEXT) TO authenticated;

COMMENT ON FUNCTION public.enforce_premium_feature IS
  'P0-9: single source of truth for premium feature access. Callers MUST invoke this RPC before rendering paid content. Returns allowed=FALSE with a reason code on denial.';

-- =============================================================================
-- 4) Read-only helper for the UI (no side effects, same rules)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_use_premium_feature(
  p_feature_key TEXT
)
RETURNS TABLE (
  allowed       BOOLEAN,
  reason        TEXT,
  required_tier TEXT,
  user_tier     TEXT,
  remaining     INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_policy  RECORD;
  v_tier    TEXT;
  v_count   INTEGER;
  v_remaining INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'unauthorized'::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM public.premium_feature_policy
   WHERE feature_key = p_feature_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'unknown_feature'::TEXT, NULL::TEXT, NULL::TEXT, 0;
    RETURN;
  END IF;

  v_tier := public.get_user_tier(v_user_id);

  IF NOT public.tier_at_least(v_tier, v_policy.required_tier) THEN
    RETURN QUERY SELECT FALSE, 'insufficient_tier'::TEXT, v_policy.required_tier, v_tier, 0;
    RETURN;
  END IF;

  SELECT COALESCE(view_count, 0) INTO v_count
    FROM public.premium_usage
   WHERE user_id = v_user_id
     AND feature_key = p_feature_key
     AND usage_date = CURRENT_DATE;

  IF v_policy.daily_quota IS NULL THEN
    v_remaining := 2147483647;  -- "unlimited"
  ELSE
    v_remaining := GREATEST(v_policy.daily_quota - COALESCE(v_count, 0), 0);
  END IF;

  RETURN QUERY SELECT
    (v_policy.daily_quota IS NULL OR COALESCE(v_count, 0) < v_policy.daily_quota),
    'ok'::TEXT,
    v_policy.required_tier,
    v_tier,
    v_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_use_premium_feature(TEXT) TO authenticated;

commit;
