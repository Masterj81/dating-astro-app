-- Extend the public.discoverable_profiles view with the MVP profile fields
-- added in 20260430000001 (relationship_intent, personal_values,
-- looking_for_text, prompts, icebreaker_question). `interests` was already
-- in the view but is listed for clarity.
--
-- Why a view (and not the get_discoverable_profiles RPC, which already has
-- these fields)? The web app reads via `from('discoverable_profiles').select`
-- in apps/web/src/components/ProfileDetail.tsx and DiscoverOverview.tsx.
-- Updating the view is a 30-line migration; refactoring those consumers to
-- the RPC is a bigger frontend change we'll batch later.
--
-- The filter is also tightened to mirror get_discoverable_profiles:
-- non-onboarded profiles must not leak via direct URL. `is_active = true`
-- and `name IS NOT NULL` were already there; we add `onboarding_completed`.
--
-- security_invoker = true is preserved → RLS on `profiles` still applies.
-- GRANT SELECT TO authenticated must be re-issued because DROP destroys it.
--
-- Idempotent: DROP IF EXISTS + CREATE.

begin;

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
  created_at,
  -- MVP profile fields (added 2026-05-02)
  relationship_intent,
  personal_values,
  looking_for_text,
  prompts,
  icebreaker_question
FROM public.profiles
WHERE COALESCE(is_active, true) = true
  AND COALESCE(onboarding_completed, false) = true
  AND name IS NOT NULL
  AND name <> '';

GRANT SELECT ON public.discoverable_profiles TO authenticated;

COMMENT ON VIEW public.discoverable_profiles IS
  'Public-safe projection of profiles for the web /profile/[id] page and discover surfaces. Filters: active + onboarded + named. Updated 2026-05-02 to surface MVP profile fields (relationship_intent, personal_values, looking_for_text, prompts, icebreaker_question) for the web profile redesign.';

commit;
