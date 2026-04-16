-- Convert profiles.looking_for from TEXT back to TEXT[]
--
-- Context: profiles.looking_for was originally declared TEXT[] in
-- 00000000000000_full_schema.sql but at some point was altered to TEXT
-- (likely via Supabase dashboard) without a versioned migration. The
-- previous fix (20260416_fix_signup_looking_for.sql) added a DEFAULT
-- but couldn't restore the type because Postgres doesn't allow subqueries
-- in ALTER COLUMN ... USING expressions.
--
-- This migration documents the prod conversion done manually:
--   1. Add temporary text[] column
--   2. Backfill by parsing every possible stored format (Postgres array
--      text '{a,b}', JSON '["a","b"]', comma-separated 'a,b', single 'a')
--   3. Drop dependent view, drop old column, rename new column
--   4. Restore DEFAULT and NOT NULL
--   5. Recreate discoverable_profiles view (with onboarding_completed
--      filter from 20260413_security_hardening.sql)
--
-- Idempotent: skips conversion if looking_for is already TEXT[].

DO $$
DECLARE
  current_type TEXT;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = 'looking_for';

  IF current_type = 'ARRAY' THEN
    RAISE NOTICE 'profiles.looking_for is already ARRAY type — skipping conversion';
    RETURN;
  END IF;

  RAISE NOTICE 'Converting profiles.looking_for from % to TEXT[]', current_type;

  -- Add temporary column
  EXECUTE 'ALTER TABLE public.profiles ADD COLUMN looking_for_new TEXT[]';

  -- Backfill from every possible text format
  EXECUTE $sql$
    UPDATE public.profiles
    SET looking_for_new = CASE
      WHEN looking_for ~ '^\{.*\}$' THEN looking_for::TEXT[]
      WHEN looking_for ~ '^\[.*\]$' THEN ARRAY(SELECT jsonb_array_elements_text(looking_for::jsonb))
      WHEN looking_for LIKE '%,%' THEN string_to_array(looking_for, ',')
      WHEN looking_for IS NULL OR trim(looking_for) = '' THEN ARRAY['male','female','non-binary','other']::TEXT[]
      ELSE ARRAY[looking_for]
    END
  $sql$;

  -- Sanity check
  PERFORM 1 FROM public.profiles WHERE looking_for_new IS NULL LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Conversion failed: some rows have NULL looking_for_new';
  END IF;

  -- Drop dependent view (recreated below)
  DROP VIEW IF EXISTS public.discoverable_profiles CASCADE;

  -- Swap columns
  EXECUTE 'ALTER TABLE public.profiles DROP COLUMN looking_for';
  EXECUTE 'ALTER TABLE public.profiles RENAME COLUMN looking_for_new TO looking_for';

  -- Restore DEFAULT and NOT NULL
  EXECUTE $sql$
    ALTER TABLE public.profiles
      ALTER COLUMN looking_for SET DEFAULT ARRAY['male','female','non-binary','other']::TEXT[]
  $sql$;

  EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN looking_for SET NOT NULL';
END $$;

-- Recreate discoverable_profiles view (idempotent thanks to CREATE OR REPLACE)
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
