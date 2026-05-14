-- Migration: Add get_discoverable_profiles RPC function
-- This function returns profiles for the discover screen, excluding:
-- - The current user
-- - Users already swiped on
-- - Blocked users (in either direction)

-- Drop existing function if it exists (to handle signature changes)
DROP FUNCTION IF EXISTS get_discoverable_profiles(UUID, INTEGER);

-- Create the RPC function
CREATE OR REPLACE FUNCTION get_discoverable_profiles(p_user_id UUID, p_limit INTEGER DEFAULT 50)
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
) AS $$
BEGIN
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
    -- Exclude profiles the user has already swiped on
    AND NOT EXISTS (
      SELECT 1 FROM public.swipes s
      WHERE s.swiper_id = p_user_id AND s.swiped_id = p.id
    )
    -- Exclude blocked users (in either direction)
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.blocker_id = p_user_id AND b.blocked_id = p.id)
         OR (b.blocker_id = p.id AND b.blocked_id = p_user_id)
    )
    -- Only include profiles that have completed onboarding
    AND p.onboarding_completed = true
    -- Only include profiles with a name
    AND p.name IS NOT NULL
    AND p.name != ''
  ORDER BY p.last_active DESC NULLS LAST, p.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_discoverable_profiles(UUID, INTEGER) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_discoverable_profiles IS 'Returns discoverable profiles for the discover screen, excluding the current user, already-swiped profiles, and blocked users';
