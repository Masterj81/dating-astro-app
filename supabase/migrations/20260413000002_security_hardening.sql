-- Security hardening: get_user_tier, discoverable_profiles view

-- 1. Add auth.uid() guard to get_user_tier (defense-in-depth)
-- Allow service_role to query any user, but authenticated users can only query their own tier
CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- service_role (webhooks, edge functions) can query any user
    WHEN auth.role() = 'service_role' THEN
      COALESCE((SELECT tier FROM public.get_effective_subscription(p_user_id)), 'free')
    -- authenticated users can only query their own tier
    WHEN auth.uid() = p_user_id THEN
      COALESCE((SELECT tier FROM public.get_effective_subscription(p_user_id)), 'free')
    ELSE 'free'
  END;
$$;

-- 2. Ensure discoverable_profiles view filters on onboarding_completed
CREATE OR REPLACE VIEW public.discoverable_profiles
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
  COALESCE(image_url, photos[1]) AS image_url,
  COALESCE(images, photos) AS images,
  gender,
  current_city,
  birth_chart,
  interests,
  is_verified,
  has_voice_intro,
  voice_intro_url,
  last_active,
  created_at
FROM public.profiles
WHERE is_active = TRUE
  AND name IS NOT NULL
  AND onboarding_completed = TRUE;
