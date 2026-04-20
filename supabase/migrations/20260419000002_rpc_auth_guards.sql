-- P0-2 — Add auth.uid() guards to all SECURITY DEFINER RPCs that accept a
-- p_user_id parameter. These functions run with elevated privileges; an
-- authenticated caller must only be able to query/mutate data for themselves,
-- while the service_role (webhooks, crons, edge functions) keeps full access.
--
-- Shape used for user-facing RPCs:
--   IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
--     RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
--   END IF;
--
-- Rationale: service_role has auth.uid() = NULL, so the check is a no-op for
-- server-to-server calls (cron, webhook handlers). Authenticated JWT callers
-- must have auth.uid() = p_user_id or the call is rejected.
--
-- RPC coverage (see §4 of the security report for the matrix):
--   - get_effective_subscription(UUID)
--   - get_referral_stats(UUID)
--   - get_discoverable_profiles(UUID, INTEGER)
--   - get_user_matches(UUID)
--   - increment_feature_usage(UUID, TEXT)
--
-- Not redefined here:
--   - get_user_tier(UUID)               already guarded (see 20260413_security_hardening.sql)
--   - check_rate_limit / enforce_*      triggers, invoked with NEW.*_id at row-level
--   - notify_*, send_*_email triggers   no p_user_id parameter
--   - schedule_onboarding_emails        trigger, uses NEW.id
--   - handle_new_auth_user_profile      trigger on auth.users
--   - set_referral_code_on_insert       trigger
--   - generate_referral_code            pure helper, no user data

begin;

-- =============================================================================
-- get_effective_subscription(p_user_id UUID)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_effective_subscription(p_user_id UUID)
RETURNS TABLE (
  tier TEXT,
  status TEXT,
  source TEXT,
  expires_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_subscription(UUID) TO authenticated;

-- =============================================================================
-- get_referral_stats(p_user_id UUID)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_referral_stats(p_user_id UUID)
RETURNS TABLE (
  referral_code TEXT,
  total_referrals BIGINT,
  rewarded_referrals BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.referral_code,
    (SELECT count(*) FROM public.referral_redemptions r WHERE r.referrer_id = p_user_id),
    (SELECT count(*) FROM public.referral_redemptions r WHERE r.referrer_id = p_user_id AND r.referrer_rewarded = TRUE)
  FROM public.profiles p
  WHERE p.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_stats(UUID) TO authenticated;

-- =============================================================================
-- get_discoverable_profiles(p_user_id UUID, p_limit INTEGER)
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_discoverable_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id UUID,
  name TEXT,
  age INTEGER,
  sun_sign TEXT,
  moon_sign TEXT,
  rising_sign TEXT,
  bio TEXT,
  image_url TEXT,
  is_verified BOOLEAN,
  has_voice_intro BOOLEAN,
  voice_intro_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.age,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    COALESCE(p.image_url, p.photos[1]) as image_url,
    COALESCE(p.is_verified, false) as is_verified,
    COALESCE(p.has_voice_intro, false) as has_voice_intro,
    p.voice_intro_url
  FROM public.profiles p
  WHERE p.id != p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    AND p.onboarding_completed = true
    AND p.name IS NOT NULL
    AND p.name != ''
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_discoverable_profiles IS
  'Returns discoverable profiles for the discover screen, excluding the current user, already-swiped profiles, and blocked users. Guarded: authenticated callers must pass their own auth.uid().';

-- =============================================================================
-- get_user_matches(p_user_id UUID)
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_user_matches(UUID);

CREATE OR REPLACE FUNCTION public.get_user_matches(p_user_id UUID)
RETURNS TABLE (
  match_id UUID,
  matched_user_id UUID,
  matched_user_name TEXT,
  matched_user_image TEXT,
  matched_user_sun_sign TEXT,
  compatibility_overall INTEGER,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  matched_at TIMESTAMPTZ,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS match_id,
    CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END AS matched_user_id,
    p.name AS matched_user_name,
    COALESCE(p.image_url, p.photos[1]) AS matched_user_image,
    p.sun_sign AS matched_user_sun_sign,
    m.compatibility_overall,
    (
      SELECT msg.content
      FROM public.messages msg
      WHERE msg.match_id = m.id
      ORDER BY msg.created_at DESC
      LIMIT 1
    ) AS last_message,
    m.last_message_at,
    COALESCE(m.matched_at, m.created_at) AS matched_at,
    (
      SELECT COUNT(*)
      FROM public.messages msg
      WHERE msg.match_id = m.id
        AND msg.sender_id != p_user_id
        AND msg.is_read = FALSE
    ) AS unread_count
  FROM public.matches m
  JOIN public.profiles p
    ON p.id = CASE WHEN m.user1_id = p_user_id THEN m.user2_id ELSE m.user1_id END
  WHERE (m.user1_id = p_user_id OR m.user2_id = p_user_id)
    AND m.status = 'active'
  ORDER BY COALESCE(m.last_message_at, m.matched_at, m.created_at) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_matches(UUID) TO authenticated;

-- =============================================================================
-- increment_feature_usage(p_user_id UUID, p_feature_key TEXT)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_feature_usage(p_user_id UUID, p_feature_key TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.premium_usage (user_id, feature_key, usage_date, view_count)
  VALUES (p_user_id, p_feature_key, CURRENT_DATE, 1)
  ON CONFLICT (user_id, feature_key, usage_date)
  DO UPDATE SET view_count = public.premium_usage.view_count + 1
  RETURNING view_count INTO v_count;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_feature_usage(UUID, TEXT) TO authenticated;

commit;
