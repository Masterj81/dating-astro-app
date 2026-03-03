-- Fix security definer view warning
-- Recreate discoverable_profiles view with SECURITY INVOKER (default, respects RLS)

DROP VIEW IF EXISTS public.discoverable_profiles;

CREATE VIEW public.discoverable_profiles
WITH (security_invoker = true)
AS
SELECT
  id,
  name,
  age,
  birth_date,
  sun_sign,
  moon_sign,
  rising_sign,
  bio,
  COALESCE(image_url, photos[1]) as image_url,
  COALESCE(images, photos) as images,
  gender,
  current_city,
  birth_chart,
  interests,
  is_verified,
  has_voice_intro,
  voice_intro_url,
  last_active,
  created_at
FROM profiles
WHERE is_active = TRUE AND name IS NOT NULL;

-- Grant access to authenticated users
GRANT SELECT ON public.discoverable_profiles TO authenticated;
