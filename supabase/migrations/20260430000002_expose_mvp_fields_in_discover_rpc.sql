-- Extend get_discoverable_profiles to surface the MVP profile fields added in
-- 20260430000001 (relationship_intent, personal_values, interests,
-- looking_for_text, prompts, icebreaker_question). The discover deck needs
-- these to render the new public-profile sections (intent badge, lifestyle
-- tags, prompts, looking-for, icebreaker CTA).
--
-- The bidirectional gender filter from 20260428000001 is preserved verbatim —
-- only the column projection changes. SECURITY DEFINER + the auth.uid() guard
-- + REVOKE/GRANT posture are unchanged.
--
-- Idempotent: DROP + CREATE.

begin;

DROP FUNCTION IF EXISTS public.get_discoverable_profiles(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
  id                  UUID,
  name                TEXT,
  age                 INTEGER,
  sun_sign            TEXT,
  moon_sign           TEXT,
  rising_sign         TEXT,
  bio                 TEXT,
  image_url           TEXT,
  is_verified         BOOLEAN,
  has_voice_intro     BOOLEAN,
  voice_intro_url     TEXT,
  -- MVP profile additions
  relationship_intent TEXT,
  personal_values     TEXT[],
  interests           TEXT[],
  looking_for_text    TEXT,
  prompts             JSONB,
  icebreaker_question TEXT
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
  -- permissive default so legacy rows don't silently produce empty decks.
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
    p.icebreaker_question
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
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_discoverable_profiles IS
  'Returns discoverable profiles for the discover screen with bidirectional gender preference matching: target.gender must be in viewer.looking_for AND viewer.gender must be in target.looking_for. Excludes self, already-swiped, blocked, non-onboarded, and unnamed profiles. Auth-guarded: authenticated callers must pass their own auth.uid(). Edge cases: NULL/empty looking_for is treated as the permissive default {male,female,non-binary,other}; NULL viewer gender skips reciprocal check; NULL target gender excludes. Updated 2026-04-30 to surface MVP profile fields (relationship_intent, personal_values, interests, looking_for_text, prompts, icebreaker_question) for the redesigned discover card.';

commit;
