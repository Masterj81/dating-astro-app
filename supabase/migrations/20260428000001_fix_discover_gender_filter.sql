-- Fix critical discover bug: get_discoverable_profiles ignores gender preferences.
--
-- ── Problem ────────────────────────────────────────────────────────────────
-- The previous get_discoverable_profiles (last redefined in
-- 20260419000002_rpc_auth_guards.sql) returned every onboarded profile that
-- was not the caller, not already swiped, and not blocked. It did NOT filter
-- by `gender` or `looking_for` at all. Result: a man with
-- looking_for = {'female'} sees men in his discover deck. Same bug for every
-- gender preference combination.
--
-- ── Fix: bidirectional gender preference matching ──────────────────────────
-- We apply BOTH directions of the preference, matching industry standard
-- (Tinder/Bumble/Hinge):
--   1. Forward — target.gender ∈ viewer.looking_for
--      ("show me only profiles that match what I'm looking for")
--   2. Reciprocal — viewer.gender ∈ target.looking_for
--      ("don't waste my swipe on someone who wouldn't match back")
--
-- Why bidirectional and not unidirectional?
--   Unidirectional would let the viewer see profiles that can never match
--   them (target's looking_for excludes viewer.gender). Every "like" on such
--   a profile is wasted: even mutual interest from the viewer's side cannot
--   produce a match because the target will never see the viewer in their
--   own deck. Bidirectional avoids this dead-end UX.
--
-- ── Edge cases handled ─────────────────────────────────────────────────────
--   - viewer.looking_for NULL or empty  → treat as "everyone"
--     (defensive — DB DEFAULT + signup trigger should prevent this, but
--      legacy rows may exist)
--   - viewer.gender NULL → skip the reciprocal check (we can't enforce it
--     without knowing the viewer's gender; still apply the forward filter)
--   - target.gender NULL → exclude (we can't filter what we don't know;
--     better to hide than to show a profile that breaks the preference)
--   - target.looking_for NULL or empty → treat as "everyone" (permissive
--      — legacy rows shouldn't be punished)
--   - target.is_active is already enforced via discoverable_profiles view in
--     prior migrations; we keep an explicit guard here for defense in depth.
--
-- ── Idempotency ─────────────────────────────────────────────────────────────
-- The function is replaced via DROP IF EXISTS + CREATE. Migrations 1, 2, 3
-- below are also idempotent (CHECK constraint guarded by NOT EXISTS, COMMENT
-- is overwriting).

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Add a CHECK constraint on profiles.looking_for so legacy/invalid values
--    can never sneak in via direct SQL or stale clients. This documents the
--    canonical vocabulary and matches the existing CHECK on profiles.gender.
-- ───────────────────────────────────────────────────────────────────────────

-- Backfill any legacy values just in case (idempotent: only touches rows that
-- contain unexpected tokens). This is the same canonical set used everywhere
-- in the codebase: 'male', 'female', 'non-binary', 'other'.
UPDATE public.profiles
SET looking_for = ARRAY(
  SELECT DISTINCT
    CASE lower(v)
      WHEN 'man'         THEN 'male'
      WHEN 'men'         THEN 'male'
      WHEN 'm'           THEN 'male'
      WHEN 'woman'       THEN 'female'
      WHEN 'women'       THEN 'female'
      WHEN 'w'           THEN 'female'
      WHEN 'f'           THEN 'female'
      WHEN 'nb'          THEN 'non-binary'
      WHEN 'nonbinary'   THEN 'non-binary'
      WHEN 'enby'        THEN 'non-binary'
      ELSE lower(v)
    END
  FROM unnest(looking_for) AS v
  WHERE v IS NOT NULL AND trim(v) <> ''
)
WHERE looking_for IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(looking_for) AS v
    WHERE lower(v) NOT IN ('male','female','non-binary','other')
       OR v <> lower(v)
  );

-- Drop unknown values that don't map to canonical vocabulary
UPDATE public.profiles
SET looking_for = ARRAY(
  SELECT v FROM unnest(looking_for) AS v
  WHERE v IN ('male','female','non-binary','other')
)
WHERE looking_for IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(looking_for) AS v
    WHERE v NOT IN ('male','female','non-binary','other')
  );

-- If the cleanup produced an empty array, restore the permissive default
UPDATE public.profiles
SET looking_for = ARRAY['male','female','non-binary','other']::TEXT[]
WHERE looking_for IS NULL OR cardinality(looking_for) = 0;

-- Add CHECK constraint guarding the canonical vocabulary. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_looking_for_values_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_looking_for_values_check
      CHECK (
        looking_for IS NULL
        OR cardinality(looking_for) = 0
        OR looking_for <@ ARRAY['male','female','non-binary','other']::TEXT[]
      )
      NOT VALID;
    -- VALIDATE separately so the cleanup above runs first; if any row still
    -- violates after backfill, this will raise (unlikely but explicit).
    ALTER TABLE public.profiles
      VALIDATE CONSTRAINT profiles_looking_for_values_check;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Replace get_discoverable_profiles with the gender-aware version.
-- ───────────────────────────────────────────────────────────────────────────

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
    p.voice_intro_url
  FROM public.profiles p
  WHERE p.id <> p_user_id
    -- Exclude already-swiped profiles
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id
    )
    -- Exclude blocked users (either direction)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    -- Only fully-onboarded, named, active profiles
    AND COALESCE(p.is_active, true) = true
    AND p.onboarding_completed = true
    AND p.name IS NOT NULL
    AND p.name <> ''
    -- Forward filter: target's gender must be in viewer's looking_for.
    -- Targets without a declared gender are excluded (we cannot honor
    -- the viewer's preference without knowing the target's gender).
    AND p.gender IS NOT NULL
    AND p.gender = ANY(v_viewer_looking_for)
    -- Reciprocal filter: viewer's gender must be in target's looking_for.
    -- If the viewer has no gender declared we skip this check (we can't
    -- enforce it). If the target has no looking_for or it is empty we
    -- treat it as permissive ("everyone") so legacy rows aren't excluded.
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

-- Re-apply grants and revokes consistent with prior migrations
-- (20260427000022 revoked anon/PUBLIC; we preserve that posture).
REVOKE EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_discoverable_profiles(UUID, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_discoverable_profiles IS
  'Returns discoverable profiles for the discover screen with bidirectional gender preference matching: target.gender must be in viewer.looking_for AND viewer.gender must be in target.looking_for. Excludes self, already-swiped, blocked, non-onboarded, and unnamed profiles. Auth-guarded: authenticated callers must pass their own auth.uid(). Edge cases: NULL/empty looking_for is treated as the permissive default {male,female,non-binary,other}; NULL viewer gender skips reciprocal check; NULL target gender excludes.';

commit;
