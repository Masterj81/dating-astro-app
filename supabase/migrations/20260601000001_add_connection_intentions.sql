-- Connection intentions — macro intentions a user is open to. JUNO 2.0
-- widens the product from "romantic intent" to "love / friendship /
-- business (working chemistry)". The existing relationship_intent column
-- stays — it carries the romantic flavor (serious / exploring / casual /
-- friends / unsure) — and a NEW array column carries the macro intent set.
--
-- Default is ARRAY['love'] so every existing row keeps the romantic-first
-- experience exactly as it was. Users can update via the profile edit and
-- onboarding screens; at least one entry is required by the client (the
-- DB itself allows NULL during the migration of stale rows).
--
-- get_my_full_profile, get_discoverable_profiles, and
-- get_synastry_candidate_profiles all have to project the new column so
-- the mobile + web edit / discover / synastry surfaces can read it. We
-- DROP + recreate because RETURNS TABLE columns can't be altered with
-- CREATE OR REPLACE — same pattern as 20260430000001 / 20260430000002 /
-- 20260513000001.
--
-- get_discoverable_profiles also picks up an optional p_intentions filter
-- — clients pass it from the Discover segmented control (All / Love /
-- Friendship / Business). When NULL, the filter is bypassed so the
-- default behavior is unchanged.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CHECK constraint guarded by
-- pg_constraint lookup, RPCs DROP + recreated.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. New column on profiles
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS connection_intentions TEXT[]
    DEFAULT ARRAY['love']::TEXT[];

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Constrain connection_intentions vocabulary + cardinality.
--    Canonical values: 'love', 'friendship', 'business'.
--    NULL allowed to avoid breaking historical rows; client code defaults
--    to ['love'] when empty/null.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_connection_intentions_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_connection_intentions_check
      CHECK (
        connection_intentions IS NULL
        OR (
          cardinality(connection_intentions) BETWEEN 1 AND 3
          AND connection_intentions <@ ARRAY['love','friendship','business']::TEXT[]
        )
      );
  END IF;
END $$;

-- GIN index — supports the && (overlap) filter we apply in
-- get_discoverable_profiles when the client passes p_intentions.
CREATE INDEX IF NOT EXISTS profiles_connection_intentions_gin
  ON public.profiles USING GIN (connection_intentions);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. get_my_full_profile — expose connection_intentions to the self-read.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_full_profile();

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
  updated_at               TIMESTAMPTZ,
  -- MVP profile additions
  personal_values          TEXT[],
  relationship_intent      TEXT,
  looking_for_text         TEXT,
  icebreaker_question      TEXT,
  prompts                  JSONB,
  -- Connection intentions (love / friendship / business)
  connection_intentions    TEXT[]
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
    p.updated_at,
    p.personal_values,
    p.relationship_intent,
    p.looking_for_text,
    p.icebreaker_question,
    p.prompts,
    p.connection_intentions
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_full_profile() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_full_profile() TO authenticated;

COMMENT ON FUNCTION public.get_my_full_profile() IS
  'Phase 3-A: self-read of caller''s profile row, all columns. SECURITY DEFINER bypasses Phase 3-C column REVOKEs. Updated 2026-06-01 to surface connection_intentions (love/friendship/business macro intent set).';

-- ───────────────────────────────────────────────────────────────────────────
-- 4. get_discoverable_profiles — expose connection_intentions + accept
--    an optional p_intentions filter. Default behavior unchanged when
--    p_intentions is NULL or empty.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_discoverable_profiles(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.get_discoverable_profiles(UUID, INTEGER, TEXT[]);

CREATE OR REPLACE FUNCTION public.get_discoverable_profiles(
  p_user_id    UUID,
  p_limit      INTEGER DEFAULT 50,
  p_intentions TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  age                   INTEGER,
  sun_sign              TEXT,
  moon_sign             TEXT,
  rising_sign           TEXT,
  bio                   TEXT,
  image_url             TEXT,
  is_verified           BOOLEAN,
  has_voice_intro       BOOLEAN,
  voice_intro_url       TEXT,
  -- MVP profile additions
  relationship_intent   TEXT,
  personal_values       TEXT[],
  interests             TEXT[],
  looking_for_text      TEXT,
  prompts               JSONB,
  icebreaker_question   TEXT,
  -- Macro connection intentions
  connection_intentions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viewer_gender TEXT;
  v_viewer_looking_for TEXT[];
  v_default_looking_for CONSTANT TEXT[] := ARRAY['male','female','non-binary','other']::TEXT[];
BEGIN
  -- Auth guard: authenticated callers must be acting on their own profile.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT
    NULLIF(trim(p.gender), ''),
    CASE
      WHEN p.looking_for IS NULL OR cardinality(p.looking_for) = 0
        THEN v_default_looking_for
      ELSE p.looking_for
    END
  INTO v_viewer_gender, v_viewer_looking_for
  FROM public.profiles p
  WHERE p.id = p_user_id;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.age,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    COALESCE(p.image_url, p.photos[1]) AS image_url,
    COALESCE(p.is_verified, false) AS is_verified,
    COALESCE(p.has_voice_intro, false) AS has_voice_intro,
    p.voice_intro_url,
    p.relationship_intent,
    p.personal_values,
    p.interests,
    p.looking_for_text,
    p.prompts,
    p.icebreaker_question,
    p.connection_intentions
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    AND COALESCE(p.is_active, true) = true
    AND p.onboarding_completed = true
    AND p.name IS NOT NULL
    AND p.name <> ''
    AND p.gender IS NOT NULL
    AND p.gender = ANY(v_viewer_looking_for)
    AND (
      v_viewer_gender IS NULL
      OR p.looking_for IS NULL
      OR cardinality(p.looking_for) = 0
      OR v_viewer_gender = ANY(p.looking_for)
    )
    -- Optional intentions filter — pass through when NULL/empty so legacy
    -- callers (no p_intentions arg) keep the previous behavior.
    AND (
      p_intentions IS NULL
      OR cardinality(p_intentions) = 0
      OR p.connection_intentions IS NULL
      OR p.connection_intentions && p_intentions
    )
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER, TEXT[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.get_discoverable_profiles IS
  'Returns discoverable profiles. Bidirectional gender filter (target.gender ∈ viewer.looking_for AND viewer.gender ∈ target.looking_for). Excludes self, already-swiped, blocked, non-onboarded, unnamed. Auth-guarded. Updated 2026-06-01 to surface connection_intentions and accept an optional p_intentions TEXT[] filter (NULL = no filter).';

-- ───────────────────────────────────────────────────────────────────────────
-- 5. get_synastry_candidate_profiles — expose connection_intentions.
--    The picker is read-only and never accepts a filter; the segmented
--    control on synastry is a reading-frame, not a candidate filter.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_synastry_candidate_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_synastry_candidate_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  age                   INTEGER,
  sun_sign              TEXT,
  moon_sign             TEXT,
  rising_sign           TEXT,
  bio                   TEXT,
  image_url             TEXT,
  images                TEXT[],
  is_verified           BOOLEAN,
  relationship_intent   TEXT,
  personal_values       TEXT[],
  interests             TEXT[],
  looking_for_text      TEXT,
  prompts               JSONB,
  icebreaker_question   TEXT,
  last_active           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ,
  connection_intentions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_viewer_gender TEXT;
  v_viewer_looking_for TEXT[];
  v_default_looking_for CONSTANT TEXT[] := ARRAY['male','female','non-binary','other']::TEXT[];
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT
    NULLIF(trim(p.gender), ''),
    CASE
      WHEN p.looking_for IS NULL OR cardinality(p.looking_for) = 0
        THEN v_default_looking_for
      ELSE p.looking_for
    END
  INTO v_viewer_gender, v_viewer_looking_for
  FROM public.profiles p
  WHERE p.id = p_user_id;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.age,
    p.sun_sign,
    p.moon_sign,
    p.rising_sign,
    p.bio,
    COALESCE(p.image_url, p.photos[1]) AS image_url,
    p.images,
    COALESCE(p.is_verified, false) AS is_verified,
    p.relationship_intent,
    p.personal_values,
    p.interests,
    p.looking_for_text,
    p.prompts,
    p.icebreaker_question,
    p.last_active,
    p.created_at,
    p.connection_intentions
  FROM public.profiles p
  WHERE p.id <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    AND COALESCE(p.is_active, true) = true
    AND p.onboarding_completed = true
    AND p.name IS NOT NULL
    AND p.name <> ''
    AND p.gender IS NOT NULL
    AND p.gender = ANY(v_viewer_looking_for)
    AND (
      v_viewer_gender IS NULL
      OR p.looking_for IS NULL
      OR cardinality(p.looking_for) = 0
      OR v_viewer_gender = ANY(p.looking_for)
    )
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_synastry_candidate_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_synastry_candidate_profiles IS
  'Same preference filtering as get_discoverable_profiles, but does NOT exclude already-swiped profiles. Synastry is a premium reading tool. Updated 2026-06-01 to surface connection_intentions.';

commit;
