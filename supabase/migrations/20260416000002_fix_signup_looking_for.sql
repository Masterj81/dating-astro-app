-- Fix signup failure: profiles.looking_for NOT NULL violation (SQLSTATE 23502)
--
-- Root cause: the trigger handle_new_auth_user_profile() only inserts
-- (id, email, name, gender) into public.profiles. If the column looking_for
-- has been altered to NOT NULL without a working DEFAULT (or the DEFAULT
-- was dropped via dashboard), every signup throws:
--   `null value in column "looking_for" of relation "profiles"
--    violates not-null constraint`
-- → POST /signup returns 500 "Database error saving new user".
--
-- Fix strategy (defense-in-depth):
--   1. Re-establish the DEFAULT on profiles.looking_for so any insert that
--      omits it falls back to a sensible value.
--   2. Update the trigger to insert looking_for explicitly with the same
--      default — the DB-level default is a safety net only.
--   3. Backfill any existing rows where looking_for IS NULL.

begin;

-- 1. Ensure DEFAULT is present on the column
ALTER TABLE public.profiles
  ALTER COLUMN looking_for SET DEFAULT ARRAY['male', 'female', 'non-binary', 'other']::TEXT[];

-- 2. Backfill any existing NULL rows so a future NOT NULL constraint doesn't break
UPDATE public.profiles
SET looking_for = ARRAY['male', 'female', 'non-binary', 'other']::TEXT[]
WHERE looking_for IS NULL;

-- 3. Update the signup trigger to provide looking_for explicitly
CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    name,
    gender,
    looking_for
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.raw_user_meta_data ->> 'gender',
    ARRAY['male', 'female', 'non-binary', 'other']::TEXT[]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    gender = COALESCE(public.profiles.gender, EXCLUDED.gender),
    looking_for = COALESCE(public.profiles.looking_for, EXCLUDED.looking_for);

  RETURN NEW;
END;
$$;

commit;
