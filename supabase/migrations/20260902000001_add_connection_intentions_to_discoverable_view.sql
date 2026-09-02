-- =============================================================================
-- The discoverable_profiles view never got `connection_intentions`
-- =============================================================================
--
-- WHAT WAS BROKEN
-- ---------------
-- Opening someone's profile returned 400 on both platforms, and had since
-- 23 May 2026.
--
-- `20260601000001_add_connection_intentions` added the column to
-- `public.profiles` and taught all three RPCs to return it —
-- `get_my_full_profile`, `get_discoverable_profiles`,
-- `get_synastry_candidate_profiles`. It never recreated the VIEW, whose last
-- definition is `20260502000001_extend_discoverable_view_with_mvp`.
--
-- Two screens read the view directly rather than through an RPC, and both ask
-- for the column:
--
--   apps/web/src/components/ProfileOverview.tsx
--   apps/mobile/app/profile/[id].tsx
--
-- PostgREST answers a select naming a column the relation does not have with
-- 400 and Postgres error 42703. Nothing else broke, and that is exactly why it
-- survived three months: Discover, Synastry and the chat header all read a
-- source that DOES have the column — the first two through RPCs updated by the
-- same migration, the chat header through the same view but without asking for
-- it. Every path except "open a profile" was fine, so the feature that shipped
-- that day looked like it worked.
--
-- WHY REPLACE AND NOT DROP
-- ------------------------
-- The 20260502 migration had to re-issue `GRANT SELECT ... TO authenticated`
-- because it dropped the view first, and its own comment says so. Appending a
-- column at the end is exactly the shape CREATE OR REPLACE VIEW accepts, so
-- the grant survives and there is no window where an authenticated reader
-- loses access to Discover.
--
-- The column is the same one the RPCs already return to the same audience:
-- macro intent (love / friendship / business) on a profile that is already
-- discoverable. No birth data, no new exposure, no change to the WHERE clause
-- that decides who is visible at all.

begin;

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
  created_at,
  relationship_intent,
  personal_values,
  looking_for_text,
  prompts,
  icebreaker_question,
  -- Appended 2026-09-02. Last position is not cosmetic: CREATE OR REPLACE
  -- VIEW only accepts new columns at the end, and inserting it next to the
  -- other MVP fields would force a DROP and take the grant with it.
  connection_intentions
FROM public.profiles
WHERE COALESCE(is_active, true) = true
  AND COALESCE(onboarding_completed, false) = true
  AND name IS NOT NULL
  AND name <> '';

COMMENT ON VIEW public.discoverable_profiles IS
  'Profiles visible in Discover and on a public profile page: active, onboarded, named. security_invoker so the caller''s RLS applies. Carries no birth time and no birth coordinates. Gained connection_intentions on 2026-09-02, three months after the column reached the RPCs — until then any client selecting it from here got a 400.';

commit;
