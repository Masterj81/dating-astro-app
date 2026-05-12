-- Synastry candidate picker: returns the set of profiles that match the
-- caller's Discovery preferences (self exclusion, bidirectional gender /
-- looking_for, blocked users in both directions, active + onboarded +
-- named) WITHOUT excluding already-swiped profiles. Synastry is a paid
-- comparison tool, not the Discover feed — passing or liking someone in
-- Discover should not hide them from the compatibility picker.
--
-- Filtering parity with get_discoverable_profiles (20260430000002) — only
-- the swipes clause differs. SECURITY DEFINER + auth.uid() guard +
-- REVOKE/GRANT posture are identical.
--
-- Idempotent: DROP + CREATE.

begin;

DROP FUNCTION IF EXISTS public.get_synastry_candidate_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_synastry_candidate_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  age                 INTEGER,
  sun_sign            TEXT,
  moon_sign           TEXT,
  rising_sign         TEXT,
  bio                 TEXT,
  image_url           TEXT,
  images              TEXT[],
  is_verified         BOOLEAN,
  relationship_intent TEXT,
  personal_values     TEXT[],
  interests           TEXT[],
  looking_for_text    TEXT,
  prompts             JSONB,
  icebreaker_question TEXT,
  last_active         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ
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
  -- service_role (auth.uid() IS NULL) keeps full access for crons/webhooks.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Load the viewer's gender + looking_for. Coalesce empty/NULL to the
  -- permissive default so legacy rows don't silently produce empty pickers.
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
    p.created_at
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
  'Same preference filtering as get_discoverable_profiles, but does NOT exclude already-swiped profiles because Synastry is a premium comparison tool, not the Discover feed. Self exclusion, bidirectional gender / looking_for, blocked users in both directions, active + onboarded + named. Auth-guarded: authenticated callers must pass their own auth.uid(). REVOKE PUBLIC/anon, GRANT authenticated.';

commit;
