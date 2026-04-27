-- Phase 3-A: get_my_full_profile() RPC
--
-- SECURITY DEFINER RPC that returns the caller's own profile row, all columns
-- included. Designed to replace direct `from('profiles').select(...)` reads
-- once Phase 3-C revokes column-level SELECT on sensitive columns from the
-- `authenticated` role.
--
-- Why a SECURITY DEFINER RPC and not a simple `from('profiles').select('*')`?
--   After Phase 3-C, `authenticated` no longer has SELECT on email,
--   birth_time, birth_latitude, birth_longitude, push_token, etc. — even
--   for their own row. This RPC bypasses that restriction (DEFINER runs as
--   the function owner, typically `postgres`) and applies the auth.uid()=id
--   filter inside, so the caller can only see their own data.
--
-- Hardening:
--   - REVOKE EXECUTE FROM PUBLIC, anon (auth-only).
--   - SECURITY DEFINER + SET search_path = public.
--   - The WHERE auth.uid() = id filter inside means a malicious caller
--     cannot pass another user's id (no parameter at all).

CREATE OR REPLACE FUNCTION public.get_my_full_profile()
RETURNS TABLE (
  id                       UUID,
  email                    TEXT,
  name                     TEXT,
  age                      INTEGER,
  birth_date               DATE,
  birth_time               TIME,
  birth_city               TEXT,
  birth_latitude           DECIMAL(9,6),
  birth_longitude          DECIMAL(9,6),
  birth_chart              JSONB,
  sun_sign                 TEXT,
  moon_sign                TEXT,
  rising_sign              TEXT,
  bio                      TEXT,
  gender                   TEXT,
  looking_for              TEXT[],
  interests                TEXT[],
  image_url                TEXT,
  images                   TEXT[],
  photos                   TEXT[],
  current_city             TEXT,
  current_latitude         DECIMAL(9,6),
  current_longitude        DECIMAL(9,6),
  min_age                  INTEGER,
  max_age                  INTEGER,
  max_distance             INTEGER,
  preferred_elements       TEXT[],
  is_premium               BOOLEAN,
  premium_until            TIMESTAMPTZ,
  is_active                BOOLEAN,
  is_verified              BOOLEAN,
  onboarding_completed     BOOLEAN,
  has_voice_intro          BOOLEAN,
  voice_intro_url          TEXT,
  verification_video_url   TEXT,
  verified_at              TIMESTAMPTZ,
  notification_preferences JSONB,
  push_token               TEXT,
  referral_code            TEXT,
  referred_by              UUID,
  last_active              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.email,
    p.name,
    p.age,
    p.birth_date,
    p.birth_time,
    p.birth_city,
    p.birth_latitude,
    p.birth_longitude,
    p.birth_chart,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    p.gender,
    p.looking_for,
    p.interests,
    p.image_url,
    p.images,
    p.photos,
    p.current_city,
    p.current_latitude,
    p.current_longitude,
    p.min_age,
    p.max_age,
    p.max_distance,
    p.preferred_elements,
    p.is_premium,
    p.premium_until,
    p.is_active,
    p.is_verified,
    p.onboarding_completed,
    p.has_voice_intro,
    p.voice_intro_url,
    p.verification_video_url,
    p.verified_at,
    p.notification_preferences,
    p.push_token,
    p.referral_code,
    p.referred_by,
    p.last_active,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

COMMENT ON FUNCTION public.get_my_full_profile() IS
  'Phase 3-A: self-read of caller''s profile row, all columns. SECURITY DEFINER bypasses Phase 3-C column REVOKEs. Use this RPC instead of from(''profiles'').select(''*'') for own-profile reads. The function takes no parameters and uses auth.uid() internally — a caller cannot fetch another user''s profile.';
